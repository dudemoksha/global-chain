// helpers/mocha-reporter.js — custom Mocha reporter that captures results to JSON
const Mocha = require("mocha");
const { saveResult, clearResults } = require("./setup");
const { EVENT_RUN_BEGIN, EVENT_TEST_PASS, EVENT_TEST_FAIL, EVENT_SUITE_BEGIN } = Mocha.Runner.constants;

class JsonResultReporter {
  constructor(runner) {
    let currentSuite = "General";
    let startTime = Date.now();

    runner.on(EVENT_RUN_BEGIN, () => {
      clearResults();
    });

    runner.on(EVENT_SUITE_BEGIN, (suite) => {
      if (suite.title && suite.title.trim()) {
        currentSuite = suite.title.trim();
      }
    });

    runner.on(EVENT_TEST_PASS, (test) => {
      const duration = Date.now() - startTime;
      saveResult(currentSuite, test.fullTitle(), "passed", test.duration || duration, null);
      console.log(`  ✔ ${test.title}`);
      startTime = Date.now();
    });

    runner.on(EVENT_TEST_FAIL, (test, err) => {
      const duration = Date.now() - startTime;
      saveResult(currentSuite, test.fullTitle(), "failed", test.duration || duration, err);
      console.log(`  ✖ ${test.title}`);
      console.log(`    ${err.message}`);
      startTime = Date.now();
    });
  }
}

module.exports = JsonResultReporter;
