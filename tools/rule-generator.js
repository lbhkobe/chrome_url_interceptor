'use strict';
/* ══════════════════════ utils ══════════════════════ */
const $ = id => document.getElementById(id);
const pad2 = n => String(n).padStart(2, '0');
const ymParse = ym => { const [y, m] = ym.split('-').map(Number); return { y, m }; };
const lastDay = (y, m) => new Date(y, m, 0).getDate();
const ymd = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
const yyyymmdd = (y, m, d) => `${y}${pad2(m)}${pad2(d)}`;
const prevYM = (y, m) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 });
const nextYM = (y, m) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 });
const yymmOf = (y, m) => String(y).slice(2) + pad2(m);
const cmpRate = (cur, prev) => (!prev || prev === 0) ? null : (cur - prev) / prev;
const num = (v, d) => { const n = parseFloat(v); return isNaN(n) ? (d || 0) : n; };

function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function dailyWeights(y, m, seed) {
  const days = lastDay(y, m), rng = lcg(seed), w = [];
  for (let i = 0; i < days; i++) {
    const dow = new Date(y, m - 1, i + 1).getDay();
    w.push((dow === 0 || dow === 6 ? 0.85 : 1.0) * (0.85 + rng() * 0.30));
  }
  return w;
}
function distribute(total, y, m, seed) {
  const w = dailyWeights(y, m, seed), sumW = w.reduce((a, b) => a + b, 0);
  if (!w.length || !sumW) return [];
  const raw = w.map(x => (x / sumW) * total), fl = raw.map(Math.floor);
  let rem = total - fl.reduce((a, b) => a + b, 0);
  const fr = raw.map((v, i) => ({ i, f: v - fl[i] })).sort((a, b) => b.f - a.f);
  for (let k = 0; k < rem && k < fr.length; k++) fl[fr[k].i]++;
  rem -= Math.min(rem, fr.length);
  while (rem > 0 && fl.length) { for (let i = 0; i < fl.length && rem > 0; i++) { fl[i]++; rem--; } }
  while (rem < 0 && fl.length) { let moved = false; for (let i = 0; i < fl.length && rem < 0; i++) { if (fl[i] > 0) { fl[i]--; rem++; moved = true; } } if (!moved) break; }
  return fl;
}
function distributeAmt(total, y, m, seed) {
  const w = dailyWeights(y, m, seed), sumW = w.reduce((a, b) => a + b, 0);
  if (!w.length || !sumW) return [];
  return w.map(x => Math.round((x / sumW) * total * 100) / 100);
}
const genTraceId = () => `${Math.floor(Math.random() * 9e6 + 1e6)}.73483.${Date.now()}${Math.floor(Math.random() * 1e4)}`;
const genUuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click();
}

/* ══════════════════════ state ══════════════════════ */
let base = null, baseName = '';
const basket = [];
let curTab = 'jd_new';

const CATS = [
  { id: 'jd_new', name: '京麦新版' },
  { id: 'jd_old', name: '京麦旧版' },
  { id: 'tmall',  name: '猫超' },
  { id: 'sycm',   name: '生意参谋' },
  { id: 'wx',     name: '微信小店' },
  { id: 'szc',    name: '税务szc' },
  { id: 'custom', name: '自定义' },
];
function catOfRule(r) {
  const a = r.alias || '', p = r.pattern || '';
  if (a.startsWith('京麦新版')) return 'jd_new';
  if (a.startsWith('京麦')) return 'jd_old';
  if (a.startsWith('猫超') || a.startsWith('趋势分析表')) return 'tmall';
  if (a.startsWith('生意参谋')) return 'sycm';
  if (a.startsWith('微信小店')) return 'wx';
  if (p.includes('szc/szzh')) return 'szc';
  return 'custom';
}

/* ══════════════════════ 京麦新版 field codes ══════════════════════ */
const F = {
  PV: 'jdr_sch_traffic_brow_sku__page_qtty_traffic_plat_item_di_sz_bsg',
  UV: 'jdr_sch_traffic_brow_sku__page_cnt_traffic_plat_item_di_sz_bsg',
  DealUser: 'jdr_sch_user_deal_ord_user_cnt_sz_user_deal_snapshot',
  DealRate: 'fo_jdr_sch_industry_deal_rate',
  DealNum: 'jdr_sch_trade_deal_ord_ord_qtty_sz_trade_deal_snapshot',
  DealProNum: 'jdr_sch_trade_deal_ord_sku_qtty_sz_trade_deal_snapshot',
  DealAmt: 'jdr_sch_trade_deal_ord_ord_amt_sz_trade_deal_snapshot',
  DealPriceAvg: 'fo_jdr_sch_trade_deal_ord_amt_user_sz_trade_deal_snapshot',
};

function buildJdNewSummary(cur, prev) {
  const d = {};
  d[F.DealRate + '##compareValue'] = prev.DealRate;
  d[F.PV + '##compareValue'] = prev.PV;
  d[F.DealNum + '##compare'] = cmpRate(cur.DealNum, prev.DealNum);
  d[F.DealProNum] = cur.DealProNum * 1.0;
  d[F.UV] = cur.UV;
  d[F.UV + '##compare'] = cmpRate(cur.UV, prev.UV);
  d[F.DealRate + '##compare'] = cmpRate(cur.DealRate, prev.DealRate);
  d[F.DealPriceAvg] = cur.DealPriceAvg * 1.0;
  d[F.DealPriceAvg + '##compareValue'] = prev.DealPriceAvg * 1.0;
  d[F.PV + '##compare'] = cmpRate(cur.PV, prev.PV);
  d[F.PV] = cur.PV * 1.0;
  d[F.DealUser] = cur.DealUser;
  d[F.DealNum] = cur.DealNum;
  d[F.DealAmt + '##compare'] = cmpRate(cur.DealAmt, prev.DealAmt);
  d[F.DealUser + '##compare'] = cmpRate(cur.DealUser, prev.DealUser);
  d[F.UV + '##compareValue'] = prev.UV;
  d[F.DealProNum + '##compare'] = cmpRate(cur.DealProNum, prev.DealProNum);
  d[F.DealPriceAvg + '##compare'] = cmpRate(cur.DealPriceAvg, prev.DealPriceAvg);
  d[F.DealAmt] = cur.DealAmt * 1.0;
  d[F.DealAmt + '##compareValue'] = prev.DealAmt * 1.0;
  d[F.DealProNum + '##compareValue'] = prev.DealProNum * 1.0;
  d[F.DealNum + '##compareValue'] = prev.DealNum;
  d[F.DealRate] = cur.DealRate;
  d[F.DealUser + '##compareValue'] = prev.DealUser;
  return { header: { code: 0, desc: 'success' }, body: { data: [d], size: 1, cache: true, traceId: genTraceId(), uuid: genUuid() }, errors: null };
}
function buildJdNewTrend(cur) {
  const { y, m } = cur, days = lastDay(y, m);
  const categories = Array.from({ length: days }, (_, i) => ymd(y, m, i + 1));
  const seed = parseInt(yymmOf(y, m), 10);
  const series = [
    { code: F.DealAmt, data: distributeAmt(cur.DealAmt, y, m, seed + 1) },
    { code: F.DealNum, data: distribute(cur.DealNum, y, m, seed + 2) },
    { code: F.DealProNum, data: distribute(cur.DealProNum, y, m, seed + 3) },
    { code: F.DealUser, data: distribute(cur.DealUser, y, m, seed + 4) },
    { code: F.PV, data: distribute(cur.PV, y, m, seed + 5) },
    { code: F.UV, data: distribute(cur.UV, y, m, seed + 6) },
  ];
  return { header: { code: 0, desc: 'success' }, body: { data: [{ trend: { series, categories } }], size: null, cache: true, traceId: genTraceId(), uuid: genUuid() }, errors: null };
}
function jdNewBodySummary(y, m) {
  const p = prevYM(y, m), cur = `${y}-${pad2(m)}`;
  return [`"startDate":"${cur}"`, `"endDate":"${cur}"`, `"compareStartDate":"${p.y}-${pad2(p.m)}"`].join('\n');
}
function jdNewBodyTrend(y, m) {
  const p = prevYM(y, m);
  return [`"startDate":"${ymd(y, m, 1)}"`, `"endDate":"${ymd(y, m, lastDay(y, m))}"`,
    `"compareStartDate":"${ymd(p.y, p.m, 1)}"`, `"compareEndDate":"${ymd(p.y, p.m, lastDay(p.y, p.m))}"`].join('\n');
}
function extractJdNew(y, m) {
  if (!base) return null;
  const r = base.rules.find(x => x.alias === `京麦新版_${yymmOf(y, m)}_getSummary`);
  if (!r) return null;
  try {
    const d = JSON.parse(r.response).body.data[0];
    return { PV: d[F.PV], UV: d[F.UV], DealUser: d[F.DealUser], DealRate: d[F.DealRate],
      DealNum: d[F.DealNum], DealProNum: d[F.DealProNum], DealAmt: d[F.DealAmt], DealPriceAvg: d[F.DealPriceAvg] };
  } catch (e) { return null; }
}

/* ══════════════════════ 京麦旧版 synthesis ══════════════════════ */
function buildJdOld(y, m, cur, prev) {
  const yymm = yymmOf(y, m), s01 = ymd(y, m, 1), sEnd = ymd(y, m, lastDay(y, m));
  const rate = (c, p) => Math.round(((c - p) / p) * 1e10) / 1e10;
  // derived pro-summary fields
  const der = {
    CartGoodsNum: Math.round(cur.ToCartUser * 0.82), CartProNum: Math.round(cur.ToCartUser * 1.55),
    DealGoodsNum: Math.round(cur.DealProNum / 1.19), VisitedGoodsNum: Math.round(cur.UV * 0.082),
    CollectGoodsNum: Math.round(cur.UV * 0.007), CollectNum: Math.round(cur.UV * 0.01),
  };
  const pder = {
    CartGoodsNum: Math.round(prev.ToCartUser * 0.82), CartProNum: Math.round(prev.ToCartUser * 1.55),
    DealGoodsNum: Math.round(prev.DealProNum / 1.19), VisitedGoodsNum: Math.round(prev.UV * 0.082),
    CollectGoodsNum: Math.round(prev.UV * 0.007), CollectNum: Math.round(prev.UV * 0.01),
  };
  const S = (v, p) => ({ Value: v, PreValue: p, Rate: rate(v, p) });
  const proSummary = { message: 'success', status: 0, content: { summary: {
    CollectGoodsNum: S(der.CollectGoodsNum, pder.CollectGoodsNum), UV: S(cur.UV, prev.UV),
    CartGoodsNum: S(der.CartGoodsNum, pder.CartGoodsNum), CartProNum: S(der.CartProNum, pder.CartProNum),
    ToCartUser: S(cur.ToCartUser, prev.ToCartUser), DealAmt: S(cur.DealAmt, prev.DealAmt),
    PV: S(cur.PV, prev.PV), DealProNum: S(cur.DealProNum, prev.DealProNum),
    DealGoodsNum: S(der.DealGoodsNum, pder.DealGoodsNum), VisitedGoodsNum: S(der.VisitedGoodsNum, pder.VisitedGoodsNum),
    CollectNum: S(der.CollectNum, pder.CollectNum) } } };
  const seed = parseInt(yymm, 10);
  const daily = {
    VisitedGoodsNum: distribute(der.VisitedGoodsNum, y, m, seed + 21), CollectGoodsNum: distribute(der.CollectGoodsNum, y, m, seed + 22),
    CartGoodsNum: distribute(der.CartGoodsNum, y, m, seed + 23), DealGoodsNum: distribute(der.DealGoodsNum, y, m, seed + 24),
    DealAmt: distribute(cur.DealAmt, y, m, seed + 25), DealNum: distribute(cur.DealNum, y, m, seed + 26),
    DealProNum: distribute(cur.DealProNum, y, m, seed + 27), DealUser: distribute(cur.DealUser, y, m, seed + 28),
    PV: distribute(cur.PV, y, m, seed + 29), UV: distribute(cur.UV, y, m, seed + 30),
    CartProNum: distribute(der.CartProNum, y, m, seed + 31), ToCartUser: distribute(cur.ToCartUser, y, m, seed + 32),
    CollectNum: distribute(der.CollectNum, y, m, seed + 33),
  };
  const cats = Array.from({ length: lastDay(y, m) }, (_, i) => ymd(y, m, i + 1));
  const proTrend = { message: 'success', status: 0, content: { series: Object.entries(daily).map(([name, data]) => ({ data, name })), categories: cats } };
  const priceAvgDaily = daily.DealAmt.map((a, i) => Math.round((a / daily.DealUser[i]) * 100) / 100);
  const rng = lcg(seed + 40);
  const dealRateDaily = Array.from({ length: lastDay(y, m) }, () => Math.round((cur.DealRate + (rng() - 0.5) * 0.002) * 1e10) / 1e10);
  const vender = { message: 'success', status: 0, content: {
    summary: { DealNum: S(cur.DealNum, prev.DealNum), UV: S(cur.UV, prev.UV), DealUser: S(cur.DealUser, prev.DealUser),
      DealPriceAvg: S(cur.DealPriceAvg, prev.DealPriceAvg), PV: S(cur.PV, prev.PV), DealAmt: S(cur.DealAmt, prev.DealAmt),
      DealProNum: S(cur.DealProNum, prev.DealProNum), DealRate: S(cur.DealRate, prev.DealRate) },
    trend: { series: [ { data: daily.PV, name: 'PV' }, { data: daily.UV, name: 'UV' }, { data: daily.DealUser, name: 'DealUser' },
      { data: dealRateDaily, name: 'DealRate' }, { data: daily.DealNum, name: 'DealNum' }, { data: daily.DealProNum, name: 'DealProNum' },
      { data: daily.DealAmt, name: 'DealAmt' }, { data: priceAvgDaily, name: 'DealPriceAvg' } ], categories: cats } } };
  return [
    { alias: `京麦${yymm}_getProSummary`, pattern: `ppzh.jd.com/brand/productAnalysis/productSummary/getProSummary.ajax?brandId=all&firstCategoryId=&secondCategoryId=&thirdCategoryId=all&date=${yymm}&startDate=${s01}&endDate=${sEnd}`, bodyPattern: '', contentType: 'application/json', enabled: true, response: JSON.stringify(proSummary, null, 4), status: 200 },
    { alias: `京麦${yymm}_getProTrend`, pattern: `jd.com/brand/productAnalysis/productSummary/getProTrend.ajax?brandId=all&firstCategoryId=&secondCategoryId=&thirdCategoryId=all&date=${yymm}&startDate=${s01}&endDate=${sEnd}`, bodyPattern: '', contentType: 'application/json', enabled: true, response: JSON.stringify(proTrend, null, 4), status: 200 },
    { alias: `京麦${yymm}_getVenderDealSummayData`, pattern: `jd.com/brand/dealAnalysis/dealSummary/getVenderDealSummayData.ajax?brandId=all&thirdCategoryId=all&shopType=all&date=${yymm}&endDate=${sEnd}&startDate=${s01}`, bodyPattern: '', contentType: 'application/json', enabled: true, response: JSON.stringify(vender, null, 4), status: 200 },
  ];
}
function extractJdOld(y, m) {
  if (!base) return null;
  const yymm = yymmOf(y, m);
  const rv = base.rules.find(x => x.alias === `京麦${yymm}_getVenderDealSummayData`);
  const rp = base.rules.find(x => x.alias === `京麦${yymm}_getProSummary`);
  if (!rv) return null;
  try {
    const s = JSON.parse(rv.response).content.summary;
    const tc = rp ? JSON.parse(rp.response).content.summary.ToCartUser.Value : Math.round(s.DealUser.Value * 0.7);
    return { PV: s.PV.Value, UV: s.UV.Value, DealUser: s.DealUser.Value, DealRate: s.DealRate.Value,
      DealNum: s.DealNum.Value, DealProNum: s.DealProNum.Value, DealAmt: s.DealAmt.Value,
      DealPriceAvg: s.DealPriceAvg.Value, ToCartUser: tc };
  } catch (e) { return null; }
}

/* ══════════════════════ template clone (猫超/生意参谋/微信小店/szc) ══════════════════════ */
function cloneRule(cat, tpl, y, m, opts) {
  const r = JSON.parse(JSON.stringify(tpl));
  const p = prevYM(y, m), n = nextYM(y, m), end = lastDay(y, m);
  if (cat === 'tmall') {
    if ((tpl.bodyPattern || '').includes('1757')) {
      r.bodyPattern = `"value":"${yyyymmdd(p.y, p.m, lastDay(p.y, p.m))}"\n"value":"${yyyymmdd(y, m, end)}"\n"code":"1757"`;
    }
    try {
      const resp = JSON.parse(r.response);
      const row = resp && resp.data && resp.data.data && resp.data.data[0];
      if (row) {
        row.stat_date = yyyymmdd(y, m, end);
        (opts.overrides || []).forEach(o => { if (o.field && o.value !== '') row[o.field] = num(o.value); });
      }
      r.response = JSON.stringify(resp, null, 4);
    } catch (e) { /* keep template response */ }
  } else if (cat === 'sycm') {
    r.pattern = r.pattern.replace(/dateRange=[^&]*/, `dateRange=${ymd(y, m, 1)}%7C${ymd(y, m, end)}`);
  } else if (cat === 'wx') {
    const startMs = Date.UTC(y, m - 1, 1) - 8 * 3600 * 1000;
    const endMs = startMs + end * 86400000 - 1;
    r.bodyPattern = (r.bodyPattern || '')
      .replace(/"startMs":\d+/, `"startMs":${startMs}`)
      .replace(/"endMs":\d+/, `"endMs":${endMs}`);
  } else if (cat === 'szc') {
    r.bodyPattern = (r.bodyPattern || '')
      .replace(/"skssqq":"[^"]*"/, `"skssqq":"${ymd(y, m, 1)}"`)
      .replace(/"sksszz":"[^"]*"/, `"sksszz":"${ymd(y, m, end)}"`)
      .replace(/"sbrqq":"[^"]*"/, `"sbrqq":"${ymd(n.y, n.m, 1)}"`);
  }
  if (opts.alias) r.alias = opts.alias;
  if (opts.paste) r.response = opts.paste;
  return r;
}
const TMALL_OVERRIDES = [
  ['pay_ord_amt_1d', '支付金额 pay_ord_amt_1d'], ['ipvuv_1d', '访客数 ipvuv_1d'], ['ipv_1d', '浏览量 ipv_1d'],
  ['pay_byr_cnt_1d', '成交人数 pay_byr_cnt_1d'], ['pay_ord_cnt_1d', '成交单量 pay_ord_cnt_1d'],
  ['pay_itm_qty_1d', '成交件数 pay_itm_qty_1d'], ['pay_pbt_1d', '客单价 pay_pbt_1d'],
];

/* ══════════════════════ panels ══════════════════════ */
const metricFields = [['PV', '浏览量'], ['UV', '访客数'], ['DealUser', '成交人数'], ['DealRatePct', '成交转化率%'],
  ['DealNum', '成交单量'], ['DealProNum', '成交商品件数'], ['DealAmt', '成交金额'], ['DealPriceAvg', '客单价']];

function metricsGrid(prefix, vals) {
  return `<div class="grid">${metricFields.map(([k, label]) =>
    `<div><label>${label}</label><input type="number" id="${prefix}_${k}" value="${vals && vals[k] != null ? vals[k] : ''}"></div>`).join('')}
    <div><label>加购人数(仅旧版用)</label><input type="number" id="${prefix}_ToCartUser" value="${vals && vals.ToCartUser != null ? vals.ToCartUser : ''}"></div></div>`;
}
function readMetrics(prefix) {
  const g = k => num($(`${prefix}_${k}`).value);
  return { PV: g('PV'), UV: g('UV'), DealUser: g('DealUser'), DealRate: g('DealRatePct') / 100,
    DealNum: g('DealNum'), DealProNum: g('DealProNum'), DealAmt: g('DealAmt'), DealPriceAvg: g('DealPriceAvg'), ToCartUser: g('ToCartUser') };
}

function renderTabs() {
  $('tabs').innerHTML = CATS.map(c => `<div class="tab ${c.id === curTab ? 'on' : ''}" data-id="${c.id}">${c.name}</div>`).join('');
  $('tabs').querySelectorAll('.tab').forEach(t => t.onclick = () => { curTab = t.dataset.id; renderTabs(); renderPanel(); });
}

function renderPanel() {
  const el = $('panel');
  if (curTab === 'jd_new' || curTab === 'jd_old') {
    el.innerHTML = `
      <div class="row"><div><label>月份</label><input type="month" id="m_ym" value="2026-07"></div>
      <div><label>对比基期</label><select id="m_cmpSrc"><option value="auto">自动（从基础文件读${curTab === 'jd_new' ? '上月' : '去年同期'}）</option><option value="manual">手动填写</option></select></div></div>
      <fieldset><legend>本期指标</legend>${metricsGrid('cur')}</fieldset>
      <fieldset id="cmpBox" style="display:none"><legend>基期指标（${curTab === 'jd_new' ? '上月' : '去年同期'}）</legend>${metricsGrid('prev')}</fieldset>
      <div class="row" style="margin-top:12px"><button id="btnGen">生成规则 → 加入生成篮</button><span id="genMsg" class="ok"></span></div>
      <div class="hint">${curTab === 'jd_new' ? '生成 getSummary + getTrend 两条规则，body 日期自动推算。' : '生成 getProSummary + getProTrend + getVenderDealSummayData 三条规则，URL 日期自动推算。'}</div>`;
    $('m_cmpSrc').onchange = () => { $('cmpBox').style.display = $('m_cmpSrc').value === 'manual' ? '' : 'none'; };
    $('m_ym').onchange = tryAutoFill;
    tryAutoFill();
    $('btnGen').onclick = () => genMetrics();
  } else if (curTab === 'custom') {
    el.innerHTML = `
      <div class="grid">
        <div><label>alias</label><input type="text" id="c_alias" style="width:100%"></div>
        <div><label>pattern (URL包含)</label><input type="text" id="c_pattern" style="width:100%"></div>
        <div><label>status</label><input type="number" id="c_status" value="200"></div>
        <div><label>contentType</label><input type="text" id="c_ct" value="application/json"></div>
      </div>
      <div style="margin-top:8px"><label>bodyPattern（每行一个AND条件，可空）</label><textarea id="c_body" rows="3"></textarea></div>
      <div style="margin-top:8px"><label>cookiePattern（每行一个AND条件，可空）</label><textarea id="c_cookie" rows="2"></textarea></div>
      <div style="margin-top:8px"><label>response（完整JSON）</label><textarea id="c_resp" rows="10"></textarea></div>
      <div class="row" style="margin-top:12px"><button id="btnGenC">生成规则 → 加入生成篮</button></div>`;
    $('btnGenC').onclick = genCustom;
  } else {
    // clone categories
    const list = base ? base.rules.filter(r => catOfRule(r) === curTab) : [];
    el.innerHTML = `
      ${base ? '' : '<div class="hint" style="color:#c0392b">请先在①加载基础规则文件以选择模板。</div>'}
      <div class="row">
        <div style="min-width:320px"><label>模板规则</label><select id="t_tpl" style="width:340px">${list.map((r, i) => `<option value="${base.rules.indexOf(r)}">${r.alias}</option>`).join('')}</select></div>
        <div><label>目标月份</label><input type="month" id="t_ym" value="2026-07"></div>
        <div><label>新alias（可空=沿用模板）</label><input type="text" id="t_alias" style="width:220px"></div>
      </div>
      ${curTab === 'tmall' ? `<fieldset><legend>关键字段覆盖（留空=沿用模板值；仅对1757支付金额类生效）</legend>
        <div class="grid">${TMALL_OVERRIDES.map(([f, label]) => `<div><label>${label}</label><input type="number" id="ov_${f}"></div>`).join('')}</div></fieldset>` : ''}
      <fieldset><legend>response 来源</legend>
        <div class="row"><select id="t_respSrc"><option value="tpl">模板response（自动改写日期字段）</option><option value="paste">粘贴抓包response</option></select></div>
        <textarea id="t_paste" rows="6" style="display:none;margin-top:8px" placeholder="粘贴完整response JSON"></textarea>
      </fieldset>
      <div class="row" style="margin-top:12px"><button id="btnGenT">生成规则 → 加入生成篮</button><span id="genMsg" class="ok"></span></div>
      <div class="hint">日期自动改写：猫超=value日期+stat_date；生意参谋=URL dateRange；微信小店=startMs/endMs毫秒；szc=skssqq/sbrqq。</div>`;
    $('t_respSrc').onchange = () => { $('t_paste').style.display = $('t_respSrc').value === 'paste' ? '' : 'none'; };
    $('btnGenT').onclick = () => genClone();
  }
}

function tryAutoFill() {
  if (curTab !== 'jd_new' && curTab !== 'jd_old') return;
  const { y, m } = ymParse($('m_ym').value || '2026-07');
  const src = curTab === 'jd_new' ? extractJdNew(prevYM(y, m).y, prevYM(y, m).m) : extractJdOld(y - 1, m);
  if (src) {
    $('m_cmpSrc').value = 'auto';
    $('cmpBox').style.display = 'none';
  }
}

/* ══════════════════════ generators ══════════════════════ */
function genMetrics() {
  const { y, m } = ymParse($('m_ym').value);
  const cur = readMetrics('cur');
  let prev;
  if ($('m_cmpSrc').value === 'auto') {
    prev = curTab === 'jd_new' ? extractJdNew(prevYM(y, m).y, prevYM(y, m).m) : extractJdOld(y - 1, m);
    if (!prev) { $('genMsg').textContent = '⚠ 基础文件中无基期数据，请改手动填写'; return; }
  } else prev = readMetrics('prev');
  let rules;
  if (curTab === 'jd_new') {
    const yymm = yymmOf(y, m);
    rules = [
      { alias: `京麦新版_${yymm}_getSummary`, pattern: '.jd.com/api/lowcode/tradeSummary/summary/getSummary.ajax', bodyPattern: jdNewBodySummary(y, m), contentType: 'application/json', enabled: true, response: JSON.stringify(buildJdNewSummary(cur, prev), null, 4), status: 200 },
      { alias: `京麦新版_${yymm}_getTrend`, pattern: '.jd.com/api/lowcode/tradeSummary/summary/getTrend.ajax', bodyPattern: jdNewBodyTrend(y, m), contentType: 'application/json', enabled: true, response: JSON.stringify(buildJdNewTrend({ ...cur, y, m }), null, 4), status: 200 },
    ];
  } else {
    rules = buildJdOld(y, m, cur, prev);
  }
  addToBasket(rules);
  $('genMsg').textContent = `✓ 已生成 ${rules.length} 条规则`;
}

function genClone() {
  const sel = $('t_tpl');
  if (!sel || sel.value === '') { alert('请先加载基础规则文件'); return; }
  const tpl = base.rules[parseInt(sel.value, 10)];
  const { y, m } = ymParse($('t_ym').value);
  const overrides = curTab === 'tmall' ? TMALL_OVERRIDES.map(([f]) => ({ field: f, value: $(`ov_${f}`).value })) : [];
  let paste = null;
  if ($('t_respSrc').value === 'paste') {
    paste = $('t_paste').value.trim();
    try { JSON.parse(paste); } catch (e) { alert('粘贴的response不是合法JSON'); return; }
  }
  const alias = $('t_alias').value.trim() || tpl.alias;
  const rule = cloneRule(curTab, tpl, y, m, { alias, paste, overrides });
  addToBasket([rule]);
  $('genMsg').textContent = '✓ 已生成 1 条规则';
}

function genCustom() {
  const rule = {
    alias: $('c_alias').value.trim() || '自定义规则',
    pattern: $('c_pattern').value.trim(),
    bodyPattern: $('c_body').value, cookiePattern: $('c_cookie').value,
    contentType: $('c_ct').value.trim() || 'application/json',
    enabled: true, response: $('c_resp').value, status: parseInt($('c_status').value, 10) || 200,
  };
  if (rule.response) { try { JSON.parse(rule.response); } catch (e) { alert('response不是合法JSON'); return; } }
  addToBasket([rule]);
}

/* ══════════════════════ basket & export ══════════════════════ */
function addToBasket(rules) {
  basket.push(...rules);
  renderBasket();
  $('preview').textContent = JSON.stringify(rules, null, 2);
}
function renderBasket() {
  $('basketCount').textContent = `（${basket.length}条）`;
  $('basket').innerHTML = basket.length === 0 ? '<span class="muted">暂无生成的规则</span>' :
    basket.map((r, i) => `<div class="basket-item"><code>${r.alias}</code><span class="muted">${(r.pattern || '').slice(0, 60)}</span><button class="danger" data-i="${i}">删除</button></div>`).join('');
  $('basket').querySelectorAll('.danger').forEach(b => b.onclick = () => { basket.splice(parseInt(b.dataset.i, 10), 1); renderBasket(); });
}
function defaultOutName() {
  const d = new Date(), mmdd = pad2(d.getMonth() + 1) + pad2(d.getDate());
  if (baseName) {
    const stripped = baseName.replace(/\d{4}\.json$/, '').replace(/\d{4}\.json/, '');
    return `${stripped}${mmdd}.json`;
  }
  return `txcs-interceptor-rules-${mmdd}.json`;
}
function exportAll() {
  if (!base) { alert('请先加载基础规则文件'); return; }
  if (!basket.length) { alert('生成篮为空'); return; }
  const out = JSON.parse(JSON.stringify(base));
  out.rules = out.rules.concat(basket);
  download($('outName').value || defaultOutName(), JSON.stringify(out, null, 2));
  $('exportMsg').textContent = `✓ 已导出 ${out.rules.length} 条规则（基础${base.rules.length}+生成${basket.length}）`;
}
function exportBasket() {
  if (!basket.length) { alert('生成篮为空'); return; }
  download($('outName').value || defaultOutName(), JSON.stringify({ version: 1, rules: basket }, null, 2));
  $('exportMsg').textContent = `✓ 已导出 ${basket.length} 条生成规则`;
}

/* ══════════════════════ init ══════════════════════ */
$('baseFile').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      base = JSON.parse(rd.result);
      baseName = f.name;
      $('baseInfo').textContent = `已加载 ${f.name}（${base.rules.length}条规则）`;
      $('outName').value = defaultOutName();
      renderPanel();
    } catch (err) { alert('文件解析失败：' + err.message); }
  };
  rd.readAsText(f, 'utf8');
};
$('btnExportAll').onclick = exportAll;
$('btnExportBasket').onclick = exportBasket;
$('btnCopy').onclick = () => {
  navigator.clipboard.writeText(JSON.stringify({ version: 1, rules: basket }, null, 2))
    .then(() => { $('exportMsg').textContent = '✓ 已复制到剪贴板'; });
};
$('outName').value = defaultOutName();
renderTabs();
renderPanel();
renderBasket();
