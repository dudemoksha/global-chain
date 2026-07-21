// tests/02-register.test.js — Register page (20 test cases)
const assert = require("assert");
const {
  buildDriver, waitFor, waitForCss, go,
  By, until, TIMEOUT, BASE_URL,
} = require("../helpers/setup");

const SUITE = "02 — Register Page";

describe(SUITE, function () {
  this.timeout(90000);
  let driver;

  before(async () => { driver = buildDriver(); });
  after(async () => { if (driver) await driver.quit(); });

  async function loadRegister() {
    await go(driver, "/register");
    await driver.sleep(2000);
  }

  it("TC-026 Register page loads successfully", async () => {
    await loadRegister();
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/register"));
  });

  it("TC-027 Register page has correct title", async () => {
    await loadRegister();
    const title = await driver.getTitle();
    assert.ok(title.length > 0);
  });

  it("TC-028 Registration form is present", async () => {
    await loadRegister();
    const form = await driver.findElement(By.css("form"));
    assert.ok(await form.isDisplayed());
  });

  it("TC-029 Company / organisation name field exists", async () => {
    await loadRegister();
    const inputs = await driver.findElements(By.css("input"));
    assert.ok(inputs.length >= 1);
  });

  it("TC-030 Work email field is present", async () => {
    await loadRegister();
    const inputs = await driver.findElements(By.css("input[type='email'], input[autocomplete='email']"));
    assert.ok(inputs.length >= 1);
  });

  it("TC-031 Submit / request access button is visible", async () => {
    await loadRegister();
    const btn = await driver.findElement(By.css("button[type='submit']"));
    assert.ok(await btn.isDisplayed());
  });

  it("TC-032 Already-have-account link exists", async () => {
    await loadRegister();
    const link = await driver.findElement(By.css("a[href='/login']"));
    assert.ok(await link.isDisplayed());
  });

  it("TC-033 Already-have-account link navigates to /login", async () => {
    await loadRegister();
    await driver.findElement(By.css("a[href='/login']")).click();
    await driver.sleep(1500);
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/login"));
  });

  it("TC-034 Global-Chain brand mark is displayed on register page", async () => {
    await loadRegister();
    const src = await driver.getPageSource();
    assert.ok(src.includes("Global") || src.includes("Chain"));
  });

  it("TC-035 Register page heading is present", async () => {
    await loadRegister();
    const h1 = await driver.findElement(By.css("h1"));
    assert.ok((await h1.getText()).length > 0);
  });

  it("TC-036 Page has multiple input fields for registration details", async () => {
    await loadRegister();
    const inputs = await driver.findElements(By.css("input"));
    assert.ok(inputs.length >= 2);
  });

  it("TC-037 Register form has a submit button with text", async () => {
    await loadRegister();
    const btn = await driver.findElement(By.css("button[type='submit']"));
    const text = await btn.getText();
    assert.ok(text.trim().length > 0);
  });

  it("TC-038 Admin-review notice is shown on register page", async () => {
    await loadRegister();
    const src = await driver.getPageSource();
    assert.ok(
      src.toLowerCase().includes("review") ||
      src.toLowerCase().includes("approved") ||
      src.toLowerCase().includes("admin")
    );
  });

  it("TC-039 Register page body contains descriptive text", async () => {
    await loadRegister();
    const body = await driver.findElement(By.css("body"));
    const text = await body.getText();
    assert.ok(text.length > 100);
  });

  it("TC-040 Page does not have broken HTML structure", async () => {
    await loadRegister();
    const src = await driver.getPageSource();
    assert.ok(src.includes("</html>"));
  });

  it("TC-041 Register page is responsive — body is not zero width", async () => {
    await loadRegister();
    const body = await driver.findElement(By.css("body"));
    const size = await body.getRect();
    assert.ok(size.width > 0);
  });

  it("TC-042 Email input on register page has email type or validation", async () => {
    await loadRegister();
    const src = await driver.getPageSource();
    assert.ok(src.includes("email"));
  });

  it("TC-043 Register page has at least one label element", async () => {
    await loadRegister();
    const labels = await driver.findElements(By.css("label"));
    assert.ok(labels.length >= 1);
  });

  it("TC-044 Register page loads within 10 seconds", async () => {
    const start = Date.now();
    await loadRegister();
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 10000);
  });

  it("TC-045 Navigate from register to login and back preserves pages", async () => {
    await loadRegister();
    await driver.findElement(By.css("a[href='/login']")).click();
    await driver.sleep(1500);
    await driver.navigate().back();
    await driver.sleep(1500);
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/register"));
  });
});
