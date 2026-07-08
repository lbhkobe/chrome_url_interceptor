// Generate one independent 成交概况 (getVenderDealSummayData.ajax) JSON per month
// from the historical dataset 京麦2501-2604.json (Jan 2025 .. Apr 2026).
//
// Source field  -> target field
//   browse         PV
//   visitors       UV
//   buyers         DealUser
//   orders         DealNum
//   items          DealProNum
//   amount         DealAmt
//   conversionRate DealRate      (fraction; = buyers/visitors)
//   avgPrice       DealPriceAvg  (= amount/orders in this dataset)
//
// summary field = { Value, PreValue, Rate }
//   Rate     = provided yearOnYear (同比) as a fraction
//   PreValue = Value / (1 + Rate)
// trend series reuse the pre-computed dailyTrend; daily DealRate = buyers/visitors,
// daily DealPriceAvg = amount/orders.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '京麦2501-2604.json');
const OUT_DIR = path.join(__dirname, 'monthly_json');

// The file is a JS object-literal fragment (single quotes, // comments, trailing
// comma, no outer braces). Wrap it and evaluate as JS.
const raw = fs.readFileSync(SRC, 'utf8');
// eslint-disable-next-line no-new-func
const data = new Function('return ({' + raw + '})')();

// key in source -> { year, month, days }  (2025 & 2026 are non-leap years)
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
function round2(n) { return Math.round(n * 100) / 100; }

// Scale a daily array so it sums EXACTLY to `total`, preserving its shape.
// Uses largest-remainder rounding (each day adjusted by at most +1).
function normalizeInt(src, days, total) {
  const arr = src.slice(0, days);
  const sum = arr.reduce((a, b) => a + b, 0);
  if (sum === 0) return arr.map(() => 0);
  const scaled = arr.map((x) => (x * total) / sum);
  const out = scaled.map((x) => Math.floor(x));
  const rem = total - out.reduce((a, b) => a + b, 0); // integer in [0, days)
  scaled
    .map((x, i) => ({ i, f: x - Math.floor(x) }))
    .sort((a, b) => b.f - a.f)
    .slice(0, rem)
    .forEach((o) => { out[o.i] += 1; });
  return out;
}

// build { Value, PreValue, Rate } from a value and a YoY fraction
function fieldYoY(value, yoy) {
  const pre = yoy === -1 ? 0 : value / (1 + yoy);
  return { Value: value, PreValue: pre, Rate: yoy };
}

function buildMonth(cfg) {
  const m = data[cfg.key];
  if (!m) throw new Error('missing key ' + cfg.key);
  const yoy = m.yearOnYear;

  const dealRate = m.buyers / m.visitors;         // = conversionRate
  const dealPriceAvg = m.avgPrice;                // dataset defines it as amount/orders

  const summary = {
    DealNum:      fieldYoY(m.orders,   pct(yoy.orders)),
    UV:           fieldYoY(m.visitors, pct(yoy.visitors)),
    DealUser:     fieldYoY(m.buyers,   pct(yoy.buyers)),
    DealPriceAvg: fieldYoY(dealPriceAvg, pct(yoy.avgPrice)),
    PV:           fieldYoY(m.browse,   pct(yoy.browse)),
    DealAmt:      fieldYoY(m.amount,   pct(yoy.amount)),
    DealProNum:   fieldYoY(m.items,    pct(yoy.items)),
    DealRate:     fieldYoY(dealRate,   pct(yoy.conversionRate)),
  };

  const t = m.dailyTrend;
  // Normalize each daily series to sum EXACTLY to its monthly total.
  const nPV     = normalizeInt(t.browse,   cfg.days, m.browse);
  const nUV     = normalizeInt(t.visitors, cfg.days, m.visitors);
  const nUser   = normalizeInt(t.buyers,   cfg.days, m.buyers);
  const nNum    = normalizeInt(t.orders,   cfg.days, m.orders);
  const nProNum = normalizeInt(t.items,    cfg.days, m.items);
  const nAmt    = normalizeInt(t.amount,   cfg.days, m.amount);

  const dRate = [];
  const dPrice = [];
  for (let i = 0; i < cfg.days; i++) {
    dRate.push(nUV[i] > 0 ? nUser[i] / nUV[i] : 0);
    dPrice.push(nNum[i] > 0 ? round2(nAmt[i] / nNum[i]) : null);
  }

  const categories = [];
  for (let d = 1; d <= cfg.days; d++) {
    categories.push(`${cfg.year}-${String(cfg.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  const series = [
    { data: nPV,     name: 'PV' },
    { data: nUV,     name: 'UV' },
    { data: nUser,   name: 'DealUser' },
    { data: dRate,   name: 'DealRate' },
    { data: nNum,    name: 'DealNum' },
    { data: nProNum, name: 'DealProNum' },
    { data: nAmt,    name: 'DealAmt' },
    { data: dPrice,  name: 'DealPriceAvg' },
  ];

  // ── validation ──
  const warn = [];
  [['PV', nPV, m.browse], ['UV', nUV, m.visitors], ['DealUser', nUser, m.buyers],
   ['DealNum', nNum, m.orders], ['DealProNum', nProNum, m.items], ['DealAmt', nAmt, m.amount]]
    .forEach(([f, arr, total]) => {
      if (arr.length !== cfg.days) warn.push(`${f} length ${arr.length}!=${cfg.days}`);
      const sum = arr.reduce((x, y) => x + y, 0);
      if (sum !== total) warn.push(`${f} sum ${sum} vs total ${total} (Δ${sum - total})`);
    });

  return {
    resp: { message: 'success', content: { summary, trend: { series, categories } }, status: 0 },
    warn,
  };
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

MONTHS.forEach((cfg) => {
  const { resp, warn } = buildMonth(cfg);
  const name = `京麦成交概况${cfg.year}-${String(cfg.month).padStart(2, '0')}.json`;
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(resp, null, 4), 'utf8');
  const tag = warn.length ? `⚠ ${warn.join('; ')}` : 'OK';
  console.log(`${name}  ${tag}`);
});

console.log(`\nDone. ${MONTHS.length} files written to ${OUT_DIR}`);
