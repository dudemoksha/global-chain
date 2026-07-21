#!/usr/bin/env node
// helpers/generate-report.js — reads results.json and writes a formatted Excel workbook
const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

const RESULTS_FILE = path.join(__dirname, "..", "reports", "results.json");
const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "reports",
  `GlobalChain_E2E_Report_${new Date().toISOString().slice(0, 10)}.xlsx`
);

async function main() {
  if (!fs.existsSync(RESULTS_FILE)) {
    console.error("No results.json found. Run the tests first.");
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8"));
  const wb = new ExcelJS.Workbook();
  wb.creator = "GlobalChain E2E";
  wb.created = new Date();

  // ── Summary sheet ──────────────────────────────────────────────────────────
  const summary = wb.addWorksheet("Summary");

  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const total = results.length;
  const passRate = total ? ((passed / total) * 100).toFixed(1) : "0.0";

  summary.columns = [
    { header: "Metric", key: "metric", width: 30 },
    { header: "Value", key: "value", width: 20 },
  ];

  [
    ["Report Generated", new Date().toLocaleString()],
    ["Application", "Global-Chain Supply Chain Platform"],
    ["Test URL", process.env.TEST_URL || "http://localhost:8080"],
    ["Total Test Cases", total],
    ["Passed", passed],
    ["Failed", failed],
    ["Pass Rate (%)", `${passRate}%`],
  ].forEach(([m, v]) => summary.addRow({ metric: m, value: v }));

  // Style summary header
  summary.getRow(1).font = { bold: true, size: 12 };
  summary.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1A1A2E" },
  };
  summary.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };

  // Colour the pass-rate cell
  const passRateCell = summary.getCell("B9");
  passRateCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: parseFloat(passRate) >= 80 ? "FF22C55E" : "FFEF4444" },
  };
  passRateCell.font = { bold: true, color: { argb: "FFFFFFFF" } };

  // ── Per-suite breakdown sheet ──────────────────────────────────────────────
  const breakdown = wb.addWorksheet("Suite Breakdown");
  breakdown.columns = [
    { header: "Test Suite", key: "suite", width: 35 },
    { header: "Total", key: "total", width: 10 },
    { header: "Passed", key: "passed", width: 10 },
    { header: "Failed", key: "failed", width: 10 },
    { header: "Pass Rate", key: "rate", width: 14 },
  ];
  breakdown.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  breakdown.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1A1A2E" },
  };

  const suites = [...new Set(results.map((r) => r.suite))];
  suites.forEach((suite) => {
    const rows = results.filter((r) => r.suite === suite);
    const p = rows.filter((r) => r.status === "passed").length;
    const f = rows.length - p;
    const rate = `${((p / rows.length) * 100).toFixed(1)}%`;
    const row = breakdown.addRow({ suite, total: rows.length, passed: p, failed: f, rate });
    row.getCell("rate").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: f === 0 ? "FFD1FAE5" : "FFFEE2E2" },
    };
  });

  // ── All test cases sheet ───────────────────────────────────────────────────
  const allTests = wb.addWorksheet("All Test Cases");
  allTests.columns = [
    { header: "#", key: "no", width: 6 },
    { header: "Suite", key: "suite", width: 32 },
    { header: "Test Case", key: "title", width: 70 },
    { header: "Status", key: "status", width: 12 },
    { header: "Duration (ms)", key: "duration", width: 16 },
    { header: "Timestamp", key: "timestamp", width: 26 },
    { header: "Error", key: "error", width: 60 },
  ];
  allTests.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  allTests.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1A1A2E" },
  };

  results.forEach((r, i) => {
    const row = allTests.addRow({
      no: i + 1,
      suite: r.suite,
      title: r.title,
      status: r.status.toUpperCase(),
      duration: r.durationMs,
      timestamp: r.timestamp,
      error: r.error || "",
    });
    const statusCell = row.getCell("status");
    statusCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: r.status === "passed" ? "FFD1FAE5" : "FFFEE2E2" },
    };
    statusCell.font = {
      bold: true,
      color: { argb: r.status === "passed" ? "FF166534" : "FF991B1B" },
    };
  });

  // ── Failed tests sheet ─────────────────────────────────────────────────────
  const failedSheet = wb.addWorksheet("Failed Tests");
  failedSheet.columns = [
    { header: "#", key: "no", width: 6 },
    { header: "Suite", key: "suite", width: 32 },
    { header: "Test Case", key: "title", width: 70 },
    { header: "Error", key: "error", width: 80 },
    { header: "Timestamp", key: "timestamp", width: 26 },
  ];
  failedSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  failedSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF991B1B" },
  };

  const failedResults = results.filter((r) => r.status === "failed");
  failedResults.forEach((r, i) => {
    failedSheet.addRow({
      no: i + 1,
      suite: r.suite,
      title: r.title,
      error: r.error || "Unknown error",
      timestamp: r.timestamp,
    });
  });

  // ── Chart data sheet ───────────────────────────────────────────────────────
  const chartData = wb.addWorksheet("Chart Data");
  chartData.addRow(["Suite", "Passed", "Failed"]);
  suites.forEach((suite) => {
    const rows = results.filter((r) => r.suite === suite);
    const p = rows.filter((r) => r.status === "passed").length;
    chartData.addRow([suite, p, rows.length - p]);
  });

  await wb.xlsx.writeFile(OUTPUT_FILE);
  console.log(`\n✅ Excel report generated: ${OUTPUT_FILE}`);
  console.log(`   Total: ${total}  Passed: ${passed}  Failed: ${failed}  Pass Rate: ${passRate}%\n`);
}

main().catch((err) => {
  console.error("Report generation failed:", err);
  process.exit(1);
});
