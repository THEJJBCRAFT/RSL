// Stufe-C-Tests: Broker-Link nur nach Rueckfrage, 12-stelliger Code (v2), Kanal-Bindung, Abschiedsnachricht,
// "Neue Gruppe mit neuem Code", v1-Kompatibilitaet, Broker zuruecksetzen.
// Wird von run.mjs mit gemeinsamem Browser, Broker und Webserver aufgerufen; `errors` sammelt Fehler.
export const title = "Sicherheit: Broker-Rueckfrage, Code v2, Kanal-Bindung, Abschiedsnachricht, neuer Code, v1";

export default async function run({ browser, errors, base, broker, devices, mqtt, startBroker, out }) {
  const check = (label, ok) => { console.log(`${ok ? "OK " : "FAIL"} ${label}`); if (!ok) errors.push(`check failed: ${label}`); };
  // Der Broker-Link (?broker=…) fragt in der App nach; im Test wird er bestaetigt.
  const acceptBroker = async page => { try { await page.waitForSelector("#dialog:not([hidden])", { timeout: 2500 }); if ((await page.textContent("#dialogTitle")).includes("Verbindungsdienst")) await page.click("#dialogOk"); } catch {} };
  void check; void acceptBroker; void devices; void mqtt; void startBroker; void out;
  const BROKER_KEY = "findMeinSoon.broker";
  const SESSION_KEY = "findMeinSoon.session";

  const phone = async (name, lat, lng, extra = {}) => {
    const ctx = await browser.newContext({ ...devices["Pixel 7"], geolocation: { latitude: lat, longitude: lng, accuracy: 15 }, permissions: ["geolocation"], locale: "de-DE", ...extra });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`${name}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" && !/ERR_TUNNEL|tile\.openstreetmap|WebSocket connection|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
    page.on("dialog", d => { errors.push(`${name}: Browser-Dialog: ${d.message()}`); d.dismiss(); });
    return { ctx, page };
  };
  const dbg = page => page.evaluate(() => window.fmsDebug());
  const stored = page => page.evaluate(key => localStorage.getItem(key), BROKER_KEY);
  const session = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), SESSION_KEY);
  const members = page => page.evaluate(() => document.querySelectorAll(".member-item").length);
  const names = page => page.evaluate(() => [...document.querySelectorAll(".member-name")].map(n => n.textContent.trim()));
  const withBroker = async (page, url = broker) => {
    await page.goto(`${base}?broker=${encodeURIComponent(url)}`);
    await page.waitForSelector("#dialog:not([hidden])", { timeout: 5000 });
    await page.click("#dialogOk");
  };
  const join = async (page, code, name, force = false) => {
    await page.click("[data-mode=join]");
    await page.fill("#setupName", name);
    await page.fill("#setupCode", code);
    await page.click("#setupSubmit");
    if (force) {
      await page.waitForSelector("#setupForce:not([hidden])", { timeout: 20000 });
      await page.click("#setupForce");
    }
    await page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  };
  // Roh-Client am Broker (kennt keinen Schluessel): sammelt retained Nachrichten und kann beliebige Bytes senden.
  const raw = mqtt.connect(broker, { protocolVersion: 4, clientId: `raw-${Date.now()}` });
  await new Promise(resolve => raw.on("connect", resolve));
  const retained = async pattern => {
    const found = new Map();
    const handler = (topic, payload, packet) => { if (packet.retain) found.set(topic, Buffer.from(payload)); };
    raw.on("message", handler);
    await new Promise(resolve => raw.subscribe(pattern, { qos: 1 }, resolve));
    await new Promise(resolve => setTimeout(resolve, 1200));
    raw.removeListener("message", handler);
    await new Promise(resolve => raw.unsubscribe(pattern, resolve));
    return found;
  };
  const rawPublish = (topic, payload) => new Promise(resolve => raw.publish(topic, payload, { qos: 1, retain: true }, resolve));

  // 1. Ungueltiger Broker-Link wird ignoriert
  const a = await phone("A", 52.52, 13.405);
  await a.page.goto(`${base}?broker=${encodeURIComponent("http://evil.example/mqtt")}`);
  await a.page.waitForFunction(() => document.getElementById("toast").textContent.includes("ignoriert"), null, { timeout: 5000 });
  check("http-Broker-Link ignoriert, nichts gespeichert", (await stored(a.page)) === null && await a.page.evaluate(() => document.getElementById("dialog").hidden));

  // 2. Gueltiger Link: Rueckfrage, Abbrechen speichert nichts
  await a.page.goto(`${base}?broker=${encodeURIComponent(broker)}`);
  await a.page.waitForSelector("#dialog:not([hidden])", { timeout: 5000 });
  const dialogText = await a.page.textContent("#dialogText");
  check("Rueckfrage nennt den Host", (await a.page.textContent("#dialogTitle")).includes("Verbindungsdienst") && dialogText.includes("127.0.0.1"));
  await a.page.click("#dialogCancel");
  check("Abbrechen speichert nichts", (await stored(a.page)) === null);
  check("Adresse bereinigt", await a.page.evaluate(() => location.search + location.hash) === "");

  // 3. Bestaetigen speichert
  await withBroker(a.page);
  check("Bestaetigen speichert Broker", (await stored(a.page)) === broker);

  // 4. Gruppe erstellen: 12-stelliger Code, Protokoll v2
  await a.page.fill("#setupName", "Jaro");
  await a.page.fill("#setupGroupName", "Familie");
  await a.page.click("#setupSubmit");
  await a.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  const code = await a.page.textContent("#groupCode");
  const aDbg = await dbg(a.page);
  check(`Code-Anzeige XXXX-XXXX-XXXX (${code})`, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code));
  check(`Protokoll v2, Thema ${aDbg.root}`, aDbg.version === 2 && /^fms\/v2\/[0-9a-f]{32}$/.test(aDbg.root));
  const aSession = await session(a.page);
  check("Sitzung speichert Code ohne Bindestriche (12 Zeichen)", aSession.code.length === 12 && !aSession.code.includes("-"));

  // 5. Menue zeigt eigenen Broker + Zuruecksetzen
  await a.page.click("#menuButton");
  const menuBroker = await a.page.textContent("#menuBroker");
  check(`Menue zeigt eigenen Dienst (${menuBroker})`, menuBroker.includes("Eigener Verbindungsdienst") && menuBroker.includes("127.0.0.1") && await a.page.isVisible("#menuBrokerReset"));
  await a.page.click("#menuClose");

  // 6. B tritt per eingefuegtem Einladungstext bei
  const b = await phone("B", 52.5163, 13.3777);
  await withBroker(b.page);
  await b.page.click("[data-mode=join]");
  await b.page.fill("#setupCode", `Komm in meine Find-Mein-Soon-Gruppe "Familie". Code: ${code}\nhttps://thejjbcraft.github.io/RSL/apps/find-mein-soon/#join=${code}`);
  check("Code aus Einladungstext extrahiert", (await b.page.inputValue("#setupCode")) === code);
  await b.page.fill("#setupName", "Delta");
  await b.page.click("#setupSubmit");
  await b.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await a.page.waitForFunction(() => document.querySelectorAll(".member-item").length >= 2, null, { timeout: 15000 });
  check("A sieht B", (await names(a.page)).some(n => n.includes("Delta")));
  // Code ohne Bindestriche wird ebenfalls akzeptiert (Eingabe wird formatiert)
  await b.page.evaluate(() => { document.getElementById("setupCode").value = "ABCDEFGHJKLM"; document.getElementById("setupCode").dispatchEvent(new Event("input")); });
  check("Eingabe ohne Bindestriche wird formatiert", (await b.page.inputValue("#setupCode")) === "ABCD-EFGH-JKLM");

  // 7. Kanal-Bindung: Nachrichten anderer Themen / Fremde leere Nachrichten haben keine Wirkung
  const root = aDbg.root;
  const bSession = await session(b.page);
  const store = await retained(`${root}/#`);
  const aPayload = store.get(`${root}/${aSession.memberId}`);
  const bPayload = store.get(`${root}/${bSession.memberId}`);
  check("Retained Eintraege von A und B vorhanden", Boolean(aPayload && bPayload && aPayload.length > 12 && bPayload.length > 12));
  await rawPublish(`${root}/deadbeefdeadbeef`, aPayload); // Kopie von A unter fremder Mitgliedskennung
  await rawPublish(`${root}/${bSession.memberId}`, aPayload); // Kopie von A auf Bs Thema
  await rawPublish(`${root}/meta`, bPayload); // Mitgliedsnachricht auf dem Gruppen-Thema
  await rawPublish(`${root}/cafe0000cafe0000`, Buffer.from("nonsense-bytes-that-are-long-enough"));
  await a.page.waitForTimeout(1500);
  await b.page.waitForTimeout(500);
  check("A: kein drittes Mitglied, B bleibt Delta", (await members(a.page)) === 2 && (await names(a.page)).some(n => n.includes("Delta")));
  check("B: kein drittes Mitglied", (await members(b.page)) === 2);
  check("Gruppenname unveraendert", (await a.page.textContent("#groupName")) === "Familie");
  await rawPublish(`${root}/${aSession.memberId}`, ""); // Fremde leere Nachricht auf As Thema
  await b.page.waitForTimeout(1500);
  check("B sieht A trotz fremder leerer Nachricht weiter (v2)", (await members(b.page)) === 2);

  // 7b. Wiedereinspielen: eine alte, mitgeschnittene Nachricht darf die Karte nicht zurueckdrehen
  const distanceToB = () => a.page.evaluate(id => {
    const node = document.querySelector(`[data-member="${id}"] .member-distance strong`);
    return node ? node.textContent : "";
  }, bSession.memberId);
  const oldPayload = (await retained(`${root}/${bSession.memberId}`)).get(`${root}/${bSession.memberId}`);
  const farAway = await distanceToB();
  await b.ctx.setGeolocation({ latitude: 52.5202, longitude: 13.4044, accuracy: 15 });
  await a.page.waitForFunction(([id, before]) => {
    const node = document.querySelector(`[data-member="${id}"] .member-distance strong`);
    return node && node.textContent !== before;
  }, [bSession.memberId, farAway], { timeout: 40000 });
  const nearby = await distanceToB();
  await rawPublish(`${root}/${bSession.memberId}`, oldPayload);
  await a.page.waitForTimeout(2000);
  check(`Alte Position (${farAway}) wird nach dem Umzug (${nearby}) nicht wieder eingespielt`, (await distanceToB()) === nearby);

  // 8. Abschiedsnachricht statt leerer Nachricht
  await b.page.click("#menuButton");
  await b.page.click("#menuLeave");
  await b.page.waitForSelector("#dialog:not([hidden])");
  await b.page.click("#dialogOk");
  await b.page.waitForSelector("#setupView:not([hidden])", { timeout: 10000 });
  await a.page.waitForFunction(() => document.querySelectorAll(".member-item").length === 1, null, { timeout: 15000 });
  const afterLeave = await retained(`${root}/${bSession.memberId}`);
  const tomb = afterLeave.get(`${root}/${bSession.memberId}`);
  const mqttVersion = (await dbg(a.page)).protocol;
  // MQTT 5: verschluesselte Abschiedsnachricht mit Ablaufzeit bleibt liegen. MQTT 3.1.1 (kein Ablauf): der Platz wird geleert.
  check(`A sieht B nach Verlassen nicht mehr; retained Platz nach Verlassen (MQTT ${mqttVersion}): ${tomb ? tomb.length : 0} Bytes`,
    mqttVersion === 5 ? Boolean(tomb && tomb.length > 12 && tomb.length < 120) : !tomb || tomb.length === 0);

  // 8b. Ein Handy mit vorgehender Uhr darf die Treffpunkt-Aenderungen der anderen nicht verwerfen
  const skew = await phone("S", 52.5119, 13.4009);
  await skew.ctx.addInitScript(() => {
    const realNow = Date.now.bind(Date);
    Date.now = () => realNow() + 10 * 60 * 1000; // Uhr geht zehn Minuten vor
  });
  await withBroker(skew.page);
  // Der Test oben hat den Gruppendaten-Platz beim Dienst mit einer ungueltigen Nachricht ueberschrieben,
  // deshalb kommt hier keine Gruppe zurueck und der Beitritt laeuft ueber "Trotzdem beitreten".
  await join(skew.page, code, "Skew", true);
  await a.page.waitForFunction(() => document.querySelectorAll(".member-item").length === 2, null, { timeout: 15000 });
  await skew.page.click("#meetingButton");
  await skew.page.click("#map", { position: { x: 180, y: 180 } });
  await skew.page.waitForSelector("#dialog:not([hidden])");
  await skew.page.fill("#dialogInput", "Vorgehende Uhr");
  await skew.page.click("#dialogOk");
  await a.page.waitForFunction(() => document.getElementById("meetingLabel").textContent.includes("Vorgehende Uhr"), null, { timeout: 15000 });
  // Diesen Stand mitschneiden: Er darf spaeter nicht ueber die neuere Aenderung von A gelegt werden koennen.
  const oldMeta = (await retained(`${root}/meta`)).get(`${root}/meta`);
  await a.page.click("#meetingButton");
  await a.page.click("#map", { position: { x: 220, y: 150 } });
  await a.page.waitForSelector("#dialog:not([hidden])");
  await a.page.fill("#dialogInput", "Korrigiert");
  await a.page.click("#dialogOk");
  const seesCorrection = async (page, label) => {
    try {
      await page.waitForFunction(() => document.getElementById("meetingLabel").textContent.includes("Korrigiert"), null, { timeout: 15000 });
      check(label, true);
    } catch {
      check(`${label} (steht: ${await page.textContent("#meetingLabel")})`, false);
    }
  };
  await seesCorrection(a.page, "Änderung trotz vorgehender Uhr bei A sichtbar");
  await seesCorrection(skew.page, "Änderung auch auf dem Handy mit vorgehender Uhr sichtbar");
  // Der mitgeschnittene aeltere Treffpunkt eines anderen Mitglieds darf die Aenderung nicht zurueckdrehen.
  await rawPublish(`${root}/meta`, oldMeta);
  await a.page.waitForTimeout(2000);
  check("Wiedereingespielte alte Gruppendaten drehen den Treffpunkt nicht zurück",
    (await a.page.textContent("#meetingLabel")).includes("Korrigiert") && (await skew.page.textContent("#meetingLabel")).includes("Korrigiert"));

  await skew.page.click("#menuButton");
  await skew.page.click("#menuLeave");
  await skew.page.waitForSelector("#dialog:not([hidden])");
  await skew.page.click("#dialogOk");
  await skew.page.waitForSelector("#setupView:not([hidden])", { timeout: 10000 });
  await a.page.waitForFunction(() => document.querySelectorAll(".member-item").length === 1, null, { timeout: 15000 });

  // 9. Treffpunkt + C dabei, dann "Neue Gruppe mit neuem Code"
  await a.page.click("#meetingButton");
  await a.page.click("#map", { position: { x: 200, y: 200 } });
  await a.page.waitForSelector("#dialog:not([hidden])");
  await a.page.fill("#dialogInput", "Eingang Nord");
  await a.page.click("#dialogOk");
  await a.page.waitForFunction(() => !document.getElementById("meetingLine").hidden, null, { timeout: 10000 });
  const c = await phone("C", 52.5, 13.4);
  await withBroker(c.page);
  await join(c.page, code, "Chaos");
  await a.page.waitForFunction(() => document.querySelectorAll(".member-item").length === 2, null, { timeout: 15000 });
  await a.page.click("#menuButton");
  await a.page.click("#menuRenew");
  await a.page.waitForSelector("#dialog:not([hidden])");
  check("Rueckfrage neuer Code", (await a.page.textContent("#dialogTitle")).includes("Neue Gruppe"));
  await a.page.click("#dialogOk");
  await a.page.waitForFunction(() => !document.getElementById("dialog").hidden && document.getElementById("dialogTitle").textContent.includes("Neuer Code"), null, { timeout: 30000 });
  const newCode = await a.page.textContent("#groupCode");
  const newDbg = await dbg(a.page);
  check(`Neuer Code ${newCode} != ${code}, neues Thema`, newCode !== code && /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(newCode) && newDbg.root !== root && newDbg.version === 2);
  check("Dialog nennt den neuen Code", (await a.page.textContent("#dialogText")).includes(newCode));
  await a.page.click("#dialogCancel");
  await a.page.waitForTimeout(800);
  check("Gruppenname bleibt", (await a.page.textContent("#groupName")) === "Familie");
  check("Treffpunkt bleibt", !(await a.page.evaluate(() => document.getElementById("meetingLine").hidden)) && (await a.page.textContent("#meetingLabel")).includes("Eingang Nord"));
  await c.page.waitForFunction(() => document.querySelectorAll(".member-item").length === 1, null, { timeout: 15000 });
  check("C sieht A in der alten Gruppe nicht mehr", true);
  await a.page.click("#menuButton");
  check("Menue ohne Hinweis auf alten Code", !(await a.page.textContent("#menuInfo")).includes("kurzen Code"));
  await a.page.click("#menuClose");

  // 10. v1-Kompatibilitaet: alter 8-stelliger Code, leere Nachricht = verlassen
  const d = await phone("D", 52.51, 13.41);
  await withBroker(d.page);
  const v1code = Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  await join(d.page, v1code, "Dora", true);
  const dDbg = await dbg(d.page);
  check(`v1-Gruppe ${dDbg.root}`, dDbg.version === 1 && /^fms\/v1\/[0-9a-f]{32}$/.test(dDbg.root));
  check("v1-Code-Anzeige XXXX-XXXX", (await d.page.textContent("#groupCode")) === `${v1code.slice(0, 4)}-${v1code.slice(4)}`);
  await d.page.click("#menuButton");
  check("Menue-Hinweis auf kurzen Code", (await d.page.textContent("#menuInfo")).includes("kurzen Code"));
  await d.page.click("#menuClose");
  const e = await phone("E", 52.515, 13.415);
  await withBroker(e.page);
  await join(e.page, `${v1code.slice(0, 4).toLowerCase()}-${v1code.slice(4)}`, "Emil", true);
  await d.page.waitForFunction(() => document.querySelectorAll(".member-item").length === 2, null, { timeout: 15000 });
  const eSession = await session(e.page);
  await rawPublish(`${dDbg.root}/${eSession.memberId}`, "");
  await d.page.waitForFunction(() => document.querySelectorAll(".member-item").length === 1, null, { timeout: 5000 }).then(() => check("v1: leere Nachricht entfernt Mitglied (Altverhalten)", true)).catch(() => check("v1: leere Nachricht entfernt Mitglied (Altverhalten)", false));
  await e.page.click("#menuButton");
  await e.page.click("#menuLeave");
  await e.page.waitForSelector("#dialog:not([hidden])");
  await e.page.click("#dialogOk");
  await e.page.waitForSelector("#setupView:not([hidden])", { timeout: 10000 });

  // 11. Broker zuruecksetzen
  await a.page.click("#menuButton");
  await a.page.click("#menuBrokerReset");
  await a.page.waitForTimeout(500);
  check("Zuruecksetzen loescht gespeicherten Broker", (await stored(a.page)) === null);
  await a.page.click("#menuButton");
  check("Menue zeigt Standard-Dienst", (await a.page.textContent("#menuBroker")).includes("Standard") && !(await a.page.isVisible("#menuBrokerReset")));
  await a.page.click("#menuClose");
}
