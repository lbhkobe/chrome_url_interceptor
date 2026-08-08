/**
 * Add 京麦新版 2607/2608 rules (getSummary + getTrend) to both store rule files.
 *
 * Reference (user-provided):
 *   July 2026:  PV=377826, UV=111442, DealUser=9584,  DealRate=8.60%,
 *               DealNum=8261, DealProNum=9318,  DealAmt=3450240, DealPriceAvg=360
 *   Aug  2026:  PV=414967, UV=121158, DealUser=10359, DealRate=8.55%,
 *               DealNum=8940, DealProNum=10093, DealAmt=3749958, DealPriceAvg=362
 *
 * Compare base: 2607 → June (read from existing 2606 rule in each file),
 *               2608 → July (values above).
 *
 * Outputs (new files, originals untouched):
 *   rules/txcs-interceptor-rules - 海盛和食品0808.json
 *   rules/txcs-interceptor-rules - 蓝色海洋0808.json
 *   script/new_version_json/getSummary_2607.json ... getTrend_2608.json
 */
const fs = require('fs');
const path = require('path');

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

const JUL = { yymm: '2607', year: 2026, month: 7,
  PV: 377826, UV: 111442, DealUser: 9584, DealRate: 0.086,
  DealNum: 8261, DealProNum: 9318, DealAmt: 3450240, DealPriceAvg: 360 };

const AUG = { yymm: '2608', year: 2026, month: 8,
  PV: 414967, UV: 121158, DealUser: 10359, DealRate: 0.0855,
  DealNum: 8940, DealProNum: 10093, DealAmt: 3749958, DealPriceAvg: 362 };

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
function pad2(n) { return String(n).padStart(2, '0'); }
function lastDay(year, month) { return new Date(year, month, 0).getDate(); }

// ── Seeded PRNG + largest-remainder daily distribution ──────────────────────
function lcg(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
function dailyWeights(year, month, seed) {
  const days = lastDay(year, month);
  const rng = lcg(seed);
  const w = [];
  for (let i = 0; i < days; i++) {
    const dow = new Date(year, month - 1, i + 1).getDay();
    const base = (dow === 0 || dow === 6) ? 0.85 : 1.0;
    w.push(base * (0.85 + rng() * 0.30));
  }
  return w;
}
function distribute(total, year, month, seed) {
  const w = dailyWeights(year, month, seed);
  const sumW = w.reduce((a, b) => a + b, 0);
  const raw = w.map(x => (x / sumW) * total);
  const floored = raw.map(Math.floor);
  let rem = total - floored.reduce((a, b) => a + b, 0);
  const fracs = raw.map((v, i) => ({ i, f: v - floored[i] })).sort((a, b) => b.f - a.f);
  for (let k = 0; k < rem; k++) floored[fracs[k].i]++;
  return floored;
}
function distributeAmt(total, year, month, seed) {
  const w = dailyWeights(year, month, seed);
  const sumW = w.reduce((a, b) => a + b, 0);
  return w.map(x => Math.round((x / sumW) * total * 100) / 100);
}

// ── Builders ────────────────────────────────────────────────────────────────
function buildSummary(cur, prev) {
  const d = {};
  d[F.DealRate + '##compareValue'] = prev.DealRate;
  d[F.PV + '##compareValue'] = prev.PV;
  d[F.DealNum + '##compare'] = compare(cur.DealNum, prev.DealNum);
  d[F.DealProNum] = cur.DealProNum * 1.0;
  d[F.UV] = cur.UV;
  d[F.UV + '##compare'] = compare(cur.UV, prev.UV);
  d[F.DealRate + '##compare'] = compare(cur.DealRate, prev.DealRate);
  d[F.DealPriceAvg] = cur.DealPriceAvg * 1.0;
  d[F.DealPriceAvg + '##compareValue'] = prev.DealPriceAvg * 1.0;
  d[F.PV + '##compare'] = compare(cur.PV, prev.PV);
  d[F.PV] = cur.PV * 1.0;
  d[F.DealUser] = cur.DealUser;
  d[F.DealNum] = cur.DealNum;
  d[F.DealAmt + '##compare'] = compare(cur.DealAmt, prev.DealAmt);
  d[F.DealUser + '##compare'] = compare(cur.DealUser, prev.DealUser);
  d[F.UV + '##compareValue'] = prev.UV;
  d[F.DealProNum + '##compare'] = compare(cur.DealProNum, prev.DealProNum);
  d[F.DealPriceAvg + '##compare'] = compare(cur.DealPriceAvg, prev.DealPriceAvg);
  d[F.DealAmt] = cur.DealAmt * 1.0;
  d[F.DealAmt + '##compareValue'] = prev.DealAmt * 1.0;
  d[F.DealProNum + '##compareValue'] = prev.DealProNum * 1.0;
  d[F.DealNum + '##compareValue'] = prev.DealNum;
  d[F.DealRate] = cur.DealRate;
  d[F.DealUser + '##compareValue'] = prev.DealUser;
  return {
    header: { code: 0, desc: "success" },
    body: { data: [d], size: 1, cache: true, traceId: genTraceId(), uuid: genUuid() },
    errors: null
  };
}

function buildTrend(cur) {
  const days = lastDay(cur.year, cur.month);
  const categories = Array.from({ length: days }, (_, i) =>
    `${cur.year}-${pad2(cur.month)}-${pad2(i + 1)}`);
  const base = parseInt(cur.yymm, 10);
  const series = [
    { code: F.DealAmt,    data: distributeAmt(cur.DealAmt, cur.year, cur.month, base + 1) },
    { code: F.DealNum,    data: distribute(cur.DealNum, cur.year, cur.month, base + 2) },
    { code: F.DealProNum, data: distribute(cur.DealProNum, cur.year, cur.month, base + 3) },
    { code: F.DealUser,   data: distribute(cur.DealUser, cur.year, cur.month, base + 4) },
    { code: F.PV,         data: distribute(cur.PV, cur.year, cur.month, base + 5) },
    { code: F.UV,         data: distribute(cur.UV, cur.year, cur.month, base + 6) },
  ];
  return {
    header: { code: 0, desc: "success" },
    body: { data: [{ trend: { series, categories } }], size: null, cache: true,
            traceId: genTraceId(), uuid: genUuid() },
    errors: null
  };
}

function buildBodySummary(year, month) {
  const p = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const cur = `${year}-${pad2(month)}`;
  return [`"startDate":"${cur}"`, `"endDate":"${cur}"`,
          `"compareStartDate":"${p.y}-${pad2(p.m)}"`].join('\n');
}
function buildBodyTrend(year, month) {
  const p = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  return [
    `"startDate":"${year}-${pad2(month)}-01"`,
    `"endDate":"${year}-${pad2(month)}-${pad2(lastDay(year, month))}"`,
    `"compareStartDate":"${p.y}-${pad2(p.m)}-01"`,
    `"compareEndDate":"${p.y}-${pad2(p.m)}-${pad2(lastDay(p.y, p.m))}"`
  ].join('\n');
}

// ── Generate standalone JSONs + per-month rule descriptors ──────────────────
const outDir = path.join(__dirname, 'new_version_json');
const months = [JUL, AUG];
const prevOf = { '2607': null, '2608': JUL }; // 2607 prev filled from file's 2606 rule

for (const m of months) {
  const prev = prevOf[m.yymm];
  if (!prev) continue;
  const sum = buildSummary(m, prev);
  const trd = buildTrend(m);
  fs.writeFileSync(path.join(outDir, `getSummary_${m.yymm}.json`), JSON.stringify(sum, null, 4), 'utf8');
  fs.writeFileSync(path.join(outDir, `getTrend_${m.yymm}.json`), JSON.stringify(trd, null, 4), 'utf8');
  console.log(`✓ new_version_json/getSummary_${m.yymm}.json & getTrend_${m.yymm}.json`);
}

// ── Append rules into new 0808 files for both stores ────────────────────────
const stores = ['海盛和食品', '蓝色海洋'];
for (const store of stores) {
  const srcPath = path.join(__dirname, '..', 'rules', `txcs-interceptor-rules - ${store}0723.json`);
  const dstPath = path.join(__dirname, '..', 'rules', `txcs-interceptor-rules - ${store}0808.json`);
  const rulesData = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

  // Extract June values from existing 2606 rule (compare base for 2607)
  const junRule = rulesData.rules.find(r => r.alias === '京麦新版_2606_getSummary');
  const jd = JSON.parse(junRule.response).body.data[0];
  const JUN = {
    PV: jd[F.PV], UV: jd[F.UV], DealUser: jd[F.DealUser], DealRate: jd[F.DealRate],
    DealNum: jd[F.DealNum], DealProNum: jd[F.DealProNum],
    DealAmt: jd[F.DealAmt], DealPriceAvg: jd[F.DealPriceAvg],
  };
  prevOf['2607'] = JUN;

  // Rebuild 2607 summary now that June base is known (also rewrite standalone file)
  const sumJul = buildSummary(JUL, JUN);
  fs.writeFileSync(path.join(outDir, 'getSummary_2607.json'), JSON.stringify(sumJul, null, 4), 'utf8');
  const trdJul = buildTrend(JUL);
  fs.writeFileSync(path.join(outDir, 'getTrend_2607.json'), JSON.stringify(trdJul, null, 4), 'utf8');
  const sumAug = buildSummary(AUG, JUL);
  fs.writeFileSync(path.join(outDir, 'getSummary_2608.json'), JSON.stringify(sumAug, null, 4), 'utf8');
  const trdAug = buildTrend(AUG);
  fs.writeFileSync(path.join(outDir, 'getTrend_2608.json'), JSON.stringify(trdAug, null, 4), 'utf8');

  const newRules = [];
  for (const m of months) {
    const prev = m.yymm === '2607' ? JUN : JUL;
    const sum = m.yymm === '2607' ? sumJul : sumAug;
    const trd = m.yymm === '2607' ? trdJul : trdAug;
    newRules.push({
      alias: `京麦新版_${m.yymm}_getSummary`,
      pattern: '.jd.com/api/lowcode/tradeSummary/summary/getSummary.ajax',
      bodyPattern: buildBodySummary(m.year, m.month),
      contentType: 'application/json',
      enabled: true,
      response: JSON.stringify(sum, null, 4),
      status: 200
    });
    newRules.push({
      alias: `京麦新版_${m.yymm}_getTrend`,
      pattern: '.jd.com/api/lowcode/tradeSummary/summary/getTrend.ajax',
      bodyPattern: buildBodyTrend(m.year, m.month),
      contentType: 'application/json',
      enabled: true,
      response: JSON.stringify(trd, null, 4),
      status: 200
    });
  }

  rulesData.rules = rulesData.rules.concat(newRules);
  fs.writeFileSync(dstPath, JSON.stringify(rulesData, null, 2), 'utf8');
  console.log(`✓ ${dstPath} — total rules: ${rulesData.rules.length} (was ${rulesData.rules.length - newRules.length})`);
}

// ── Verification ───────────────────────────────────────────────────────────
console.log('\nVerification (trend sums):');
for (const yymm of ['2607', '2608']) {
  const t = JSON.parse(fs.readFileSync(path.join(outDir, `getTrend_${yymm}.json`), 'utf8'));
  t.body.data[0].trend.series.forEach(s => {
    console.log(`  ${yymm} ${s.code.slice(-28)}: ${Math.round(s.data.reduce((a, b) => a + b, 0))}`);
  });
}
