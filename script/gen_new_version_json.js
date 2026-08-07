/**
 * Generate new-format JSON files (getSummary + getTrend) for months 2501-2606.
 *
 * New format field mapping (old → new):
 *   ToCartUser → jdr_sch_user_deal_ord_user_cnt_sz_user_deal_snapshot   (成交人数)
 *   PV         → jdr_sch_traffic_brow_sku__page_qtty_traffic_plat_item_di_sz_bsg  (浏览量)
 *   UV         → jdr_sch_traffic_brow_sku__page_cnt_traffic_plat_item_di_sz_bsg   (访客数)
 *   DealAmt    → jdr_sch_trade_deal_ord_ord_amt_sz_trade_deal_snapshot  (成交金额)
 *   DealNum    → jdr_sch_trade_deal_ord_ord_qtty_sz_trade_deal_snapshot (成交单量)
 *   DealProNum → jdr_sch_trade_deal_ord_sku_qtty_sz_trade_deal_snapshot (成交商品件数)
 *   DealRate   → fo_jdr_sch_industry_deal_rate                         (成交转化率, = DealUser/UV)
 *   DealPriceAvg → fo_jdr_sch_trade_deal_ord_amt_user_sz_trade_deal_snapshot (客单价, = DealAmt/DealUser)
 */
const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const MONTHS = [
  '2501','2502','2503','2504','2505','2506',
  '2507','2508','2509','2510','2511','2512',
  '2601','2602','2603','2604','2605','2606'
];

const SRC_DIR = path.join(__dirname, 'getProSummary_monthly_json');
const OUT_DIR = path.join(__dirname, 'new_version_json');

// New field codes
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

// Trend series to include (old name → new code)
const TREND_SERIES = {
  DealAmt:    F.DealAmt,
  DealNum:    F.DealNum,
  DealProNum: F.DealProNum,
  DealUser:   F.DealUser,
  PV:         F.PV,
  UV:         F.UV,
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function readJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

function daysInMonth(yymm) {
  const yy = parseInt(yymm.slice(0, 2), 10);
  const mm = parseInt(yymm.slice(2), 10);
  const year = 2000 + yy;
  return new Date(year, mm, 0).getDate();
}

function makeCategories(yymm) {
  const yy = parseInt(yymm.slice(0, 2), 10);
  const mm = parseInt(yymm.slice(2), 10);
  const year = 2000 + yy;
  const days = daysInMonth(yymm);
  const cats = [];
  for (let d = 1; d <= days; d++) {
    cats.push(`${year}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  }
  return cats;
}

function sumArray(arr) {
  return arr.reduce((a, b) => a + (b || 0), 0);
}

function compare(value, compareValue) {
  if (!compareValue || compareValue === 0) return null;
  return (value - compareValue) / compareValue;
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

// Convert 0 → null for deal metrics in trend data
function nullifyZeros(arr) {
  return arr.map(v => (v === 0 || v === 0.0) ? null : v);
}

// ── Load all source data ────────────────────────────────────────────────────
const allSummary = {};  // yymm → { ToCartUser, UV, PV, DealAmt, DealProNum, + PreValues }
const allTrend = {};    // yymm → { seriesName: [...dailyValues] }

for (const yymm of MONTHS) {
  const summaryPath = path.join(SRC_DIR, `京麦${yymm}_getProSummary.json`);
  const trendPath = path.join(SRC_DIR, `京麦${yymm}_getProTrend.json`);

  const summaryData = readJSON(summaryPath);
  const s = summaryData.content.summary;
  allSummary[yymm] = {
    ToCartUser: s.ToCartUser.Value,
    ToCartUser_Pre: s.ToCartUser.PreValue,
    UV: s.UV.Value,
    UV_Pre: s.UV.PreValue,
    PV: s.PV.Value,
    PV_Pre: s.PV.PreValue,
    DealAmt: s.DealAmt.Value,
    DealAmt_Pre: s.DealAmt.PreValue,
    DealProNum: s.DealProNum.Value,
    DealProNum_Pre: s.DealProNum.PreValue,
    DealProNum_Rate: s.DealProNum.Rate,
  };

  const trendData = readJSON(trendPath);
  allTrend[yymm] = {};
  if (trendData && trendData.content && trendData.content.series) {
    const series = trendData.content.series;
    for (const ser of series) {
      allTrend[yymm][ser.name] = ser.data;
    }
  } else {
    // Trend file empty/invalid — will generate from summary
    console.log(`  ⚠ ${yymm} trend file empty, will generate from summary.`);
  }
}

// ── Seeded PRNG for reproducible daily distributions ─────────────────────────
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
    const dow = (i + new Date(2026, 0, 1).getDay()) % 7;
    const base = (dow === 0 || dow === 6) ? 0.88 : 1.0;
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

// Generate daily DealAmt with decimal values
function distributeAmt(total, days, seed) {
  const rng = lcg(seed);
  const weights = [];
  for (let i = 0; i < days; i++) {
    weights.push(0.85 + rng() * 0.30);
  }
  const sumW = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => Math.round((w / sumW) * total * 100) / 100);
}

// ── Compute DealNum for each month from trend ───────────────────────────────
const dealNumByMonth = {};
for (const yymm of MONTHS) {
  const dealNumSeries = allTrend[yymm].DealNum;
  if (dealNumSeries && dealNumSeries.length > 0) {
    dealNumByMonth[yymm] = sumArray(dealNumSeries);
  } else {
    // Derive from ToCartUser * 1.08 if DealNum series missing
    dealNumByMonth[yymm] = Math.round(allSummary[yymm].ToCartUser * 1.08);
  }
}

// ── Fill missing trend data from summary values ─────────────────────────────
for (const yymm of MONTHS) {
  if (Object.keys(allTrend[yymm]).length === 0) {
    const src = allSummary[yymm];
    const days = daysInMonth(yymm);
    const baseSeed = parseInt(yymm, 10);
    allTrend[yymm].DealAmt = distributeAmt(src.DealAmt, days, baseSeed + 1);
    allTrend[yymm].DealNum = distribute(dealNumByMonth[yymm], days, baseSeed + 2);
    allTrend[yymm].DealProNum = distribute(src.DealProNum, days, baseSeed + 3);
    allTrend[yymm].DealUser = distribute(src.ToCartUser, days, baseSeed + 4);
    allTrend[yymm].PV = distribute(src.PV, days, baseSeed + 5);
    allTrend[yymm].UV = distribute(src.UV, days, baseSeed + 6);
  }
}

// ── Generate output files ───────────────────────────────────────────────────
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

for (const yymm of MONTHS) {
  const src = allSummary[yymm];
  const days = daysInMonth(yymm);

  // ─── Determine compareValues ───────────────────────────────────────────
  let cmp = {};
  const mm = yymm.slice(2); // month part
  const isYear26 = yymm.startsWith('26');
  const prevYearYYMM = isYear26 ? `25${mm}` : null;

  if (isYear26 && allSummary[prevYearYYMM]) {
    // 2026 months: compareValue = 2025 same-month actual values
    const prev = allSummary[prevYearYYMM];
    cmp.ToCartUser = prev.ToCartUser;
    cmp.UV = prev.UV;
    cmp.PV = prev.PV;
    cmp.DealAmt = prev.DealAmt;
    cmp.DealProNum = prev.DealProNum;
    cmp.DealNum = dealNumByMonth[prevYearYYMM] || Math.round(prev.ToCartUser * 1.08);
  } else {
    // 2025 months: compareValue = PreValue from source (2024 data)
    cmp.ToCartUser = src.ToCartUser_Pre;
    cmp.UV = src.UV_Pre;
    cmp.PV = src.PV_Pre;
    cmp.DealAmt = src.DealAmt_Pre;
    cmp.DealProNum = src.DealProNum_Pre;
    // DealNum for 2024: estimate from current DealNum / (1 + DealProNum_Rate)
    const rate = src.DealProNum_Rate || 0.2;
    cmp.DealNum = Math.round(dealNumByMonth[yymm] / (1 + rate));
  }

  // ─── Compute summary values ────────────────────────────────────────────
  const DealUser = src.ToCartUser;
  const UV = src.UV;
  const PV = src.PV;
  const DealAmt = src.DealAmt;
  const DealProNum = src.DealProNum;
  const DealNum = dealNumByMonth[yymm];
  const DealRate = DealUser / UV;
  const DealPriceAvg = DealUser > 0 ? DealAmt / DealUser : 0;

  const cmpDealRate = cmp.ToCartUser / cmp.UV;
  const cmpDealPriceAvg = cmp.ToCartUser > 0 ? cmp.DealAmt / cmp.ToCartUser : 0;

  // ─── Build getSummary JSON ─────────────────────────────────────────────
  const summaryObj = {};
  // DealRate (calculated field with fo_ prefix)
  summaryObj[F.DealRate + '##compareValue'] = cmpDealRate;
  summaryObj[F.PV + '##compareValue'] = cmp.PV;
  summaryObj[F.DealNum + '##compare'] = compare(DealNum, cmp.DealNum);
  summaryObj[F.DealProNum] = DealProNum * 1.0;
  summaryObj[F.UV] = UV;
  summaryObj[F.UV + '##compare'] = compare(UV, cmp.UV);
  summaryObj[F.DealRate + '##compare'] = compare(DealRate, cmpDealRate);
  summaryObj[F.DealPriceAvg] = Math.round(DealPriceAvg * 10000000000) / 10000000000;
  summaryObj[F.DealPriceAvg + '##compareValue'] = Math.round(cmpDealPriceAvg * 10000000000) / 10000000000;
  summaryObj[F.PV + '##compare'] = compare(PV, cmp.PV);
  summaryObj[F.PV] = PV * 1.0;
  summaryObj[F.DealUser] = DealUser;
  summaryObj[F.DealNum] = DealNum;
  summaryObj[F.DealAmt + '##compare'] = compare(DealAmt, cmp.DealAmt);
  summaryObj[F.DealUser + '##compare'] = compare(DealUser, cmp.ToCartUser);
  summaryObj[F.UV + '##compareValue'] = cmp.UV;
  summaryObj[F.DealProNum + '##compare'] = compare(DealProNum, cmp.DealProNum);
  summaryObj[F.DealPriceAvg + '##compare'] = compare(DealPriceAvg, cmpDealPriceAvg);
  summaryObj[F.DealAmt] = DealAmt * 1.0;
  summaryObj[F.DealAmt + '##compareValue'] = cmp.DealAmt;
  summaryObj[F.DealProNum + '##compareValue'] = cmp.DealProNum;
  summaryObj[F.DealNum + '##compareValue'] = cmp.DealNum;
  summaryObj[F.DealRate] = DealRate;
  summaryObj[F.DealUser + '##compareValue'] = cmp.ToCartUser;

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

  // ─── Build getTrend JSON ───────────────────────────────────────────────
  const categories = makeCategories(yymm);
  const trendSeriesArr = [];

  for (const [oldName, newCode] of Object.entries(TREND_SERIES)) {
    let data = allTrend[yymm][oldName];
    if (!data) {
      // If series missing, skip
      continue;
    }
    // Trim or pad to match actual days in month
    if (data.length > days) {
      data = data.slice(0, days);
    } else if (data.length < days) {
      // Pad with null
      data = [...data, ...Array(days - data.length).fill(null)];
    }
    // For deal metrics, convert 0 → null
    const isDealMetric = ['DealAmt', 'DealNum', 'DealProNum', 'DealUser'].includes(oldName);
    if (isDealMetric) {
      data = nullifyZeros(data);
    }
    trendSeriesArr.push({ code: newCode, data });
  }

  const getTrendJSON = {
    header: { code: 0, desc: "success" },
    body: {
      data: [{
        trend: {
          series: trendSeriesArr,
          categories
        }
      }],
      size: null,
      cache: true,
      traceId: genTraceId(),
      uuid: genUuid()
    },
    errors: null
  };

  // ─── Write files ───────────────────────────────────────────────────────
  const summaryPath = path.join(OUT_DIR, `getSummary_${yymm}.json`);
  const trendPath = path.join(OUT_DIR, `getTrend_${yymm}.json`);

  fs.writeFileSync(summaryPath, JSON.stringify(getSummaryJSON, null, 4), 'utf8');
  fs.writeFileSync(trendPath, JSON.stringify(getTrendJSON, null, 4), 'utf8');

  console.log(`✓ ${yymm}: getSummary (DealUser=${DealUser}, DealAmt=${DealAmt}, UV=${UV}) | getTrend (${trendSeriesArr.length} series, ${days} days)`);
}

console.log(`\nDone! Generated ${MONTHS.length * 2} files in ${OUT_DIR}`);
