// Append monthly interception rules (3 per month) to the rules file, based on
// the format at txcs-interceptor-rules (2).json lines 636-665.
//
// Three endpoints per month, each with a DISTINCT url (date=YYYYMM discriminates month):
//   1. getProSummary  <- getProSummary_monthly_json/京麦{YYMM}_getProSummary.json
//        ppzh.jd.com/brand/productAnalysis/productSummary/getProSummary.ajax
//   2. getProTrend    <- getProSummary_monthly_json/京麦{YYMM}_getProTrend.json
//        jd.com/brand/productAnalysis/productSummary/getProTrend.ajax
//   3. getVenderDealSummayData <- getVenderDealSummayData_monthly_json/京麦成交概况{YYYY-MM}.json
//        jd.com/brand/dealAnalysis/dealSummary/getVenderDealSummayData.ajax
//
// Output: a NEW file txcs-interceptor-rules (3).json (existing rules preserved).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_RULES = path.join(ROOT, 'rules', 'txcs-interceptor-rules (2).json');
const OUT_RULES = path.join(ROOT, 'rules', 'txcs-interceptor-rules (3).json');
const PRO_DIR = path.join(__dirname, 'getProSummary_monthly_json');
const DEAL_DIR = path.join(__dirname, 'getVenderDealSummayData_monthly_json');

// [compact YYMM, YYYY, MM, lastDay]
const MONTHS = [
  ['2501', 2025, '01', 31],
  ['2502', 2025, '02', 28],
  ['2503', 2025, '03', 31],
  ['2504', 2025, '04', 30],
  ['2505', 2025, '05', 31],
  ['2506', 2025, '06', 30],
  ['2507', 2025, '07', 31],
  ['2508', 2025, '08', 31],
  ['2509', 2025, '09', 30],
  ['2510', 2025, '10', 31],
  ['2511', 2025, '11', 30],
  ['2512', 2025, '12', 31],
  ['2601', 2026, '01', 31],
  ['2602', 2026, '02', 28],
  ['2603', 2026, '03', 31],
  ['2604', 2026, '04', 30],
];

function readBody(p) { return fs.readFileSync(p, 'utf8'); }

function mkRule(alias, pattern, body) {
  return {
    alias,
    pattern,
    bodyPattern: '',
    status: 200,
    contentType: 'application/json',
    responseType: 'static',
    response: body,
    enabled: true,
  };
}

const doc = JSON.parse(fs.readFileSync(SRC_RULES, 'utf8'));
const beforeCount = doc.rules.length;
let added = 0;

MONTHS.forEach(([ym, year, mm, lastDay]) => {
  const ymd = `${year}${mm}`;                 // 202501
  const start = `${year}-${mm}-01`;           // 2025-01-01
  const end = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`; // 2025-01-31
  const ymDash = `${year}-${mm}`;             // 2025-01

  const proSummaryUrl =
    `ppzh.jd.com/brand/productAnalysis/productSummary/getProSummary.ajax?brandId=all&firstCategoryId=&secondCategoryId=&thirdCategoryId=all&date=${ymd}&startDate=${start}&endDate=${end}`;
  const proTrendUrl =
    `jd.com/brand/productAnalysis/productSummary/getProTrend.ajax?brandId=all&firstCategoryId=&secondCategoryId=&thirdCategoryId=all&date=${ymd}&startDate=${start}&endDate=${end}`;
  const venderUrl =
    `jd.com/brand/dealAnalysis/dealSummary/getVenderDealSummayData.ajax?brandId=all&thirdCategoryId=all&shopType=all&date=${ymd}&endDate=${end}&startDate=${start}`;

  const proSummaryBody = readBody(path.join(PRO_DIR, `京麦${ym}_getProSummary.json`));
  const proTrendBody = readBody(path.join(PRO_DIR, `京麦${ym}_getProTrend.json`));
  const venderBody = readBody(path.join(DEAL_DIR, `京麦成交概况${ymDash}.json`));

  doc.rules.push(mkRule(`京麦${ym}_getProSummary`, proSummaryUrl, proSummaryBody));
  doc.rules.push(mkRule(`京麦${ym}_getProTrend`, proTrendUrl, proTrendBody));
  doc.rules.push(mkRule(`京麦${ym}_getVenderDealSummayData`, venderUrl, venderBody));
  added += 3;
  console.log(`+ 京麦${ym}: getProSummary / getProTrend / getVenderDealSummayData  (date=${ymd})`);
});

fs.writeFileSync(OUT_RULES, JSON.stringify(doc, null, 2), 'utf8');
console.log(`\nRules: ${beforeCount} -> ${doc.rules.length} (+${added}). Written to ${OUT_RULES}`);
