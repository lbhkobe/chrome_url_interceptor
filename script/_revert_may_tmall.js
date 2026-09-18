const fs = require('fs');
const path = require('path');

const rulesPath = path.join(__dirname, '..', 'rules', 'txcs-interceptor-rules (4).json');
const originalPath = path.join(__dirname, '天猫超市26年5月支付金额.json');

const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
const original = fs.readFileSync(originalPath, 'utf8');

const idx = rules.rules.findIndex(r => r.alias === '猫超-26年5月支付金额');
console.log('Found rule at index:', idx);

// Revert to original data
rules.rules[idx].response = JSON.stringify(JSON.parse(original), null, 2);

fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2), 'utf8');
console.log('Reverted 猫超-26年5月支付金额 to original values.');

const d = JSON.parse(rules.rules[idx].response).data.data[0];
console.log('Verification (restored):');
console.log('  ipvuv_1d:', d.ipvuv_1d, '| pay_ord_amt_1d:', d.pay_ord_amt_1d);
