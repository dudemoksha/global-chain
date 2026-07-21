// tests/01-login.test.js — Login page (25 test cases)
const assert = require("assert");
const {
  buildDriver, setInput, waitFor, waitForCss, go,
  loginAsAdmin, By, until, TIMEOUT, BASE_URL,
  ADMIN_EMAIL, ADMIN_PASSWORD, saveResult,
} = require("../helpers/setup");

const SUITE = "01 — Login Page";

describe(SUITE, function () {
  this.timeout(90000);
  let driver;

  before(async () => { driver = buildDriver(); });
  after(async () => { if (driver) await driver.quit(); });
  afterEach(async () => { await driver.sleep(400); });

  async function loadLogin() {
    await go(driver, "/login");
    await waitFor(driver, "email");
  }

  it("TC-001 Login page loads successfully", async () => {
    await loadLogin();
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/login"));
  });

  it("TC-002 Page title contains 'Sign in'", async () => {
    await loadLogin();
    const title = await driver.getTitle();
    assert.ok(title.toLowerCase().includes("sign in"));
  });

  it("TC-003 Email input field is visible", async () => {
    await loadLogin();
    const el = await driver.findElement(By.id("email"));
    assert.ok(await el.isDisplayed());
  });

  it("TC-004 Password input field is visible", async () => {
    await loadLogin();
    const el = await driver.findElement(By.id("password"));
    assert.ok(await el.isDisplayed());
  });

  it("TC-005 Login button is visible", async () => {
    await loadLogin();
    const el = await driver.findElement(By.id("login-button"));
    assert.ok(await el.isDisplayed());
  });

  it("TC-006 Login button label says Continue", async () => {
    await loadLogin();
    const el = await driver.findElement(By.id("login-button"));
    const text = await el.getText();
    assert.ok(text.includes("Continue"));
  });

  it("TC-007 Google sign-in button is displayed", async () => {
    await loadLogin();
    const btn = await waitForCss(driver, "button[type='button']");
    assert.ok(await btn.isDisplayed());
  });

  it("TC-008 Google button contains 'Google' text", async () => {
    await loadLogin();
    const src = await driver.getPageSource();
    assert.ok(src.includes("Google"));
  });

  it("TC-009 Page heading is Operator sign-in", async () => {
    await loadLogin();
    const h1 = await driver.findElement(By.css("h1"));
    const text = await h1.getText();
    assert.ok(text.toLowerCase().includes("sign-in") || text.toLowerCase().includes("operator"));
  });

  it("TC-010 Brand logo is displayed", async () => {
    await loadLogin();
    const src = await driver.getPageSource();
    assert.ok(src.includes("Global") && src.includes("Chain"));
  });

  it("TC-011 Register link exists on login page", async () => {
    await loadLogin();
    const link = await driver.findElement(By.css("a[href='/register']"));
    assert.ok(await link.isDisplayed());
  });

  it("TC-012 Register link navigates to /register", async () => {
    await loadLogin();
    await driver.findElement(By.css("a[href='/register']")).click();
    await driver.sleep(2000);
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/register"));
  });

  it("TC-013 Email field type is email", async () => {
    await loadLogin();
    const type = await driver.findElement(By.id("email")).getAttribute("type");
    assert.strictEqual(type, "email");
  });

  it("TC-014 Password field type is password", async () => {
    await loadLogin();
    const type = await driver.findElement(By.id("password")).getAttribute("type");
    assert.strictEqual(type, "password");
  });

  it("TC-015 Password show/hide button exists", async () => {
    await loadLogin();
    const btn = await driver.findElement(By.css("button[aria-label='Show password']"));
    assert.ok(await btn.isDisplayed());
  });

  it("TC-016 Show password button reveals password text", async () => {
    await loadLogin();
    await setInput(driver, "password", "mypassword");
    await driver.findElement(By.css("button[aria-label='Show password']")).click();
    await driver.sleep(300);
    const type = await driver.findElement(By.id("password")).getAttribute("type");
    assert.strictEqual(type, "text");
  });

  it("TC-017 Hide password button masks the password again", async () => {
    await loadLogin();
    await setInput(driver, "password", "mypassword");
    await driver.findElement(By.css("button[aria-label='Show password']")).click();
    await driver.sleep(300);
    await driver.findElement(By.css("button[aria-label='Hide password']")).click();
    await driver.sleep(300);
    const type = await driver.findElement(By.id("password")).getAttribute("type");
    assert.strictEqual(type, "password");
  });

  it("TC-018 Wrong credentials show error message", async () => {
    await loadLogin();
    await setInput(driver, "email", "wrong@test.com");
    await setInput(driver, "password", "wrongpass123");
    await driver.findElement(By.id("login-button")).click();
    const err = await driver.wait(until.elementLocated(By.id("login-error")), TIMEOUT);
    const text = await err.getText();
    assert.ok(text.length > 0);
  });

  it("TC-019 Error element has id=login-error", async () => {
    await loadLogin();
    await setInput(driver, "email", "bad@bad.com");
    await setInput(driver, "password", "badpass");
    await driver.findElement(By.id("login-button")).click();
    const el = await driver.wait(until.elementLocated(By.id("login-error")), TIMEOUT);
    assert.ok(el !== null);
  });

  it("TC-020 Email field has autocomplete=email", async () => {
    await loadLogin();
    const ac = await driver.findElement(By.id("email")).getAttribute("autocomplete");
    assert.strictEqual(ac, "email");
  });

  it("TC-021 Password field has autocomplete=current-password", async () => {
    await loadLogin();
    const ac = await driver.findElement(By.id("password")).getAttribute("autocomplete");
    assert.strictEqual(ac, "current-password");
  });

  it("TC-022 Page has noindex robots meta tag", async () => {
    await loadLogin();
    const src = await driver.getPageSource();
    assert.ok(src.includes("noindex"));
  });

  it("TC-023 Valid admin login redirects to dashboard", async () => {
    await loadLogin();
    await setInput(driver, "email", ADMIN_EMAIL);
    await setInput(driver, "password", ADMIN_PASSWORD);
    await driver.findElement(By.id("login-button")).click();
    await driver.wait(until.urlContains("/dashboard"), TIMEOUT);
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/dashboard"));
  });

  it("TC-024 Sign out button returns to home page", async () => {
    // Already logged in from previous test
    const signOut = await driver.findElement(
      By.xpath("//button[normalize-space()='Sign out']")
    );
    await signOut.click();
    await driver.sleep(2000);
    const url = await driver.getCurrentUrl();
    assert.ok(!url.includes("/dashboard"));
  });

  it("TC-025 Unauthenticated visit to /dashboard redirects to /login", async () => {
    await go(driver, "/dashboard");
    await driver.sleep(2000);
    const url = await driver.getCurrentUrl();
    assert.ok(url.includes("/login"));
  });
});
