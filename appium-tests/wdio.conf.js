const path = require("path");

exports.config = {
  runner: "local",
  port: 4723,
  specs: ["./tests/**/*.test.js"],
  exclude: [],
  maxInstances: 1,
  capabilities: [
    {
      platformName: "Android",
      "appium:deviceName": "Android Emulator",
      "appium:platformVersion": "14.0", // Adjust to target emulator version
      "appium:automationName": "UiAutomator2",
      "appium:app": path.join(
        __dirname,
        "..",
        "android",
        "app",
        "build",
        "outputs",
        "apk",
        "debug",
        "app-debug.apk"
      ),
      "appium:appPackage": "com.globalchain.app",
      "appium:appActivity": "com.globalchain.app.MainActivity",
      "appium:noReset": false,
      "appium:fullReset": false,
      "appium:autoGrantPermissions": true,
      "appium:chromedriverExecutableDir": path.join(__dirname, "drivers"), // Location for custom chromedrivers if needed
    },
  ],
  logLevel: "info",
  bail: 0,
  waitforTimeout: 15000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  services: [
    [
      "appium",
      {
        args: {
          address: "localhost",
          port: 4723,
        },
        command: "appium",
      },
    ],
  ],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 120000,
  },
};
