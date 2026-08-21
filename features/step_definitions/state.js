import assert from 'node:assert';
import { Given, When, Then } from '@wdio/cucumber-framework';

Given(/^leanState is available$/, async () => {
    await browser.url('http://localhost:8080/test/');
});

When(/^I set "([^"]*)" to "([^"]*)"$/, async (key, value) => {
    // WebdriverIO replaces page.evaluate with browser.execute
    await browser.execute((k, v) => {
        window.leanState.set(k, v);
    }, key, value);
});

Then(/^getting "([^"]*)" should return "([^"]*)"$/, async (key, expected) => {
    const actual = await browser.execute((k) => {
        return window.leanState.get(k);
    }, key);

    assert.strictEqual(actual, expected);
});