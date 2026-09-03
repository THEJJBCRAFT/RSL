// Aktualisiert die eingebetteten Bibliotheken von Find Mein Soon aus npm (ohne Build-System):
//   node tools/update-find-mein-soon-vendor.mjs            -> Versionen aus VENDOR unten
//   node tools/update-find-mein-soon-vendor.mjs leaflet=1.9.5 -> eine Version ueberschreiben
// Danach: npm test, Versionsnummern in README.md und VENDOR pruefen, apps/find-mein-soon/version.js erhoehen.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, copyFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VENDOR = {
  leaflet: { version: "1.9.4", files: { "dist/leaflet.js": "leaflet/leaflet.js", "dist/leaflet.css": "leaflet/leaflet.css", "dist/images": "leaflet/images" }, license: "BSD-2-Clause" },
  mqtt: { version: "5.15.2", files: { "dist/mqtt.min.js": "mqtt/mqtt.min.js" }, license: "MIT" },
  "qrcode-generator": { version: "1.4.4", files: { "qrcode.js": "qrcode/qrcode.js" }, license: "MIT" }
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "apps/find-mein-soon/vendor");
for (const arg of process.argv.slice(2)) {
  const [name, version] = arg.split("=");
  if (!VENDOR[name] || !version) {
    console.error(`Unbekannt: ${arg}. Erlaubt: ${Object.keys(VENDOR).map(key => `${key}=<version>`).join(", ")}`);
    process.exit(1);
  }
  VENDOR[name].version = version;
}

const work = mkdtempSync(join(tmpdir(), "fms-vendor-"));
try {
  for (const [name, spec] of Object.entries(VENDOR)) {
    const tarball = execFileSync("npm", ["pack", `${name}@${spec.version}`, "--pack-destination", work], { encoding: "utf8" }).trim().split("\n").pop();
    const unpack = join(work, name);
    mkdirSync(unpack, { recursive: true });
    execFileSync("tar", ["xzf", join(work, tarball), "-C", unpack]);
    for (const [from, to] of Object.entries(spec.files)) {
      const source = join(unpack, "package", from);
      const destination = join(target, to);
      if (!existsSync(source)) throw new Error(`${name}@${spec.version}: ${from} fehlt im Paket`);
      mkdirSync(dirname(destination), { recursive: true });
      rmSync(destination, { recursive: true, force: true });
      cpSync(source, destination, { recursive: true });
    }
    writeFileSync(join(target, to_dir(spec), "VERSION.txt"), `${name} ${spec.version} (${spec.license}), Dateien unveraendert aus dem npm-Paket.\n`);
    console.log(`${name}@${spec.version} -> ${Object.values(spec.files).join(", ")}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

function to_dir(spec) {
  return Object.values(spec.files)[0].split("/")[0];
}

// Unbenutzt, aber praktisch fuer einzelne Dateien.
export { copyFileSync };
