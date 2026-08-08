// DOM-stub smoke test for tools/rule-generator.js
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

const test = `
;(function(){
  const E = id => document.getElementById(id);
  const rulesPath = 'e:\\\\Whale\\\\tmcs_extension\\\\rules\\\\txcs-interceptor-rules - 海盛和食品0808.json';
  base = JSON.parse(require('fs').readFileSync(rulesPath, 'utf8'));
  baseName = '海盛和食品0808.json';

  // ── Test 1: jd_new 2026-07 with auto compare (June from file) ──
  E('m_ym').value = '2026-07';
  E('m_cmpSrc').value = 'auto';
  E('cur_PV').value = '377826'; E('cur_UV').value = '111442';
  E('cur_DealUser').value = '9584'; E('cur_DealRatePct').value = '8.60';
  E('cur_DealNum').value = '8261'; E('cur_DealProNum').value = '9318';
  E('cur_DealAmt').value = '3450240'; E('cur_DealPriceAvg').value = '360';
  E('cur_ToCartUser').value = '9584';
  genMetrics();
  console.log('T1 basket:', basket.map(b => b.alias).join(', '));
  const s = JSON.parse(basket[0].response).body.data[0];
  console.log('T1 UV:', s[F.UV], '| cmpUV(expect 195670):', s[F.UV + '##compareValue']);
  console.log('T1 bodySummary:', JSON.stringify(basket[0].bodyPattern));
  const t = JSON.parse(basket[1].response).body.data[0].trend;
  console.log('T1 trend days:', t.categories.length, '| DealAmt sum:', Math.round(t.series[0].data.reduce((a,b)=>a+b,0)));

  // ── Test 2: jd_old 2026-07 with auto compare (2507 from file) ──
  curTab = 'jd_old';
  genMetrics();
  console.log('T2 basket now:', basket.length, 'rules; last3:', basket.slice(-3).map(b => b.alias).join(', '));

  // ── Test 3: clone tmall June→July ──
  const tpl = base.rules.find(r => r.alias === '猫超-26年6月支付金额');
  const cl = cloneRule('tmall', tpl, 2026, 7, { alias: '猫超-26年7月支付金额', overrides: [{ field: 'pay_ord_amt_1d', value: '3500000' }] });
  console.log('T3 body:', JSON.stringify(cl.bodyPattern));
  const row = JSON.parse(cl.response).data.data[0];
  console.log('T3 stat_date(expect 20260731):', row.stat_date, '| pay_ord_amt_1d(expect 3500000):', row.pay_ord_amt_1d);

  // ── Test 4: clone wx 2604→2607 timestamps ──
  const wx = base.rules.find(r => r.alias === '微信小店2604');
  const cl2 = cloneRule('wx', wx, 2026, 7, { alias: '微信小店2607' });
  console.log('T4 wx body:', JSON.stringify(cl2.bodyPattern));

  // ── Test 5: clone sycm + szc ──
  const sy = base.rules.find(r => r.alias === '生意参谋-26年4月');
  const cl3 = cloneRule('sycm', sy, 2026, 7, { alias: '生意参谋-26年7月' });
  console.log('T5 sycm pattern:', cl3.pattern);
  const sz = base.rules.find(r => r.alias === 'hsh-26.03-total');
  const cl4 = cloneRule('szc', sz, 2026, 7, { alias: 'hsh-26.07-total' });
  console.log('T5 szc body:', JSON.stringify(cl4.bodyPattern));

  console.log('ALL TESTS DONE');
})();
`;

eval(src + test);
