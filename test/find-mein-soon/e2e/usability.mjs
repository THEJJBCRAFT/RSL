// Stufe-D-Tests: Genauigkeit anderer, QR-Teilen, Gruppenwechsel per Link, Standort-Karte, Zeitlimit, Akku-Warnung,
// Spur, Kartenknoepfe, Version, Update-Hinweis, "In der App oeffnen".
// Wird von run.mjs mit gemeinsamem Browser, Broker und Webserver aufgerufen; `errors` sammelt Fehler.
export const title = "Bedienung: Genauigkeit, QR, Gruppenwechsel, Standort-Karte, Zeitlimit, Akku, Spur, Update";

export default async function run({ browser, errors, base, broker, devices, mqtt, startBroker, out }) {
  const check = (label, ok) => { console.log(`${ok ? "OK " : "FAIL"} ${label}`); if (!ok) errors.push(`check failed: ${label}`); };
  // Der Broker-Link (?broker=…) fragt in der App nach; im Test wird er bestaetigt.
  const acceptBroker = async page => { try { await page.waitForSelector("#dialog:not([hidden])", { timeout: 2500 }); if ((await page.textContent("#dialogTitle")).includes("Verbindungsdienst")) await page.click("#dialogOk"); } catch {} };
  void check; void acceptBroker; void devices; void mqtt; void startBroker; void out;

  const phone = async (name, lat, lng, extra = {}, init = null) => {
    const ctx = await browser.newContext({ ...devices["Pixel 7"], geolocation: { latitude: lat, longitude: lng, accuracy: 15 }, permissions: ["geolocation"], locale: "de-DE", ...extra });
    await ctx.addInitScript(() => {
      window.__toasts = [];
      new MutationObserver(() => {
        const t = document.getElementById("toast");
        if (t && t.textContent && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent);
      }).observe(document, { subtree: true, childList: true, characterData: true });
    });
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`${name}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" && !/ERR_TUNNEL|tile\.openstreetmap|WebSocket connection|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|api\.github\.com/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
    page.on("dialog", d => { errors.push(`${name}: Browser-Dialog: ${d.message()}`); d.dismiss(); });
    return { ctx, page };
  };
  const dbg = page => page.evaluate(() => window.fmsDebug());
  const withBroker = async page => {
    await page.goto(`${base}?broker=${encodeURIComponent(broker)}`);
    await page.waitForSelector("#dialog:not([hidden])", { timeout: 5000 });
    await page.click("#dialogOk");
  };
  const toastText = page => page.evaluate(() => document.getElementById("toast").textContent);

  // A erstellt, B mit schwachem Akku und ungenauem Standort tritt bei
  const a = await phone("A", 52.52, 13.405);
  await withBroker(a.page);
  await a.page.fill("#setupName", "Jaro");
  await a.page.click("#setupSubmit");
  await a.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  const code = await a.page.textContent("#groupCode");
  check("Standort-Karte bei erteilter Berechtigung nicht sichtbar", !(await a.page.isVisible("#geoCard")));

  const b = await phone("B", 52.5163, 13.3777, { geolocation: { latitude: 52.5163, longitude: 13.3777, accuracy: 650 } },
    () => { navigator.getBattery = () => Promise.resolve({ level: 0.15, addEventListener() {} }); });
  await withBroker(b.page);
  await b.page.click("[data-mode=join]");
  await b.page.fill("#setupName", "Delta");
  await b.page.fill("#setupCode", code);
  await b.page.click("#setupSubmit");
  await b.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await a.page.waitForFunction(() => [...document.querySelectorAll(".member-accuracy")].some(n => n.textContent.includes("ungefähr")), null, { timeout: 15000 });
  check("A sieht B als ungefähr (±650 m)", true);
  check("A: Genauigkeitskreis für B", (await a.page.evaluate(() => document.querySelectorAll(".leaflet-interactive, path").length)) >= 2);
  await a.page.waitForFunction(() => document.getElementById("toast").textContent.includes("Akku von Delta"), null, { timeout: 15000 }).then(() => check("A: Akku-Warnung für Delta", true)).catch(async () => check(`A: Akku-Warnung für Delta (toast: ${await toastText(a.page)})`, false));
  check("A: Mitgliedsinfo nennt schwachen Akku", (await a.page.textContent("#memberList")).includes("schwach"));
  await b.page.waitForFunction(() => document.getElementById("toast").textContent.includes("Dein Akku"), null, { timeout: 5000 }).then(() => check("B: eigene Akku-Warnung", true)).catch(() => check("B: eigene Akku-Warnung", false));

  // Teilen-Blatt mit QR
  await a.page.click("#shareButton");
  await a.page.waitForSelector("#shareSheet:not([hidden])");
  check("Teilen: Code groß", (await a.page.textContent("#shareSheetCode")) === code);
  check("Teilen: QR-Code als SVG", await a.page.evaluate(() => Boolean(document.querySelector("#shareQr svg"))));
  check("Teilen: Knopf", /Link (teilen|kopieren)/.test(await a.page.textContent("#shareSend")));
  check("fmsBack schließt Teilen-Blatt", await a.page.evaluate(() => window.fmsBack() && document.getElementById("shareSheet").hidden));

  // Spur: A bewegt sich mehrmals
  for (const [lat, lng] of [[52.521, 13.406], [52.522, 13.407], [52.523, 13.408]]) {
    await a.ctx.setGeolocation({ latitude: lat, longitude: lng, accuracy: 15 });
    await a.page.waitForTimeout(6500); // Sende-Drossel: alle 6 s
  }
  const trails = (await dbg(a.page)).trails;
  check(`A: Spur mit Punkten ${JSON.stringify(trails)}`, trails.some(([, n]) => n >= 3));
  await b.page.waitForTimeout(1500);
  const bTrails = (await dbg(b.page)).trails;
  check(`B: Spur von A ${JSON.stringify(bTrails)}`, bTrails.some(([, n]) => n >= 2));
  check("Karte: Polyline gezeichnet", (await a.page.evaluate(() => document.querySelectorAll(".leaflet-overlay-pane path").length)) >= 2);

  // Kartenknoepfe
  await a.page.click("#zoomIn");
  await a.page.click("#mapStyle");
  check("Helle Karte aktiv + gespeichert", await a.page.evaluate(() => document.body.classList.contains("map-light") && localStorage.getItem("findMeinSoon.mapStyle") === "light"));
  await a.page.click("#mapStyle");
  check("Dunkle Karte zurück", await a.page.evaluate(() => !document.body.classList.contains("map-light")));
  await a.page.click("#zoomOut");

  // Version im Menue, Zeitlimit
  await a.page.click("#menuButton");
  check("Version im Menü", /Version \d+\.\d+\.\d+/.test(await a.page.textContent("#menuVersion")));
  await a.page.click("#menuTimed");
  await a.page.waitForSelector("#dialog:not([hidden])");
  await a.page.fill("#dialogInput", "abc");
  await a.page.click("#dialogOk");
  await a.page.waitForFunction(() => document.getElementById("toast").textContent.includes("Uhrzeit"), null, { timeout: 3000 });
  check("Ungültige Eingabe abgelehnt", true);
  await a.page.click("#menuButton");
  await a.page.click("#menuTimed");
  await a.page.waitForSelector("#dialog:not([hidden])");
  await a.page.fill("#dialogInput", "0.004"); // ~14 s
  await a.page.click("#dialogOk");
  await a.page.waitForFunction(() => /bis \d{2}:\d{2}/.test(document.querySelector("#shareToggle .toggle-state").textContent), null, { timeout: 3000 });
  check("Teilen-Schalter zeigt 'bis HH:MM'", true);
  await a.page.reload();
  await a.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await a.page.waitForTimeout(500);
  check("Zeitlimit überlebt Neuladen", /bis \d{2}:\d{2}/.test(await a.page.textContent("#shareToggle .toggle-state")));
  await a.page.waitForFunction(() => document.querySelector("#shareToggle .toggle-state").textContent === "AUS", null, { timeout: 45000 });
  check("Teilen automatisch aus nach Ablauf", true);
  check("Nach Pause kein Standort-Watch mehr", !(await dbg(a.page)).watching);
  await a.page.click("#shareToggle");
  await a.page.waitForTimeout(500);
  check("Wieder an: Watch läuft", (await dbg(a.page)).watching && (await a.page.textContent("#shareToggle .toggle-state")) === "AN");

  // Uhrzeit-Eingabe
  const until = await a.page.evaluate(() => {
    const now = new Date(Date.now() + 90 * 60000);
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  await a.page.click("#menuButton");
  await a.page.click("#menuTimed");
  await a.page.waitForSelector("#dialog:not([hidden])");
  await a.page.fill("#dialogInput", until);
  await a.page.click("#dialogOk");
  await a.page.waitForTimeout(300);
  check(`Uhrzeit ${until} übernommen`, (await a.page.textContent("#shareToggle .toggle-state")) === `bis ${until}`);

  // Gruppenwechsel per Einladungslink, waehrend man in einer Gruppe ist
  const c = await phone("C", 52.5, 13.4);
  await withBroker(c.page);
  await c.page.fill("#setupName", "Chaos");
  await c.page.fill("#setupGroupName", "Andere");
  await c.page.click("#setupSubmit");
  await c.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await c.page.goto(`${base}?join=${code}`); // echte Navigation (nur ein Fragment wuerde die Seite nicht neu laden)
  await c.page.waitForSelector("#dialog:not([hidden])", { timeout: 5000 });
  check("Wechsel-Dialog", (await c.page.textContent("#dialogTitle")).includes("wechseln") && (await c.page.textContent("#dialogText")).includes("Andere"));
  await c.page.click("#dialogOk");
  await c.page.waitForSelector("#setupView:not([hidden])", { timeout: 10000 });
  check("Wechsel: Code + Name vorbelegt", (await c.page.inputValue("#setupCode")) === code && (await c.page.inputValue("#setupName")) === "Chaos");
  check("Wechsel: 'In der App öffnen' auf Android-Browser", await c.page.evaluate(() => !document.getElementById("openInAppCard").hidden && document.getElementById("openInAppLink").href.startsWith("intent://") && document.getElementById("openInAppLink").href.includes("package=de.redstonelabs.findmeinsoon")));
  await c.page.click("#setupSubmit");
  await c.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await a.page.waitForFunction(() => document.querySelectorAll(".member-item").length === 3, null, { timeout: 15000 });
  check("C ist in As Gruppe", true);
  await c.page.goto(`${base}?join=${code}`);
  await c.page.waitForFunction(() => window.__toasts.some(t => t.includes("schon in dieser Gruppe")), null, { timeout: 5000 });
  check("Gleicher Code: Hinweis statt Dialog", true);

  // Standort verweigert -> Karte mit "Erneut versuchen"
  const d = await phone("D", 52.5, 13.4, { permissions: [] });
  await withBroker(d.page);
  await d.page.click("[data-mode=join]");
  await d.page.fill("#setupName", "Dora");
  await d.page.fill("#setupCode", code);
  await d.page.click("#setupSubmit");
  await d.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await d.page.waitForSelector("#geoCard:not([hidden])", { timeout: 10000 });
  check(`D: Standort-Karte (${await d.page.textContent("#geoAllow")})`, /Standort erlauben|Erneut versuchen/.test(await d.page.textContent("#geoAllow")));
  await d.page.click("#geoAllow");
  await d.page.waitForSelector("#geoCard:not([hidden])", { timeout: 10000 });
  check("D: nach Ablehnung 'Erneut versuchen'", (await d.page.textContent("#geoAllow")) === "Erneut versuchen");
  check("D: Herzschlag ohne Standort läuft (Mitglied sichtbar bei A)", await a.page.evaluate(() => [...document.querySelectorAll(".member-name")].some(n => n.textContent.includes("Dora"))));

  // Native App: Update-Hinweis, Version aus Bruecke, Berechtigungskarte ueber Bruecke
  const n = await phone("N", 52.5, 13.4, { userAgent: devices["Pixel 7"].userAgent + " FindMeinSoonApp/2.0.3" }, () => {
    window.__native = { sharing: null, low: null };
    window.FindMeinSoonNative = {
      version: () => "2.0.3",
      setSharing: on => { window.__native.sharing = on; },
      setLowPower: on => { window.__native.low = on; },
      locationPermission: () => "denied",
      openSettings: () => { window.__native.settings = true; },
      share: () => {},
      showAlert: () => {},
      clearAlert: () => {},
      isSharingServiceRunning: () => false
    };
  });
  await n.page.route("https://api.github.com/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ name: "Find Mein Soon APK (Build 40)", tag_name: "find-mein-soon-latest" }) }));
  await withBroker(n.page);
  await n.page.click("[data-mode=join]");
  await n.page.fill("#setupName", "Nina");
  await n.page.fill("#setupCode", code);
  await n.page.click("#setupSubmit");
  await n.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await n.page.waitForSelector("#updateCard:not([hidden])", { timeout: 10000 });
  check("N: Update-Karte", (await n.page.textContent("#updateText")).includes("Build 40") && (await n.page.getAttribute("#updateLink", "href")).includes("FindMeinSoon.apk"));
  await n.page.click("#menuButton");
  check("N: Version aus Brücke", (await n.page.textContent("#menuVersion")).includes("App 2.0.3") && await n.page.isVisible("#menuUpdate"));
  await n.page.click("#menuClose");
  await n.page.waitForSelector("#geoCard:not([hidden])", { timeout: 5000 });
  check("N: Standort-Karte vor Android-Abfrage, Dienst noch nicht gestartet", (await n.page.evaluate(() => window.__native.sharing)) === null);
  await n.page.click("#geoAllow");
  check("N: Tipp startet Android-Abfrage über setSharing(true)", (await n.page.evaluate(() => window.__native.sharing)) === true);
  await n.page.evaluate(() => window.fmsPermission(false));
  await n.page.waitForSelector("#geoCard:not([hidden])", { timeout: 3000 });
  check("N: Ablehnung -> Einstellungen-Knopf", await n.page.isVisible("#geoSettings"));
  await n.page.evaluate(() => window.fmsPermission(true));
  await n.page.waitForTimeout(500);
  check("N: Erlaubnis -> Watch läuft, Karte weg", (await dbg(n.page)).watching && (await n.page.evaluate(() => document.getElementById("geoCard").hidden)));
  check("N: gespeicherter Update-Check", await n.page.evaluate(() => JSON.parse(localStorage.getItem("findMeinSoon.updateCheck")).build === 40));
}
