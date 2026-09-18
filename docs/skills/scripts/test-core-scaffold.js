#!/usr/bin/env node
/* 单文件 HTML 工具 core 测试脚手架
 * 用法：node docs/skills/scripts/test-core-scaffold.js [HTML路径] [规则文件路径]
 *   不传参时自动定位（HTML=tools/txcs-rule-generator.html，规则文件=rules/ 日期最新的那份）。
 * 从 <script id="core"> 提取纯逻辑函数 eval 后断言 —— 改工具后跑一遍防止回归。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');

function pickNewestRules(){
  const dir = path.join(ROOT, 'rules');
  const files = fs.readdirSync(dir).filter(f => /_\d{8}_\d{2}\.json$/.test(f));
  if (!files.length) throw new Error('rules/ 下没有 {店铺}_{YYYYMMDD}_{序号}.json 规则文件');
  files.sort((a, b) => {
    const ka = (a.match(/_(\d{8})_(\d{2})\.json$/) || []).slice(1).join('');
    const kb = (b.match(/_(\d{8})_(\d{2})\.json$/) || []).slice(1).join('');
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.startsWith('海盛和') ? 1 : -1;
  });
  return path.join(dir, files[files.length - 1]);
}

const HTML_PATH = process.argv[2] || path.join(ROOT, 'tools/txcs-rule-generator.html');
const RULES_PATH = process.argv[3] || pickNewestRules();

const html = fs.readFileSync(HTML_PATH, 'utf8');
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) { console.error('找不到 core 脚本（确认 <script id="core"> 存在）'); process.exit(1); }

// 关键：必须剥掉 'use strict' —— 严格模式下 eval 内的函数声明不会泄漏到外围作用域
eval(m[1].replace(/'use strict';?\s*/g, ''));

let pass = 0, fail = 0;
function check(name, cond, detail){
  if (cond){ pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '  ' + (detail || '')); }
}

const data = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
const rules = data.rules;
console.log('规则数:', rules.length, '|', RULES_PATH);
const groups = buildGroups(rules);
console.log('模板组:', groups.length, '| 可生成:', groups.filter(g => g.canGenerate).length);

/* ── 示例断言：京麦新版 getSummary 2608 → 2609 ── */
const base = rules.find(r => r.alias === '京麦新版_2608_getSummary');
if (base){
  const nr = generateRule(base, { y: 2026, m: 9 });
  check('alias 联动', nr.alias === '京麦新版_2609_getSummary', nr.alias);
  check('bodyPattern startDate', nr.bodyPattern.indexOf('"startDate":"2026-09"') !== -1, nr.bodyPattern);
  check('bodyPattern 环比上月', nr.bodyPattern.indexOf('"compareStartDate":"2026-08"') !== -1, nr.bodyPattern);
  check('响应合法 JSON', (() => { try { return !!JSON.parse(nr.response).body; } catch(e){ return false; } })(), '');
}

/* ── 示例断言：猫超 code 值不被日期正则误替换 ── */
const mc = rules.find(r => r.alias === '猫超-26年6月支付金额');
if (mc){
  const nr2 = generateRule(mc, { y: 2026, m: 9 });
  check('猫超 alias', nr2.alias === '猫超-26年9月支付金额', nr2.alias);
  check('code 1757 保留', nr2.bodyPattern.indexOf('"code":"1757"') !== -1, nr2.bodyPattern);
  check('value 联动上月末', nr2.bodyPattern.indexOf('"value":"20260831"') !== -1, nr2.bodyPattern);
  check('value 联动本月末', nr2.bodyPattern.indexOf('"value":"20260930"') !== -1, nr2.bodyPattern);
}

/* ── 示例断言：表单字段（猫超支付金额精简模式 = 13 字段，含 _lfl；趋势表是 7 列） ──
 * 依据 references/platform-fingerprints.md「精简白名单 ESSENTIAL_FIELDS」
 * —— 曾把此处误写成 7（那是趋势表的列数），2026-09 修正。 */
const ESSENTIAL_FIELDS_CAT_PAY = 13;
if (mc){
  const ess = collectFormFields(JSON.parse(mc.response), { essential: true, pattern: mc.pattern });
  check('精简模式 13 字段（支付金额）', ess.length === ESSENTIAL_FIELDS_CAT_PAY, ess.length);
  const all = collectFormFields(JSON.parse(mc.response));
  const labels = all.map(f => f.label);
  const dups = labels.filter((l, i) => labels.indexOf(l) !== i);
  check('全模式标签无重复', dups.length === 0, dups.join(','));
}

console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);
