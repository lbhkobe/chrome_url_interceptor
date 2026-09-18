#!/usr/bin/env node
/* TXCS 规则生成器核心逻辑测试：node 直接跑（无依赖）。
 * 用法: node docs/skills/scripts/test_txcs_gen.js [工具HTML] [规则文件]
 *   - 不传参数时自动定位：HTML=tools/txcs-rule-generator.html，规则文件=rules/ 里日期最新的那份
 *     （同日取「海盛和食品」那份；两文件规则集相同、仅 enabled 不同）
 * 从 tools/txcs-rule-generator.html 提取 <script id="core"> 核心逻辑，
 * 对 rules/ 真实规则文件跑断言（单测 + 端到端）。改完工具后必跑。
 * 注意：本脚本不能有 'use strict'（严格模式下 eval 不泄漏函数声明）；
 *       提取的 core 脚本里的 'use strict' 也必须剥掉。 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');          // 仓库根
const HTML_PATH = process.argv[2] || path.join(ROOT, 'tools/txcs-rule-generator.html');
const RULES_PATH = process.argv[3] || pickNewestRules();

/** rules/ 下取日期最新的规则文件（文件名约定：{店铺}_{YYYYMMDD}_{序号}.json） */
function pickNewestRules(){
  const dir = path.join(ROOT, 'rules');
  const files = fs.readdirSync(dir).filter(f => /_\d{8}_\d{2}\.json$/.test(f));
  if (!files.length) throw new Error('rules/ 下没有 {店铺}_{YYYYMMDD}_{序号}.json 规则文件');
  files.sort((a, b) => {
    const ka = (a.match(/_(\d{8})_(\d{2})\.json$/) || []).slice(1).join('');
    const kb = (b.match(/_(\d{8})_(\d{2})\.json$/) || []).slice(1).join('');
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.startsWith('海盛和') ? 1 : -1;                // 同一天优先海盛和
  });
  return path.join(dir, files[files.length - 1]);
}

console.log('工具 HTML: ' + HTML_PATH);
console.log('规则文件 : ' + RULES_PATH);
const html = fs.readFileSync(HTML_PATH, 'utf8');
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m){ console.error('✗ 找不到 core 脚本'); process.exit(1); }
eval(m[1].replace(/'use strict';?\s*/g, ''));

const data = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
const rules = data.rules;
let pass = 0, fail = 0;
function check(name, cond, detail){
  if (cond){ pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '  ' + (detail || '')); }
}

/* ── 1. 模板组识别 ── */
const groups = buildGroups(rules);
const genGroups = groups.filter(g => g.canGenerate);
console.log(`模板组：${groups.length} 组，可生成 ${genGroups.length} 组`);
check('京麦旧版归一化后 ≤4 组', groups.filter(g => g.platform === '京东·京麦旧版').length <= 4,
  groups.filter(g => g.platform === '京东·京麦旧版').length);
check('生意参谋 overview 可生成（2 位年 bug 回归）',
  genGroups.some(g => g.platform === '淘宝·生意参谋' && g.iface === 'overview'), '');
check('微信小店可生成', genGroups.some(g => g.pattern.indexOf('liner/query') !== -1), '');

/* ── 2. 京麦新版 getSummary 2608→2609 ── */
const T = { y: 2026, m: 9 };
const jdSum = rules.find(r => r.alias === '京麦新版_2608_getSummary');
const g1 = generateRule(jdSum, T);
check('getSummary alias', g1.alias === '京麦新版_2609_getSummary', g1.alias);
check('getSummary startDate 新月', g1.bodyPattern.indexOf('"startDate":"2026-09"') !== -1, g1.bodyPattern);
check('getSummary compareStartDate 上月', g1.bodyPattern.indexOf('"compareStartDate":"2026-08"') !== -1, g1.bodyPattern);
check('getSummary 响应合法 JSON', (() => { try { return !!JSON.parse(g1.response).body.data[0]; } catch(e){ return false; } })(), '');

/* ── 3. 京麦新版 getTrend：每日数组对齐 ── */
const jdTr = rules.find(r => r.alias === '京麦新版_2608_getTrend');
const g2j = JSON.parse(generateRule(jdTr, T).response);
const cat = g2j.body.data[0].trend.categories;
check('getTrend categories 30 天', cat.length === 30, cat.length);
check('getTrend 首日 2026-09-01', cat[0] === '2026-09-01', cat[0]);
check('getTrend 末日 2026-09-30', cat[29] === '2026-09-30', cat[29]);

/* ── 4. 猫超：value 行上月/本月、code 1757 保留 ── */
const mc = rules.find(r => r.alias === '猫超-26年6月支付金额');
const g3 = generateRule(mc, T);
const g3j = JSON.parse(g3.response);
check('猫超 alias', g3.alias === '猫超-26年9月支付金额', g3.alias);
check('猫超 code 1757 保留', g3.bodyPattern.indexOf('"code":"1757"') !== -1, g3.bodyPattern);
check('猫超 value 上月(20260831)', g3.bodyPattern.indexOf('"value":"20260831"') !== -1, g3.bodyPattern);
check('猫超 value 本月(20260930)', g3.bodyPattern.indexOf('"value":"20260930"') !== -1, g3.bodyPattern);
check('猫超 stat_date 新月末', g3j.data.data[0].stat_date === '20260930', g3j.data.data[0].stat_date);
check('猫超响应无旧月日期', !/2026-0[1-8]|20260[1-8]\d\d/.test(JSON.stringify(g3j)), '');

/* ── 5. 生意参谋（URL dateRange）/ 微信小店 / 电子税务局 ── */
const sycm = rules.find(r => r.alias === '生意参谋-26年4月');
const g4 = generateRule(sycm, T);
check('生意参谋 alias', g4.alias === '生意参谋-26年9月', g4.alias);
check('生意参谋 dateRange 联动', g4.pattern.indexOf('dateRange=2026-09') !== -1, g4.pattern);
check('微信小店 alias', generateRule(rules.find(r => r.alias === '微信小店2604'), T).alias === '微信小店2609', '');
/* 电子税务局：2026-08 起 alias 由 '26.3-01' 改为 '{店铺}-26年3月-增值税及附加税费申报表' */
const TAX_ALIAS = '海盛和食品-26年3月-增值税及附加税费申报表';
const TAX_ALIAS_NEW = '海盛和食品-26年9月-增值税及附加税费申报表';
const tax = rules.find(r => r.alias === TAX_ALIAS);
check('电子税务局规则存在（alias 未再改名的回归）', !!tax, tax ? '' : '找不到 ' + TAX_ALIAS);
check('电子税务局 alias', !!tax && generateRule(tax, T).alias === TAX_ALIAS_NEW,
  tax ? generateRule(tax, T).alias : '(跳过：规则缺失)');

/* ── 6. extractMonthOf 抽查 ── */
check('extractMonthOf 猫超 26年6月', JSON.stringify(extractMonthOf(mc)) === '{"y":2026,"m":6}', '');
check('extractMonthOf 生意参谋 2位年', JSON.stringify(extractMonthOf(sycm)) === '{"y":2026,"m":4}', JSON.stringify(extractMonthOf(sycm)));
check('extractMonthOf 电子税 26年3月', !!tax && JSON.stringify(extractMonthOf(tax)) === '{"y":2026,"m":3}',
  tax ? JSON.stringify(extractMonthOf(tax)) : '(跳过：规则缺失)');

/* ── 7. 指标速填（京麦 8 指标） ── */
const dm = detectMetrics(jdSum.response);
check('detectMetrics 8 指标', dm && Object.keys(dm.values).length === 8, dm ? Object.keys(dm.values).length : 0);
if (dm){
  const vals = Object.assign({}, dm.values);
  const amtKey = 'jdr_sch_trade_deal_ord_ord_amt_sz_trade_deal_snapshot';
  vals[amtKey] = 5000000;
  const nj = JSON.parse(applyMetrics(jdSum.response, vals));
  check('指标速填金额更新', nj.body.data[0][amtKey] === 5000000, nj.body.data[0][amtKey]);
  const cv = nj.body.data[0][amtKey + '##compareValue'];
  const expect = Math.round(((5000000 - cv) / cv) * 10000) / 10000;
  check('指标速填环比重算', nj.body.data[0][amtKey + '##compare'] === expect, nj.body.data[0][amtKey + '##compare']);
}

/* ── 8. 表单编辑（collectFormFields / computeCompare / _tb 清空） ── */
const wx = rules.find(r => r.alias === '微信小店2604');
const wxObj = JSON.parse(wx.response);
const fields = collectFormFields(wxObj);
check('微信小店表单字段 >20', fields.length > 20, fields.length);
check('微信小店中文标签', fields.some(f => f.label === '成交金额'), fields.filter(f=>f.label.indexOf('金额')!==-1).slice(0,3).map(f=>f.label).join(','));
check('metaConfig 未展开', !fields.some(f => f.path.indexOf('metaConfig') !== -1), '');
const wxGroup = groups.find(g => g.pattern.indexOf('liner/query') !== -1);
const genWx = generateRule(wxGroup.monthRules[wxGroup.monthRules.length-1].rule, T);
const genWxObj = JSON.parse(genWx.response);
check('生成后 _tb 全部清空', Object.keys(genWxObj.total).filter(k => /_tb$/.test(k)).every(k => genWxObj.total[k] === ''), '');
genWxObj.total.pay_gmv = '60000000';
const cmpObj = JSON.parse(computeCompare(JSON.stringify(genWxObj), wx.response));
const expectTb = Math.round(((60000000 - parseFloat(wxObj.total.pay_gmv)) / parseFloat(wxObj.total.pay_gmv)) * 1000000) / 1000000;
check('computeCompare 环比正确', Math.abs(parseFloat(cmpObj.total.pay_gmv_tb) - expectTb) < 1e-9, cmpObj.total.pay_gmv_tb);

/* ── 9. 端到端：全部模板组生成 → 导出 → 模拟扩展导入 ── */
let genCount = 0, jsonOk = 0, stale = 0;
const newRules = [];
for (const g of genGroups){
  const base = g.monthRules[g.monthRules.length - 1];
  const nr = generateRule(base.rule, T);
  newRules.push(nr); genCount++;
  if (nr.responseType !== 'function'){
    try {
      JSON.parse(nr.response); jsonOk++;
      const s = JSON.stringify(JSON.parse(nr.response));
      if (/2026-0[1-7]|20260[1-7]\d\d/.test(s)) stale++;
    } catch(e){ console.log('✗ 响应非法 JSON: ' + nr.alias); }
  }
}
check('端到端生成全部模板组', genCount === genGroups.length, genCount);
check('端到端响应 JSON 全合法', jsonOk === genCount, jsonOk + '/' + genCount);
check('端到端无旧日期残留', stale === 0, stale);
const payload = { version: 1, rules: rules.concat(newRules.map(r => { const c = Object.assign({}, r); delete c._new; return c; })) };
const parsed = JSON.parse(JSON.stringify(payload));
const imported = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.rules) ? parsed.rules : null);
check('导出文件可被扩展导入', !!imported && imported.length === payload.rules.length, imported && imported.length);

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);
