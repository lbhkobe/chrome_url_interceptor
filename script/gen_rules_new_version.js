/**
 * Add new-format getSummary + getTrend rules to the interceptor rules file.
 *
 * URL patterns:
 *   getSummary: .jd.com/api/lowcode/tradeSummary/summary/getSummary.ajax
 *   getTrend:   .jd.com/api/lowcode/tradeSummary/summary/getTrend.ajax
 *
 * Body patterns (getSummary, example for 2026-06):
 *   "startDate":"2026-06"
 *   "endDate":"2026-06"
 *   "compareStartDate":"2026-05"
 *
 * Body patterns (getTrend, example for 2026-06):
 *   "startDate":"2026-06-01"
 *   "endDate":"2026-06-30"
 *   "compareStartDate":"2026-05-01"
 *   "compareEndDate":"2026-05-31"
 */
const fs = require('fs');
const path = require('path');

const MONTHS = [
  '2501','2502','2503','2504','2505','2506',
  '2507','2508','2509','2510','2511','2512',
  '2601','2602','2603','2604','2605','2606'
];

const SRC_RULES = path.join(__dirname, '..', 'rules', 'txcs-interceptor-rules (4).json');
const DST_RULES = path.join(__dirname, '..', 'rules', 'txcs-interceptor-rules (5).json');
const JSON_DIR  = path.join(__dirname, 'new_version_json');

const PATTERN_SUMMARY = '.jd.com/api/lowcode/tradeSummary/summary/getSummary.ajax';
const PATTERN_TREND   = '.jd.com/api/lowcode/tradeSummary/summary/getTrend.ajax';

// ── Helpers ─────────────────────────────────────────────────────────────────
function toFullYear(yymm) {
  const yy = parseInt(yymm.slice(0, 2), 10);
  const mm = parseInt(yymm.slice(2), 10);
  return { year: 2000 + yy, month: mm };
}

function lastDay(year, month) {
  return new Date(year, month, 0).getDate();
}

function pad2(n) { return String(n).padStart(2, '0'); }

/**
 * Get previous month (year, month) from current (year, month)
 */
function prevMonth(year, month) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

/**
 * Build bodyPattern for getSummary rule.
 * Example output for 2026-06:
 *   "startDate":"2026-06"\n"endDate":"2026-06"\n"compareStartDate":"2026-05"
 */
function buildSummaryBody(year, month) {
  const cur = `${year}-${pad2(month)}`;
  const prev = prevMonth(year, month);
  const cmp = `${prev.year}-${pad2(prev.month)}`;
  return [
    `"startDate":"${cur}"`,
    `"endDate":"${cur}"`,
    `"compareStartDate":"${cmp}"`
  ].join('\n');
}

/**
 * Build bodyPattern for getTrend rule.
 * Example output for 2026-06:
 *   "startDate":"2026-06-01"\n"endDate":"2026-06-30"\n"compareStartDate":"2026-05-01"\n"compareEndDate":"2026-05-31"
 */
function buildTrendBody(year, month) {
  const curStart = `${year}-${pad2(month)}-01`;
  const curEnd   = `${year}-${pad2(month)}-${pad2(lastDay(year, month))}`;
  const prev = prevMonth(year, month);
  const cmpStart = `${prev.year}-${pad2(prev.month)}-01`;
  const cmpEnd   = `${prev.year}-${pad2(prev.month)}-${pad2(lastDay(prev.year, prev.month))}`;
  return [
    `"startDate":"${curStart}"`,
    `"endDate":"${curEnd}"`,
    `"compareStartDate":"${cmpStart}"`,
    `"compareEndDate":"${cmpEnd}"`
  ].join('\n');
}

// ── Main ────────────────────────────────────────────────────────────────────
const rulesData = JSON.parse(fs.readFileSync(SRC_RULES, 'utf8'));
const newRules = [];

for (const yymm of MONTHS) {
  const { year, month } = toFullYear(yymm);

  // Read generated JSON files
  const summaryJSON = fs.readFileSync(path.join(JSON_DIR, `getSummary_${yymm}.json`), 'utf8');
  const trendJSON   = fs.readFileSync(path.join(JSON_DIR, `getTrend_${yymm}.json`), 'utf8');

  // getSummary rule
  newRules.push({
    alias: `京麦新版_${yymm}_getSummary`,
    pattern: PATTERN_SUMMARY,
    bodyPattern: buildSummaryBody(year, month),
    contentType: 'application/json',
    enabled: true,
    response: summaryJSON.trim(),
    status: 200
  });

  // getTrend rule
  newRules.push({
    alias: `京麦新版_${yymm}_getTrend`,
    pattern: PATTERN_TREND,
    bodyPattern: buildTrendBody(year, month),
    contentType: 'application/json',
    enabled: true,
    response: trendJSON.trim(),
    status: 200
  });
}

// Append new rules
rulesData.rules = rulesData.rules.concat(newRules);

// Write to new file
fs.writeFileSync(DST_RULES, JSON.stringify(rulesData, null, 2), 'utf8');

console.log(`Added ${newRules.length} new rules (${MONTHS.length} months × 2).`);
console.log(`Total rules: ${rulesData.rules.length}`);
console.log(`Output: ${DST_RULES}`);
console.log('\nSample bodyPatterns:');
console.log('  getSummary 2606:', buildSummaryBody(2026, 6));
console.log('  getTrend   2606:', buildTrendBody(2026, 6));
console.log('  getSummary 2501:', buildSummaryBody(2025, 1));
console.log('  getTrend   2501:', buildTrendBody(2025, 1));
