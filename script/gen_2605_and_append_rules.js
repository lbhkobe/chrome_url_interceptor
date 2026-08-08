// Append 3 rules for 京麦2605 (May 2026) to the rules file.
// Base metrics for May 2026 come from user image; PreValue uses source '2505'
// (May 2025) as YoY baseline — same pattern as the existing 2501–2604 rules.
// Daily shape uses March 2026 (source '2026-3', 31 days) as template, scaled
// to May 2026 totals via largest-remainder rounding.
//
// Output:
//   - script/getProSummary_monthly_json/京麦2605_getProSummary.json
//   - script/getProSummary_monthly_json/京麦2605_getProTrend.json
//   - script/getVenderDealSummayData_monthly_json/京麦成交概况2026-05.json
//   - rules/txcs-interceptor-rules (4).json  (existing rules + 3 new)

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '京麦2501-2604.json');
const raw = fs.readFileSync(SRC, 'utf8');
// eslint-disable-next-line no-new-func
const src = new Function('return ({' + raw + '})')();

const shape = src['2026-3'];      // 31-day shape template
const ly    = src['2505'];        // May 2025 baseline for YoY

// ── May 2026 totals from image ──
const MAY = {
  PV: 533148, UV: 161560, DealUser: 14266,
  DealNum: 12156, DealProNum: 13736, DealAmt: 5178471,
};
// ── May 2025 baseline (YoY PreValue) ──
const LY = {
  PV: ly.browse, UV: ly.visitors, DealUser: ly.buyers,
  DealNum: ly.orders, DealProNum: ly.items, DealAmt: ly.amount,
};

const D = 31;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const round2 = (x) => Math.round(x * 100) / 100;

function normalizeInt(src, days, total) {
  const arr = src.slice(0, days);
  const s = sum(arr);
  if (s === 0) return arr.map(() => 0);
  const scaled = arr.map((x) => (x * total) / s);
  const out = scaled.map((x) => Math.floor(x));
  const rem = total - sum(out);
  scaled.map((x, i) => ({ i, f: x - Math.floor(x) }))
    .sort((a, b) => b.f - a.f).slice(0, rem)
    .forEach((o) => { out[o.i] += 1; });
  return out;
}
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// ── real daily series (sum exactly matches May totals) ──
const PV      = normalizeInt(shape.dailyTrend.browse,   D, MAY.PV);
const UV      = normalizeInt(shape.dailyTrend.visitors, D, MAY.UV);
const DealAmt = normalizeInt(shape.dailyTrend.amount,   D, MAY.DealAmt);
const DealPro = normalizeInt(shape.dailyTrend.items,    D, MAY.DealProNum);
const DealNum = normalizeInt(shape.dailyTrend.orders,   D, MAY.DealNum);
const DealUsr = normalizeInt(shape.dailyTrend.buyers,   D, MAY.DealUser);

// ── synthesized daily (behavior/goods metrics) ──
const seed = 2026 * 100 + 5;
const j = (rnd) => 0.9 + rnd() * 0.2;
const rTC = lcg(seed + 11), rCP = lcg(seed + 12), rCG = lcg(seed + 13),
      rCo = lcg(seed + 14), rCGd = lcg(seed + 15), rDG = lcg(seed + 16), rVG = lcg(seed + 17);
const ToCartUser = [], ToCartRate = [], CartProNum = [], CartGoodsNum = [],
      CollectNum = [], CollectGoodsNum = [], DealGoodsNum = [], VisitedGoodsNum = [];
for (let i = 0; i < D; i++) {
  const tc = Math.max(DealUsr[i], Math.round(UV[i] * 0.05 * j(rTC)));
  ToCartUser.push(tc);
  ToCartRate.push(UV[i] > 0 ? tc / UV[i] : 0);
  CartProNum.push(Math.round(tc * 1.2 * j(rCP)));
  CartGoodsNum.push(Math.max(1, Math.round(tc * 0.8 * j(rCG))));
  const col = Math.round(UV[i] * 0.01 * j(rCo));
  CollectNum.push(col);
  CollectGoodsNum.push(Math.max(1, Math.round(col * 0.7 * j(rCGd))));
  DealGoodsNum.push(DealPro[i] > 0 ? Math.max(1, Math.round(DealPro[i] * 0.85 * j(rDG))) : 0);
  VisitedGoodsNum.push(Math.max(1, Math.round(UV[i] * 0.08 * j(rVG))));
}

// ── YoY PreValue for synthesized fields: same flat ratios applied to May 2025 base ──
const lyToCart = Math.round(LY.UV * 0.05);
const lyCartPro = Math.round(lyToCart * 1.2);
const lyCartGoods = Math.round(lyToCart * 0.8);
const lyCollect = Math.round(LY.UV * 0.01);
const lyCollectGoods = Math.round(lyCollect * 0.7);
const lyDealGoods = Math.round(LY.DealProNum * 0.85);
const lyVisited = Math.round(LY.UV * 0.08);

// {Value, PreValue, Rate}; Rate = (V-P)/P
const rf = (v, p) => ({ Value: v, PreValue: p, Rate: p === 0 ? 0 : (v - p) / p });

// ── categories ──
const categories = [];
for (let d = 1; d <= D; d++) categories.push(`2026-05-${String(d).padStart(2, '0')}`);

// ── proSummary body ──
const proSummary = {
  message: 'success',
  content: {
    summary: {
      CollectGoodsNum: rf(sum(CollectGoodsNum), lyCollectGoods),
      UV:              rf(MAY.UV, LY.UV),
      CartGoodsNum:    rf(sum(CartGoodsNum), lyCartGoods),
      CartProNum:      rf(sum(CartProNum), lyCartPro),
      ToCartUser:      rf(sum(ToCartUser), lyToCart),
      DealAmt:         rf(MAY.DealAmt, LY.DealAmt),
      PV:              rf(MAY.PV, LY.PV),
      DealProNum:      rf(MAY.DealProNum, LY.DealProNum),
      DealGoodsNum:    rf(sum(DealGoodsNum), lyDealGoods),
      VisitedGoodsNum: rf(sum(VisitedGoodsNum), lyVisited),
      CollectNum:      rf(sum(CollectNum), lyCollect),
    },
  },
  status: 0,
};

// ── proTrend body ──
const proTrend = {
  message: 'success',
  content: {
    series: [
      { data: VisitedGoodsNum, name: 'VisitedGoodsNum' },
      { data: CollectGoodsNum, name: 'CollectGoodsNum' },
      { data: CartGoodsNum,    name: 'CartGoodsNum' },
      { data: DealGoodsNum,    name: 'DealGoodsNum' },
      { data: DealAmt,         name: 'DealAmt' },
      { data: DealNum,         name: 'DealNum' },
      { data: DealPro,         name: 'DealProNum' },
      { data: DealUsr,         name: 'DealUser' },
      { data: PV,              name: 'PV' },
      { data: UV,              name: 'UV' },
      { data: CartProNum,      name: 'CartProNum' },
      { data: ToCartUser,      name: 'ToCartUser' },
      { data: ToCartRate,      name: 'ToCartRate' },
      { data: CollectNum,      name: 'CollectNum' },
    ],
    categories,
  },
  status: 0,
};

// ── getVenderDealSummayData body ──
const mayDealRate     = MAY.DealUser / MAY.UV;
const lyDealRate      = LY.DealUser / LY.UV;
const mayDealPriceAvg = MAY.DealAmt / MAY.DealUser;
const lyDealPriceAvg  = LY.DealAmt / LY.DealUser;
const dailyDealRate = [], dailyDealPriceAvg = [];
for (let i = 0; i < D; i++) {
  dailyDealRate.push(UV[i] > 0 ? DealUsr[i] / UV[i] : 0);
  dailyDealPriceAvg.push(DealUsr[i] > 0 ? round2(DealAmt[i] / DealUsr[i]) : 0);
}
const venderData = {
  message: 'success',
  content: {
    summary: {
      DealNum:      rf(MAY.DealNum, LY.DealNum),
      UV:           rf(MAY.UV, LY.UV),
      DealUser:     rf(MAY.DealUser, LY.DealUser),
      DealPriceAvg: rf(mayDealPriceAvg, lyDealPriceAvg),
      PV:           rf(MAY.PV, LY.PV),
      DealAmt:      rf(MAY.DealAmt, LY.DealAmt),
      DealProNum:   rf(MAY.DealProNum, LY.DealProNum),
      DealRate:     rf(mayDealRate, lyDealRate),
    },
    trend: {
      series: [
        { data: PV,                name: 'PV' },
        { data: UV,                name: 'UV' },
        { data: DealUsr,           name: 'DealUser' },
        { data: dailyDealRate,     name: 'DealRate' },
        { data: DealNum,           name: 'DealNum' },
        { data: DealPro,           name: 'DealProNum' },
        { data: DealAmt,           name: 'DealAmt' },
        { data: dailyDealPriceAvg, name: 'DealPriceAvg' },
      ],
      categories,
    },
  },
  status: 0,
};

// ── write body files ──
const PRO_DIR  = path.join(__dirname, 'getProSummary_monthly_json');
const DEAL_DIR = path.join(__dirname, 'getVenderDealSummayData_monthly_json');
const proSumFile   = path.join(PRO_DIR,  '京麦2605_getProSummary.json');
const proTrendFile = path.join(PRO_DIR,  '京麦2605_getProTrend.json');
const venderFile   = path.join(DEAL_DIR, '京麦成交概况2026-05.json');
fs.writeFileSync(proSumFile,   JSON.stringify(proSummary, null, 4), 'utf8');
fs.writeFileSync(proTrendFile, JSON.stringify(proTrend,   null, 4), 'utf8');
fs.writeFileSync(venderFile,   JSON.stringify(venderData, null, 4), 'utf8');
console.log('body files written:');
console.log('  ' + proSumFile);
console.log('  ' + proTrendFile);
console.log('  ' + venderFile);

// ── append 3 rules to a NEW rules file (4).json ──
const SRC_RULES = path.join(__dirname, '..', 'rules', 'txcs-interceptor-rules (3).json');
const OUT_RULES = path.join(__dirname, '..', 'rules', 'txcs-interceptor-rules (4).json');
const doc = JSON.parse(fs.readFileSync(SRC_RULES, 'utf8'));
const before = doc.rules.length;
const mkRule = (alias, pattern, body) => ({
  alias, pattern, bodyPattern: '', status: 200,
  contentType: 'application/json', responseType: 'static',
  response: body, enabled: true,
});
const ymd = '202605', start = '2026-05-01', end = '2026-05-31';
doc.rules.push(mkRule('京麦2605_getProSummary',
  `ppzh.jd.com/brand/productAnalysis/productSummary/getProSummary.ajax?brandId=all&firstCategoryId=&secondCategoryId=&thirdCategoryId=all&date=${ymd}&startDate=${start}&endDate=${end}`,
  fs.readFileSync(proSumFile, 'utf8')));
doc.rules.push(mkRule('京麦2605_getProTrend',
  `jd.com/brand/productAnalysis/productSummary/getProTrend.ajax?brandId=all&firstCategoryId=&secondCategoryId=&thirdCategoryId=all&date=${ymd}&startDate=${start}&endDate=${end}`,
  fs.readFileSync(proTrendFile, 'utf8')));
doc.rules.push(mkRule('京麦2605_getVenderDealSummayData',
  `jd.com/brand/dealAnalysis/dealSummary/getVenderDealSummayData.ajax?brandId=all&thirdCategoryId=all&shopType=all&date=${ymd}&endDate=${end}&startDate=${start}`,
  fs.readFileSync(venderFile, 'utf8')));

fs.writeFileSync(OUT_RULES, JSON.stringify(doc, null, 2), 'utf8');
console.log(`\nRules: ${before} -> ${doc.rules.length} (+3). Written to ${OUT_RULES}`);

// ── sanity check ──
const dealRatePct = (mayDealRate * 100).toFixed(2);
const priceAvg = mayDealPriceAvg.toFixed(2);
console.log(`\nMay 2026 verified: DealRate=${dealRatePct}% (expected 8.83%), DealPriceAvg=${priceAvg} (expected ~363)`);
console.log(`May 2025 baseline: PV=${LY.PV} UV=${LY.UV} DealAmt=${LY.DealAmt} DealUser=${LY.DealUser}`);
