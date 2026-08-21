
/** @type {import('@wdio/types').Options.Testrunner }*/
/** @type {import('@wdio/types').Capabilities.WithRequestedTestrunnerCapabilities }*/
export const config = {
    runner: 'local',
    specs: ['./features/**/*.feature'],
    maxInstances: 2,
    services: [
        ['static-server', {
            port: 8080,
            folders: [
                { mount: '/', path: './' }
            ]
        }]
    ],
    capabilities: [{
        browserName: 'chrome',
        "goog:chromeOptions": {
            args: [
                "--load-extension=path/to/extension",
                "--disable-gpu",
                "--headless=new",
            ],
        },
    }],
    logLevel: "error", // info, warn, error
    framework: 'cucumber',
    reporters: ['dot', 'spec', 'cucumberjs-json'],
    cucumberOpts: {
        require: ['features/step_definitions/**/*.js'],
        timeout: 60000
    }
};