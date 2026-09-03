// Fuehrt die Ende-zu-Ende-Tests von Find Mein Soon aus: mehrere "Handys" (Browser-Kontexte) reden ueber einen
// lokalen MQTT-Broker miteinander. Aufruf: node test/find-mein-soon/e2e/run.mjs [szenario ...]
// Szenarien: basic, connection, alarm, security, usability (Standard: alle).
import { dirname, resolve, join } from "node:path";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";
import mqtt from "mqtt";
import { startBroker, startStatic } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const all = ["basic", "connection", "alarm", "security", "usability"];
const wanted = process.argv.slice(2).filter(name => all.includes(name));
const scenarios = wanted.length ? wanted : all;

// Screenshots der Szenarien (z. B. fuer CI-Artefakte)
const out = process.env.FMS_E2E_OUT || join(tmpdir(), "find-mein-soon-e2e");
mkdirSync(out, { recursive: true });

const broker = await startBroker(9001);
const site = await startStatic(repoRoot, 8099);
const browser = await chromium.launch();
const results = [];

for (const name of scenarios) {
  const errors = [];
  const started = Date.now();
  try {
    const scenario = await import(`./${name}.mjs`);
    console.log(`\n=== ${name}: ${scenario.title}`);
    await scenario.default({
      browser,
      errors,
      base: `${site.url}/apps/find-mein-soon/index.html`,
      broker: broker.url,
      devices,
      mqtt,
      startBroker,
      out
    });
  } catch (error) {
    errors.push(`abgebrochen: ${error && error.message ? error.message.split("\n")[0] : error}`);
  }
  for (const context of browser.contexts()) {
    await context.close().catch(() => {});
  }
  results.push({ name, errors, seconds: Math.round((Date.now() - started) / 1000) });
  console.log(`--- ${name}: ${errors.length ? "FEHLER" : "ok"} (${results[results.length - 1].seconds} s)`);
  errors.forEach(message => console.log(`    ${message}`));
}

await browser.close();
await site.close();
await broker.close();

const failed = results.filter(result => result.errors.length);
console.log(`\n${results.length - failed.length}/${results.length} Szenarien ok (Screenshots: ${out})`);
process.exit(failed.length ? 1 : 0);
