// ESLint fuer Find Mein Soon (Web-App, Tests, Werkzeuge) und die Tests der RSL-App.
// Die uebrige Website und das TypeScript in apps/rsl-mobile bleiben unangetastet (dort prueft tsc).
const js = require("@eslint/js");

const browserGlobals = {
  window: "readonly", document: "readonly", navigator: "readonly", location: "readonly", history: "readonly",
  localStorage: "readonly", sessionStorage: "readonly", setTimeout: "readonly", clearTimeout: "readonly",
  setInterval: "readonly", clearInterval: "readonly", requestAnimationFrame: "readonly", console: "readonly",
  fetch: "readonly", Request: "readonly", Response: "readonly", URL: "readonly", URLSearchParams: "readonly",
  TextEncoder: "readonly", TextDecoder: "readonly", Notification: "readonly", AudioContext: "readonly",
  MutationObserver: "readonly", Event: "readonly", self: "readonly", globalThis: "readonly", crypto: "readonly",
  caches: "readonly", importScripts: "readonly",
  // Vendor-Bibliotheken (klassische Scripts vor den Modulen)
  L: "readonly", mqtt: "readonly", qrcode: "readonly"
};

const nodeGlobals = {
  process: "readonly", console: "readonly", Buffer: "readonly", setTimeout: "readonly", clearTimeout: "readonly",
  setInterval: "readonly", clearInterval: "readonly", URL: "readonly", crypto: "readonly", globalThis: "readonly",
  require: "readonly", module: "writable", __dirname: "readonly", fetch: "readonly", TextEncoder: "readonly", TextDecoder: "readonly"
};

module.exports = [
  {
    files: ["apps/find-mein-soon/*.js"],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: browserGlobals },
    rules: {
      ...js.configs.recommended.rules,
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }]
    }
  },
  {
    files: ["apps/find-mein-soon/sw.js", "apps/find-mein-soon/version.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: browserGlobals }
  },
  {
    files: ["test/find-mein-soon/**/*.mjs", "test/rsl-mobile/**/*.mjs", "tools/update-find-mein-soon-vendor.mjs"],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...nodeGlobals, ...browserGlobals } },
    rules: {
      ...js.configs.recommended.rules,
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }]
    }
  }
];
