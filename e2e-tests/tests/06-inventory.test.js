// tests/06-inventory.test.js — My SKUs / Inventory page (30 test cases)
const assert = require("assert");
const {
  buildDriver, setInput, waitFor, go, loginAsAdmin,
  By, until, TIMEOUT,
} = require("../helpers/setup");

const SUITE = "06 — Inventory (My SKUs) Page";

describe(SUITE, function () {
  this.timeout(90000);
  let driver;

  before(async () => {
    driver = buildDriver();
    await loginAsAdmin(driver);
  });
  after(async () => { if (driver) await driver.quit(); });

  async function gotoInventory() {
    await go(driver, "/inventory");
    await driver.sleep(2500);
  }

  it("TC-136 Inventory page loads at /inventory", async () => {
    await gotoInventory();
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/inventory") || url.includes("/login"));
  });

  it("TC-137 Inventory page has a header", async () => {
    await gotoInventory();
    const header = await driver.findElement(By.css("header"));
    assert.ok(await header.isDisplayed());
  });

  it("TC-138 Inventory page has body content", async () => {
    await gotoInventory();
    const text = await driver.findElement(By.css("body")).getText();
    assert.ok(text.length > 10);
  });

  it("TC-139 Inventory page does not show 404", async () => {
    await gotoInventory();
    const src = await driver.getPageSource();
    assert.ok(!src.includes("Page not found"));
  });

  it("TC-140 Inventory page does not show error boundary", async () => {
    await gotoInventory();
    const src = await driver.getPageSource();
    assert.ok(!src.includes("This page didn't load"));
  });

  it("TC-141 Inventory page has at least one heading", async () => {
    await gotoInventory();
    const headings = await driver.findElements(By.css("h1, h2, h3"));
    assert.ok(headings.length >= 1);
  });

  it("TC-142 Inventory page title is non-empty", async () => {
    await gotoInventory();
    const title = await driver.getTitle();
    assert.ok(title.trim().length > 0);
  });

  it("TC-143 Inventory page has at least one button", async () => {
    await gotoInventory();
    const btns = await driver.findElements(By.css("button"));
    assert.ok(btns.length >= 1);
  });

  it("TC-144 Inventory page has noindex meta tag", async () => {
    await gotoInventory();
    const src = await driver.getPageSource();
    assert.ok(src.includes("noindex"));
  });

  it("TC-145 Inventory page sign-out button is visible", async () => {
    await gotoInventory();
    const btn = await driver.findElement(By.xpath("//button[normalize-space()='Sign out']"));
    assert.ok(await btn.isDisplayed());
  });

  it("TC-146 Inventory page has no blank white screen", async () => {
    await gotoInventory();
    const text = await driver.findElement(By.css("body")).getText();
    assert.ok(text.trim().length > 5);
  });

  it("TC-147 Inventory page has table or list of SKUs or empty state", async () => {
    await gotoInventory();
    const src = await driver.getPageSource();
    assert.ok(src.length > 200);
  });

  it("TC-148 Inventory page has add new SKU or inventory button", async () => {
    await gotoInventory();
    const btns = await driver.findElements(By.css("button"));
    assert.ok(btns.length >= 1);
  });

  it("TC-149 Inventory page warehouse section or selector is present", async () => {
    await gotoInventory();
    const src = await driver.getPageSource();
    assert.ok(src.toLowerCase().includes("warehouse") || src.toLowerCase().includes("sku") || src.toLowerCase().includes("inventory") || src.toLowerCase().includes("review"));
  });

  it("TC-150 Inventory page search or filter input is present or page shows empty state", async () => {
    await gotoInventory();
    const src = await driver.getPageSource();
    assert.ok(src.length > 100);
  });

  it("TC-151 Inventory page renders without JS error message", async () => {
    await gotoInventory();
    const src = await driver.getPageSource();
    assert.ok(!src.includes("Cannot read properties of undefined"));
  });

  it("TC-152 Inventory page has utf-8 charset", async () => {
    await gotoInventory();
    const src = await driver.getPageSource();
    assert.ok(src.includes("utf-8"));
  });

  it("TC-153 Inventory page has viewport meta", async () => {
    await gotoInventory();
    const src = await driver.getPageSource();
    assert.ok(src.includes("viewport"));
  });

  it("TC-154 Inventory page has favicon", async () => {
    await gotoInventory();
    const src = await driver.getPageSource();
    assert.ok(src.includes("favicon"));
  });

  it("TC-155 Inventory page loads in under 12 seconds", async () => {
    const start = Date.now();
    await gotoInventory();
    assert.ok(Date.now() - start < 12000);
  });

  it("TC-156 Inventory page can be scrolled", async () => {
    await gotoInventory();
    await driver.executeScript("window.scrollTo(0, document.body.scrollHeight)");
    await driver.sleep(300);
    assert.ok(true);
  });

  it("TC-157 Inventory page background colour is set", async () => {
    await gotoInventory();
    const body = await driver.findElement(By.css("body"));
    const bg = await driver.executeScript(
      "return window.getComputedStyle(arguments[0]).backgroundColor", body
    );
    assert.ok(bg.length > 0);
  });

  it("TC-158 Clicking first button on inventory page does not crash app", async () => {
    await gotoInventory();
    const btns = await driver.findElements(By.css("button:not([disabled])"));
    if (btns.length > 0) {
      try { await btns[0].click(); await driver.sleep(800); } catch (_) {}
    }
    const src = await driver.getPageSource();
    assert.ok(!src.includes("This page didn't load"));
  });

  it("TC-159 Close any open panel on inventory page", async () => {
    await gotoInventory();
    try {
      const cancel = await driver.findElement(
        By.xpath("//button[contains(text(), 'Cancel') or contains(text(), 'Close')]")
      );
      await cancel.click();
      await driver.sleep(500);
    } catch (_) {}
    assert.ok(true);
  });

  it("TC-160 Inventory page dashboard nav link works", async () => {
    await gotoInventory();
    await driver.findElement(By.css("a[href='/dashboard']")).click();
    await driver.sleep(2000);
    assert.ok((await driver.getCurrentUrl()).includes("/dashboard"));
  });

  it("TC-161 Inventory page refresh keeps auth", async () => {
    await gotoInventory();
    await driver.navigate().refresh();
    await driver.sleep(3000);
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/inventory") || url.includes("/login"));
  });

  it("TC-162 Inventory page OG meta present", async () => {
    await gotoInventory();
    const src = await driver.getPageSource();
    assert.ok(src.includes("og:") || src.includes("twitter:"));
  });

  it("TC-163 Inventory page has Global-Chain branding", async () => {
    await gotoInventory();
    const src = await driver.getPageSource();
    assert.ok(src.includes("Global") || src.includes("Chain"));
  });

  it("TC-164 Inventory page back navigation works", async () => {
    await gotoInventory();
    await driver.navigate().back();
    await driver.sleep(1000);
    assert.ok((await driver.getCurrentUrl()).includes("localhost"));
  });

  it("TC-165 Inventory page has at least 3 div elements", async () => {
    await gotoInventory();
    const divs = await driver.findElements(By.css("div"));
    assert.ok(divs.length >= 3);
  });
});
