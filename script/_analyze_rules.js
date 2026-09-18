// Analyze rule file: group by category, show pattern/bodyPattern/response shape
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'rules', 'txcs-interceptor-rules - 海盛和食品0808.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

function categorize(alias) {
  if (alias.startsWith('猫超')) return '猫超';
  if (alias.startsWith('生意参谋')) return '生意参谋(淘宝)';
  if (alias.startsWith('趋势分析表')) return '趋势分析表';
  if (alias.startsWith('微信小店')) return '微信小店';
  if (alias.startsWith('京麦新版')) return '京麦新版';
  if (alias.startsWith('京麦')) return '京麦旧版';
  if (/^(hsh|hxh)-/.test(alias)) return '微信小店(hsh/hxh前缀)';
  return '其他(' + alias + ')';
}

const groups = {};
for (const r of data.rules) {
  const cat = categorize(r.alias);
  if (!groups[cat]) groups[cat] = [];
  groups[cat].push(r);
}

for (const [cat, rules] of Object.entries(groups)) {
  console.log(`\n══════ ${cat} (${rules.length}条) ══════`);
  // unique patterns
  const patterns = [...new Set(rules.map(r => r.pattern))];
  patterns.forEach(p => console.log('  URL:', p));
  // sample bodyPatterns per pattern
  for (const p of patterns) {
    const sample = rules.find(r => r.pattern === p);
    console.log(`  [${sample.alias}] bodyPattern:`, JSON.stringify(sample.bodyPattern || '').slice(0, 200));
    console.log(`    cookiePattern:`, JSON.stringify(sample.cookiePattern || ''));
    // response top-level shape
    try {
      const resp = JSON.parse(sample.response);
      const keys = Object.keys(resp);
      console.log('    response顶层keys:', keys.join(','));
      if (resp.content && resp.content.summary) console.log('    summary字段:', Object.keys(resp.content.summary).join(','));
      if (resp.body && resp.body.data && resp.body.data[0]) {
        const d = resp.body.data[0];
        if (d.trend) console.log('    trend series:', d.trend.series.map(s => s.code.slice(-20)).join(','));
        else console.log('    data[0]字段数:', Object.keys(d).length, '示例:', Object.keys(d).slice(0, 6).join(','));
      }
      if (resp.data && resp.data.data) console.log('    data.data[0]字段数:', Object.keys(resp.data.data[0]).length);
    } catch (e) { console.log('    response非JSON'); }
  }
  console.log('  aliases:', rules.map(r => r.alias).slice(0, 8).join(' | '), rules.length > 8 ? '...' : '');
}
