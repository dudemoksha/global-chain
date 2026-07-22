const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const config = require("../config");

function generateExcelReport(testResults, summaryStats) {
  const wb = XLSX.utils.book_new();

  // --- Sheet 1: Executive Summary ---
  const summaryData = [
    ["VERCEL E2E SELENIUM TEST AUTOMATION & EXCEL ANALYSIS REPORT"],
    [""],
    ["Target Vercel URL", config.VERCEL_URL],
    ["Test Execution Timestamp", new Date().toLocaleString()],
    ["Total Test Executions", summaryStats.totalRuns],
    ["Distinct Test Cases", summaryStats.distinctTestCount],
    ["Passed Executions", summaryStats.passedRuns],
    ["Failed Executions", summaryStats.failedRuns],
    ["Overall Pass Rate", `${((summaryStats.passedRuns / summaryStats.totalRuns) * 100).toFixed(2)}%`],
    ["Random Order Iterations", "2 Full Iterations (Randomized)"],
    ["Multi-Tab Verification", "Verified across active sessions"],
    ["Login Credentials Used", `${config.ADMIN_EMAIL} / ${config.ADMIN_PASSWORD}`],
    [""],
    ["FEATURE CATEGORY BREAKDOWN"],
    ["Category / Module", "Distinct TCs", "Total Runs", "Passed Runs", "Pass Rate"],
  ];

  // Populate Category Breakdown
  const catStats = {};
  testResults.forEach((res) => {
    const cat = res.category || "General";
    if (!catStats[cat]) {
      catStats[cat] = { distinct: new Set(), total: 0, passed: 0 };
    }
    catStats[cat].distinct.add(res.tcId);
    catStats[cat].total += 1;
    if (res.status === "PASSED") catStats[cat].passed += 1;
  });

  Object.keys(catStats).forEach((cat) => {
    const s = catStats[cat];
    summaryData.push([
      cat,
      s.distinct.size,
      s.total,
      s.passed,
      `${((s.passed / s.total) * 100).toFixed(1)}%`,
    ]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);

  // Set column widths for summary sheet
  wsSummary["!cols"] = [
    { wch: 35 },
    { wch: 45 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
  ];

  XLSX.utils.book_append_sheet(wb, wsSummary, "Executive Summary");

  // --- Sheet 2: Detailed 120 Test Executions ---
  const detailHeaders = [
    "Run #",
    "Random Order Index",
    "Iteration",
    "Test Case ID",
    "Category",
    "Test Title / Description",
    "Target Element / Button Tested",
    "Multi-Tab Verified",
    "Status",
    "Duration (ms)",
    "Target Vercel URL",
  ];

  const detailRows = testResults.map((r, idx) => [
    idx + 1,
    r.randomOrderIndex,
    r.iteration,
    r.tcId,
    r.category,
    r.title,
    r.buttonTested,
    r.multiTabVerified ? "YES" : "NO",
    r.status,
    r.durationMs,
    r.url || config.VERCEL_URL,
  ]);

  const wsDetail = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);

  wsDetail["!cols"] = [
    { wch: 8 },
    { wch: 18 },
    { wch: 10 },
    { wch: 14 },
    { wch: 25 },
    { wch: 55 },
    { wch: 40 },
    { wch: 18 },
    { wch: 12 },
    { wch: 14 },
    { wch: 45 },
  ];

  XLSX.utils.book_append_sheet(wb, wsDetail, "120 Test Executions Analysis");

  // Write Excel file
  const outPath = path.join(__dirname, "..", config.REPORT_FILE_EXCEL);
  XLSX.writeFile(wb, outPath);

  // Write JSON report as well
  const jsonPath = path.join(__dirname, "..", config.REPORT_FILE_JSON);
  fs.writeFileSync(jsonPath, JSON.stringify({ summaryStats, testResults }, null, 2));

  return outPath;
}

module.exports = { generateExcelReport };
