// features/support/world.js

const { setWorldConstructor } = require("@cucumber/cucumber");
const { chromium } = require("playwright");

class World {
  async init() {
    this.browser = await chromium.launch();
    this.page = await this.browser.newPage();
  }

  async close() {
    await this.browser.close();
  }
}

setWorldConstructor(World);