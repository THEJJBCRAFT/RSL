/**
 * Prueft die Protokoll-Teile der Android-Huelle auf dem Rechner.
 *
 * Android laesst sich hier nicht starten, aber Minecraft-Ping und SRV-Nachschlag sind reines
 * Java. Darum werden genau diese beiden Dateien mit kleinen Ersatzteilen fuer die
 * Android-Klassen uebersetzt und gegen einen nachgebauten Server laufen gelassen.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const work = join(repo, "node_modules", ".cache", "rsl-mobile-java");
const classes = join(work, "classes");
const jsonJar = join(work, "json.jar");
const JSON_URL = "https://repo1.maven.org/maven2/org/json/json/20240303/json-20240303.jar";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

rmSync(classes, { recursive: true, force: true });
mkdirSync(classes, { recursive: true });

// org.json steckt auf Android im System; auf dem Rechner kommt es einmalig von Maven Central.
if (!existsSync(jsonJar)) {
  const response = await fetch(JSON_URL);
  if (!response.ok) {
    console.error(`org.json konnte nicht geladen werden (HTTP ${response.status}).`);
    process.exit(1);
  }
  writeFileSync(jsonJar, Buffer.from(await response.arrayBuffer()));
}

const sources = [
  join(here, "java", "shim", "android", "content", "Context.java"),
  join(here, "java", "shim", "android", "net", "Network.java"),
  join(here, "java", "shim", "android", "net", "LinkProperties.java"),
  join(here, "java", "shim", "android", "net", "ConnectivityManager.java"),
  join(here, "java", "shim", "android", "os", "Build.java"),
  join(repo, "android", "rsl", "app", "src", "main", "java", "de", "redstonelabs", "rsl", "Dns.java"),
  join(repo, "android", "rsl", "app", "src", "main", "java", "de", "redstonelabs", "rsl", "McPing.java"),
  join(here, "java", "de", "redstonelabs", "rsl", "McPingTest.java"),
];

const compiled = run("javac", ["-nowarn", "-encoding", "UTF-8", "-cp", jsonJar, "-d", classes, ...sources]);
if (compiled !== 0) {
  console.error("Java liess sich nicht uebersetzen.");
  process.exit(compiled);
}

const separator = process.platform === "win32" ? ";" : ":";
process.exit(run("java", ["-cp", [classes, jsonJar].join(separator), "de.redstonelabs.rsl.McPingTest"]));
