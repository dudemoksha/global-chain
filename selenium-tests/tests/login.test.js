const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const assert = require("assert");

const BASE_URL = process.env.TEST_URL || "http://localhost:8080";
const ADMIN_EMAIL = "nmokshasai7@gmail.com";
const ADMIN_PASSWORD = "111111";
const TIMEOUT = 45000;

async function setReactInput(driver, id, text) {
  // Use JavaScript to set value AND fire the native input event
  // This triggers React's synthetic event system directly, so React state is updated
  // and cannot be wiped out by subsequent hydration
  await driver.executeScript(`
    const el = document.getElementById(arguments[0]);
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(el, arguments[1]);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  `, id, text);
  await driver.sleep(300);
}

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
    let emailInput;
    try {
      emailInput = await driver.wait(
        until.elementLocated(By.id("email")),
        TIMEOUT
      );
    } catch (e) {
      console.log("\\n--- HTML SOURCE ON FAILURE ---");
      console.log(await driver.getPageSource());
      console.log("------------------------------\\n");
      throw e;
    }
    const passwordInput = await driver.findElement(By.id("password"));
    const loginButton = await driver.findElement(By.id("login-button"));

    assert.ok(await emailInput.isDisplayed(), "Email input should be visible");
    assert.ok(await passwordInput.isDisplayed(), "Password input should be visible");
    assert.ok(await loginButton.isDisplayed(), "Login button should be visible");
    
    // Wait for Vite to compile client JS and React to fully hydrate
    // This prevents React from overwriting inputs in subsequent tests
    await driver.sleep(10000);
  });

  it("02 — Login fails with wrong credentials and shows error", async function () {
    await driver.get(`${BASE_URL}/login`);
    // Wait for React to fully hydrate
    await driver.wait(until.elementLocated(By.id("email")), TIMEOUT);
    await driver.sleep(3000);

    await setReactInput(driver, "email", "wrong@example.com");
    await setReactInput(driver, "password", "wrongpassword");

    // Verify values stuck before submitting
    const emailVal = await driver.executeScript(`return document.getElementById('email').value`);
    const passVal = await driver.executeScript(`return document.getElementById('password').value`);
    console.log(`Before submit — email: "${emailVal}", password: "${passVal}"`);

    const loginButton = await driver.findElement(By.id("login-button"));
    await loginButton.click();

    // Wait for error message element to appear
    let errorEl;
    try {
      errorEl = await driver.wait(
        until.elementLocated(By.id("login-error")),
        TIMEOUT,
        "Error message should be displayed for wrong credentials"
      );
    } catch (e) {
      console.log("\\n--- BROWSER CONSOLE LOGS ---");
      const logs = await driver.manage().logs().get(require("selenium-webdriver/lib/logging").Type.BROWSER);
      logs.forEach(log => console.log(`[${log.level.name}] ${log.message}`));
      
      console.log("\\n--- HTML SOURCE ON FAILURE ---");
      console.log(await driver.getPageSource());
      console.log("------------------------------\\n");
      throw e;
    }

    const errorText = await errorEl.getText();
    assert.ok(
      errorText.trim().length > 0,
      `Error message should be displayed, but got: '${errorText}'`
    );
  });

  it("03 — Admin login succeeds and redirects to dashboard", async function () {
    await driver.get(`${BASE_URL}/login`);
    await driver.wait(until.elementLocated(By.id("email")), TIMEOUT);
    await driver.sleep(2000);
    
    await setReactInput(driver, "email", ADMIN_EMAIL);
    await setReactInput(driver, "password", ADMIN_PASSWORD);

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
