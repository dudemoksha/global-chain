const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const assert = require("assert");

const BASE_URL = process.env.TEST_URL || "http://localhost:8080";
const ADMIN_EMAIL = "nmokshasai7@gmail.com";
const ADMIN_PASSWORD = "111111";
const TIMEOUT = 15000;

describe("Global-Chain Login E2E Tests", function () {
  this.timeout(60000);
  let driver;

  before(async function () {
    const options = new chrome.Options();
    options.addArguments("--headless");
    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");
    options.addArguments("--disable-gpu");
    options.addArguments("--window-size=1280,800");

    driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build();
  });

  after(async function () {
    if (driver) await driver.quit();
  });

  it("01 — Login page loads with email and password fields", async function () {
    await driver.get(`${BASE_URL}/login`);
    const emailInput = await driver.wait(
      until.elementLocated(By.id("email")),
      TIMEOUT
    );
    const passwordInput = await driver.findElement(By.id("password"));
    const loginButton = await driver.findElement(By.id("login-button"));

    assert.ok(await emailInput.isDisplayed(), "Email input should be visible");
    assert.ok(await passwordInput.isDisplayed(), "Password input should be visible");
    assert.ok(await loginButton.isDisplayed(), "Login button should be visible");
  });

  it("02 — Login fails with wrong credentials and shows error", async function () {
    await driver.get(`${BASE_URL}/login`);
    const emailInput = await driver.wait(
      until.elementLocated(By.id("email")),
      TIMEOUT
    );
    await emailInput.clear();
    await emailInput.sendKeys("wrong@example.com");

    const passwordInput = await driver.findElement(By.id("password"));
    await passwordInput.clear();
    await passwordInput.sendKeys("wrongpassword");

    const loginButton = await driver.findElement(By.id("login-button"));
    await loginButton.click();

    // Wait for error message to appear
    await driver.sleep(3000);
    const pageSource = await driver.getPageSource();
    assert.ok(
      pageSource.toLowerCase().includes("invalid") ||
        pageSource.toLowerCase().includes("error") ||
        pageSource.toLowerCase().includes("wrong") ||
        pageSource.toLowerCase().includes("incorrect"),
      "Error message should be displayed for wrong credentials"
    );
  });

  it("03 — Admin login succeeds and redirects to dashboard", async function () {
    await driver.get(`${BASE_URL}/login`);
    const emailInput = await driver.wait(
      until.elementLocated(By.id("email")),
      TIMEOUT
    );
    await emailInput.clear();
    await emailInput.sendKeys(ADMIN_EMAIL);

    const passwordInput = await driver.findElement(By.id("password"));
    await passwordInput.clear();
    await passwordInput.sendKeys(ADMIN_PASSWORD);

    const loginButton = await driver.findElement(By.id("login-button"));
    await loginButton.click();

    // Wait for redirect to dashboard
    await driver.wait(
      until.urlContains("/dashboard"),
      TIMEOUT,
      "Should redirect to dashboard after login"
    );

    const currentUrl = await driver.getCurrentUrl();
    assert.ok(
      currentUrl.includes("/dashboard"),
      `Expected to be on dashboard, but was on: ${currentUrl}`
    );
  });

  it("04 — Dashboard is accessible after login", async function () {
    // Already logged in from previous test
    const currentUrl = await driver.getCurrentUrl();
    if (!currentUrl.includes("/dashboard")) {
      await driver.get(`${BASE_URL}/dashboard`);
    }

    await driver.wait(
      until.urlContains("/dashboard"),
      TIMEOUT
    );

    const pageSource = await driver.getPageSource();
    // Dashboard should have recognizable content
    assert.ok(
      pageSource.toLowerCase().includes("dashboard") ||
        pageSource.toLowerCase().includes("supply") ||
        pageSource.toLowerCase().includes("risk") ||
        pageSource.toLowerCase().includes("global"),
      "Dashboard page should contain supply chain content"
    );
  });

  it("05 — Register page is accessible", async function () {
    await driver.get(`${BASE_URL}/register`);
    await driver.wait(until.urlContains("/register"), TIMEOUT);

    const pageSource = await driver.getPageSource();
    assert.ok(
      pageSource.toLowerCase().includes("register") ||
        pageSource.toLowerCase().includes("organisation") ||
        pageSource.toLowerCase().includes("request"),
      "Register page should be accessible and contain registration content"
    );
  });
});
