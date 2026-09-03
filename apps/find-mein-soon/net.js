// Netzschicht von Find Mein Soon: serverlos ueber einen oeffentlichen MQTT-Broker.
// Aus dem Gruppencode werden ein AES-Schluessel und eine Themen-ID abgeleitet. Jedes Mitglied veroeffentlicht
// seinen verschluesselten Zustand als "retained" Nachricht unter <root>/<memberId>; Gruppendaten (Name,
// Treffpunkt) liegen unter <root>/meta. Neue Mitglieder bekommen so sofort den letzten Stand aller anderen.
//
// Die Schicht kennt keine Oberflaeche: Aenderungen und Statuswechsel gehen ueber die `hooks` nach oben.
import { deriveGroupSecrets, encrypt, decrypt, randomId } from "./crypto.js";
import { brokerHost } from "./format.js";
import { PROTOCOL_VERSION, MEMBER_EXPIRY_S, META_EXPIRY_S, TOMBSTONE_EXPIRY_S, topicRoot, farewell, sanitizeMember, sanitizeMeeting, cleanText } from "./protocol.js";

export const RETRY_DELAYS_MS = [5000, 10000, 30000, 60000];
export const PRIMARY_PROBE_MS = 60000;
export const ABORTED = "fms-aborted";

/**
 * hooks:
 *  brokers()        -> Liste der Broker-Adressen in Reihenfolge
 *  getSession()     -> aktuelle Sitzung ({ code, memberId, ... }) oder null
 *  getSelf()        -> eigener Mitgliedseintrag (wird verschluesselt gesendet) oder null, wenn gerade nichts gesendet werden soll
 *  isLeaving()      -> true, waehrend die Gruppe verlassen wird
 *  onChange()       -> Mitglieder oder Gruppendaten haben sich geaendert
 *  onStatus()       -> Verbindungsstatus hat sich geaendert
 *  onConnected()    -> Verbindung steht (eigener Stand soll raus)
 *  onProtocolHint() -> ein Mitglied nutzt ein neueres Protokoll
 */
export function createNet(hooks) {
  const net = {
    client: null,
    key: null,
    protocol: 0,
    root: null,
    connected: false,
    connecting: false,
    members: new Map(),
    meta: null,
    brokers: [],
    brokerIndex: -1,
    retryTimer: null,
    retryCount: 0,
    probeTimer: null,
    lastAck: 0,
    failReason: "",
    resyncTimer: null,
    generation: 0,
    probing: false,
    lastConnectAt: 0,
    // Hoechste je gesehene Zaehlnummer je Absender (Mitglieder und Gruppendaten): schuetzt davor, dass jemand eine
    // alte, mitgeschnittene Nachricht erneut einspielt. Ueberlebt resetNet und wird mit der Sitzung gespeichert.
    seen: new Map(),
    metaFresh: false
  };
  let protoHintShown = false;

  function persistSeen() {
    if (!hooks.persistSeen) return;
    const cutoff = Date.now() - MEMBER_EXPIRY_S * 1000;
    // Nach unserer eigenen Uhr aufraeumen, nicht nach der des Absenders.
    for (const [key, mark] of net.seen) if (!mark || !(mark.at > cutoff)) net.seen.delete(key);
    hooks.persistSeen(Object.fromEntries(net.seen));
  }

  /**
   * Wiedereinspiel-Schutz. Jede Nachricht traegt eine Zaehlnummer, die beim Absender nur steigt: kleinere Nummern
   * sind Wiederholungen und werden verworfen, gleiche sind die retained Kopie nach einem Wiederverbinden.
   * Bewusst nicht die Uhrzeit: springt die Uhr eines Handys zurueck, waere es sonst minutenlang stumm.
   * Nachrichten ohne Zaehlnummer stammen aus einer aelteren App-Version; fuer sie gilt wie frueher nur die
   * Reihenfolge des Absenders (undefined = kein Schutz moeglich, null = verwerfen).
   */
  function replayMark(key, data) {
    const seq = Number(data.seq);
    if (!Number.isFinite(seq) || seq <= 0) return undefined;
    const known = net.seen.get(key);
    if (known && Number.isFinite(known.seq) && seq < known.seq) return null;
    return { seq, ts: Number(data.ts || 0), at: Date.now() };
  }

  function rememberMark(key, mark) {
    if (!mark) return;
    net.seen.set(key, mark);
    persistSeen();
  }

  function nextSeq() {
    return hooks.nextSeq ? hooks.nextSeq() : 0;
  }

  /**
   * Stellt die Verbindung her und versucht es bei Fehlern mit wachsendem Abstand weiter.
   * Wird beim Start, bei "online", beim Sichtbarwerden und von "Neu verbinden" aufgerufen.
   */
  function ensureConnected(delayMs) {
    if (!hooks.getSession() || net.client || net.connecting) return;
    clearTimeout(net.retryTimer);
    net.retryTimer = setTimeout(async () => {
      const session = hooks.getSession();
      if (!session || net.client || net.connecting) return;
      net.connecting = true;
      hooks.onStatus();
      let retryIn = -1;
      try {
        await connectGroup(session);
        net.retryCount = 0;
        net.failReason = "";
        hooks.onConnected();
      } catch (error) {
        if (error && error.message === ABORTED) {
          // Jemand hat die Verbindung waehrend des Versuchs neu gestartet oder die Gruppe verlassen.
          retryIn = hooks.getSession() ? 0 : -1;
        } else {
          net.failReason = error.message || "Keine Verbindung.";
          retryIn = RETRY_DELAYS_MS[Math.min(net.retryCount, RETRY_DELAYS_MS.length - 1)];
          net.retryCount++;
        }
      } finally {
        net.connecting = false;
        hooks.onStatus();
      }
      if (retryIn >= 0 && hooks.getSession() && !net.client) ensureConnected(retryIn);
    }, Math.max(0, delayMs || 0));
  }

  /**
   * Verbindet mit dem ersten erreichbaren Broker. Der Haupt-Broker wird mehrfach versucht, damit alle
   * Mitglieder moeglichst beim selben Dienst landen. Landet man doch auf einem Ersatz, wird regelmaessig
   * zurueck zum Haupt-Broker gewechselt (probePrimary).
   */
  async function connectGroup(session) {
    if (typeof globalThis.mqtt === "undefined") throw new Error("Die Netzwerk-Bibliothek konnte nicht geladen werden.");
    resetNet();
    const generation = net.generation;
    const secrets = await deriveGroupSecrets(session.code);
    if (generation !== net.generation) throw new Error(ABORTED);
    net.key = secrets.key;
    net.protocol = secrets.version;
    net.root = topicRoot(secrets);
    net.members = new Map();
    net.meta = null;
    net.metaFresh = false;
    // Gespeicherte Zeitstempel der Sitzung uebernehmen (leer bei einer neuen Gruppe).
    // Nur die Marken dieser Gruppe uebernehmen (bei einer neuen Gruppe faengt der Schutz von vorne an).
    const stored = hooks.loadSeen ? hooks.loadSeen(session) : null;
    net.seen = new Map(Object.entries(stored || {})
      .filter(([, mark]) => mark && typeof mark === "object" && Number.isFinite(Number(mark.seq)))
      .map(([key, mark]) => [key, { seq: Number(mark.seq), ts: Number(mark.ts) || 0, at: Number(mark.at) || 0 }]));
    net.brokers = hooks.brokers();

    let lastError = null;
    for (let index = 0; index < net.brokers.length; index++) {
      const attempts = index === 0 ? 2 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        let client = null;
        try {
          client = await connectBroker(net.brokers[index], session);
        } catch (error) {
          lastError = error;
        }
        if (generation !== net.generation) {
          // Waehrenddessen wurde neu verbunden oder die Gruppe verlassen: diesen Versuch verwerfen.
          if (client) { try { client.end(true); } catch {} }
          throw new Error(ABORTED);
        }
        if (client) {
          net.client = client;
          net.brokerIndex = index;
          net.connected = true;
          net.lastConnectAt = Date.now();
          hooks.onStatus();
          if (index > 0) startPrimaryProbe(session);
          return;
        }
      }
    }
    if (navigator.onLine) {
      throw new Error("Kein Verbindungsdienst erreichbar. Dieses WLAN blockiert vermutlich die Verbindung, probiere mobile Daten.");
    }
    throw new Error(lastError?.message || "Keine Verbindung. Prüfe dein Internet.");
  }

  function startPrimaryProbe(session) {
    clearInterval(net.probeTimer);
    const timer = setInterval(async () => {
      if (!net.client || net.brokerIndex <= 0 || net.connecting || net.probing) return;
      const current = net.client;
      const root = net.root;
      const generation = net.generation;
      net.probing = true;
      let primary = null;
      try {
        primary = await connectBroker(net.brokers[0], session);
      } catch {
        // Haupt-Broker weiterhin nicht erreichbar, spaeter erneut probieren.
      } finally {
        net.probing = false;
      }
      if (!primary) return;
      if (net.client !== current || net.root !== root || generation !== net.generation || !hooks.getSession()) {
        // Inzwischen neu verbunden oder Gruppe verlassen: Probe-Verbindung verwerfen.
        try { primary.end(true); } catch {}
        return;
      }
      // Umzug zum Haupt-Broker: alte Verbindung schliessen, Mitglieder aus den retained Nachrichten neu aufbauen.
      net.client = primary;
      net.brokerIndex = 0;
      net.connected = true;
      net.lastConnectAt = Date.now();
      try { current.end(true); } catch {}
      if (net.probeTimer === timer) {
        clearInterval(timer);
        net.probeTimer = null;
      }
      net.metaFresh = false;
      scheduleResync();
      publishSelf().catch(() => {});
      hooks.onStatus();
    }, PRIMARY_PROBE_MS);
    net.probeTimer = timer;
  }

  function connectBroker(url, session, protocolVersion = 5) {
    return new Promise((resolve, reject) => {
      const options = {
        clientId: `fms-${randomId(8)}`,
        clean: true,
        keepalive: 30,
        connectTimeout: 8000,
        reconnectPeriod: 3000,
        protocolVersion
      };
      const client = globalThis.mqtt.connect(url, options);
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { client.end(true); } catch {}
        const message = String(error?.message || "");
        if (protocolVersion === 5 && /protocol/i.test(message)) {
          // Broker kann kein MQTT 5: mit Version 3.1.1 erneut versuchen.
          connectBroker(url, session, 4).then(resolve, reject);
          return;
        }
        reject(new Error(`Verbindung zu ${brokerHost(url)} fehlgeschlagen${message ? ` (${message})` : ""}.`));
      };
      const timer = setTimeout(() => fail(new Error("Zeitüberschreitung")), 10000);

      client.on("connect", () => {
        if (settled) {
          if (net.client !== client) return; // verwaister Client (Probe/abgebrochener Versuch): ignorieren
          // Reconnect: bei clean=true muss neu abonniert und der eigene Stand erneut gesendet werden.
          net.connected = true;
          net.lastConnectAt = Date.now();
          net.metaFresh = false;
          client.subscribe(`${net.root}/#`, { qos: 1 });
          scheduleResync();
          publishSelf().catch(() => {});
          hooks.onStatus();
          return;
        }
        client.subscribe(`${net.root}/#`, { qos: 1 }, error => {
          clearTimeout(timer);
          if (error) {
            fail(error);
            return;
          }
          settled = true;
          resolve(client);
        });
      });
      client.on("message", (topic, payload, packet) => {
        if (net.client === client || !settled) handleMessage(topic, payload, packet);
      });
      client.on("error", error => {
        if (!settled) fail(error);
      });
      client.on("close", () => {
        if (!settled) {
          // Verbindung ohne CONNACK geschlossen: Broker kann vermutlich kein MQTT 5, oder er ist nicht erreichbar.
          fail(new Error(protocolVersion === 5 ? "protocol version rejected" : "Verbindung geschlossen"));
          return;
        }
        if (net.client === client) {
          net.connected = false;
          hooks.onStatus();
          // Watchdog: haengt der Broker laenger als eine Minute, obwohl Internet da ist, die Liste neu durchgehen.
          if (navigator.onLine && hooks.getSession() && !hooks.isLeaving() && Date.now() - net.lastConnectAt > 60000) {
            disconnectNet();
            ensureConnected(0);
          }
        }
      });
      client.on("offline", () => {
        if (net.client === client) {
          net.connected = false;
          hooks.onStatus();
        }
      });
    });
  }

  /**
   * Nach einem Wiederverbinden liefert der Broker alle retained Eintraege sofort erneut. Wer danach nicht
   * wieder auftaucht, hat die Gruppe inzwischen verlassen und wird aus der Liste entfernt.
   */
  function scheduleResync() {
    const started = Date.now();
    clearTimeout(net.resyncTimer);
    net.resyncTimer = setTimeout(() => {
      let changed = false;
      for (const [id, member] of net.members) {
        if ((member.receivedAt || 0) < started) {
          net.members.delete(id);
          changed = true;
        }
      }
      if (changed) hooks.onChange();
      // Gruppendaten nur dann erneut senden, wenn der Broker nach dem Wiederverbinden keine (neueren) geliefert hat;
      // sonst wuerde ein zurueckkehrendes Handy einen inzwischen geaenderten Treffpunkt fuer alle zuruecksetzen.
      if (!net.metaFresh && net.meta && net.client && net.connected) {
        publish(`${net.root}/meta`, net.meta, META_EXPIRY_S).catch(() => {});
      }
    }, 5000);
  }

  /** Trennt die aktuelle Verbindung und macht laufende Versuche ungueltig (Generation), ohne den Retry-Zustand zu beruehren. */
  function resetNet() {
    net.generation++;
    if (net.client) {
      try { net.client.end(true); } catch {}
    }
    clearInterval(net.probeTimer);
    clearTimeout(net.resyncTimer);
    net.probeTimer = null;
    net.resyncTimer = null;
    net.client = null;
    net.connected = false;
    net.key = null;
    net.protocol = 0;
    net.root = null;
    net.members = new Map();
    net.meta = null;
    net.metaFresh = false;
    net.seen = new Map(); // Marken liegen in der Sitzung und werden beim Verbinden wieder geladen
    net.brokerIndex = -1;
    net.lastAck = 0;
  }

  /** Vollstaendiges Trennen (Gruppe verlassen, "Neu verbinden"). Ein laufender Verbindungsversuch bricht sich selbst ab. */
  function disconnectNet() {
    resetNet();
    clearTimeout(net.retryTimer);
    net.retryTimer = null;
    net.failReason = "";
    hooks.onStatus();
  }

  async function handleMessage(topic, payload, packet) {
    if (!net.root || !topic.startsWith(`${net.root}/`)) return;
    const sub = topic.slice(net.root.length + 1);
    if (!/^[a-z0-9]+$/.test(sub)) return;
    if (!payload || !payload.length) {
      // Leere retained Nachricht. Nur im alten Protokoll heisst das "hat verlassen". In v2 zaehlt allein die
      // verschluesselte Abschiedsnachricht, sonst koennte jeder, der die Themen-ID sieht, Mitglieder von der Karte nehmen.
      if (net.protocol === 1 && sub !== "meta" && net.members.delete(sub)) hooks.onChange();
      return;
    }
    let data;
    try {
      data = await decrypt(net.key, net.protocol, payload, topic);
    } catch {
      return; // fremde, beschaedigte oder auf ein anderes Thema kopierte Nachricht
    }
    if (!data || typeof data !== "object") return;
    if (Number(data.proto) > PROTOCOL_VERSION && !protoHintShown) {
      protoHintShown = true;
      hooks.onProtocolHint();
    }

    if (sub === "meta") {
      // Gruppendaten: Der Schutz gilt je schreibendem Mitglied. Zwischen verschiedenen Schreibern zaehlt weiter die
      // Reihenfolge des Dienstes, sonst wuerde die vorgehende Uhr eines Handys die Aenderungen aller anderen verwerfen.
      const by = /^[a-z0-9]{1,32}$/.test(String(data.by || "")) ? String(data.by) : "?";
      const mark = replayMark(`meta:${by}`, data);
      if (mark === null) return;
      rememberMark(`meta:${by}`, mark);
      net.metaFresh = true;
      net.meta = {
        name: cleanText(data.name, 40) || net.meta?.name || null,
        meetingPoint: sanitizeMeeting(data.meetingPoint),
        ts: Number(data.ts || 0),
        by,
        seq: mark ? mark.seq : 0
      };
    } else {
      if (sub === hooks.getSession()?.memberId) return; // eigener Eintrag: der lokale Zustand ist aktueller
      const existing = net.members.get(sub);
      const mark = replayMark(sub, data);
      if (mark === null) return;
      if (data.left === true) {
        // Abschiedsnachricht (v2): gilt nur, wenn sie nicht aelter als der bekannte Stand ist.
        if (mark === undefined && existing && Number(data.ts || 0) < existing.ts) return;
        rememberMark(sub, mark);
        if (!existing) return;
        net.members.delete(sub);
        hooks.onChange();
        return;
      }
      const member = sanitizeMember(sub, data);
      // Ohne Zaehlnummer (alte App-Version) gilt wie frueher die Reihenfolge des Absenders.
      if (mark === undefined && existing && member.ts < existing.ts) return;
      // Uhrenversatz nur aus Live-Nachrichten ableiten; retained Nachrichten koennen beliebig alt sein.
      member.skew = packet && !packet.retain && member.ts ? Date.now() - member.ts : (existing ? existing.skew : undefined);
      net.members.set(sub, member);
      rememberMark(sub, mark);
    }
    hooks.onChange();
  }

  async function publishSelf() {
    const self = hooks.getSelf();
    if (!net.client || !self) return;
    await publish(`${net.root}/${self.id}`, { ...self, ts: Date.now(), seq: nextSeq() }, MEMBER_EXPIRY_S);
  }

  async function leaveNet() {
    const session = hooks.getSession();
    if (!net.client || !session || !net.connected) return false;
    const topic = `${net.root}/${session.memberId}`;
    if (net.protocol === 1) {
      // Altes Protokoll: leere retained Nachricht loescht den eigenen Eintrag beim Broker.
      return new Promise(resolve => net.client.publish(topic, "", { qos: 1, retain: true }, error => resolve(!error)));
    }
    // v2: verschluesselte Abschiedsnachricht, die nur mit dem Gruppenschluessel entstehen kann. Sie ersetzt den
    // eigenen Eintrag beim Broker und verfaellt von selbst.
    try {
      await publish(topic, { ...farewell(), seq: nextSeq() }, TOMBSTONE_EXPIRY_S);
      if (net.client.options?.protocolVersion !== 5) {
        // Ohne MQTT 5 gibt es keine Ablaufzeit: den retained Platz zusaetzlich leeren, damit beim Broker nichts liegen bleibt.
        // (Live-Mitglieder haben die Abschiedsnachricht schon; leere Nachrichten werden in v2 ignoriert.)
        await new Promise(resolve => net.client.publish(topic, "", { qos: 1, retain: true }, () => resolve()));
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Sendet verschluesselt und retained. Ohne Verbindung wird nichts gepuffert: nach dem Verbinden geht der aktuelle Stand raus. */
  async function publish(topic, data, expirySeconds) {
    if (!net.client || !net.connected) return;
    const body = await encrypt(net.key, net.protocol, data, topic);
    const client = net.client;
    const options = { qos: 1, retain: true };
    if (client.options?.protocolVersion === 5 && expirySeconds) options.properties = { messageExpiryInterval: expirySeconds };
    return new Promise((resolve, reject) => {
      client.publish(topic, body, options, error => {
        if (error) {
          reject(error);
          return;
        }
        net.lastAck = Date.now();
        hooks.onStatus();
        resolve();
      });
    });
  }

  net.ensureConnected = ensureConnected;
  net.connectGroup = connectGroup;
  net.disconnect = disconnectNet;
  net.reset = resetNet;
  net.publish = publish;
  net.publishSelf = publishSelf;
  net.leave = leaveNet;
  return net;
}
