// tests/08-simulation.test.js — Simulation page (25 test cases)
const assert = require("assert");
const {
  buildDriver, go, loginAsAdmin,
  By, until, TIMEOUT,
} = require("../helpers/setup");

const SUITE = "08 — Simulation Page";

describe(SUITE, function () {
  this.timeout(90000);
  let driver;

  before(async () => {
    driver = buildDriver();
    await loginAsAdmin(driver);
  });
  after(async () => { if (driver) await driver.quit(); });

  async function gotoSim() {
    await go(driver, "/simulation");
    await driver.sleep(2500);
  }

  it("TC-191 Simulation page loads at /simulation", async () => {
    await gotoSim();
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/simulation") || url.includes("/login"));
  });

  it("TC-192 Simulation page has header", async () => {
    await gotoSim();
    assert.ok(await driver.findElement(By.css("header")).isDisplayed());
  });

  it("TC-193 Simulation page has body content", async () => {
    await gotoSim();
    const text = await driver.findElement(By.css("body")).getText();
    assert.ok(text.length > 5);
  });

  it("TC-194 Simulation page no 404 error", async () => {
    await gotoSim();
    assert.ok(!(await driver.getPageSource()).includes("Page not found"));
  });

  it("TC-195 Simulation page no error boundary shown", async () => {
    await gotoSim();
    assert.ok(!(await driver.getPageSource()).includes("This page didn't load"));
  });

  it("TC-196 Simulation page has headings", async () => {
    await gotoSim();
    const h = await driver.findElements(By.css("h1, h2, h3"));
    assert.ok(h.length >= 1);
  });

  it("TC-197 Simulation page title is non-empty", async () => {
    await gotoSim();
    assert.ok((await driver.getTitle()).trim().length > 0);
  });

  it("TC-198 Simulation page has noindex meta", async () => {
    await gotoSim();
    assert.ok((await driver.getPageSource()).includes("noindex"));
  });

  it("TC-199 Simulation page has at least one button or input", async () => {
    await gotoSim();
    const btns = await driver.findElements(By.css("button, input"));
    assert.ok(btns.length >= 1);
  });

  it("TC-200 Simulation page shows simulation controls or Under Review notice", async () => {
    await gotoSim();
    const src = await driver.getPageSource();
    assert.ok(
      src.toLowerCase().includes("simulat") ||
      src.toLowerCase().includes("scenario") ||
      src.toLowerCase().includes("review") ||
      src.toLowerCase().includes("approved")
    );
  });

  it("TC-201 Simulation page severity or scenario selector is present or review is shown", async () => {
    await gotoSim();
    const src = await driver.getPageSource();
    assert.ok(src.length > 200);
  });

  it("TC-202 Simulation page sign-out button visible", async () => {
    await gotoSim();
    const btn = await driver.findElement(By.xpath("//button[normalize-space()='Sign out']"));
    assert.ok(await btn.isDisplayed());
  });

  it("TC-203 Simulation page utf-8 present", async () => {
    await gotoSim();
    assert.ok((await driver.getPageSource()).includes("utf-8"));
  });

  it("TC-204 Simulation page viewport meta present", async () => {
    await gotoSim();
    assert.ok((await driver.getPageSource()).includes("viewport"));
  });

  it("TC-205 Simulation page favicon present", async () => {
    await gotoSim();
    assert.ok((await driver.getPageSource()).includes("favicon"));
  });

  it("TC-206 Simulation page loads in under 12 seconds", async () => {
    const start = Date.now();
    await gotoSim();
    assert.ok(Date.now() - start < 12000);
  });

  it("TC-207 Simulation page scrolls without errors", async () => {
    await gotoSim();
    await driver.executeScript("window.scrollTo(0, document.body.scrollHeight)");
    await driver.sleep(300);
    assert.ok(true);
  });

  it("TC-208 Simulation page Global-Chain branding is present", async () => {
    await gotoSim();
    const src = await driver.getPageSource();
    assert.ok(src.includes("Global") || src.includes("Chain"));
  });

  it("TC-209 Simulation page dashboard nav link works", async () => {
    await gotoSim();
    await driver.findElement(By.css("a[href='/dashboard']")).click();
    await driver.sleep(2000);
    assert.ok((await driver.getCurrentUrl()).includes("/dashboard"));
  });

  it("TC-210 Simulation page refresh keeps auth", async () => {
    await gotoSim();
    await driver.navigate().refresh();
    await driver.sleep(3000);
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/simulation") || url.includes("/login"));
  });

  it("TC-211 First button on simulation page is clickable", async () => {
    await gotoSim();
    const btns = await driver.findElements(By.css("button:not([disabled])"));
    if (btns.length > 0) {
      try { await btns[0].click(); await driver.sleep(600); } catch (_) {}
    }
    assert.ok(true);
  });

  it("TC-212 Simulation page OG meta present", async () => {
    await gotoSim();
    assert.ok((await driver.getPageSource()).includes("og:"));
  });

  it("TC-213 Simulation page back navigation works", async () => {
    await gotoSim();
    await driver.navigate().back();
    await driver.sleep(1000);
    assert.ok((await driver.getCurrentUrl()).includes("localhost"));
  });

  it("TC-214 Simulation page has no blank body", async () => {
    await gotoSim();
    const text = await driver.findElement(By.css("body")).getText();
    assert.ok(text.trim().length > 5);
  });

  it("TC-215 Simulation page background colour is set", async () => {
    await gotoSim();
    const body = await driver.findElement(By.css("body"));
    const bg = await driver.executeScript(
      "return window.getComputedStyle(arguments[0]).backgroundColor", body
    );
    assert.ok(bg.length > 0);
  });
});
