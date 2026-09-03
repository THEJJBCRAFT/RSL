// Stufe-A-Tests: falscher Code, Offline/Reconnect, Zustand nach Neuladen, Start ohne Broker mit Retry.
// Wird von run.mjs mit gemeinsamem Browser, Broker und Webserver aufgerufen; `errors` sammelt Fehler.
export const title = "Verbindung: falscher Code, Offline/Reconnect, Zustand nach Neuladen, Broker-Start spaeter";

export default async function run({ browser, errors, base, broker, devices, mqtt, startBroker, out }) {
  const check = (label, ok) => { console.log(`${ok ? "OK " : "FAIL"} ${label}`); if (!ok) errors.push(`check failed: ${label}`); };
  // Der Broker-Link (?broker=…) fragt in der App nach; im Test wird er bestaetigt.
  const acceptBroker = async page => { try { await page.waitForSelector("#dialog:not([hidden])", { timeout: 2500 }); if ((await page.textContent("#dialogTitle")).includes("Verbindungsdienst")) await page.click("#dialogOk"); } catch {} };
  void check; void acceptBroker; void devices; void mqtt; void startBroker; void out;

  const phone = async (name, lat, lng) => {
    const ctx = await browser.newContext({ ...devices["Pixel 7"], geolocation: { latitude: lat, longitude: lng, accuracy: 15 }, permissions: ["geolocation"], locale: "de-DE" });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`${name}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" && !/ERR_TUNNEL|tile\.openstreetmap|WebSocket connection/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
    return { ctx, page };
  };
  const dbg = page => page.evaluate(() => window.fmsDebug());

  // A erstellt Gruppe
  const a = await phone("A", 52.52, 13.405);
  await a.page.goto(`${base}?broker=${encodeURIComponent(broker)}`); await acceptBroker(a.page);
  await a.page.fill("#setupName", "Jaro");
  await a.page.click("#setupSubmit");
  await a.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  const code = await a.page.textContent("#groupCode");
  await a.page.waitForTimeout(800);
  console.log("A debug:", JSON.stringify(await dbg(a.page)));
  console.log("A status:", await a.page.textContent("#netStatus"));

  // Falscher Code -> Fehler + "Trotzdem beitreten"
  const d = await phone("D", 52.5, 13.4);
  await d.page.goto(`${base}?broker=${encodeURIComponent(broker)}`); await acceptBroker(d.page);
  await d.page.click("[data-mode=join]");
  await d.page.fill("#setupName", "Fremd");
  await d.page.fill("#setupCode", "ZZZZZZZZ");
  await d.page.click("#setupSubmit");
  await d.page.waitForSelector("#setupError:not([hidden])", { timeout: 20000 });
  console.log("D Fehler:", (await d.page.textContent("#setupError")).slice(0, 60), "| force sichtbar:", await d.page.isVisible("#setupForce"));
  // Verbotene Zeichen
  await d.page.fill("#setupCode", "0O1IABCD");
  await d.page.click("#setupSubmit");
  await d.page.waitForTimeout(300);
  console.log("D Alphabet-Fehler:", (await d.page.textContent("#setupError")).slice(0, 50));
  // Einladungstext einfuegen
  await d.page.fill("#setupCode", `Komm in meine Gruppe. Code: ${code}\nhttps://x.y/apps/find-mein-soon/?join=${code}`);
  console.log("D aus Text extrahiert:", await d.page.inputValue("#setupCode"), "(erwartet", code + ")");
  // Trotzdem beitreten mit falschem Code
  await d.page.fill("#setupCode", "ZZZZZZZZ");
  await d.page.click("#setupSubmit");
  await d.page.waitForSelector("#setupForce:not([hidden])", { timeout: 20000 });
  await d.page.click("#setupForce");
  await d.page.waitForSelector("#mainView:not([hidden])", { timeout: 10000 });
  console.log("D trotzdem beigetreten, Mitglieder:", await d.page.$$eval(".member-item", i => i.length));

  // B tritt korrekt bei
  const b = await phone("B", 52.5163, 13.3777);
  await b.page.goto(`${base}?broker=${encodeURIComponent(broker)}#join=${code}`); await acceptBroker(b.page);
  await b.page.fill("#setupName", "Delta");
  await b.page.click("#setupSubmit");
  await b.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await a.page.waitForFunction(() => document.querySelectorAll(".member-item").length >= 2, null, { timeout: 15000 });
  console.log("B beigetreten; A sieht", await a.page.$$eval(".member-item", i => i.length), "Mitglieder");

  // B pausiert Standort, laedt neu -> Pause bleibt; dann Alarm, neu laden -> Alarm bleibt
  await b.page.click("#shareToggle");
  await b.page.waitForTimeout(300);
  await b.page.reload();
  await b.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await b.page.waitForTimeout(800);
  console.log("B nach Reload (pausiert): teilen =", await b.page.textContent("#shareToggle .toggle-state"));
  await b.page.click("#sosButton");
  await b.page.waitForSelector("#dialog:not([hidden])"); await b.page.click("#dialogOk");
  await b.page.waitForTimeout(500);
  await b.page.reload();
  await b.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await b.page.waitForTimeout(1000);
  console.log("B nach Reload (Alarm): teilen =", await b.page.textContent("#shareToggle .toggle-state"), "| SOS-Label =", await b.page.textContent("#sosButton .sos-label"));
  await a.page.waitForSelector("#alertBanner:not([hidden])", { timeout: 15000 });
  console.log("A sieht Alarm, Ton-Knopf:", await a.page.textContent("#alertMute"));
  await a.page.click("#alertMute");
  console.log("A nach Klick:", await a.page.textContent("#alertMute"));

  // B geht offline, A beendet nichts; B kommt zurueck -> reconnect, Status
  await b.ctx.setOffline(true);
  await b.page.waitForTimeout(1500);
  console.log("B offline status:", await b.page.textContent("#netStatus"));
  // Waehrend B offline ist, verlaesst D die Gruppe (falsche Gruppe, irrelevant) und A aendert den Namen
  await a.page.click("#menuButton");
  await a.page.click("#menuRename");
  await a.page.waitForSelector("#dialog:not([hidden])"); await a.page.fill("#dialogInput", "Jaro II"); await a.page.click("#dialogOk");
  await b.ctx.setOffline(false);
  await b.page.waitForFunction(() => window.fmsDebug().connected, null, { timeout: 30000 });
  await b.page.waitForFunction(() => [...document.querySelectorAll(".member-name")].some(n => n.textContent.includes("Jaro II")), null, { timeout: 30000 });
  console.log("B wieder verbunden und sieht Umbenennung; status:", await b.page.textContent("#netStatus"));

  // B beendet Alarm -> A Banner weg; B verlaesst -> A entfernt B
  await b.page.click("#sosButton");
  await b.page.waitForSelector("#dialog:not([hidden])"); await b.page.click("#dialogOk");
  await a.page.waitForFunction(() => document.getElementById("alertBanner").hidden, null, { timeout: 15000 });
  await b.page.click("#menuButton");
  await b.page.click("#menuLeave");
  await b.page.waitForSelector("#dialog:not([hidden])"); await b.page.click("#dialogOk");
  await b.page.waitForSelector("#setupView:not([hidden])", { timeout: 10000 });
  await a.page.waitForFunction(() => document.querySelectorAll(".member-item").length === 1, null, { timeout: 15000 });
  console.log("A nach Verlassen von B: 1 Mitglied");

  // Start ohne erreichbaren Broker -> Retry, dann Broker starten -> verbindet von selbst
  const r = await phone("R", 52.5, 13.4);
  // Oeffentliche Broker (wss://) sind im Test tabu: jede Verbindung dorthin wird sofort geschlossen, damit der
  // Ablauf ohne Netz nach draussen und ueberall gleich laeuft.
  await r.page.routeWebSocket(/^wss:\/\//, route => route.close({ code: 1006, reason: "im Test gesperrt" }));
  await r.page.goto(`${base}?broker=${encodeURIComponent("ws://127.0.0.1:9002")}`); await acceptBroker(r.page);
  await r.page.fill("#setupName", "Retry");
  await r.page.click("#setupSubmit");
  await r.page.waitForSelector("#setupError:not([hidden])", { timeout: 60000 });
  console.log("R Setup-Fehler ohne Broker:", (await r.page.textContent("#setupError")).slice(0, 70));
  // Sitzung simulieren: Gruppe wurde frueher erstellt, jetzt Start ohne Broker
  await r.page.evaluate(() => localStorage.setItem("findMeinSoon.session", JSON.stringify({ code: "ABCDEFGH", memberId: "abc123abc123abcd", name: "Retry", color: "#4ff4cf", groupName: "Test", sharing: true, alert: null })));
  await r.page.reload();
  await r.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await r.page.waitForFunction(() => window.fmsDebug().retries >= 1, null, { timeout: 60000 });
  console.log("R Status waehrend Retry:", await r.page.textContent("#netStatus"));
  const second = await startBroker(9002);
  await r.page.waitForFunction(() => window.fmsDebug().connected, null, { timeout: 90000 });
  console.log("R verbunden nach Broker-Start:", JSON.stringify(await dbg(r.page)), "| status:", await r.page.textContent("#netStatus"));
  await second.close();
}
