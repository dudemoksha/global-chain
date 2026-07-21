// helpers/setup.js — shared driver factory, auth helpers, React input utilities
const { Builder, By, until, Key } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const path = require("path");
const fs = require("fs");

const BASE_URL = process.env.TEST_URL || "http://localhost:8080";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "nmokshasai7@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "111111";
const TIMEOUT = 20000;
const RESULTS_FILE = path.join(__dirname, "..", "reports", "results.json");

// ─── Driver ────────────────────────────────────────────────────────────────
function buildDriver() {
  const opts = new chrome.Options();
  opts.addArguments("--headless");
  opts.addArguments("--no-sandbox");
  opts.addArguments("--disable-dev-shm-usage");
  opts.addArguments("--disable-gpu");
  opts.addArguments("--window-size=1400,900");
  opts.addArguments("--disable-extensions");
  return new Builder().forBrowser("chrome").setChromeOptions(opts).build();
}

// ─── React-aware input setter ───────────────────────────────────────────────
async function setInput(driver, id, text) {
  await driver.executeScript(
    `
    const el = document.getElementById(arguments[0]);
    if (!el) throw new Error('Element not found: ' + arguments[0]);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, arguments[1]);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  `,
    id,
    text
  );
  await driver.sleep(200);
}

// Set a <select> by value attribute
async function setSelect(driver, id, value) {
  await driver.executeScript(
    `
    const el = document.getElementById(arguments[0]);
    if (!el) throw new Error('Select not found: ' + arguments[0]);
    el.value = arguments[1];
    el.dispatchEvent(new Event('change', { bubbles: true }));
  `,
    id,
    value
  );
  await driver.sleep(200);
}

// Wait for an element by id to appear in DOM
async function waitFor(driver, id, ms) {
  return driver.wait(until.elementLocated(By.id(id)), ms || TIMEOUT);
}

// Wait for any CSS selector
async function waitForCss(driver, css, ms) {
  return driver.wait(until.elementLocated(By.css(css)), ms || TIMEOUT);
}

// Navigate and wait for React to hydrate
async function go(driver, path, waitMs) {
  await driver.get(`${BASE_URL}${path}`);
  await driver.sleep(waitMs || 2500);
}

// ─── Auth helpers ───────────────────────────────────────────────────────────
async function loginAsAdmin(driver) {
  await go(driver, "/login");
  await waitFor(driver, "email");
  await setInput(driver, "email", ADMIN_EMAIL);
  await setInput(driver, "password", ADMIN_PASSWORD);
  await driver.findElement(By.id("login-button")).click();
  await driver.wait(until.urlContains("/dashboard"), TIMEOUT, "Login redirect");
  await driver.sleep(2000);
}

async function logout(driver) {
  try {
    const btn = await driver.findElement(
      By.xpath("//button[normalize-space()='Sign out']")
    );
    await btn.click();
    await driver.sleep(1500);
  } catch (_) {}
}

// ─── Result collector ───────────────────────────────────────────────────────
function loadResults() {
  try {
    fs.mkdirSync(path.join(__dirname, "..", "reports"), { recursive: true });
    if (fs.existsSync(RESULTS_FILE)) {
      return JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8"));
    }
  } catch (_) {}
  return [];
}

function saveResult(suite, title, status, durationMs, error) {
  const results = loadResults();
  results.push({
    suite,
    title,
    status,
    durationMs: durationMs || 0,
    error: error ? error.message : null,
    timestamp: new Date().toISOString(),
  });
  fs.mkdirSync(path.join(__dirname, "..", "reports"), { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
}

function clearResults() {
  fs.mkdirSync(path.join(__dirname, "..", "reports"), { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify([], null, 2));
}

module.exports = {
  BASE_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TIMEOUT,
  buildDriver,
  setInput,
  setSelect,
  waitFor,
  waitForCss,
  go,
  loginAsAdmin,
  logout,
  saveResult,
  loadResults,
  clearResults,
  By,
  until,
  Key,
};
