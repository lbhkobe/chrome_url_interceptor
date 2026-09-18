#!/usr/bin/env node
/* TXCS 规则生成器核心冒烟测试：提取 HTML 中 <script id="core"> 并用真实规则文件验证。
 * 用法：node docs/skills/scripts/verify-core.js [规则文件路径] [工具HTML路径]
 *   不传参时自动定位（规则文件 = rules/ 日期最新那份，HTML = tools/txcs-rule-generator.html）。
 * 通过标准：模板组识别、生成 2609 规则 JSON 合法、无旧日期残留。
 * 坑：eval 前剥 'use strict'（否则函数声明不泄漏）；本脚本自身也不能有 'use strict'。 */
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

const RULES_FILE = process.argv[2] || pickNewestRules();
const HTML_FILE  = process.argv[3] || path.join(ROOT, 'tools/txcs-rule-generator.html');

const html = fs.readFileSync(HTML_FILE, 'utf8');
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) { console.error('✗ 找不到 <script id="core">'); process.exit(1); }
eval(m[1].replace(/'use strict';?\s*/g, ''));

const data = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
const rules = Array.isArray(data) ? data : data.rules;
console.log(`✓ core 加载 | 规则 ${rules.length} 条 | ${RULES_FILE}`);

const groups = buildGroups(rules);
const gen = groups.filter(g => g.canGenerate);
console.log(`✓ 模板组 ${groups.length} 个，可生成 ${gen.length} 个`);
if (gen.length === 0){ console.error('✗ 无模板组可生成'); process.exit(1); }

let fail = 0, checked = 0;
for (const g of gen){
  const base = g.monthRules[g.monthRules.length - 1];
  const nr = generateRule(base.rule, { y: 2026, m: 9 });   // 目标月可改
  if (nr.responseType === 'function') continue;
  try {
    const obj = JSON.parse(nr.response);
    // 旧日期残留（允许环比月 = 目标月前一个月）
    const s = JSON.stringify(obj);
    const bad = (s.match(/2026-0[1-7]|20260[1-7]\d\d/g) || []).length;
    if (bad) { fail++; console.log(`  ✗ 旧日期残留: ${nr.alias} (${bad})`); }
  } catch(e) {
    fail++; console.log(`  ✗ 非法 JSON: ${nr.alias} → ${e.message}`);
  }
  checked++;
}
console.log(`✓ 生成 ${checked} 条检查完毕，残留/非法: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
