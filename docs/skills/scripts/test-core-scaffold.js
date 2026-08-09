#!/usr/bin/env node
/* 单文件 HTML 工具 core 测试脚手架
 * 用法：node test-core-scaffold.js [HTML路径] [规则文件路径]
 * 从 <script id="core"> 提取纯逻辑函数 eval 后断言 —— 改工具后跑一遍防止回归。
 */
const fs = require('fs');

const HTML_PATH = process.argv[2] || '/mnt/e/Whale/tmcs_extension/tools/txcs-rule-generator.html';
const RULES_PATH = process.argv[3] || '/mnt/e/Whale/tmcs_extension/rules/txcs-interceptor-rules - 海盛和食品0808.json';

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
console.log('规则数:', rules.length);
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

/* ── 示例断言：表单字段（精简模式 7 列 + 标签无重复） ── */
if (mc){
  const ess = collectFormFields(JSON.parse(mc.response), { essential: true, pattern: mc.pattern });
  check('精简模式 7 字段', ess.length === 7, ess.length);
  const all = collectFormFields(JSON.parse(mc.response));
  const labels = all.map(f => f.label);
  const dups = labels.filter((l, i) => labels.indexOf(l) !== i);
  check('全模式标签无重复', dups.length === 0, dups.join(','));
}

console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);
