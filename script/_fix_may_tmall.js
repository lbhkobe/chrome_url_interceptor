const fs = require('fs');
const path = require('path');

const rulesPath = path.join(__dirname, '..', 'rules', 'txcs-interceptor-rules (4).json');
const correctedPath = path.join(__dirname, '天猫超市26年5月支付金额_new.json');

const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
const corrected = fs.readFileSync(correctedPath, 'utf8');

const idx = rules.rules.findIndex(r => r.alias === '猫超-26年5月支付金额');
console.log('Found rule at index:', idx);

rules.rules[idx].response = JSON.stringify(JSON.parse(corrected), null, 2);

fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2), 'utf8');
console.log('Done. Updated rule response.');

const d = JSON.parse(rules.rules[idx].response).data.data[0];
console.log('Verification - key values:');
console.log('  ipv_1d (浏览量):', d.ipv_1d);
console.log('  ipvuv_1d (访客数):', d.ipvuv_1d);
console.log('  pay_byr_cnt_1d (成交人数):', d.pay_byr_cnt_1d);
console.log('  pay_byr_rate_1d (成交转化率):', d.pay_byr_rate_1d);
console.log('  pay_ord_cnt_1d (成交单量):', d.pay_ord_cnt_1d);
console.log('  pay_itm_qty_1d (成交商品件数):', d.pay_itm_qty_1d);
console.log('  pay_ord_amt_1d (成交金额):', d.pay_ord_amt_1d);
console.log('  pay_pbt_1d (成交客单价):', d.pay_pbt_1d);
