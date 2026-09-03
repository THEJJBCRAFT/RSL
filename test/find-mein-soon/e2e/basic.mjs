// Zwei-Handy-Test der serverlosen Variante ueber einen lokalen MQTT-Broker.
// Wird von run.mjs mit gemeinsamem Browser, Broker und Webserver aufgerufen; `errors` sammelt Fehler.
export const title = "Grundablauf: erstellen, beitreten, Alarm, Treffpunkt, verlassen";

export default async function run({ browser, errors, base, broker, devices, mqtt, startBroker, out }) {
  const check = (label, ok) => { console.log(`${ok ? "OK " : "FAIL"} ${label}`); if (!ok) errors.push(`check failed: ${label}`); };
  // Der Broker-Link (?broker=…) fragt in der App nach; im Test wird er bestaetigt.
  const acceptBroker = async page => { try { await page.waitForSelector("#dialog:not([hidden])", { timeout: 2500 }); if ((await page.textContent("#dialogTitle")).includes("Verbindungsdienst")) await page.click("#dialogOk"); } catch {} };
  void check; void acceptBroker; void devices; void mqtt; void startBroker; void out;

  const phone = async (device, lat, lng, name, ua) => {
    const ctx = await browser.newContext({
      ...devices[device],
      ...(ua ? { userAgent: devices[device].userAgent + ua } : {}),
      geolocation: { latitude: lat, longitude: lng, accuracy: 15 },
      permissions: ["geolocation"],
      locale: "de-DE"
    });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`${name}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" && !/ERR_TUNNEL|tile\.openstreetmap/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
    return { ctx, page };
  };

  // Handy 1 erstellt die Gruppe
  const a = await phone("Pixel 7", 52.52, 13.405, "A");
  await a.page.goto(`${base}?broker=${encodeURIComponent(broker)}`); await acceptBroker(a.page);
  await a.page.fill("#setupName", "Jaro");
  await a.page.fill("#setupGroupName", "Familie");
  await a.page.click("#setupSubmit");
  await a.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  const code = await a.page.textContent("#groupCode");
  console.log("code:", code, "laenge", code.length);
  await a.page.waitForTimeout(1500);
  console.log("A netDot:", await a.page.getAttribute("#netDot", "class"), "| group:", await a.page.textContent("#groupName"));

  // Handy 2 tritt ueber den Link bei (falscher Code zuerst)
  const b = await phone("iPhone 13", 52.5163, 13.3777, "B");
  await b.page.goto(`${base}?broker=${encodeURIComponent(broker)}#join=${code}`); await acceptBroker(b.page);
  console.log("B prefilled:", await b.page.inputValue("#setupCode"));
  await b.page.fill("#setupName", "Delta");
  await b.page.click("#setupSubmit");
  await b.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await b.page.waitForFunction(() => document.querySelectorAll(".member-item").length >= 2, null, { timeout: 15000 });
  await b.page.waitForTimeout(1500);
  console.log("B group name (retained meta):", await b.page.textContent("#groupName"));
  console.log("B members:", await b.page.$$eval(".member-item", items => items.map(i => i.innerText.replace(/\n/g, " | "))));
  await a.page.waitForFunction(() => document.querySelectorAll(".member-item").length >= 2, null, { timeout: 15000 });
  await a.page.waitForTimeout(500);
  console.log("A members:", await a.page.$$eval(".member-item", items => items.map(i => i.innerText.replace(/\n/g, " | "))));
  await a.page.screenshot({ path: `${out}/m1-a-two.png` });

  // B: Alarm
  await b.page.click("#sosButton");
  await b.page.waitForSelector("#dialog:not([hidden])"); await b.page.click("#dialogOk");
  await b.page.waitForFunction(() => document.getElementById("dialog").hidden);
  await b.page.click("#ownAlertMessage"); await b.page.waitForSelector("#dialog:not([hidden])"); await b.page.fill("#dialogInput", "Bin am Bahnhof!"); await b.page.click("#dialogOk");
  await a.page.waitForSelector("#alertBanner:not([hidden])", { timeout: 15000 });
  console.log("A alert:", await a.page.textContent("#alertTitle"), "|", await a.page.textContent("#alertText"));
  await a.page.screenshot({ path: `${out}/m2-a-alert.png` });

  // A: Treffpunkt auf Karte
  await a.page.click("#meetingButton");
  await a.page.click("#map", { position: { x: 200, y: 200 } });
  await a.page.waitForSelector("#dialog:not([hidden])"); await a.page.fill("#dialogInput", "Treffpunkt Alex"); await a.page.click("#dialogOk");
  await b.page.waitForSelector("#meetingLine:not([hidden])", { timeout: 15000 });
  console.log("B meeting:", await b.page.textContent("#meetingLabel"));

  // B: Alarm beenden -> A Banner weg
  await b.page.click("#sosButton");
  await b.page.waitForSelector("#dialog:not([hidden])"); await b.page.click("#dialogOk");
  await a.page.waitForFunction(() => document.getElementById("alertBanner").hidden, null, { timeout: 15000 });
  console.log("A alert cleared");

  // A: Name aendern -> B sieht neuen Namen
  await a.page.click("#menuButton");
  await a.page.click("#menuRename");
  await a.page.waitForSelector("#dialog:not([hidden])"); await a.page.fill("#dialogInput", "Jaro Neu"); await a.page.click("#dialogOk");
  await b.page.waitForFunction(() => [...document.querySelectorAll(".member-name")].some(n => n.textContent.includes("Jaro Neu")), null, { timeout: 15000 });
  console.log("B sieht Umbenennung");

  // A: Neuladen -> Sitzung + Gruppe bleiben, B weiterhin sichtbar (retained)
  await a.page.reload();
  await a.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await a.page.waitForFunction(() => document.querySelectorAll(".member-item").length >= 2, null, { timeout: 15000 });
  console.log("A nach Reload:", await a.page.textContent("#groupName"), "|", await a.page.$$eval(".member-item", items => items.length), "Mitglieder");

  // Handy 3 (Android-Huelle-UA) tritt spaeter bei und sieht sofort beide (retained)
  const c = await phone("Pixel 7", 52.50, 13.40, "C", " FindMeinSoonApp/2.0.0");
  await c.page.goto(`${base}?broker=${encodeURIComponent(broker)}`); await acceptBroker(c.page);
  await c.page.click("[data-mode=join]");
  await c.page.fill("#setupName", "Chaos");
  await c.page.fill("#setupCode", code.toLowerCase());
  await c.page.click("#setupSubmit");
  await c.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await c.page.waitForFunction(() => document.querySelectorAll(".member-item").length >= 3, null, { timeout: 15000 });
  console.log("C members:", await c.page.$$eval(".member-item", items => items.map(i => i.innerText.split("\n")[1])));
  console.log("C sw registered:", await c.page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration())));
  await c.page.click("#menuButton");
  console.log("C website link:", await c.page.$eval("#menu a.link-button", a => a.href));
  await c.page.click("#menuClose");
  await c.page.screenshot({ path: `${out}/m3-c-three.png` });

  // Falscher Code: Gruppe ist leer (nur man selbst), kein Absturz
  const d = await phone("Pixel 7", 52.5, 13.4, "D");
  await d.page.goto(`${base}?broker=${encodeURIComponent(broker)}`); await acceptBroker(d.page);
  await d.page.click("[data-mode=join]");
  await d.page.fill("#setupName", "Fremd");
  await d.page.fill("#setupCode", "ZZZZZZZZ");
  await d.page.click("#setupSubmit");
  await d.page.waitForSelector("#setupForce:not([hidden])", { timeout: 20000 });
  console.log("D (falscher Code) Fehler:", (await d.page.textContent("#setupError")).slice(0, 40));
  await d.page.click("#setupForce");
  await d.page.waitForSelector("#mainView:not([hidden])", { timeout: 20000 });
  await d.page.waitForTimeout(1500);
  console.log("D (falscher Code) members:", await d.page.$$eval(".member-item", items => items.length));

  // B verlaesst -> A und C sehen B nicht mehr
  await b.page.click("#menuButton");
  await b.page.click("#menuLeave");
  await b.page.waitForSelector("#dialog:not([hidden])"); await b.page.click("#dialogOk");
  await b.page.waitForSelector("#setupView:not([hidden])", { timeout: 10000 });
  await a.page.waitForFunction(() => ![...document.querySelectorAll(".member-name")].some(n => n.textContent.includes("Delta")), null, { timeout: 15000 });
  console.log("A: Delta entfernt nach Verlassen");
}
