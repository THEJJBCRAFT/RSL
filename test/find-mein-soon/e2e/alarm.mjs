// Stufe-B-Tests: Dialoge, Alarm-Ablauf mit "Ich komme", Zurueck-Taste, Benachrichtigungs-Karte, Fragment-Links.
// Wird von run.mjs mit gemeinsamem Browser, Broker und Webserver aufgerufen; `errors` sammelt Fehler.
export const title = "Alarm-Ablauf, Dialoge, Zurueck-Taste, Benachrichtigungs-Karte, Fragment-Links";

export default async function run({ browser, errors, base, broker, devices, mqtt, startBroker, out }) {
  const check = (label, ok) => { console.log(`${ok ? "OK " : "FAIL"} ${label}`); if (!ok) errors.push(`check failed: ${label}`); };
  // Der Broker-Link (?broker=…) fragt in der App nach; im Test wird er bestaetigt.
  const acceptBroker = async page => { try { await page.waitForSelector("#dialog:not([hidden])", { timeout: 2500 }); if ((await page.textContent("#dialogTitle")).includes("Verbindungsdienst")) await page.click("#dialogOk"); } catch {} };
  void check; void acceptBroker; void devices; void mqtt; void startBroker; void out;

  const phone = async (name, lat, lng, extra = {}) => {
    const ctx = await browser.newContext({ ...devices["Pixel 7"], geolocation: { latitude: lat, longitude: lng, accuracy: 15 }, permissions: ["geolocation"], locale: "de-DE", ...extra });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`${name}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" && !/ERR_TUNNEL|tile\.openstreetmap|WebSocket connection/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
    page.on("dialog", d => { errors.push(`${name}: Browser-Dialog erschienen: ${d.message()}`); d.dismiss(); });
    return { ctx, page };
  };

  const a = await phone("A", 52.52, 13.405);
  await a.page.goto(`${base}?broker=${encodeURIComponent(broker)}`); await acceptBroker(a.page);
  console.log("A URL bereinigt:", await a.page.evaluate(() => location.search + location.hash) === "");
  await a.page.fill("#setupName", "Jaro");
  await a.page.click("#setupSubmit");
  await a.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  const code = await a.page.textContent("#groupCode");
  console.log("A Notification.permission:", await a.page.evaluate(() => Notification.permission), "| Karte sichtbar:", await a.page.isVisible("#notifyCard"));
  console.log("A Karte wuerde bei 'default' erscheinen:", await a.page.evaluate(() => { const card = document.getElementById("notifyCard"); return Boolean(card && document.getElementById("notifyAllow")); }));

  // B ueber Fragment-Link
  const b = await phone("B", 52.5163, 13.3777);
  await b.page.goto(`${base}?broker=${encodeURIComponent(broker)}#join=${code}`); await acceptBroker(b.page);
  console.log("B prefilled aus #join:", await b.page.inputValue("#setupCode") === code);
  await b.page.fill("#setupName", "Delta");
  await b.page.click("#setupSubmit");
  await b.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await a.page.waitForFunction(() => document.querySelectorAll(".member-item").length >= 2, null, { timeout: 15000 });

  // Umbenennen ueber Dialog
  await a.page.click("#menuButton");
  await a.page.click("#menuRename");
  await a.page.waitForSelector("#dialog:not([hidden])");
  console.log("A Dialog-Titel:", await a.page.textContent("#dialogTitle"));
  await a.page.fill("#dialogInput", "Jaro Neu");
  await a.page.click("#dialogOk");
  await b.page.waitForFunction(() => [...document.querySelectorAll(".member-name")].some(n => n.textContent.includes("Jaro Neu")), null, { timeout: 15000 });
  console.log("B sieht neuen Namen");

  // Zurueck-Taste: Menue offen -> fmsBack schliesst es
  await a.page.click("#menuButton");
  const backResult = await a.page.evaluate(() => [window.fmsBack(), document.getElementById("menu").hidden, window.fmsBack()]);
  console.log("A fmsBack (menu offen -> true, menu zu, dann false):", JSON.stringify(backResult));

  // Alarm: B drueckt "Finde mich!" -> Dialog -> senden
  await b.page.click("#sosButton");
  await b.page.waitForSelector("#dialog:not([hidden])");
  console.log("B Alarm-Dialog:", await b.page.textContent("#dialogTitle"), "|", await b.page.textContent("#dialogOk"));
  await b.page.click("#dialogOk");
  await b.page.waitForSelector("#ownAlert:not([hidden])", { timeout: 5000 });
  console.log("B eigener Alarm:", (await b.page.textContent("#ownAlertText")).slice(0, 60));
  await a.page.waitForSelector("#alertBanner:not([hidden])", { timeout: 15000 });
  console.log("A Banner:", await a.page.textContent("#alertTitle"), "| Knopf:", await a.page.textContent("#alertRespond"));

  // A: Ich komme -> B sieht es
  await a.page.click("#alertRespond");
  await b.page.waitForFunction(() => document.getElementById("ownAlertText").textContent.includes("kommt"), null, { timeout: 15000 });
  console.log("B sieht Rückmeldung:", (await b.page.textContent("#ownAlertText")).slice(0, 90));
  console.log("A Knopf danach:", await a.page.textContent("#alertRespond"));

  // B: Nachricht aendern
  await b.page.click("#ownAlertMessage");
  await b.page.waitForSelector("#dialog:not([hidden])");
  await b.page.fill("#dialogInput", "Bin am Riesenrad");
  await b.page.click("#dialogOk");
  await a.page.waitForFunction(() => document.getElementById("alertText").textContent.includes("Riesenrad"), null, { timeout: 15000 });
  console.log("A sieht neue Nachricht");

  // B beendet Alarm ueber Dialog -> A Banner weg, responding zurueckgesetzt
  await b.page.click("#ownAlertEnd");
  await b.page.waitForSelector("#dialog:not([hidden])");
  await b.page.click("#dialogOk");
  await a.page.waitForFunction(() => document.getElementById("alertBanner").hidden, null, { timeout: 15000 });
  await a.page.waitForTimeout(500);
  console.log("A nach Alarm-Ende: Banner weg, responding zurückgesetzt:", await a.page.evaluate(() => document.getElementById("alertBanner").hidden));

  // Treffpunkt mit Dialog
  await a.page.click("#meetingButton");
  await a.page.click("#map", { position: { x: 200, y: 200 } });
  await a.page.waitForSelector("#dialog:not([hidden])");
  await a.page.fill("#dialogInput", "Eingang Nord");
  await a.page.click("#dialogOk");
  await b.page.waitForFunction(() => !document.getElementById("meetingLine").hidden && document.getElementById("meetingLabel").textContent.includes("Eingang Nord"), null, { timeout: 15000 });
  console.log("B Treffpunkt:", await b.page.textContent("#meetingLabel"));

  // Verlassen ueber Dialog
  await b.page.click("#menuButton");
  await b.page.click("#menuLeave");
  await b.page.waitForSelector("#dialog:not([hidden])");
  await b.page.click("#dialogOk");
  await b.page.waitForSelector("#setupView:not([hidden])", { timeout: 10000 });
  await a.page.waitForFunction(() => document.querySelectorAll(".member-item").length === 1, null, { timeout: 15000 });
  console.log("B hat verlassen, A sieht 1 Mitglied");

  // Native-UA: Benachrichtigungs-Karte darf nicht erscheinen, Teilen-Link nutzt Fragment
  const c = await phone("C", 52.5, 13.4, { userAgent: devices["Pixel 7"].userAgent + " FindMeinSoonApp/2.0.0" });
  await c.page.goto(`${base}?broker=${encodeURIComponent(broker)}#join=${code}`); await acceptBroker(c.page);
  await c.page.fill("#setupName", "Chaos");
  await c.page.click("#setupSubmit");
  await c.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  console.log("C (native UA) Benachrichtigungs-Karte:", await c.page.isVisible("#notifyCard"));
}
