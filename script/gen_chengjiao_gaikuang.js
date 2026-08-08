// Generator for 成交概况 (getVenderDealSummayData.ajax) mock responses.
//
// Model (verified against the real response structure 京麦26年6月new.json):
//   Additive fields : PV, UV, DealUser, DealNum, DealProNum, DealAmt
//                     -> monthly summary Value === sum of the daily trend series
//   Derived fields  : DealRate     = DealUser / UV
//                     DealPriceAvg = DealAmt  / DealUser
//   Each summary field: { Value, PreValue, Rate }, Rate = (Value-PreValue)/PreValue
//
// PreValue (环比 base):
//   June -> May (real month-over-month, both provided)
//   May  -> April, derived geometrically as April = May^2 / June so the
//           month-over-month growth stays consistent.
//
// Daily trend is distributed deterministically (seeded LCG) so results are
// reproducible and each series sums EXACTLY to its monthly total.

const fs = require('fs');
const path = require('path');

// ── monthly totals from the mapping table / image ────────────────────────────
const MAY = { PV: 533148, UV: 161560, DealUser: 14266, DealNum: 12156, DealProNum: 13736, DealAmt: 5178471 };
const JUN = { PV: 616361, UV: 195670, DealUser: 17845, DealNum: 15365, DealProNum: 17177, DealAmt: 6281485 };

const ADD_FIELDS = ['PV', 'UV', 'DealUser', 'DealNum', 'DealProNum', 'DealAmt'];

// April = May^2 / June (per field) -> keeps a consistent geometric MoM trend.
const APR = {};
ADD_FIELDS.forEach((k) => { APR[k] = Math.round((MAY[k] * MAY[k]) / JUN[k]); });

// ── deterministic PRNG (LCG) ─────────────────────────────────────────────────
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Distribute an integer total across `days` with mild fluctuation, exact sum.
function distributeInt(total, days, rnd) {
  const w = [];
  for (let i = 0; i < days; i++) w.push(0.78 + rnd() * 0.44); // [0.78, 1.22]
  const sw = w.reduce((a, b) => a + b, 0);
  const arr = w.map((x) => Math.max(0, Math.round((total * x) / sw)));
  const diff = total - arr.reduce((a, b) => a + b, 0);
  arr[arr.length - 1] += diff; // absorb rounding remainder
  return arr;
}

// Distribute a money total (2 decimals) across `days`, exact sum.
function distributeMoney(total, days, rnd) {
  const w = [];
  for (let i = 0; i < days; i++) w.push(0.78 + rnd() * 0.44);
  const sw = w.reduce((a, b) => a + b, 0);
  const arr = w.map((x) => Math.round(((total * x) / sw) * 100) / 100);
  const diff = Math.round((total - arr.reduce((a, b) => a + b, 0)) * 100) / 100;
  arr[arr.length - 1] = Math.round((arr[arr.length - 1] + diff) * 100) / 100;
  return arr;
}

function round2(n) { return Math.round(n * 100) / 100; }

// ── build one summary field { Value, PreValue, Rate } ─────────────────────────
function field(value, pre) {
  return { Value: value, PreValue: pre, Rate: pre === 0 ? 0 : (value - pre) / pre };
}

function derived(t) {
  return {
    DealRate: t.DealUser / t.UV,
    DealPriceAvg: t.DealAmt / t.DealUser,
  };
}

function buildSummary(cur, pre) {
  const dCur = derived(cur);
  const dPre = derived(pre);
  return {
    DealNum: field(cur.DealNum, pre.DealNum),
    UV: field(cur.UV, pre.UV),
    DealUser: field(cur.DealUser, pre.DealUser),
    DealPriceAvg: field(dCur.DealPriceAvg, dPre.DealPriceAvg),
    PV: field(cur.PV, pre.PV),
    DealAmt: field(cur.DealAmt, pre.DealAmt),
    DealProNum: field(cur.DealProNum, pre.DealProNum),
    DealRate: field(dCur.DealRate, dPre.DealRate),
  };
}

// ── build the daily trend block ───────────────────────────────────────────────
function buildTrend(totals, year, month, days, seed) {
  const daily = {};
  // separate sub-stream per metric so the shapes differ but stay reproducible
  daily.PV = distributeInt(totals.PV, days, lcg(seed + 1));
  daily.UV = distributeInt(totals.UV, days, lcg(seed + 2));
  daily.DealUser = distributeInt(totals.DealUser, days, lcg(seed + 3));
  daily.DealNum = distributeInt(totals.DealNum, days, lcg(seed + 4));
  daily.DealProNum = distributeInt(totals.DealProNum, days, lcg(seed + 5));
  daily.DealAmt = distributeMoney(totals.DealAmt, days, lcg(seed + 6));

  const DealRate = [];
  const DealPriceAvg = [];
  for (let i = 0; i < days; i++) {
    DealRate.push(daily.UV[i] > 0 ? daily.DealUser[i] / daily.UV[i] : 0);
    DealPriceAvg.push(daily.DealUser[i] > 0 ? round2(daily.DealAmt[i] / daily.DealUser[i]) : null);
  }

  const categories = [];
  for (let d = 1; d <= days; d++) {
    categories.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  const series = [
    { data: daily.PV, name: 'PV' },
    { data: daily.UV, name: 'UV' },
    { data: daily.DealUser, name: 'DealUser' },
    { data: DealRate, name: 'DealRate' },
    { data: daily.DealNum, name: 'DealNum' },
    { data: daily.DealProNum, name: 'DealProNum' },
    { data: daily.DealAmt, name: 'DealAmt' },
    { data: DealPriceAvg, name: 'DealPriceAvg' },
  ];

  return { series, categories };
}

function buildResponse(cur, pre, year, month, days, seed) {
  return {
    message: 'success',
    content: {
      summary: buildSummary(cur, pre),
      trend: buildTrend(cur, year, month, days, seed),
    },
    status: 0,
  };
}

// ── emit the two files ────────────────────────────────────────────────────────
const mayResp = buildResponse(MAY, APR, 2026, 5, 31, 20260500);
const junResp = buildResponse(JUN, MAY, 2026, 6, 30, 20260600);

const outMay = path.join(__dirname, '京麦成交概况26年5月new.json');
const outJun = path.join(__dirname, '京麦成交概况26年6月new.json');

fs.writeFileSync(outMay, JSON.stringify(mayResp, null, 4), 'utf8');
fs.writeFileSync(outJun, JSON.stringify(junResp, null, 4), 'utf8');

// ── sanity check: series sums match totals ────────────────────────────────────
function check(label, resp, totals) {
  const s = {};
  resp.content.trend.series.forEach((ser) => {
    if (ADD_FIELDS.includes(ser.name)) s[ser.name] = ser.data.reduce((a, b) => a + b, 0);
  });
  ADD_FIELDS.forEach((k) => {
    const sum = k === 'DealAmt' ? round2(s[k]) : s[k];
    const ok = Math.abs(sum - totals[k]) < 0.01;
    console.log(`${label} ${k}: sum=${sum} total=${totals[k]} ${ok ? 'OK' : 'MISMATCH'}`);
  });
}

console.log('April (May PreValue base):', APR);
check('MAY', mayResp, MAY);
check('JUN', junResp, JUN);
console.log('Wrote:', outMay);
console.log('Wrote:', outJun);
