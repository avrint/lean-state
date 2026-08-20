const assert = require("node:assert");
const { Given, When, Then } = require("@cucumber/cucumber");

Given("leanState is available", async function () {
  await this.page.goto("http://localhost:8080/test/");
});

When("I set {string} to {string}", async function (key, value) {
  await this.page.evaluate(
    ({ key, value }) => window.leanState.set(key, value),
    { key, value }
  );
});

Then("getting {string} should return {string}", async function (key, expected) {
  const actual = await this.page.evaluate(
    key => window.leanState.get(key),
    key
  );

  assert.strictEqual(actual, expected);
});