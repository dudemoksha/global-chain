const { Builder, By, until, Key } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const config = require("../config");

function buildDriver() {
  const opts = new chrome.Options();
  opts.addArguments("--headless=new");
  opts.addArguments("--no-sandbox");
  opts.addArguments("--disable-dev-shm-usage");
  opts.addArguments("--disable-gpu");
  opts.addArguments("--window-size=1440,900");
  opts.addArguments("--disable-extensions");
  opts.addArguments("--disable-notifications");
  return new Builder().forBrowser("chrome").setChromeOptions(opts).build();
}

async function setInput(driver, id, text) {
  await driver.executeScript(
    `
    const el = document.getElementById(arguments[0]) || document.querySelector('[name="' + arguments[0] + '"]');
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

async function waitFor(driver, id, ms) {
  return driver.wait(until.elementLocated(By.id(id)), ms || config.TIMEOUT);
}

async function waitForCss(driver, css, ms) {
  return driver.wait(until.elementLocated(By.css(css)), ms || config.TIMEOUT);
}

async function go(driver, path, waitMs) {
  const fullUrl = path.startsWith("http") ? path : `${config.VERCEL_URL}${path}`;
  await driver.get(fullUrl);
  await driver.sleep(waitMs || 2500);
}

async function loginAsAdmin(driver) {
  await go(driver, "/login");
  await waitFor(driver, "email");
  await setInput(driver, "email", config.ADMIN_EMAIL);
  await setInput(driver, "password", config.ADMIN_PASSWORD);
  const btn = await driver.findElement(By.id("login-button"));
  await btn.click();
  await driver.wait(until.urlContains("/dashboard"), config.TIMEOUT);
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

async function openNewTab(driver, url) {
  await driver.switchTo().newWindow("tab");
  if (url) {
    await go(driver, url);
  }
}

async function switchToTab(driver, index) {
  const handles = await driver.getAllWindowHandles();
  if (handles[index]) {
    await driver.switchTo().window(handles[index]);
  }
}

async function closeCurrentTab(driver) {
  const handles = await driver.getAllWindowHandles();
  if (handles.length > 1) {
    await driver.close();
    await driver.switchTo().window(handles[0]);
  }
}

module.exports = {
  buildDriver,
  setInput,
  setSelect,
  waitFor,
  waitForCss,
  go,
  loginAsAdmin,
  logout,
  openNewTab,
  switchToTab,
  closeCurrentTab,
  By,
  until,
  Key,
};
