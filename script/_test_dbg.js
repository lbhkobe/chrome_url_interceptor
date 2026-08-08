// Step-by-step debug of rule-generator.js core functions (no DOM panel flow)
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
  console.log('T0 start');
  const rulesPath = 'e:\\\\Whale\\\\tmcs_extension\\\\rules\\\\txcs-interceptor-rules - 海盛和食品0808.json';
  console.log('T0.5 loading base');
  base = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  baseName = '海盛和食品0808.json';
  console.log('T0.6 base parsed:', base.rules.length);

  // expose fs to eval scope via closure param
  console.log('T1 before genMetrics');
  E('m_ym').value = '2026-07';
  E('m_cmpSrc').value = 'auto';
  E('cur_PV').value = '377826'; E('cur_UV').value = '111442';
  E('cur_DealUser').value = '9584'; E('cur_DealRatePct').value = '8.60';
  E('cur_DealNum').value = '8261'; E('cur_DealProNum').value = '9318';
  E('cur_DealAmt').value = '3450240'; E('cur_DealPriceAvg').value = '360';
  E('cur_ToCartUser').value = '9584';
  genMetrics();
  console.log('T1 basket:', basket.map(b => b.alias).join(', '));

  console.log('T2 before jd_old');
  curTab = 'jd_old';
  genMetrics();
  console.log('T2 basket now:', basket.length);

  console.log('T3 before tmall clone');
  const tpl = base.rules.find(r => r.alias === '猫超-26年6月支付金额');
  console.log('T3.1 tpl found:', !!tpl);
  const cl = cloneRule('tmall', tpl, 2026, 7, { alias: '猫超-26年7月支付金额', overrides: [{ field: 'pay_ord_amt_1d', value: '3500000' }] });
  console.log('T3 done:', cl.alias);

  console.log('T4 before wx clone');
  const wx = base.rules.find(r => r.alias === '微信小店2604');
  const cl2 = cloneRule('wx', wx, 2026, 7, { alias: '微信小店2607' });
  console.log('T4 done:', cl2.bodyPattern.slice(0, 80));

  console.log('T5 before sycm/szc clone');
  const sy = base.rules.find(r => r.alias === '生意参谋-26年4月');
  const cl3 = cloneRule('sycm', sy, 2026, 7, { alias: '生意参谋-26年7月' });
  console.log('T5.1 sycm done:', cl3.pattern.slice(0, 80));
  const sz = base.rules.find(r => r.alias === 'hsh-26.03-total');
  const cl4 = cloneRule('szc', sz, 2026, 7, { alias: 'hsh-26.07-total' });
  console.log('T5.2 szc done:', (cl4.bodyPattern || '').slice(0, 80));

  console.log('ALL TESTS DONE');
})();
`;

global.fs = fs; // expose to eval scope
eval(src + test);
