const assert = require("assert");

describe("Global-Chain Android App E2E Hybrid Tests", () => {
  before(async () => {
    console.log("Starting Android Hybrid App Test...");
  });

  it("01 — Should wait for WebView context and switch to it", async () => {
    // Wait for native app shell to render the WebView
    await browser.waitUntil(
      async () => {
        const contexts = await browser.getContexts();
        return contexts.length > 1;
      },
      {
        timeout: 30000,
        timeoutMsg: "WebView context was not created in 30 seconds",
      }
    );

    const contexts = await browser.getContexts();
    console.log("Detected Contexts:", contexts);

    // Filter to find the WebView context (usually 'WEBVIEW_com.globalchain.app')
    const webview = contexts.find((ctx) => ctx.includes("WEBVIEW"));
    assert.ok(webview, "WebView context should exist in the contexts list");

    await browser.switchContext(webview);
    console.log("Switched browser context to WebView successfully!");
  });

  it("02 — Login form should load inside WebView", async () => {
    const email = await $("#email");
    const password = await $("#password");
    const submit = await $("#login-button");

    assert.ok(await email.isDisplayed(), "Email field should be visible in WebView");
    assert.ok(await password.isDisplayed(), "Password field should be visible in WebView");
    assert.ok(await submit.isDisplayed(), "Submit button should be visible in WebView");
  });

  it("03 — Should fail login with wrong credentials and display error", async () => {
    const email = await $("#email");
    const password = await $("#password");
    const submit = await $("#login-button");

    await email.setValue("wrong@example.com");
    await password.setValue("wrongpass");
    await submit.click();

    const err = await $("#login-error");
    await err.waitForDisplayed({ timeout: 15000 });
    const text = await err.getText();
    assert.ok(text.length > 0, "Error message should contain text");
  });

  it("04 — Should successfully log in as Admin and redirect to Dashboard", async () => {
    const email = await $("#email");
    const password = await $("#password");
    const submit = await $("#login-button");

    await email.setValue("nmokshasai7@gmail.com");
    await password.setValue("111111");
    await submit.click();

    // Wait for URL redirect to dashboard
    await browser.waitUntil(
      async () => {
        const url = await browser.getUrl();
        return url.includes("/dashboard");
      },
      {
        timeout: 20000,
        timeoutMsg: "Did not redirect to /dashboard after login",
      }
    );

    const url = await browser.getUrl();
    assert.ok(url.includes("/dashboard"), `Should be on dashboard, but got: ${url}`);
  });

  it("05 — Dashboard navigation header should display Admin email", async () => {
    const body = await $("body");
    const text = await body.getText();
    assert.ok(text.includes("nmokshasai7@gmail.com"), "Logged in user email should be visible");
  });

  it("06 — Should be able to log out from the dashboard", async () => {
    const signOutBtn = await $("//button[normalize-space()='Sign out']");
    assert.ok(await signOutBtn.isDisplayed(), "Sign out button should be visible");
    await signOutBtn.click();

    // Verify redirected back to login page
    const email = await $("#email");
    await email.waitForDisplayed({ timeout: 15000 });
    assert.ok(await email.isDisplayed(), "Should return to login page after sign out");
  });
});
