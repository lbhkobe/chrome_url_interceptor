/**
 * Fix 京麦新版_2606 data with correct June 2026 values.
 * 
 * Reference (user-provided):
 *   May 2026:  PV=533148,  UV=161560,  DealUser=14266, DealRate=8.83%,
 *              DealNum=12156, DealProNum=13736, DealAmt=5178471, DealPriceAvg=363
 *   June 2026: PV=616361,  UV=195670,  DealUser=17845, DealRate=9.12%,
 *              DealNum=15365, DealProNum=17177, DealAmt=6281485, DealPriceAvg=352
 *
 * Compare = Month-over-Month (June vs May)
 */
const fs = require('fs');
const path = require('path');

// ── Field codes ──────────────────────────────────────────────────────────────
const F = {
  PV:           'jdr_sch_traffic_brow_sku__page_qtty_traffic_plat_item_di_sz_bsg',
  UV:           'jdr_sch_traffic_brow_sku__page_cnt_traffic_plat_item_di_sz_bsg',
  DealUser:     'jdr_sch_user_deal_ord_user_cnt_sz_user_deal_snapshot',
  DealRate:     'fo_jdr_sch_industry_deal_rate',
  DealNum:      'jdr_sch_trade_deal_ord_ord_qtty_sz_trade_deal_snapshot',
  DealProNum:   'jdr_sch_trade_deal_ord_sku_qtty_sz_trade_deal_snapshot',
  DealAmt:      'jdr_sch_trade_deal_ord_ord_amt_sz_trade_deal_snapshot',
  DealPriceAvg: 'fo_jdr_sch_trade_deal_ord_amt_user_sz_trade_deal_snapshot',
};

// ── June 2026 values ─────────────────────────────────────────────────────────
const JUN = {
  PV: 616361, UV: 195670, DealUser: 17845, DealRate: 0.0912,
  DealNum: 15365, DealProNum: 17177, DealAmt: 6281485, DealPriceAvg: 352
};

// ── May 2026 values (comparison base, from bodyPattern compareStartDate=2026-05)
const MAY = {
  PV: 533148, UV: 161560, DealUser: 14266, DealRate: 0.0883,
  DealNum: 12156, DealProNum: 13736, DealAmt: 5178471, DealPriceAvg: 363
};

function compare(cur, prev) {
  if (!prev || prev === 0) return null;
  return (cur - prev) / prev;
}

function genTraceId() {
  return `${Math.floor(Math.random()*9000000+1000000)}.73483.${Date.now()}${Math.floor(Math.random()*10000)}`;
}
function genUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// getSummary_2606.json
// ═══════════════════════════════════════════════════════════════════════════════
const summaryObj = {};
summaryObj[F.DealRate + '##compareValue'] = MAY.DealRate;
summaryObj[F.PV + '##compareValue'] = MAY.PV;
summaryObj[F.DealNum + '##compare'] = compare(JUN.DealNum, MAY.DealNum);
summaryObj[F.DealProNum] = JUN.DealProNum * 1.0;
summaryObj[F.UV] = JUN.UV;
summaryObj[F.UV + '##compare'] = compare(JUN.UV, MAY.UV);
summaryObj[F.DealRate + '##compare'] = compare(JUN.DealRate, MAY.DealRate);
summaryObj[F.DealPriceAvg] = JUN.DealPriceAvg * 1.0;
summaryObj[F.DealPriceAvg + '##compareValue'] = MAY.DealPriceAvg * 1.0;
summaryObj[F.PV + '##compare'] = compare(JUN.PV, MAY.PV);
summaryObj[F.PV] = JUN.PV * 1.0;
summaryObj[F.DealUser] = JUN.DealUser;
summaryObj[F.DealNum] = JUN.DealNum;
summaryObj[F.DealAmt + '##compare'] = compare(JUN.DealAmt, MAY.DealAmt);
summaryObj[F.DealUser + '##compare'] = compare(JUN.DealUser, MAY.DealUser);
summaryObj[F.UV + '##compareValue'] = MAY.UV;
summaryObj[F.DealProNum + '##compare'] = compare(JUN.DealProNum, MAY.DealProNum);
summaryObj[F.DealPriceAvg + '##compare'] = compare(JUN.DealPriceAvg, MAY.DealPriceAvg);
summaryObj[F.DealAmt] = JUN.DealAmt * 1.0;
summaryObj[F.DealAmt + '##compareValue'] = MAY.DealAmt * 1.0;
summaryObj[F.DealProNum + '##compareValue'] = MAY.DealProNum * 1.0;
summaryObj[F.DealNum + '##compareValue'] = MAY.DealNum;
summaryObj[F.DealRate] = JUN.DealRate;
summaryObj[F.DealUser + '##compareValue'] = MAY.DealUser;

const getSummaryJSON = {
  header: { code: 0, desc: "success" },
  body: {
    data: [summaryObj],
    size: 1,
    cache: true,
    traceId: genTraceId(),
    uuid: genUuid()
  },
  errors: null
};

// ═══════════════════════════════════════════════════════════════════════════════
// getTrend_2606.json — generate 30 days for June 2026
// ═══════════════════════════════════════════════════════════════════════════════
function lcg(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function distribute(total, days, seed) {
  const rng = lcg(seed);
  const weights = [];
  for (let i = 0; i < days; i++) {
    // June 2026: day 1 = Monday (dow=1)
    const dow = (i + 1) % 7; // Mon=1, Tue=2, ... Sun=0
    const base = (dow === 0 || dow === 6) ? 0.85 : 1.0;
    weights.push(base * (0.85 + rng() * 0.30));
  }
  const sumW = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map(w => (w / sumW) * total);
  const floored = raw.map(Math.floor);
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const fracs = raw.map((v, i) => ({ i, f: v - floored[i] }));
  fracs.sort((a, b) => b.f - a.f);
  for (let k = 0; k < remainder; k++) floored[fracs[k].i]++;
  return floored;
}

function distributeAmt(total, days, seed) {
  const rng = lcg(seed);
  const weights = [];
  for (let i = 0; i < days; i++) {
    const dow = (i + 1) % 7;
    const base = (dow === 0 || dow === 6) ? 0.85 : 1.0;
    weights.push(base * (0.85 + rng() * 0.30));
  }
  const sumW = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => Math.round((w / sumW) * total * 100) / 100);
}

const DAYS = 30;
const categories = Array.from({ length: DAYS }, (_, i) => {
  return `2026-06-${String(i + 1).padStart(2, '0')}`;
});

const trendSeries = [
  { code: F.DealAmt,    data: distributeAmt(JUN.DealAmt, DAYS, 9001) },
  { code: F.DealNum,    data: distribute(JUN.DealNum, DAYS, 9002) },
  { code: F.DealProNum, data: distribute(JUN.DealProNum, DAYS, 9003) },
  { code: F.DealUser,   data: distribute(JUN.DealUser, DAYS, 9004) },
  { code: F.PV,         data: distribute(JUN.PV, DAYS, 9005) },
  { code: F.UV,         data: distribute(JUN.UV, DAYS, 9006) },
];

const getTrendJSON = {
  header: { code: 0, desc: "success" },
  body: {
    data: [{
      trend: { series: trendSeries, categories }
    }],
    size: null,
    cache: true,
    traceId: genTraceId(),
    uuid: genUuid()
  },
  errors: null
};

// ═══════════════════════════════════════════════════════════════════════════════
// Write JSON files
// ═══════════════════════════════════════════════════════════════════════════════
const outDir = path.join(__dirname, 'new_version_json');
fs.writeFileSync(path.join(outDir, 'getSummary_2606.json'), JSON.stringify(getSummaryJSON, null, 4), 'utf8');
fs.writeFileSync(path.join(outDir, 'getTrend_2606.json'), JSON.stringify(getTrendJSON, null, 4), 'utf8');

console.log('✓ Regenerated getSummary_2606.json & getTrend_2606.json');
console.log('  DealUser=17845, DealAmt=6281485, UV=195670, PV=616361');
console.log('  CompareValues (May): DealUser=14266, DealAmt=5178471, UV=161560');

// ═══════════════════════════════════════════════════════════════════════════════
// Update rules file — replace 京麦新版_2606_getSummary and 京麦新版_2606_getTrend
// ═══════════════════════════════════════════════════════════════════════════════
const rulesPath = path.join(__dirname, '..', 'rules', 'txcs-interceptor-rules (5).json');
const dstPath   = path.join(__dirname, '..', 'rules', 'txcs-interceptor-rules (6).json');
const rulesData = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));

const idxS = rulesData.rules.findIndex(r => r.alias === '京麦新版_2606_getSummary');
const idxT = rulesData.rules.findIndex(r => r.alias === '京麦新版_2606_getTrend');

console.log(`\n  Rule indices: getSummary=${idxS}, getTrend=${idxT}`);

rulesData.rules[idxS].response = JSON.stringify(getSummaryJSON, null, 4);
rulesData.rules[idxT].response = JSON.stringify(getTrendJSON, null, 4);

fs.writeFileSync(dstPath, JSON.stringify(rulesData, null, 2), 'utf8');
console.log(`✓ Written to: ${dstPath}`);
console.log(`  Total rules: ${rulesData.rules.length}`);

// Verify trend sums
console.log('\n  Trend sums verification:');
trendSeries.forEach(s => {
  const sum = s.data.reduce((a, b) => a + b, 0);
  console.log(`    ${s.code.slice(-30)}: ${Math.round(sum)}`);
});
