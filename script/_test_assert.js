// Value assertions for rule-generator.js output
const fs = require('fs');
const path = require('path');

function makeEl() {
  return { value: '', textContent: '', innerHTML: '', style: {}, dataset: {},
    onchange: null, onclick: null, querySelectorAll: () => [] };
}
const els = {};
global.document = {
  getElementById: id => els[id] || (els[id] = makeEl()),
  createElement: () => makeEl(),
};
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
global.window = global;
global.alert = msg => console.log('ALERT:', msg);

const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'rule-generator.js'), 'utf8');
let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got=${JSON.stringify(got)}${ok ? '' : ' want=' + JSON.stringify(want)}`);
};
global.check = check;
global.fs = fs;

const test = `
;(function(){
  const E = id => document.getElementById(id);
  base = JSON.parse(fs.readFileSync('e:\\\\Whale\\\\tmcs_extension\\\\rules\\\\txcs-interceptor-rules - 海盛和食品0808.json', 'utf8'));
  baseName = '海盛和食品0808.json';

  E('m_ym').value = '2026-07'; E('m_cmpSrc').value = 'auto';
  E('cur_PV').value = '377826'; E('cur_UV').value = '111442';
  E('cur_DealUser').value = '9584'; E('cur_DealRatePct').value = '8.60';
  E('cur_DealNum').value = '8261'; E('cur_DealProNum').value = '9318';
  E('cur_DealAmt').value = '3450240'; E('cur_DealPriceAvg').value = '360';
  E('cur_ToCartUser').value = '9584';
  genMetrics();

  const sum = JSON.parse(basket[0].response).body.data[0];
  check('summary.PV', sum[F.PV], 377826);
  check('summary.UV', sum[F.UV], 111442);
  check('summary.DealRate', sum[F.DealRate], 0.086);
  check('summary.DealAmt', sum[F.DealAmt], 3450240);
  check('summary.cmpUV=June', sum[F.UV + '##compareValue'], 195670);
  check('summary.cmpDealAmt=June', sum[F.DealAmt + '##compareValue'], 6281485);
  check('summary.cmpDealUser=June', sum[F.DealUser + '##compareValue'], 17845);
  check('bodyPattern', basket[0].bodyPattern, '"startDate":"2026-07"\\n"endDate":"2026-07"\\n"compareStartDate":"2026-06"');

  const tr = JSON.parse(basket[1].response).body.data[0].trend;
  check('trend.days', tr.categories.length, 31);
  check('trend.firstDay', tr.categories[0], '2026-07-01');
  check('trend.lastDay', tr.categories[30], '2026-07-31');
  const byCode = c => tr.series.find(s => s.code === c).data;
  check('trend.DealAmt sum', Math.round(byCode(F.DealAmt).reduce((a,b)=>a+b,0)), 3450240);
  check('trend.PV sum', byCode(F.PV).reduce((a,b)=>a+b,0), 377826);
  check('trend.UV sum', byCode(F.UV).reduce((a,b)=>a+b,0), 111442);
  check('trend.DealUser sum', byCode(F.DealUser).reduce((a,b)=>a+b,0), 9584);
  check('trend body', basket[1].bodyPattern, '"startDate":"2026-07-01"\\n"endDate":"2026-07-31"\\n"compareStartDate":"2026-06-01"\\n"compareEndDate":"2026-06-30"');

  curTab = 'jd_old';
  genMetrics();
  const old = basket.slice(2);
  check('jd_old aliases', old.map(r => r.alias), ['京麦2607_getProSummary', '京麦2607_getProTrend', '京麦2607_getVenderDealSummayData']);
  const vp = JSON.parse(old[2].response).content;
  check('vender.DealAmt', vp.summary.DealAmt.Value, 3450240);
  check('vender.cmpUV=2507', vp.summary.UV.PreValue, JSON.parse(base.rules.find(r => r.alias === '京麦2507_getVenderDealSummayData').response).content.summary.UV.Value);
  check('proTrend days', JSON.parse(old[1].response).content.categories.length, 31);
  check('url date', old[0].pattern.includes('date=2607&startDate=2026-07-01&endDate=2026-07-31'), true);

  const tpl = base.rules.find(r => r.alias === '猫超-26年6月支付金额');
  const cl = cloneRule('tmall', tpl, 2026, 7, { alias: '猫超-26年7月支付金额', overrides: [{ field: 'pay_ord_amt_1d', value: '3500000' }] });
  const row = JSON.parse(cl.response).data.data[0];
  check('tmall.stat_date', row.stat_date, '20260731');
  check('tmall.override', row.pay_ord_amt_1d, 3500000);
  check('tmall.body has 20260731+1757', cl.bodyPattern.includes('"value":"20260731"') && cl.bodyPattern.includes('"code":"1757"'), true);

  const wx = base.rules.find(r => r.alias === '微信小店2604');
  const cl2 = cloneRule('wx', wx, 2026, 7, { alias: '微信小店2607' });
  check('wx.startMs', cl2.bodyPattern.includes('"startMs":' + (Date.UTC(2026,6,1) - 8*3600000)), true);

  const sy = base.rules.find(r => r.alias === '生意参谋-26年4月');
  const cl3 = cloneRule('sycm', sy, 2026, 7, { alias: '生意参谋-26年7月' });
  check('sycm.dateRange', cl3.pattern.includes('dateRange=2026-07-01%7C2026-07-31'), true);

  const sz = base.rules.find(r => r.alias === 'hsh-26.03-total');
  const cl4 = cloneRule('szc', sz, 2026, 7, { alias: 'hsh-26.07-total' });
  check('szc.sbrqq (total)', cl4.bodyPattern.includes('"sbrqq":"2026-08-01"'), true);
  const szd = base.rules.find(r => r.alias === 'hxh-26.3-01');
  const cl5 = cloneRule('szc', szd, 2026, 7, { alias: 'hsh-26.7-01' });
  check('szc.skssqq (detail)', cl5.bodyPattern.includes('"skssqq":"2026-07-01"'), true);

  // custom rule
  curTab = 'custom';
  E('c_alias').value = '测试'; E('c_pattern').value = 'foo.bar/api'; E('c_resp').value = '{"a":1}';
  genCustom();
  check('custom added', basket[basket.length - 1].alias, '测试');
})();
`;

eval(src + '\nglobal.check = check;\n' + test);
console.log(fails === 0 ? '\n=== ALL ASSERTIONS PASSED ===' : `\n=== ${fails} FAILURES ===`);
process.exit(fails === 0 ? 0 : 1);
