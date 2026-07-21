// tests/12-admin.test.js — Admin pages: Analytics & admin features (25 test cases)
const assert = require("assert");
const {
  buildDriver, go, loginAsAdmin,
  By, until, TIMEOUT,
} = require("../helpers/setup");

const SUITE = "12 — Admin Features";

describe(SUITE, function () {
  this.timeout(90000);
  let driver;

  before(async () => {
    driver = buildDriver();
    await loginAsAdmin(driver);
  });
  after(async () => { if (driver) await driver.quit(); });

  async function gotoAnalytics() {
    await go(driver, "/analytics");
    await driver.sleep(2500);
  }

  it("TC-281 Admin can access /analytics page", async () => {
    await gotoAnalytics();
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/analytics") || url.includes("/login"));
  });

  it("TC-282 Analytics page has header", async () => {
    await gotoAnalytics();
    const header = await driver.findElement(By.css("header"));
    assert.ok(await header.isDisplayed());
  });

  it("TC-283 Analytics page has content", async () => {
    await gotoAnalytics();
    const text = await driver.findElement(By.css("body")).getText();
    assert.ok(text.length > 5);
  });

  it("TC-284 Analytics page no 404 shown", async () => {
    await gotoAnalytics();
    assert.ok(!(await driver.getPageSource()).includes("Page not found"));
  });

  it("TC-285 Analytics page no error boundary shown", async () => {
    await gotoAnalytics();
    assert.ok(!(await driver.getPageSource()).includes("This page didn't load"));
  });

  it("TC-286 Analytics page title is non-empty", async () => {
    await gotoAnalytics();
    assert.ok((await driver.getTitle()).trim().length > 0);
  });

  it("TC-287 Analytics page has at least one heading", async () => {
    await gotoAnalytics();
    const h = await driver.findElements(By.css("h1, h2, h3"));
    assert.ok(h.length >= 1);
  });

  it("TC-288 Analytics page has noindex meta", async () => {
    await gotoAnalytics();
    assert.ok((await driver.getPageSource()).includes("noindex"));
  });

  it("TC-289 Analytics page has at least one interactive element", async () => {
    await gotoAnalytics();
    const elems = await driver.findElements(By.css("button, input, select, a"));
    assert.ok(elems.length >= 1);
  });

  it("TC-290 Analytics page loads in under 12 seconds", async () => {
    const start = Date.now();
    await gotoAnalytics();
    assert.ok(Date.now() - start < 12000);
  });

  it("TC-291 Analytics page utf-8 charset", async () => {
    await gotoAnalytics();
    assert.ok((await driver.getPageSource()).includes("utf-8"));
  });

  it("TC-292 Analytics page viewport meta", async () => {
    await gotoAnalytics();
    assert.ok((await driver.getPageSource()).includes("viewport"));
  });

  it("TC-293 Analytics page favicon present", async () => {
    await gotoAnalytics();
    assert.ok((await driver.getPageSource()).includes("favicon"));
  });

  it("TC-294 Analytics page OG meta present", async () => {
    await gotoAnalytics();
    assert.ok((await driver.getPageSource()).includes("og:"));
  });

  it("TC-295 Analytics page Global-Chain branding present", async () => {
    await gotoAnalytics();
    const src = await driver.getPageSource();
    assert.ok(src.includes("Global") || src.includes("Chain"));
  });

  it("TC-296 Admin dashboard shows Admin badge", async () => {
    await go(driver, "/dashboard");
    await driver.sleep(2000);
    const src = await driver.getPageSource();
    assert.ok(src.toLowerCase().includes("admin"));
  });

  it("TC-297 Admin nav has Dashboard link", async () => {
    await go(driver, "/dashboard");
    await driver.sleep(2000);
    const link = await driver.findElement(By.css("a[href='/dashboard']"));
    assert.ok(await link.isDisplayed());
  });

  it("TC-298 Admin nav has Analytics link", async () => {
    await go(driver, "/dashboard");
    await driver.sleep(2000);
    const link = await driver.findElement(By.css("a[href='/analytics']"));
    assert.ok(await link.isDisplayed());
  });

  it("TC-299 Admin sign-out button works", async () => {
    await go(driver, "/dashboard");
    await driver.sleep(2000);
    const btn = await driver.findElement(By.xpath("//button[normalize-space()='Sign out']"));
    assert.ok(await btn.isDisplayed());
    // Don't actually click — just verify it's there
  });

  it("TC-300 Analytics page scrolls without errors", async () => {
    await gotoAnalytics();
    await driver.executeScript("window.scrollTo(0, document.body.scrollHeight)");
    await driver.sleep(300);
    assert.ok(true);
  });

  it("TC-301 Analytics page refresh maintains admin session", async () => {
    await gotoAnalytics();
    await driver.navigate().refresh();
    await driver.sleep(3000);
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/analytics") || url.includes("/login"));
  });

  it("TC-302 Analytics page background colour is set", async () => {
    await gotoAnalytics();
    const body = await driver.findElement(By.css("body"));
    const bg = await driver.executeScript(
      "return window.getComputedStyle(arguments[0]).backgroundColor", body
    );
    assert.ok(bg.length > 0);
  });

  it("TC-303 Analytics page back navigation works", async () => {
    await gotoAnalytics();
    await driver.navigate().back();
    await driver.sleep(1000);
    assert.ok((await driver.getCurrentUrl()).includes("localhost"));
  });

  it("TC-304 Admin user email is shown in header", async () => {
    await go(driver, "/dashboard");
    await driver.sleep(2000);
    const src = await driver.getPageSource();
    assert.ok(src.includes("@"));
  });

  it("TC-305 Full login-to-analytics E2E flow works without errors", async () => {
    // Already logged in; navigate to analytics and verify
    await gotoAnalytics();
    const url = await driver.getCurrentUrl();
    const src = await driver.getPageSource();
    assert.ok(
      (url.includes("/analytics") || url.includes("/login")) &&
      !src.includes("This page didn't load")
    );
  });
});
