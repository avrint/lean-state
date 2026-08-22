import assert from 'node:assert';
import { Given, When, Then } from '@wdio/cucumber-framework';

Given(/^leanState is available$/, async () => {
    await browser.url('http://localhost:8080/test/');
});

When(/^I set "([^"]*)" to "([^"]*)"$/, async (key, value) => {
    await browser.execute((k, v) => {
        window.leanState.set(k, v);
    }, key, value);
});

Then(/^getting "([^"]*)" should return "([^"]*)"$/, async (key, expected) => {
    const actual = await browser.execute((k) => {
        return window.leanState.get(k);
    }, key);

    // WebdriverIO serializes `undefined` from the browser as `null`
    let expectedValue = expected === 'undefined' ? undefined : expected;
    // expectedValue = expected === 'null' ? null : expected;
    assert.strictEqual(actual, expectedValue);
});

Then(/^the state should have "([^"]*)"$/, async (key) => {
    const hasKey = await browser.execute((k) => {
        return window.leanState.has(k);
    }, key);

    assert.strictEqual(hasKey, true);
});

Then(/^the state should not have "([^"]*)"$/, async (key) => {
    const hasKey = await browser.execute((k) => {
        return window.leanState.has(k);
    }, key);

    assert.strictEqual(hasKey, false);
});

When(/^I remove the key "([^"]*)"$/, async (key) => {
    await browser.execute((k) => {
        window.leanState.remove(k);
    }, key);
});

When(/^I subscribe to the key "([^"]*)"$/, async (key) => {
    await browser.execute((k) => {
        window.__stateSubs = window.__stateSubs || {};
        window.leanState.subscribe(k, (value) => {
            window.__stateSubs[k] = value;
        });
    }, key);
});

When(/^I subscribe to the bus channel "([^"]*)"$/, async (channel) => {
    await browser.execute((ch) => {
        window.__busSubs = window.__busSubs || {};
        window.leanState.bus.subscribe(ch, (payload) => {
            window.__busSubs[ch] = payload;
        });
    }, channel);
});

When(/^I send "([^"]*)" to the bus channel "([^"]*)"$/, async (payload, channel) => {
    await browser.execute((ch, p) => {
        window.leanState.bus.send(ch, p);
    }, channel, payload);
});

Then(/^the bus subscription for "([^"]*)" should receive "([^"]*)"$/, async (channel, expected) => {
    // The bus processes queues asynchronously, so we wait until the payload arrives
    await browser.waitUntil(async () => {
        const actual = await browser.execute((ch) => {
            return window.__busSubs ? window.__busSubs[ch] : null;
        }, channel);
        return actual === expected;
    }, {
        timeout: 2000,
        timeoutMsg: `Expected bus channel "${channel}" to receive payload "${expected}"`
    });
});


Then(/^the subscription for "([^"]*)" should receive "([^"]*)"$/, async (key, expected) => {
    // lean-state throttles state notifications asynchronously, so we must wait
    await browser.waitUntil(async () => {
        const actual = await browser.execute((k) => {
            return window.__stateSubs ? window.__stateSubs[k] : null;
        }, key);
        return actual === expected;
    }, {
        timeout: 2000,
        timeoutMsg: `Expected subscription for key "${key}" to receive payload "${expected}"`
    });
});