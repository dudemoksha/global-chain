// helpers/run-tests.js — Programmatic Mocha runner that executes all tests, writes results, generates the Excel report, and exits with correct code.
const Mocha = require("mocha");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const mocha = new Mocha({
  timeout: 90000,
  reporter: path.join(__dirname, "mocha-reporter.js"),
});

const testsDir = path.join(__dirname, "..", "tests");
fs.readdirSync(testsDir)
  .filter((file) => file.endsWith(".test.js"))
  .forEach((file) => {
    mocha.addFile(path.join(testsDir, file));
  });

mocha.run((failures) => {
  try {
    console.log("\nGenerating Excel Report...");
    execSync("node helpers/generate-report.js", { stdio: "inherit" });
  } catch (err) {
    console.error("Failed to generate Excel report:", err);
  }
  // Exit with correct status code (failures count)
  process.exit(failures ? 1 : 0);
});
