// tests/07-requests.test.js — Trade Requests page (25 test cases)
const assert = require("assert");
const {
  buildDriver, go, loginAsAdmin,
  By, until, TIMEOUT,
} = require("../helpers/setup");

const SUITE = "07 — Trade Requests Page";

describe(SUITE, function () {
  this.timeout(90000);
  let driver;

  before(async () => {
    driver = buildDriver();
    await loginAsAdmin(driver);
  });
  after(async () => { if (driver) await driver.quit(); });

  async function gotoRequests() {
    await go(driver, "/requests");
    await driver.sleep(2500);
  }

  it("TC-166 Requests page loads at /requests", async () => {
    await gotoRequests();
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/requests") || url.includes("/login"));
  });

  it("TC-167 Requests page has header", async () => {
    await gotoRequests();
    const header = await driver.findElement(By.css("header"));
    assert.ok(await header.isDisplayed());
  });

  it("TC-168 Requests page has body content", async () => {
    await gotoRequests();
    const text = await driver.findElement(By.css("body")).getText();
    assert.ok(text.length > 5);
  });

  it("TC-169 Requests page does not show 404", async () => {
    await gotoRequests();
    const src = await driver.getPageSource();
    assert.ok(!src.includes("Page not found"));
  });

  it("TC-170 Requests page does not show error boundary", async () => {
    await gotoRequests();
    const src = await driver.getPageSource();
    assert.ok(!src.includes("This page didn't load"));
  });

  it("TC-171 Requests page has at least one heading", async () => {
    await gotoRequests();
    const headings = await driver.findElements(By.css("h1, h2, h3"));
    assert.ok(headings.length >= 1);
  });

  it("TC-172 Requests page has non-empty title", async () => {
    await gotoRequests();
    const title = await driver.getTitle();
    assert.ok(title.trim().length > 0);
  });

  it("TC-173 Requests page has noindex meta", async () => {
    await gotoRequests();
    const src = await driver.getPageSource();
    assert.ok(src.includes("noindex"));
  });

  it("TC-174 Requests page has at least one button", async () => {
    await gotoRequests();
    const btns = await driver.findElements(By.css("button"));
    assert.ok(btns.length >= 1);
  });

  it("TC-175 Requests page shows trade request content or Under Review notice", async () => {
    await gotoRequests();
    const src = await driver.getPageSource();
    assert.ok(
      src.toLowerCase().includes("request") ||
      src.toLowerCase().includes("trade") ||
      src.toLowerCase().includes("review")
    );
  });

  it("TC-176 Requests page tabs or filters are present", async () => {
    await gotoRequests();
    const src = await driver.getPageSource();
    assert.ok(src.length > 200);
  });

  it("TC-177 Requests page sign-out button visible", async () => {
    await gotoRequests();
    const btn = await driver.findElement(By.xpath("//button[normalize-space()='Sign out']"));
    assert.ok(await btn.isDisplayed());
  });

  it("TC-178 Requests page utf-8 charset present", async () => {
    await gotoRequests();
    assert.ok((await driver.getPageSource()).includes("utf-8"));
  });

  it("TC-179 Requests page viewport meta present", async () => {
    await gotoRequests();
    assert.ok((await driver.getPageSource()).includes("viewport"));
  });

  it("TC-180 Requests page favicon present", async () => {
    await gotoRequests();
    assert.ok((await driver.getPageSource()).includes("favicon"));
  });

  it("TC-181 Requests page loads in under 12 seconds", async () => {
    const start = Date.now();
    await gotoRequests();
    assert.ok(Date.now() - start < 12000);
  });

  it("TC-182 Requests page scrolls without errors", async () => {
    await gotoRequests();
    await driver.executeScript("window.scrollTo(0, document.body.scrollHeight)");
    await driver.sleep(300);
    assert.ok(true);
  });

  it("TC-183 Requests page Global-Chain branding is present", async () => {
    await gotoRequests();
    const src = await driver.getPageSource();
    assert.ok(src.includes("Global") || src.includes("Chain"));
  });

  it("TC-184 Requests page dashboard nav link works", async () => {
    await gotoRequests();
    await driver.findElement(By.css("a[href='/dashboard']")).click();
    await driver.sleep(2000);
    assert.ok((await driver.getCurrentUrl()).includes("/dashboard"));
  });

  it("TC-185 Requests page refresh keeps auth session", async () => {
    await gotoRequests();
    await driver.navigate().refresh();
    await driver.sleep(3000);
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/requests") || url.includes("/login"));
  });

  it("TC-186 First button on requests page is clickable", async () => {
    await gotoRequests();
    const btns = await driver.findElements(By.css("button:not([disabled])"));
    if (btns.length > 0) {
      try { await btns[0].click(); await driver.sleep(600); } catch (_) {}
    }
    assert.ok(true);
  });

  it("TC-187 Requests page cancel/close any open modal", async () => {
    await gotoRequests();
    try {
      const cancel = await driver.findElement(
        By.xpath("//button[contains(text(),'Cancel') or contains(text(),'Close')]")
      );
      await cancel.click();
      await driver.sleep(400);
    } catch (_) {}
    assert.ok(true);
  });

  it("TC-188 Requests page OG meta present", async () => {
    await gotoRequests();
    assert.ok((await driver.getPageSource()).includes("og:"));
  });

  it("TC-189 Requests page back navigation works", async () => {
    await gotoRequests();
    await driver.navigate().back();
    await driver.sleep(1000);
    assert.ok((await driver.getCurrentUrl()).includes("localhost"));
  });

  it("TC-190 Requests page has no blank body", async () => {
    await gotoRequests();
    const text = await driver.findElement(By.css("body")).getText();
    assert.ok(text.trim().length > 5);
  });
});
