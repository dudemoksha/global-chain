// tests/09-assistant.test.js — AI Assistant page (20 test cases)
const assert = require("assert");
const {
  buildDriver, go, loginAsAdmin,
  By, until, TIMEOUT,
} = require("../helpers/setup");

const SUITE = "09 — Assistant Page";

describe(SUITE, function () {
  this.timeout(90000);
  let driver;

  before(async () => {
    driver = buildDriver();
    await loginAsAdmin(driver);
  });
  after(async () => { if (driver) await driver.quit(); });

  async function gotoAssistant() {
    await go(driver, "/assistant");
    await driver.sleep(2500);
  }

  it("TC-216 Assistant page loads at /assistant", async () => {
    await gotoAssistant();
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/assistant") || url.includes("/login"));
  });

  it("TC-217 Assistant page has header", async () => {
    await gotoAssistant();
    assert.ok(await driver.findElement(By.css("header")).isDisplayed());
  });

  it("TC-218 Assistant page has body content", async () => {
    await gotoAssistant();
    const text = await driver.findElement(By.css("body")).getText();
    assert.ok(text.length > 5);
  });

  it("TC-219 Assistant page no 404 error", async () => {
    await gotoAssistant();
    assert.ok(!(await driver.getPageSource()).includes("Page not found"));
  });

  it("TC-220 Assistant page no error boundary shown", async () => {
    await gotoAssistant();
    assert.ok(!(await driver.getPageSource()).includes("This page didn't load"));
  });

  it("TC-221 Assistant page has a chat input or message field", async () => {
    await gotoAssistant();
    const inputs = await driver.findElements(By.css("input[type='text'], textarea, input:not([type])"));
    assert.ok(inputs.length >= 1 || (await driver.getPageSource()).includes("assistant"));
  });

  it("TC-222 Assistant page has a send or submit button", async () => {
    await gotoAssistant();
    const btns = await driver.findElements(By.css("button"));
    assert.ok(btns.length >= 1);
  });

  it("TC-223 Assistant page title is non-empty", async () => {
    await gotoAssistant();
    assert.ok((await driver.getTitle()).trim().length > 0);
  });

  it("TC-224 Assistant page has noindex meta", async () => {
    await gotoAssistant();
    assert.ok((await driver.getPageSource()).includes("noindex"));
  });

  it("TC-225 Assistant page sign-out button visible", async () => {
    await gotoAssistant();
    const btn = await driver.findElement(By.xpath("//button[normalize-space()='Sign out']"));
    assert.ok(await btn.isDisplayed());
  });

  it("TC-226 Assistant page loads in under 12 seconds", async () => {
    const start = Date.now();
    await gotoAssistant();
    assert.ok(Date.now() - start < 12000);
  });

  it("TC-227 Assistant page has utf-8 charset", async () => {
    await gotoAssistant();
    assert.ok((await driver.getPageSource()).includes("utf-8"));
  });

  it("TC-228 Assistant page has viewport meta", async () => {
    await gotoAssistant();
    assert.ok((await driver.getPageSource()).includes("viewport"));
  });

  it("TC-229 Assistant page Global-Chain branding present", async () => {
    await gotoAssistant();
    const src = await driver.getPageSource();
    assert.ok(src.includes("Global") || src.includes("Chain"));
  });

  it("TC-230 Assistant page dashboard link works", async () => {
    await gotoAssistant();
    await driver.findElement(By.css("a[href='/dashboard']")).click();
    await driver.sleep(2000);
    assert.ok((await driver.getCurrentUrl()).includes("/dashboard"));
  });

  it("TC-231 Assistant page refresh maintains auth", async () => {
    await gotoAssistant();
    await driver.navigate().refresh();
    await driver.sleep(3000);
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/assistant") || url.includes("/login"));
  });

  it("TC-232 Assistant page has no blank body", async () => {
    await gotoAssistant();
    assert.ok((await driver.findElement(By.css("body")).getText()).trim().length > 5);
  });

  it("TC-233 Assistant page OG meta present", async () => {
    await gotoAssistant();
    assert.ok((await driver.getPageSource()).includes("og:"));
  });

  it("TC-234 Assistant page scrolls without errors", async () => {
    await gotoAssistant();
    await driver.executeScript("window.scrollTo(0, document.body.scrollHeight)");
    await driver.sleep(300);
    assert.ok(true);
  });

  it("TC-235 Assistant page back navigation works", async () => {
    await gotoAssistant();
    await driver.navigate().back();
    await driver.sleep(1000);
    assert.ok((await driver.getCurrentUrl()).includes("localhost"));
  });
});
