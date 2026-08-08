// Generate two files per month (getProSummary + getProTrend structure) for
// Jan 2025 .. Apr 2026, from the historical dataset 京麦2501-2604.json.
//
// Real metrics (from source):
//   browse->PV  visitors->UV  amount->DealAmt  items->DealProNum
//   orders->DealNum  buyers->DealUser
// Synthesized (deterministic ratio of traffic + mild seeded jitter):
//   ToCartUser, ToCartRate, CartProNum, CartGoodsNum, CollectNum,
//   CollectGoodsNum, DealGoodsNum, VisitedGoodsNum
//
// summary field = { Value, PreValue, Rate }; Rate = source yearOnYear of the
// driving metric (traffic-driven -> visitors YoY, sales-driven -> items YoY);
// PreValue = Value/(1+Rate). Every daily series sums exactly to its summary.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '京麦2501-2604.json');
const OUT = path.join(__dirname, 'getProSummary_monthly_json');
const raw = fs.readFileSync(SRC, 'utf8');
// eslint-disable-next-line no-new-func
const data = new Function('return ({' + raw + '})')();

const MONTHS = [
  { key: '2501',   year: 2025, month: 1,  days: 31 },
  { key: '25022',  year: 2025, month: 2,  days: 28 },
  { key: '2503',   year: 2025, month: 3,  days: 31 },
  { key: '2504',   year: 2025, month: 4,  days: 30 },
  { key: '2505',   year: 2025, month: 5,  days: 31 },
  { key: '2506',   year: 2025, month: 6,  days: 30 },
  { key: '2507',   year: 2025, month: 7,  days: 31 },
  { key: '2508',   year: 2025, month: 8,  days: 31 },
  { key: '2509',   year: 2025, month: 9,  days: 30 },
  { key: '2510',   year: 2025, month: 10, days: 31 },
  { key: '2511',   year: 2025, month: 11, days: 30 },
  { key: '2512',   year: 2025, month: 12, days: 31 },
  { key: '2026-1', year: 2026, month: 1,  days: 31 },
  { key: '2026-2', year: 2026, month: 2,  days: 28 },
  { key: '2026-3', year: 2026, month: 3,  days: 31 },
  { key: '2026-4', year: 2026, month: 4,  days: 30 },
];

function pct(s) { return parseFloat(String(s).replace('%', '')) / 100; }
function sum(a) { return a.reduce((x, y) => x + y, 0); }

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// Scale a daily array to sum EXACTLY to total (largest-remainder rounding).
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

function fieldYoY(value, yoy) {
  return { Value: value, PreValue: yoy === -1 ? 0 : value / (1 + yoy), Rate: yoy };
}

function buildMonth(cfg) {
  const m = data[cfg.key];
  const y = m.yearOnYear;
  const t = m.dailyTrend;
  const D = cfg.days;

  // ── real daily series (exact sums) ──
  const PV      = normalizeInt(t.browse,   D, m.browse);
  const UV      = normalizeInt(t.visitors, D, m.visitors);
  const DealAmt = normalizeInt(t.amount,   D, m.amount);
  const DealPro = normalizeInt(t.items,    D, m.items);
  const DealNum = normalizeInt(t.orders,   D, m.orders);
  const DealUsr = normalizeInt(t.buyers,   D, m.buyers);

  // ── synthesized daily series (traffic-driven, seeded jitter) ──
  const seed = cfg.year * 100 + cfg.month;
  const j = (rnd) => 0.9 + rnd() * 0.2; // jitter in [0.9, 1.1]
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

  const yTraffic = pct(y.visitors);
  const ySales   = pct(y.items);

  const summary = {
    CollectGoodsNum: fieldYoY(sum(CollectGoodsNum), yTraffic),
    UV:              fieldYoY(m.visitors, pct(y.visitors)),
    CartGoodsNum:    fieldYoY(sum(CartGoodsNum), yTraffic),
    CartProNum:      fieldYoY(sum(CartProNum), yTraffic),
    ToCartUser:      fieldYoY(sum(ToCartUser), yTraffic),
    DealAmt:         fieldYoY(m.amount, pct(y.amount)),
    PV:              fieldYoY(m.browse, pct(y.browse)),
    DealProNum:      fieldYoY(m.items, pct(y.items)),
    DealGoodsNum:    fieldYoY(sum(DealGoodsNum), ySales),
    VisitedGoodsNum: fieldYoY(sum(VisitedGoodsNum), yTraffic),
    CollectNum:      fieldYoY(sum(CollectNum), yTraffic),
  };

  const categories = [];
  for (let d = 1; d <= D; d++) {
    categories.push(`${cfg.year}-${String(cfg.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  const series = [
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
  ];

  const proSummary = { message: 'success', content: { summary }, status: 0 };
  const proTrend   = { message: 'success', content: { series, categories }, status: 0 };
  return { proSummary, proTrend };
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

MONTHS.forEach((cfg) => {
  const ym = String(cfg.year).slice(2) + String(cfg.month).padStart(2, '0');
  const { proSummary, proTrend } = buildMonth(cfg);
  fs.writeFileSync(path.join(OUT, `京麦${ym}_getProSummary.json`), JSON.stringify(proSummary, null, 4), 'utf8');
  fs.writeFileSync(path.join(OUT, `京麦${ym}_getProTrend.json`), JSON.stringify(proTrend, null, 4), 'utf8');
  console.log(`京麦${ym}_getProSummary.json + _getProTrend.json  (PV=${proSummary.content.summary.PV.Value}, UV=${proSummary.content.summary.UV.Value})`);
});

console.log(`\nDone. ${MONTHS.length * 2} files written to ${OUT}`);
