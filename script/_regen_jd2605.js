/**
 * Regenerate 京麦2605 rules with correct data.
 * Reference (user-provided May 2026 actuals):
 *   浏览量(PV)=533148, 访客数(UV)=161560, 成交人数=14266,
 *   成交转化率=8.83%, 成交单量=12156, 成交商品件数=13736,
 *   成交金额=5178471, 成交客单价=363
 *
 * May 2025 baselines (PreValues, from existing data):
 *   PV=239428, UV=69727, DealUser=5557, DealNum=4791,
 *   DealProNum=5510, DealAmt=1494760, DealPriceAvg=312,
 *   DealRate=0.0797, ToCartUser=3486, CartGoodsNum=2789,
 *   CartProNum=4183, CollectGoodsNum=488, CollectNum=697,
 *   VisitedGoodsNum=5578, DealGoodsNum=4684
 */
const fs = require('fs');
const path = require('path');

// ── Seeded PRNG (LCG) for reproducible jitter ────────────────────────────────
function lcg(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Distribute a monthly total into N daily values using largest-remainder rounding.
 * `weights` controls the relative shape; the result sums exactly to `total`.
 */
function distribute(total, weights) {
  const sumW = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map(w => (w / sumW) * total);
  const floored = raw.map(Math.floor);
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const fracs = raw.map((v, i) => ({ i, f: v - floored[i] }));
  fracs.sort((a, b) => b.f - a.f);
  for (let k = 0; k < remainder; k++) floored[fracs[k].i]++;
  return floored;
}

/** Generate 31 daily weights with some natural variation using seeded PRNG */
function dailyWeights(seed, days = 31) {
  const rng = lcg(seed);
  const w = [];
  for (let i = 0; i < days; i++) {
    // Weekday effect: slightly lower on weekends (day 0=Thu for May 2026)
    const dow = (i + 4) % 7; // May 1, 2026 is Friday (4=Fri)
    const base = (dow === 0 || dow === 6) ? 0.88 : 1.0; // weekend dip
    w.push(base * (0.85 + rng() * 0.30));
  }
  return w;
}

/** Generate daily rate values (not summed, averaged around a target) */
function dailyRates(targetRate, seed, days = 31) {
  const rng = lcg(seed);
  return Array.from({ length: days }, () => {
    const jitter = (rng() - 0.5) * 0.002; // ±0.001
    return Math.round((targetRate + jitter) * 1e10) / 1e10;
  });
}

/** Generate daily price averages (not summed; each day = DealAmt[day]/DealUser[day]) */
function dailyPriceAvg(dealAmtDaily, dealUserDaily) {
  return dealAmtDaily.map((amt, i) => {
    return Math.round((amt / dealUserDaily[i]) * 100) / 100;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// REFERENCE VALUES
// ═══════════════════════════════════════════════════════════════════════════════
const REF = {
  PV: 533148,
  UV: 161560,
  DealUser: 14266,
  DealRate: 0.0883,
  DealNum: 12156,
  DealProNum: 13736,
  DealAmt: 5178471,
  DealPriceAvg: 362.99,
};

// 2025 baselines (from existing PreValues)
const PRE = {
  PV: 239428,
  UV: 69727,
  DealUser: 5557,
  DealNum: 4791,
  DealProNum: 5510,
  DealAmt: 1494760,
  DealPriceAvg: 312,
  DealRate: 0.0797,
  ToCartUser: 3486,
  CartGoodsNum: 2789,
  CartProNum: 4183,
  CollectGoodsNum: 488,
  CollectNum: 697,
  VisitedGoodsNum: 5578,
  DealGoodsNum: 4684,
};

// ── Derived values (not in user's reference) ─────────────────────────────────
// ToCartUser (加购人数): people who added products to cart from detail page
// In 2025: ToCartUser/UV = 5.0%. Let ratio grow to ~6.5% in 2026.
const ToCartUser = Math.round(REF.UV * 0.065); // ≈10501
// CartGoodsNum (加购商品数): distinct SKUs added to cart. ~80% of ToCartUser
const CartGoodsNum = Math.round(ToCartUser * 0.82); // ≈8611
// CartProNum (加购件数): total pieces added. ~1.6x ToCartUser
const CartProNum = Math.round(ToCartUser * 1.55); // ≈16276
// DealGoodsNum (成交商品数): distinct SKUs sold. DealProNum/1.19
const DealGoodsNum = Math.round(REF.DealProNum / 1.19); // ≈11543
// VisitedGoodsNum (浏览商品数): distinct SKUs viewed. ~8% of UV
const VisitedGoodsNum = Math.round(REF.UV * 0.082); // ≈13248
// CollectGoodsNum (收藏商品数): 2025 was 488, grow by ~140%
const CollectGoodsNum = Math.round(PRE.CollectGoodsNum * 2.4); // ≈1171
// CollectNum (收藏次数): 2025 was 697, grow by ~135%
const CollectNum = Math.round(PRE.CollectNum * 2.35); // ≈1638

function yoyRate(cur, pre) {
  return Math.round(((cur - pre) / pre) * 1e10) / 1e10;
}

console.log('=== Derived Values ===');
console.log('ToCartUser:', ToCartUser, '| rate:', yoyRate(ToCartUser, PRE.ToCartUser));
console.log('CartGoodsNum:', CartGoodsNum, '| rate:', yoyRate(CartGoodsNum, PRE.CartGoodsNum));
console.log('CartProNum:', CartProNum, '| rate:', yoyRate(CartProNum, PRE.CartProNum));
console.log('DealGoodsNum:', DealGoodsNum, '| rate:', yoyRate(DealGoodsNum, PRE.DealGoodsNum));
console.log('VisitedGoodsNum:', VisitedGoodsNum, '| rate:', yoyRate(VisitedGoodsNum, PRE.VisitedGoodsNum));
console.log('CollectGoodsNum:', CollectGoodsNum, '| rate:', yoyRate(CollectGoodsNum, PRE.CollectGoodsNum));
console.log('CollectNum:', CollectNum, '| rate:', yoyRate(CollectNum, PRE.CollectNum));

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD getProSummary
// ═══════════════════════════════════════════════════════════════════════════════
const proSummary = {
  message: "success",
  content: {
    summary: {
      CollectGoodsNum: { Value: CollectGoodsNum, PreValue: PRE.CollectGoodsNum, Rate: yoyRate(CollectGoodsNum, PRE.CollectGoodsNum) },
      UV: { Value: REF.UV, PreValue: PRE.UV, Rate: yoyRate(REF.UV, PRE.UV) },
      CartGoodsNum: { Value: CartGoodsNum, PreValue: PRE.CartGoodsNum, Rate: yoyRate(CartGoodsNum, PRE.CartGoodsNum) },
      CartProNum: { Value: CartProNum, PreValue: PRE.CartProNum, Rate: yoyRate(CartProNum, PRE.CartProNum) },
      ToCartUser: { Value: ToCartUser, PreValue: PRE.ToCartUser, Rate: yoyRate(ToCartUser, PRE.ToCartUser) },
      DealAmt: { Value: REF.DealAmt, PreValue: PRE.DealAmt, Rate: yoyRate(REF.DealAmt, PRE.DealAmt) },
      PV: { Value: REF.PV, PreValue: PRE.PV, Rate: yoyRate(REF.PV, PRE.PV) },
      DealProNum: { Value: REF.DealProNum, PreValue: PRE.DealProNum, Rate: yoyRate(REF.DealProNum, PRE.DealProNum) },
      DealGoodsNum: { Value: DealGoodsNum, PreValue: PRE.DealGoodsNum, Rate: yoyRate(DealGoodsNum, PRE.DealGoodsNum) },
      VisitedGoodsNum: { Value: VisitedGoodsNum, PreValue: PRE.VisitedGoodsNum, Rate: yoyRate(VisitedGoodsNum, PRE.VisitedGoodsNum) },
      CollectNum: { Value: CollectNum, PreValue: PRE.CollectNum, Rate: yoyRate(CollectNum, PRE.CollectNum) },
    }
  },
  status: 0
};

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD getProTrend — each metric gets a UNIQUE seed so daily patterns differ
// ═══════════════════════════════════════════════════════════════════════════════
const DAYS = 31;
const categories = Array.from({ length: DAYS }, (_, i) => {
  const d = String(i + 1).padStart(2, '0');
  return `2026-05-${d}`;
});

const trendSeries = [
  { name: 'VisitedGoodsNum', total: VisitedGoodsNum, seed: 7001 },
  { name: 'CollectGoodsNum', total: CollectGoodsNum, seed: 7002 },
  { name: 'CartGoodsNum',    total: CartGoodsNum,    seed: 7003 },
  { name: 'DealGoodsNum',    total: DealGoodsNum,    seed: 7004 },
  { name: 'DealAmt',         total: REF.DealAmt,     seed: 7005 },
  { name: 'DealNum',         total: REF.DealNum,     seed: 7006 },
  { name: 'DealProNum',      total: REF.DealProNum,  seed: 7007 },
  { name: 'DealUser',        total: REF.DealUser,    seed: 7008 },
  { name: 'PV',              total: REF.PV,          seed: 7009 },
  { name: 'UV',              total: REF.UV,          seed: 7010 },
  { name: 'CartProNum',      total: CartProNum,      seed: 7011 },
  { name: 'ToCartUser',      total: ToCartUser,      seed: 7012 },
  { name: 'CollectNum',      total: CollectNum,      seed: 7013 },
];

const dailyData = {};
const proTrendSeries = trendSeries.map(s => {
  const w = dailyWeights(s.seed, DAYS);
  const data = distribute(s.total, w);
  dailyData[s.name] = data;
  return { data, name: s.name };
});

// ToCartRate = ToCartUser[day] / UV[day] (daily rate, not summed)
const toCartRateDaily = dailyData.ToCartUser.map((tc, i) => {
  return Math.round((tc / dailyData.UV[i]) * 1e10) / 1e10;
});
proTrendSeries.push({ data: toCartRateDaily, name: 'ToCartRate' });

const proTrend = {
  message: "success",
  content: {
    series: proTrendSeries,
    categories
  },
  status: 0
};

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD getVenderDealSummayData
// ═══════════════════════════════════════════════════════════════════════════════
const dealSummary = {
  message: "success",
  content: {
    summary: {
      DealNum: { Value: REF.DealNum, PreValue: PRE.DealNum, Rate: yoyRate(REF.DealNum, PRE.DealNum) },
      UV: { Value: REF.UV, PreValue: PRE.UV, Rate: yoyRate(REF.UV, PRE.UV) },
      DealUser: { Value: REF.DealUser, PreValue: PRE.DealUser, Rate: yoyRate(REF.DealUser, PRE.DealUser) },
      DealPriceAvg: { Value: REF.DealPriceAvg, PreValue: PRE.DealPriceAvg, Rate: yoyRate(REF.DealPriceAvg, PRE.DealPriceAvg) },
      PV: { Value: REF.PV, PreValue: PRE.PV, Rate: yoyRate(REF.PV, PRE.PV) },
      DealAmt: { Value: REF.DealAmt, PreValue: PRE.DealAmt, Rate: yoyRate(REF.DealAmt, PRE.DealAmt) },
      DealProNum: { Value: REF.DealProNum, PreValue: PRE.DealProNum, Rate: yoyRate(REF.DealProNum, PRE.DealProNum) },
      DealRate: { Value: REF.DealRate, PreValue: PRE.DealRate, Rate: yoyRate(REF.DealRate, PRE.DealRate) },
    },
    trend: {
      series: [
        { data: dailyData.PV, name: 'PV' },
        { data: dailyData.UV, name: 'UV' },
        { data: dailyData.DealUser, name: 'DealUser' },
        { data: dailyRates(REF.DealRate, 8001, DAYS), name: 'DealRate' },
        { data: dailyData.DealNum, name: 'DealNum' },
        { data: dailyData.DealProNum, name: 'DealProNum' },
        { data: dailyData.DealAmt, name: 'DealAmt' },
        { data: dailyPriceAvg(dailyData.DealAmt, dailyData.DealUser), name: 'DealPriceAvg' },
      ],
      categories
    }
  },
  status: 0
};

// ═══════════════════════════════════════════════════════════════════════════════
// WRITE INTO RULES FILE
// ═══════════════════════════════════════════════════════════════════════════════
const rulesPath = path.join(__dirname, '..', 'rules', 'txcs-interceptor-rules (4).json');
const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));

const idxSummary = rules.rules.findIndex(r => r.alias === '京麦2605_getProSummary');
const idxTrend   = rules.rules.findIndex(r => r.alias === '京麦2605_getProTrend');
const idxDeal    = rules.rules.findIndex(r => r.alias === '京麦2605_getVenderDealSummayData');

console.log('\nRule indices — ProSummary:', idxSummary, '| ProTrend:', idxTrend, '| VenderDeal:', idxDeal);

rules.rules[idxSummary].response = JSON.stringify(proSummary, null, 4);
rules.rules[idxTrend].response   = JSON.stringify(proTrend, null, 4);
rules.rules[idxDeal].response    = JSON.stringify(dealSummary, null, 4);

fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2), 'utf8');

// ── Verification ─────────────────────────────────────────────────────────────
console.log('\n=== Verification ===');
console.log('getProSummary:');
const ps = JSON.parse(rules.rules[idxSummary].response).content.summary;
console.log('  UV:', ps.UV.Value, '| PV:', ps.PV.Value, '| ToCartUser:', ps.ToCartUser.Value);
console.log('  DealAmt:', ps.DealAmt.Value, '| DealProNum:', ps.DealProNum.Value);

console.log('getVenderDealSummayData:');
const vs = JSON.parse(rules.rules[idxDeal].response).content.summary;
console.log('  UV:', vs.UV.Value, '| PV:', vs.PV.Value, '| DealUser:', vs.DealUser.Value);
console.log('  DealNum:', vs.DealNum.Value, '| DealAmt:', vs.DealAmt.Value, '| DealPriceAvg:', vs.DealPriceAvg.Value);

console.log('getProTrend sums:');
const pt = JSON.parse(rules.rules[idxTrend].response).content.series;
pt.filter(s => s.name !== 'ToCartRate').forEach(s => {
  console.log(' ', s.name, '→', s.data.reduce((a, b) => a + b, 0));
});

console.log('getVenderDealSummayData trend sums:');
const vt = JSON.parse(rules.rules[idxDeal].response).content.trend.series;
vt.filter(s => !['DealRate', 'DealPriceAvg'].includes(s.name)).forEach(s => {
  console.log(' ', s.name, '→', s.data.reduce((a, b) => a + b, 0));
});

console.log('\nDone!');
