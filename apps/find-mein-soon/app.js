// Oberflaeche und Ablauf von Find Mein Soon. Verschluesselung, Protokoll, Netz, Standort und Karte liegen in eigenen Modulen.
import { CODE_LENGTH, LEGACY_CODE_LENGTH, CODE_ALPHABET, newGroupCode, formatCode, extractCode, randomId, clearSecretsCache } from "./crypto.js";
import { PROTOCOL_VERSION, MEMBER_MAX_AGE_MS, META_EXPIRY_S, colorFor, memberTime, isOffline } from "./protocol.js";
import { distanceMeters, formatDistance, formatClock, formatAgo, initials, parseUntil, brokerHost, validBrokerUrl } from "./format.js";
import { createNet, ABORTED } from "./net.js";
import { createGeo } from "./geo.js";
import { createMap } from "./map.js";

(() => {
  const STORAGE_KEY = "findMeinSoon.session";
  const BROKER_KEY = "findMeinSoon.broker";
  // Oeffentliche Adresse der Web-App fuer Einladungslinks (die Android-App laedt die Seite aus dem APK).
  const PUBLIC_APP_URL = "https://thejjbcraft.github.io/RSL/apps/find-mein-soon/";
  // Oeffentliche, kostenlose MQTT-Broker. Alle Mitglieder nutzen den ersten erreichbaren in dieser Reihenfolge.
  // Die Daten sind Ende-zu-Ende verschluesselt; der Broker sieht nur Zufallsdaten.
  const BROKERS = [
    "wss://broker.hivemq.com:8884/mqtt",
    "wss://broker.emqx.io:8084/mqtt",
    "wss://test.mosquitto.org:8081"
  ];
  const ALARM_REPEAT_MS = 15000;
  const POLL_MS = 8000;
  const MIN_UPLOAD_GAP_MS = 6000;
  // Die Android-App (android/find-mein-soon) haengt diesen Marker an den User-Agent.
  const isNativeApp = /FindMeinSoonApp\//.test(navigator.userAgent);
  // iPads ab iPadOS 13 melden sich als Mac, sind aber an den Touchpunkten erkennbar.
  const isIos = (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) && !window.MSStream;
  const isAndroid = /Android/i.test(navigator.userAgent);
  // Bruecke zur Android-App (Vordergrund-Dienst, Benachrichtigungen, Teilen). Im Browser nicht vorhanden.
  const nativeBridge = typeof window.FindMeinSoonNative === "object" && window.FindMeinSoonNative ? window.FindMeinSoonNative : null;
  const NOTIFY_DISMISS_KEY = "findMeinSoon.notifyDismissed";
  const DEFAULT_ALERT_MESSAGE = "Ich finde euch nicht. Bitte kommt zu mir!";
  const APP_VERSION = String(self.FMS_VERSION || "0.0.0"); // aus version.js (eine Quelle fuer App, Service Worker und Cache)
  const MAP_STYLE_KEY = "findMeinSoon.mapStyle";
  const UPDATE_CHECK_KEY = "findMeinSoon.updateCheck";
  const IOS_HINT_KEY = "findMeinSoon.iosHintDismissed";
  const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
  const RELEASE_API_URL = "https://api.github.com/repos/THEJJBCRAFT/RSL/releases/tags/find-mein-soon-latest";
  const APK_URL = "https://github.com/THEJJBCRAFT/RSL/releases/download/find-mein-soon-latest/FindMeinSoon.apk";
  const ANDROID_PACKAGE = "de.redstonelabs.findmeinsoon";
  const LOW_BATTERY = 20;
  const APPROX_ACCURACY_M = 200;

  const $ = id => document.getElementById(id);
  const el = {
    setupView: $("setupView"),
    mainView: $("mainView"),
    setupForm: $("setupForm"),
    setupName: $("setupName"),
    setupGroupName: $("setupGroupName"),
    setupCode: $("setupCode"),
    groupNameField: $("groupNameField"),
    codeField: $("codeField"),
    setupError: $("setupError"),
    setupSubmit: $("setupSubmit"),
    segmented: document.querySelector(".segmented"),
    installCard: $("installCard"),
    installHint: $("installHint"),
    installButton: $("installButton"),
    apkCard: $("apkCard"),
    menuInstall: $("menuInstall"),
    topbarSub: $("topbarSub"),
    netDot: $("netDot"),
    menuButton: $("menuButton"),
    menu: $("menu"),
    menuInfo: $("menuInfo"),
    menuRename: $("menuRename"),
    menuPrivacy: $("menuPrivacy"),
    menuLeave: $("menuLeave"),
    menuRenew: $("menuRenew"),
    menuBroker: $("menuBroker"),
    menuBrokerReset: $("menuBrokerReset"),
    menuClose: $("menuClose"),
    privacy: $("privacy"),
    privacyClose: $("privacyClose"),
    alertBanner: $("alertBanner"),
    alertTitle: $("alertTitle"),
    alertText: $("alertText"),
    alertNavigate: $("alertNavigate"),
    map: $("map"),
    mapFallback: $("mapFallback"),
    centerButton: $("centerButton"),
    fitButton: $("fitButton"),
    pickHint: $("pickHint"),
    pickCancel: $("pickCancel"),
    geoStatus: $("geoStatus"),
    sheet: $("sheet"),
    sheetHandle: $("sheetHandle"),
    groupName: $("groupName"),
    groupCode: $("groupCode"),
    netStatus: $("netStatus"),
    setupForce: $("setupForce"),
    menuReconnect: $("menuReconnect"),
    alertMute: $("alertMute"),
    alertRespond: $("alertRespond"),
    ownAlert: $("ownAlert"),
    ownAlertText: $("ownAlertText"),
    ownAlertMessage: $("ownAlertMessage"),
    ownAlertEnd: $("ownAlertEnd"),
    notifyCard: $("notifyCard"),
    notifyTitle: $("notifyTitle"),
    notifyText: $("notifyText"),
    notifyAllow: $("notifyAllow"),
    notifyLater: $("notifyLater"),
    dialog: $("dialog"),
    dialogTitle: $("dialogTitle"),
    dialogText: $("dialogText"),
    dialogInput: $("dialogInput"),
    dialogOk: $("dialogOk"),
    dialogCancel: $("dialogCancel"),
    shareButton: $("shareButton"),
    sosButton: $("sosButton"),
    shareToggle: $("shareToggle"),
    meetingButton: $("meetingButton"),
    meetingState: $("meetingState"),
    meetingLine: $("meetingLine"),
    meetingLabel: $("meetingLabel"),
    meetingNavigate: $("meetingNavigate"),
    meetingClear: $("meetingClear"),
    memberList: $("memberList"),
    toast: $("toast"),
    geoCard: $("geoCard"),
    geoCardText: $("geoCardText"),
    geoAllow: $("geoAllow"),
    geoSettings: $("geoSettings"),
    shareSheet: $("shareSheet"),
    shareSheetCode: $("shareSheetCode"),
    shareQr: $("shareQr"),
    shareSend: $("shareSend"),
    shareClose: $("shareClose"),
    openInAppCard: $("openInAppCard"),
    openInAppLink: $("openInAppLink"),
    updateCard: $("updateCard"),
    updateText: $("updateText"),
    updateLink: $("updateLink"),
    updateLater: $("updateLater"),
    iosCard: $("iosCard"),
    iosCardCode: $("iosCardCode"),
    iosCopy: $("iosCopy"),
    iosLater: $("iosLater"),
    zoomIn: $("zoomIn"),
    zoomOut: $("zoomOut"),
    mapStyle: $("mapStyle"),
    menuVersion: $("menuVersion"),
    menuTimed: $("menuTimed"),
    menuUpdate: $("menuUpdate"),
    legacyCard: $("legacyCard"),
    legacyRenew: $("legacyRenew")
  };

  const state = {
    session: loadSession(),
    group: null,
    mode: "create",
    position: null,
    sharing: true,
    sosActive: false,
    pollTimer: null,
    lastUpload: 0,
    lastUploadPos: null,
    battery: null,
    pickingMeeting: false,
    knownAlerts: new Set(),
    installPrompt: null,
    toastTimer: null,
    alert: null,
    pendingSession: null,
    leaving: false,
    responding: null,
    dialogResolve: null,
    batteryWarned: new Set(),
    ownBatteryWarned: false,
    updateBuild: 0,
    renderQueued: false,
    membersKey: "",
    alertsChecked: false,
    alertKey: "",
    nativeNotifications: null
  };

  // Verbindung zur Gruppe (serverlos ueber einen oeffentlichen MQTT-Broker). Die Netzschicht meldet sich ueber Hooks.
  const net = createNet({
    brokers: brokerList,
    getSession: () => state.session,
    getSelf: () => (state.session && !state.leaving ? buildMe() : null),
    isLeaving: () => state.leaving,
    onChange: scheduleRender,
    onStatus: updateNetDot,
    onConnected: () => uploadLocation(true),
    onProtocolHint: () => toast("Jemand in der Gruppe nutzt eine neuere App-Version. Bitte aktualisiere Find Mein Soon."),
    // Wiedereinspiel-Schutz: Marken gehoeren zur Gruppe, die Zaehlnummer zum eigenen Geraet. Beides ueberlebt Neustarts.
    loadSeen: session => (state.session && session.code === state.session.code ? state.session.seen || {} : null),
    persistSeen: seen => {
      if (!state.session) return;
      state.session.seen = seen;
      saveSession();
    },
    nextSeq
  });

  // Standort: Berechtigung, GPS-Beobachtung, Herzschlag, Stromsparmodus.
  const geo = createGeo({
    nativeBridge,
    isActive: () => Boolean(state.session),
    isSharing: () => state.sharing,
    onStatus: setGeoStatus,
    onCard: showGeoCard,
    onWatchStarted: () => {
      el.geoCard.hidden = true;
      nativeSetSharing(state.sharing);
    },
    onHeartbeat: () => {
      checkSharingTimer();
      uploadLocation(true);
    },
    onPosition: position => {
      state.position = position;
      if (state.group) {
        rebuildGroup(); // eigener Eintrag (Marker, Spur, Entfernungen) sofort aktuell, auch wenn das Senden gedrosselt ist
        renderMarkers();
        renderMembers();
        renderMeeting();
      }
      uploadLocation(false);
    },
    onBattery: level => {
      state.battery = level;
      if (state.group) rebuildGroup();
    }
  });

  // Karte (Leaflet).
  const mapView = createMap(el.map, {
    describe: memberMeta,
    onPick: async (lat, lng) => {
      if (!state.pickingMeeting) return;
      setPicking(false);
      const label = await dialog({ title: "Treffpunkt", text: "Wie soll der Treffpunkt heißen?", input: true, value: "Treffpunkt", ok: "Setzen" });
      if (label === null) return;
      setMeetingPoint(lat, lng, label || "Treffpunkt");
    }
  });

  const audio = { ctx: null, muted: false, repeatTimer: null };

  init();

  // Kleiner Einblick fuer automatische Tests (keine Geheimnisse).
  window.fmsDebug = () => ({
    connected: net.connected,
    connecting: net.connecting,
    broker: net.brokers[net.brokerIndex] || null,
    protocol: net.client?.options?.protocolVersion || null,
    version: net.protocol,
    root: net.root,
    lowPower: geo.lowPower,
    watching: geo.watchId !== null,
    trails: mapView.trailSizes(),
    updateBuild: state.updateBuild,
    members: net.members.size,
    retries: net.retryCount,
    lastAck: net.lastAck
  });

  function init() {
    if (isNativeApp) {
      // Die Seite liegt im APK; der Website-Link muss auf die oeffentliche Adresse zeigen (oeffnet den Browser).
      const siteLink = document.querySelector("#menu a.link-button");
      if (siteLink) siteLink.href = new URL("../../", PUBLIC_APP_URL).href;
    }
    setupInstall();
    setupNetworkIndicator();
    bindDialog();
    bindSetup();
    bindMain();
    registerServiceWorker();

    // Einladungslinks tragen den Code im Fragment (#join=…), aeltere Links im Query. Beides sofort aus der Adresse entfernen.
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const brokerParam = hash.get("broker") || query.get("broker");
    const joinParam = hash.get("join") || query.get("join");
    if (query.toString() || location.hash) history.replaceState(null, "", location.pathname);
    if (joinParam) applyJoinCode(extractCode(joinParam));
    if (brokerParam) offerBrokerOverride(brokerParam);
    // Link in bereits geoeffneter App/PWA: nur das Fragment aendert sich, die Seite laedt nicht neu.
    window.addEventListener("hashchange", () => {
      const params = new URLSearchParams(location.hash.replace(/^#/, ""));
      const join = params.get("join");
      const brokerLink = params.get("broker");
      if (location.hash) history.replaceState(null, "", location.pathname);
      if (join) applyJoinCode(extractCode(join));
      if (brokerLink) offerBrokerOverride(brokerLink);
    });
    setupMapControls();
    el.menuVersion.textContent = appVersionText();
    checkForUpdate();

    // Hooks fuer die Android-App.
    window.fmsNativePosition = (lat, lng, accuracy, speed, heading, time) => {
      geo.handleFix({ coords: { latitude: lat, longitude: lng, accuracy, speed, heading }, timestamp: time });
    };
    window.fmsSetSharing = on => {
      // Nur bei echter Aenderung, sonst pingt Android und Web-App sich gegenseitig an.
      if (state.session && state.sharing !== Boolean(on)) setSharing(Boolean(on));
    };
    // Einladungslink, waehrend die Android-App schon laeuft (onNewIntent).
    window.fmsJoin = code => applyJoinCode(extractCode(code));
    // Antwort der Android-App auf die Standort-Berechtigung.
    window.fmsPermission = granted => {
      if (!state.session) return;
      if (granted) geo.startWatch();
      else showGeoCard("denied");
    };
    // Antwort der Android-App auf die Benachrichtigungs-Berechtigung.
    window.fmsNotifications = granted => {
      state.nativeNotifications = Boolean(granted);
      if (!granted && state.session) showNotifyDeniedCard();
      else if (granted) el.notifyCard.hidden = true;
    };
    window.fmsBack = () => {
      if (state.dialogResolve) {
        state.dialogResolve(null);
        return true;
      }
      if (!el.menu.hidden) {
        openMenu(false);
        return true;
      }
      if (!el.shareSheet.hidden) {
        el.shareSheet.hidden = true;
        return true;
      }
      if (!el.privacy.hidden) {
        el.privacy.hidden = true;
        return true;
      }
      if (state.pickingMeeting) {
        setPicking(false);
        return true;
      }
      return false;
    };

    if (state.session) {
      enterGroup();
    } else {
      showSetup();
    }
  }

  /** Code aus einem Einladungslink anwenden: vorbelegen, Gruppenwechsel anbieten oder Hinweis. */
  function applyJoinCode(code) {
    if (!code) return;
    if (!state.session) {
      showSetup();
      setMode("join");
      el.setupCode.value = formatCode(code);
      showOpenInApp(code);
    } else if (code !== state.session.code) {
      offerGroupSwitch(code);
    } else {
      toast("Du bist schon in dieser Gruppe.");
    }
  }

  /** Einladungslink, waehrend man schon in einer Gruppe ist: wechseln statt schweigen. */
  async function offerGroupSwitch(code) {
    const current = state.group?.name || state.session.groupName || formatCode(state.session.code);
    const go = await dialog({
      title: "Gruppe wechseln?",
      text: `Du bist in "${current}". Diese Gruppe verlassen und der Gruppe mit dem Code ${formatCode(code)} beitreten?`,
      ok: "Wechseln",
      danger: true
    });
    if (!go) return;
    const name = state.session.name;
    await departGroup();
    showSetup();
    setMode("join");
    el.setupName.value = name;
    el.setupCode.value = formatCode(code);
    showOpenInApp(code);
    toast("Tippe auf „Gruppe beitreten“, um zu wechseln.");
  }

  /** Android-Browser: Einladung lieber in der installierten App oeffnen (intent://-Link, sonst APK-Download). */
  function showOpenInApp(code) {
    if (!isAndroid || isNativeApp || !code) return;
    const app = new URL(PUBLIC_APP_URL);
    el.openInAppLink.href = `intent://${app.host}${app.pathname}?join=${formatCode(code)}#Intent;scheme=https;package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(APK_URL)};end`;
    el.openInAppCard.hidden = false;
  }

  function appVersionText() {
    let native = null;
    try { native = nativeBridge && typeof nativeBridge.version === "function" ? String(nativeBridge.version()) : null; } catch {}
    return native ? `App ${native} · Web ${APP_VERSION}` : `Version ${APP_VERSION}`;
  }

  /** Nur die Android-App: einmal am Tag beim GitHub-Release nachsehen, ob es eine neuere APK gibt. */
  async function checkForUpdate() {
    if (!isNativeApp || !nativeBridge || typeof nativeBridge.version !== "function") return;
    let own = 0;
    try { own = Number((String(nativeBridge.version()).match(/(\d+)(?:-\w+)?$/) || [])[1]) || 0; } catch {}
    if (!own) return;
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(UPDATE_CHECK_KEY) || "null"); } catch {}
    let latest = cached && Date.now() - Number(cached.at || 0) < UPDATE_CHECK_INTERVAL_MS ? Number(cached.build) || 0 : 0;
    if (!latest) {
      try {
        const response = await fetch(RELEASE_API_URL, { headers: { Accept: "application/vnd.github+json" } });
        if (!response.ok) return;
        const release = await response.json();
        latest = Number((String(release.name || "").match(/Build (\d+)/) || [])[1]) || 0;
        if (latest) {
          try { localStorage.setItem(UPDATE_CHECK_KEY, JSON.stringify({ at: Date.now(), build: latest })); } catch {}
        }
      } catch {
        return;
      }
    }
    if (latest > own) {
      state.updateBuild = latest;
      el.updateText.textContent = `Neue Version verfügbar (Build ${latest}, du hast Build ${own}).`;
      el.updateLink.href = APK_URL;
      el.updateCard.hidden = false;
      el.menuUpdate.hidden = false;
      el.menuUpdate.href = APK_URL;
    }
  }

  /** Ein Link mit ?broker=… darf den Verbindungsdienst nur nach Rueckfrage wechseln. */
  async function offerBrokerOverride(value) {
    const url = validBrokerUrl(value);
    if (!url) {
      toast("Link ignoriert: Als Verbindungsdienst sind nur verschlüsselte wss://-Adressen erlaubt.");
      return;
    }
    let stored = null;
    try { stored = localStorage.getItem(BROKER_KEY); } catch {}
    if (stored === url) return;
    const ok = await dialog({
      title: "Anderen Verbindungsdienst nutzen?",
      text: `Dieser Link möchte die App mit ${brokerHost(url)} verbinden statt mit dem Standard-Dienst. Alle in deiner Gruppe müssen denselben Dienst nutzen. Nur bestätigen, wenn der Link von jemandem kommt, dem du vertraust.`,
      ok: "Verwenden",
      danger: true
    });
    if (!ok) return;
    try { localStorage.setItem(BROKER_KEY, url); } catch {}
    toast(`Verbindungsdienst: ${brokerHost(url)}`);
    renderBrokerInfo();
    if (state.session) {
      net.disconnect();
      net.ensureConnected(0);
    }
  }

  function renderBrokerInfo() {
    let stored = null;
    try { stored = localStorage.getItem(BROKER_KEY); } catch {}
    el.menuBroker.textContent = stored
      ? `Eigener Verbindungsdienst: ${brokerHost(stored)}`
      : `Verbindungsdienst: ${brokerHost(BROKERS[0])} (Standard, mit Ersatzdiensten)`;
    el.menuBrokerReset.hidden = !stored;
  }

  // ---------- Dialog (ersetzt prompt/confirm) ----------
  function dialog({ title, text = "", input = false, value = "", placeholder = "", ok = "OK", cancel = "Abbrechen", danger = false }) {
    if (state.dialogResolve) state.dialogResolve(null);
    return new Promise(resolve => {
      el.dialogTitle.textContent = title;
      el.dialogText.textContent = text;
      el.dialogText.hidden = !text;
      el.dialogInput.hidden = !input;
      el.dialogInput.value = value;
      el.dialogInput.placeholder = placeholder;
      el.dialogOk.textContent = ok;
      el.dialogOk.classList.toggle("danger", danger);
      el.dialogCancel.hidden = cancel === null;
      el.dialogCancel.textContent = cancel || "Abbrechen";
      el.dialog.hidden = false;
      if (input) setTimeout(() => el.dialogInput.focus(), 60);
      state.dialogResolve = result => {
        el.dialog.hidden = true;
        state.dialogResolve = null;
        resolve(result);
      };
    });
  }

  function bindDialog() {
    el.dialogOk.addEventListener("click", () => {
      if (!state.dialogResolve) return;
      state.dialogResolve(el.dialogInput.hidden ? true : el.dialogInput.value.trim());
    });
    el.dialogCancel.addEventListener("click", () => state.dialogResolve && state.dialogResolve(null));
    el.dialog.addEventListener("click", event => {
      if (event.target === el.dialog && state.dialogResolve) state.dialogResolve(null);
    });
    el.dialogInput.addEventListener("keydown", event => {
      if (event.key === "Enter" && state.dialogResolve) {
        event.preventDefault();
        state.dialogResolve(el.dialogInput.value.trim());
      }
    });
  }

  // ---------- Setup ----------
  function bindSetup() {
    el.segmented.addEventListener("click", event => {
      const button = event.target.closest("button[data-mode]");
      if (button) setMode(button.dataset.mode);
    });

    el.setupCode.addEventListener("input", () => {
      const input = el.setupCode;
      const caret = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, caret).replace(/[^A-Za-z0-9]/g, "").length;
      const formatted = formatCode(extractCode(input.value));
      if (formatted !== input.value) {
        input.value = formatted;
        // Cursor hinter dieselbe Anzahl Zeichen setzen, damit Tippen mitten im Code nicht ans Ende springt.
        let pos = 0;
        let seen = 0;
        while (pos < formatted.length && seen < before) {
          if (/[A-Z0-9]/.test(formatted[pos])) seen++;
          pos++;
        }
        try { input.setSelectionRange(pos, pos); } catch {}
      }
      el.setupForce.hidden = true;
      state.pendingSession = null;
    });

    el.setupForce.addEventListener("click", () => {
      if (!state.pendingSession) return;
      completeJoin(state.pendingSession, false);
    });

    el.setupForm.addEventListener("submit", async event => {
      event.preventDefault();
      showSetupError("");
      const memberName = el.setupName.value.trim();
      if (!memberName) {
        showSetupError("Bitte gib deinen Namen ein.");
        return;
      }
      el.setupSubmit.disabled = true;
      el.setupSubmit.textContent = "Verbinde ...";
      try {
        if (!window.crypto?.subtle) throw new Error("Dieser Browser unterstützt die Verschlüsselung nicht (HTTPS nötig).");
        let code;
        let groupName = "";
        if (state.mode === "create") {
          code = newGroupCode();
          groupName = el.setupGroupName.value.trim().slice(0, 40) || `${memberName}s Gruppe`;
        } else {
          code = extractCode(el.setupCode.value);
          if (code.length !== CODE_LENGTH && code.length !== LEGACY_CODE_LENGTH) {
            throw new Error(`Der Gruppencode hat ${CODE_LENGTH} Zeichen (bei älteren Gruppen ${LEGACY_CODE_LENGTH}).`);
          }
          const wrong = [...new Set([...code].filter(char => !CODE_ALPHABET.includes(char)))];
          if (wrong.length) throw new Error(`Der Code enthält nie ${wrong.join(", ")}. Bitte prüfe ihn (z. B. 8 statt B, 5 statt S, 2 statt Z).`);
        }
        const memberId = randomId(8);
        const session = { code, memberId, name: memberName.slice(0, 40), color: colorFor(memberId), groupName, sharing: true, alert: null };
        await net.connectGroup(session);
        if (state.mode === "join") {
          // Gruppendaten kommen als retained Nachricht sofort nach dem Abonnieren. Kommt nichts, stimmt der Code meist nicht.
          const found = await waitForMeta(4000);
          if (!found) {
            state.pendingSession = session;
            el.setupForce.hidden = false;
            throw new Error("Keine Gruppe mit diesem Code gefunden. Bitte prüfe den Code oder tritt trotzdem bei, falls die Gruppe gerade erst erstellt wurde.");
          }
        }
        completeJoin(session, state.mode === "create");
      } catch (error) {
        if (!state.pendingSession) net.disconnect();
        showSetupError(error.message || "Das hat nicht geklappt.");
      } finally {
        el.setupSubmit.disabled = false;
        setMode(state.mode);
      }
    });
  }

  /** Schliesst das Erstellen/Beitreten ab, sobald die Verbindung steht. */
  function completeJoin(session, created, meetingPoint = null) {
    state.pendingSession = null;
    el.setupForce.hidden = true;
    state.session = session;
    state.sharing = true;
    state.alert = null;
    state.sosActive = false;
    saveSession();
    if (created) publishMeta({ name: session.groupName, meetingPoint }).catch(() => {});
    history.replaceState(null, "", location.pathname);
    enterGroup();
    if (created) toast(`Gruppe erstellt. Code: ${formatCode(session.code)}`);
  }

  /**
   * "Neue Gruppe mit neuem Code": verlaesst die Gruppe und erstellt sofort eine neue mit gleichem Namen und
   * Treffpunkt. Wer den alten Code kannte, ist damit draussen.
   */
  async function renewGroup() {
    const old = state.session;
    if (!old) return;
    if (!net.connected) {
      toast("Dafür braucht die App gerade eine Verbindung. Bitte gleich noch einmal versuchen.");
      return;
    }
    const groupName = net.meta?.name || old.groupName || `${old.name}s Gruppe`;
    const meetingPoint = state.group?.meetingPoint || null;
    toast("Neue Gruppe wird erstellt ...");
    await departGroup();
    const memberId = randomId(8);
    const session = { code: newGroupCode(), memberId, name: old.name, color: colorFor(memberId), groupName, sharing: true, alert: null };
    try {
      await net.connectGroup(session);
    } catch (error) {
      // Zurueck in die alte Gruppe, damit niemand ohne Gruppe dasteht (der eigene Eintrag wird beim Verbinden neu gesendet).
      const reason = error && error.message && error.message !== ABORTED ? ` (${error.message})` : "";
      state.session = { ...old, sharing: true, alert: null };
      saveSession();
      enterGroup();
      toast(`Neue Gruppe konnte nicht erstellt werden${reason}. Du bist weiter in "${groupName}".`);
      return;
    }
    completeJoin(session, true, meetingPoint);
    const share = await dialog({
      title: "Neuer Code",
      text: `"${groupName}" hat jetzt den Code ${formatCode(session.code)}. Schick ihn direkt an alle, die dabei bleiben sollen, nicht über die alte Gruppe.`,
      ok: "Code teilen",
      cancel: "Später"
    });
    if (share) shareCode();
  }

  function waitForMeta(maxMs) {
    return new Promise(resolve => {
      const started = Date.now();
      const check = () => {
        if (net.meta) return resolve(true);
        if (Date.now() - started > maxMs || !net.client) return resolve(false);
        setTimeout(check, 200);
      };
      check();
    });
  }

  function setMode(mode) {
    if (mode !== state.mode && state.pendingSession) {
      state.pendingSession = null;
      el.setupForce.hidden = true;
      net.disconnect();
    }
    state.mode = mode;
    el.segmented.querySelectorAll("button").forEach(button => button.classList.toggle("is-active", button.dataset.mode === mode));
    el.groupNameField.hidden = mode !== "create";
    el.codeField.hidden = mode !== "join";
    el.setupSubmit.textContent = mode === "create" ? "Gruppe erstellen" : "Gruppe beitreten";
  }

  function showSetupError(message) {
    el.setupError.textContent = message;
    el.setupError.hidden = !message;
  }

  function showSetup() {
    el.setupView.hidden = false;
    el.mainView.hidden = true;
    el.topbarSub.textContent = "Familie & Freunde finden";
    if (state.session?.name) el.setupName.value = state.session.name;
  }

  // ---------- Main ----------
  function bindMain() {
    el.menuButton.addEventListener("click", () => openMenu(true));
    el.menuClose.addEventListener("click", () => openMenu(false));
    el.menu.addEventListener("click", event => {
      if (event.target === el.menu) openMenu(false);
    });
    el.menuPrivacy.addEventListener("click", () => {
      openMenu(false);
      el.privacy.hidden = false;
    });
    el.menuReconnect.addEventListener("click", () => {
      openMenu(false);
      if (!state.session) return;
      net.disconnect();
      toast("Verbindung wird neu aufgebaut ...");
      net.ensureConnected(0);
    });
    el.alertMute.addEventListener("click", () => {
      audio.muted = !audio.muted;
      el.alertMute.textContent = audio.muted ? "Ton an" : "Ton stumm";
      if (audio.muted) stopAlarmSound();
      else startAlarmSound();
    });
    // Audio muss nach einer Berührung freigeschaltet werden, sonst bleibt der Alarmton in Browsern stumm.
    const unlockEvents = ["pointerup", "touchend", "click", "keydown"];
    const unlock = () => {
      unlockAudio(() => unlockEvents.forEach(type => document.removeEventListener(type, unlock, true)));
    };
    unlockEvents.forEach(type => document.addEventListener(type, unlock, true));
    el.privacyClose.addEventListener("click", () => {
      el.privacy.hidden = true;
    });
    el.menuRename.addEventListener("click", async () => {
      openMenu(false);
      const name = await dialog({ title: "Dein Name", input: true, value: state.session?.name || "", placeholder: "z. B. Jaro", ok: "Speichern" });
      if (!name) return;
      await rejoinWithName(name);
    });
    el.menuLeave.addEventListener("click", async () => {
      openMenu(false);
      const go = await dialog({ title: "Gruppe verlassen?", text: "Dein Eintrag wird bei allen entfernt. Mit dem Code kannst du jederzeit wieder beitreten.", ok: "Verlassen", danger: true });
      if (!go) return;
      await leaveGroup();
    });
    const confirmRenew = async () => {
      openMenu(false);
      if (!state.session) return;
      const go = await dialog({
        title: "Neue Gruppe mit neuem Code?",
        text: "Wer den alten Code hat, kann euch weiter sehen, solange ihr ihn nutzt. Die App verlässt diese Gruppe und erstellt eine neue mit demselben Namen und Treffpunkt, aber mit frischem Code. Schick den neuen Code danach direkt an die Leute, nicht über die alte Gruppe.",
        ok: "Neuen Code erzeugen",
        danger: true
      });
      if (!go) return;
      await renewGroup();
    };
    el.menuRenew.addEventListener("click", confirmRenew);
    el.legacyRenew.addEventListener("click", confirmRenew);
    el.menuBrokerReset.addEventListener("click", () => {
      try { localStorage.removeItem(BROKER_KEY); } catch {}
      renderBrokerInfo();
      openMenu(false);
      toast("Standard-Verbindungsdienst wird wieder genutzt.");
      if (state.session) {
        net.disconnect();
        net.ensureConnected(0);
      }
    });

    el.shareButton.addEventListener("click", shareCode);
    el.sosButton.addEventListener("click", toggleSos);
    el.shareToggle.addEventListener("click", toggleSharing);
    el.meetingButton.addEventListener("click", startMeetingPick);
    el.pickCancel.addEventListener("click", () => setPicking(false));
    el.meetingClear.addEventListener("click", () => {
      publishMeta({ meetingPoint: null }).catch(showError);
    });
    el.meetingNavigate.addEventListener("click", () => {
      const point = state.group?.meetingPoint;
      if (point) openNavigation(point.lat, point.lng);
    });
    el.alertNavigate.addEventListener("click", () => {
      const member = activeAlerts()[0];
      if (member && member.lat !== null) openNavigation(member.lat, member.lng);
    });
    el.alertRespond.addEventListener("click", () => {
      const member = activeAlerts()[0];
      if (!member) return;
      state.responding = state.responding === member.id ? null : member.id;
      toast(state.responding ? `${member.name} sieht jetzt, dass du unterwegs bist.` : "Rückmeldung zurückgenommen.");
      uploadLocation(true).catch(() => {});
    });
    el.ownAlertEnd.addEventListener("click", toggleSos);
    el.ownAlertMessage.addEventListener("click", async () => {
      const message = await dialog({ title: "Nachricht an alle", input: true, value: state.alert?.message || DEFAULT_ALERT_MESSAGE, placeholder: "Wo bist du? Was ist los?", ok: "Senden" });
      if (message === null || !state.alert) return;
      setAlert({ ...state.alert, message: message.slice(0, 160) });
      toast("Nachricht aktualisiert.");
    });
    el.notifyAllow.addEventListener("click", async () => {
      el.notifyCard.hidden = true;
      if (nativeBridge) {
        // In der Android-App ist die Berechtigung schon abgefragt worden: hier hilft nur noch der Weg ueber die Einstellungen.
        try { nativeBridge.openSettings(); } catch {}
        return;
      }
      try {
        const result = await Notification.requestPermission();
        toast(result === "granted" ? "Benachrichtigungen sind an." : "Benachrichtigungen bleiben aus.");
      } catch {
      }
    });
    el.notifyLater.addEventListener("click", () => {
      el.notifyCard.hidden = true;
      try { localStorage.setItem(NOTIFY_DISMISS_KEY, "1"); } catch {}
    });
    el.geoAllow.addEventListener("click", () => {
      geo.asked = true;
      el.geoCard.hidden = true;
      if (nativeBridge && typeof nativeBridge.setSharing === "function") {
        // Android fragt die Berechtigung ab und meldet die Antwort ueber window.fmsPermission.
        let granted = false;
        try { granted = nativeBridge.locationPermission && nativeBridge.locationPermission() === "granted"; } catch {}
        if (granted) geo.startWatch();
        else nativeSetSharing(true);
        return;
      }
      geo.startWatch();
    });
    el.geoSettings.addEventListener("click", () => {
      try { nativeBridge.openSettings(); } catch {}
    });
    el.shareSend.addEventListener("click", () => {
      el.shareSheet.hidden = true;
      sendInvite();
    });
    el.shareClose.addEventListener("click", () => {
      el.shareSheet.hidden = true;
    });
    el.shareSheet.addEventListener("click", event => {
      if (event.target === el.shareSheet) el.shareSheet.hidden = true;
    });
    el.updateLater.addEventListener("click", () => {
      el.updateCard.hidden = true;
    });
    el.iosCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(formatCode(state.session?.code || ""));
        toast("Code kopiert.");
      } catch {
        toast("Kopieren nicht möglich. Schreib dir den Code auf.");
      }
    });
    el.iosLater.addEventListener("click", () => {
      el.iosCard.hidden = true;
      try { localStorage.setItem(IOS_HINT_KEY, "1"); } catch {}
    });
    el.menuTimed.addEventListener("click", async () => {
      openMenu(false);
      if (!state.session) return;
      const value = await dialog({
        title: "Standort nur eine Weile teilen",
        text: "Uhrzeit (z. B. 20:00) oder Stunden (z. B. 2). Danach schaltet die App das Teilen von selbst aus.",
        input: true,
        value: "",
        placeholder: "20:00 oder 2",
        ok: "Übernehmen"
      });
      if (value === null) return;
      const until = parseUntil(value);
      if (!until) {
        toast("Bitte eine Uhrzeit wie 20:00 oder eine Stundenzahl eingeben.");
        return;
      }
      state.session.sharingUntil = until;
      saveSession();
      if (!state.sharing) setSharing(true);
      applySharingUi();
      toast(`Standort wird bis ${formatClock(until)} geteilt.`);
    });

    el.centerButton.addEventListener("click", () => {
      if (mapView.map && state.position) mapView.focus(state.position.lat, state.position.lng);
      else toast("Dein Standort ist noch nicht bekannt.");
    });
    el.fitButton.addEventListener("click", fitAll);
    el.sheetHandle.addEventListener("click", () => el.sheet.classList.toggle("is-collapsed"));

    el.memberList.addEventListener("click", event => {
      const item = event.target.closest("[data-member]");
      if (!item || event.target.closest("a")) return;
      const member = state.group?.members.find(entry => entry.id === item.dataset.member);
      if (member && member.lat !== null) mapView.focus(member.lat, member.lng);
    });

    document.addEventListener("visibilitychange", () => {
      if (!state.session) return;
      if (document.visibilityState === "visible") {
        startPolling();
        checkSharingTimer();
        net.ensureConnected(0);
        if (audio.ctx && audio.ctx.state !== "running") audio.ctx.resume().catch(() => {});
        if (nativeBridge && activeAlerts().length && !audio.muted && !audio.repeatTimer) startAlarmSound();
        uploadLocation(true);
        render();
      } else {
        stopPolling();
      }
    });
  }

  function enterGroup() {
    el.setupView.hidden = true;
    el.mainView.hidden = false;
    el.topbarSub.textContent = `Du bist ${state.session.name}`;
    // Pausiert/Alarm ueberleben einen Neustart.
    state.sharing = state.session.sharing !== false;
    if (state.session.sharingUntil && Date.now() >= state.session.sharingUntil) {
      // Zeitlimit ist waehrend der Pause der App abgelaufen: nichts mehr senden, bevor der Herzschlag es merkt.
      state.session.sharingUntil = null;
      state.session.sharing = false;
      state.sharing = false;
      saveSession();
      toast("Zeit abgelaufen: Dein Standort wird nicht mehr geteilt.");
    }
    state.alert = state.session.alert && state.session.alert.active ? state.session.alert : null;
    state.sosActive = Boolean(state.alert);
    applySharingUi();
    if (nativeBridge && typeof nativeBridge.requestNotifications === "function") {
      try { nativeBridge.requestNotifications(); } catch {}
    }
    rebuildGroup();
    render();
    initMap();
    if (state.sharing) geo.start();
    else {
      geo.startHeartbeat();
      nativeSetSharing(false);
    }
    startPolling();
    geo.watchBattery();
    showNotifyCardIfUseful();
    showIosHintIfUseful();
    if (net.client) uploadLocation(true);
    else net.ensureConnected(0);
  }

  function nativeSetSharing(on) {
    if (!nativeBridge || typeof nativeBridge.setSharing !== "function") return;
    try { nativeBridge.setSharing(Boolean(on && state.session)); } catch {}
  }

  /** Im Browser: einmal freundlich nach Benachrichtigungen fragen (aus einer Geste heraus, nicht mitten im Alarm). */
  /** iPhone ohne Installation: Nach "Zum Home-Bildschirm" ist die Sitzung weg, der Code muss neu eingegeben werden. */
  function showIosHintIfUseful() {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    if (!isIos || standalone || isNativeApp) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(IOS_HINT_KEY) === "1"; } catch {}
    if (dismissed) return;
    el.iosCardCode.textContent = formatCode(state.session.code);
    el.iosCard.hidden = false;
  }

  /** Android-App: Ohne Benachrichtigungen kommt im Hintergrund kein Alarm an. Das muss man sehen und reparieren koennen. */
  function showNotifyDeniedCard() {
    el.notifyTitle.textContent = "Benachrichtigungen sind aus";
    el.notifyText.textContent = "Ohne sie bekommst du keinen Alarm, wenn die App im Hintergrund ist.";
    el.notifyAllow.textContent = "Einstellungen öffnen";
    el.notifyCard.hidden = false;
  }

  function showNotifyCardIfUseful() {
    if (nativeBridge || !("Notification" in window) || Notification.permission !== "default") return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(NOTIFY_DISMISS_KEY) === "1"; } catch {}
    el.notifyCard.hidden = dismissed;
  }

  function applySharingUi() {
    el.shareToggle.classList.toggle("is-on", state.sharing);
    const until = state.session?.sharingUntil;
    el.shareToggle.querySelector(".toggle-state").textContent = state.sharing ? (until ? `bis ${formatClock(until)}` : "AN") : "AUS";
  }

  function checkSharingTimer() {
    const until = state.session?.sharingUntil;
    if (!until) return;
    if (state.sharing && Date.now() >= until) {
      state.session.sharingUntil = null;
      setSharing(false);
      toast("Zeit abgelaufen: Dein Standort wird nicht mehr geteilt.");
    }
  }

  /** Baut state.group aus den empfangenen Mitgliedern, den Gruppendaten und dem eigenen Zustand. */
  function rebuildGroup() {
    if (!state.session) return;
    const cutoff = Date.now() - MEMBER_MAX_AGE_MS;
    const others = [...net.members.values()].filter(member => member.id !== state.session.memberId && memberTime(member, member.lastSeen) > cutoff);
    if (state.responding && !others.some(member => member.id === state.responding && member.alert?.active)) {
      state.responding = null;
    }
    state.group = {
      code: state.session.code,
      name: net.meta?.name || state.session.groupName || `Gruppe ${state.session.code}`,
      meetingPoint: net.meta?.meetingPoint || null,
      members: [buildMe(), ...others]
    };
    checkBatteries(others);
  }

  /** Einmalige Warnung, wenn ein Handy der Gruppe (oder das eigene) unter 20 % faellt. */
  function checkBatteries(others) {
    others.forEach(member => {
      if (member.battery === null || member.battery === undefined) return;
      if (member.battery <= LOW_BATTERY && !state.batteryWarned.has(member.id)) {
        state.batteryWarned.add(member.id);
        toast(`Akku von ${member.name} ist bei ${member.battery} %.`);
      } else if (member.battery > LOW_BATTERY + 5) {
        state.batteryWarned.delete(member.id);
      }
    });
    if (state.battery !== null && state.battery <= LOW_BATTERY && !state.ownBatteryWarned) {
      state.ownBatteryWarned = true;
      toast(`Dein Akku ist bei ${state.battery} %. Deine Gruppe sieht das.`);
    } else if (state.battery !== null && state.battery > LOW_BATTERY + 5) {
      state.ownBatteryWarned = false;
    }
  }

  /** Der eigene Mitgliedseintrag, so wie er auch an die anderen gesendet wird. */
  function buildMe() {
    const position = state.sharing ? state.position : null;
    return {
      id: state.session.memberId,
      name: state.session.name,
      color: state.session.color,
      lat: position ? position.lat : null,
      lng: position ? position.lng : null,
      accuracy: position ? position.accuracy : null,
      heading: position ? position.heading : null,
      speed: position ? position.speed : null,
      locatedAt: position ? new Date(position.at).toISOString() : null,
      battery: state.battery,
      sharing: state.sharing,
      alert: state.alert,
      responding: state.responding,
      lastSeen: new Date().toISOString(),
      proto: PROTOCOL_VERSION
    };
  }

  function others() {
    return (state.group?.members || []).filter(member => member.id !== state.session?.memberId);
  }

  function activeAlerts() {
    return others().filter(member => member.alert?.active);
  }

  // ---------- Rendering ----------
  function render() {
    if (!state.group) return;
    el.groupName.textContent = state.group.name;
    el.groupCode.textContent = formatCode(state.group.code);
    const legacy = net.protocol === 1 || state.group.code.length === LEGACY_CODE_LENGTH;
    el.menuInfo.textContent = `${state.session.name} in "${state.group.name}" (Code ${formatCode(state.group.code)}). ${state.group.members.length} Mitglied${state.group.members.length === 1 ? "" : "er"}.`
      + (legacy ? " Diese Gruppe nutzt noch einen kurzen Code der ersten Version. Für mehr Sicherheit erzeugt ihr über \"Neue Gruppe mit neuem Code\" einen neuen." : "");

    el.legacyCard.hidden = !legacy;
    el.sosButton.classList.toggle("is-active", state.sosActive);
    el.sosButton.querySelector(".sos-label").textContent = state.sosActive ? "Ich bin sicher" : "Finde mich!";

    renderAlerts();
    renderOwnAlert();
    renderMeeting();
    renderMembers();
    renderMarkers();
  }

  /** Buendelt viele Aenderungen (jede eingehende Nachricht) zu einem Rendern pro Bild. */
  function scheduleRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    const run = () => {
      state.renderQueued = false;
      rebuildGroup();
      render();
    };
    // Im Hintergrund zeichnet der Browser keine Bilder mehr. Dort sofort verarbeiten, sonst kaeme ein Alarm erst
    // an, wenn jemand die App wieder aufmacht.
    if (document.visibilityState === "visible") requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function renderMarkers() {
    mapView.update(state.group, state.session, state.position);
  }

  function initMap() {
    if (!mapView.init()) el.mapFallback.hidden = false;
  }

  function fitAll() {
    if (!mapView.fitAll(state.group, state.position)) toast("Noch keine Standorte vorhanden.");
  }

  /** Zeigt der rufenden Person, seit wann der Alarm laeuft und wer unterwegs ist. */
  function renderOwnAlert() {
    el.ownAlert.hidden = !state.sosActive;
    if (!state.sosActive) return;
    const responders = others().filter(member => member.responding === state.session.memberId);
    const parts = [`Alarm läuft seit ${formatClock(Date.parse(state.alert?.since || "") || Date.now())}.`];
    if (responders.length) {
      parts.push(responders.map(member => {
        const distance = member.lat !== null && state.position ? ` (${formatDistance(distanceMeters(state.position, member))})` : "";
        return `${member.name} kommt${distance}`;
      }).join(", ") + ".");
    } else {
      parts.push("Noch keine Rückmeldung.");
    }
    if (state.alert?.message) parts.push(`Nachricht: „${state.alert.message}“`);
    el.ownAlertText.textContent = parts.join(" ");
  }

  function renderAlerts() {
    const alerts = activeAlerts();
    const newAlerts = alerts.filter(member => !state.knownAlerts.has(member.id));
    state.knownAlerts = new Set(alerts.map(member => member.id));
    // Ein alter Alarm eines laengst abgemeldeten Handys (retained beim Broker) bleibt sichtbar, loest aber keine Sirene aus.
    const fresh = newAlerts.filter(member => !isOffline(member));
    if (fresh.length) notifyAlert(fresh[0]);

    el.alertBanner.hidden = !alerts.length;
    if (!alerts.length) {
      stopAlarmSound();
      audio.muted = false;
      el.alertMute.textContent = "Ton stumm";
      if (state.knownAlertsShown || !state.alertsChecked) clearAlertNotification();
      state.knownAlertsShown = false;
      state.alertsChecked = true;
      state.alertKey = "";
      return;
    }
    state.alertsChecked = true;
    state.knownAlertsShown = true;
    const target = alerts[0];
    el.alertRespond.textContent = state.responding === target.id ? "Bin unterwegs ✓" : "Ich komme";
    const first = alerts[0];
    // Geaenderte Nachricht oder neuer Ort: Benachrichtigung aktualisieren, ohne erneut Alarm zu schlagen.
    const alertKey = `${first.id}|${first.alert?.message || ""}|${first.lat === null ? "" : first.lat.toFixed(4)},${first.lng === null ? "" : first.lng.toFixed(4)}`;
    if (state.alertKey && state.alertKey !== alertKey && !fresh.some(member => member.id === first.id)) showAlertNotification(first, true);
    state.alertKey = alertKey;
    el.alertTitle.textContent = alerts.length === 1 ? `${first.name} ruft: Finde mich!` : `${alerts.length} Personen rufen um Hilfe`;
    const parts = [];
    if (first.alert?.message) parts.push(first.alert.message);
    if (first.lat !== null && state.position) parts.push(`${formatDistance(distanceMeters(state.position, first))} entfernt`);
    parts.push(`zuletzt ${formatAgo(memberTime(first, first.lastSeen))}`);
    el.alertText.textContent = parts.join(" | ");
    el.alertNavigate.hidden = first.lat === null;
  }

  function renderMeeting() {
    const point = state.group.meetingPoint;
    el.meetingLine.hidden = !point;
    el.meetingState.textContent = point ? "aktiv" : "setzen";
    el.meetingButton.classList.toggle("is-on", Boolean(point));
    if (point) {
      const distance = state.position ? ` | ${formatDistance(distanceMeters(state.position, point))}` : "";
      el.meetingLabel.textContent = `${point.label} (von ${point.setBy})${distance}`;
    }
  }

  function renderMembers() {
    const distanceTo = member => (member.lat !== null && state.position ? distanceMeters(state.position, member) : Infinity);
    const members = [...state.group.members].sort((a, b) => {
      if (a.id === state.session.memberId) return -1;
      if (b.id === state.session.memberId) return 1;
      if (Boolean(a.alert?.active) !== Boolean(b.alert?.active)) return a.alert?.active ? -1 : 1;
      if (isOffline(a) !== isOffline(b)) return isOffline(a) ? 1 : -1;
      const byDistance = distanceTo(a) - distanceTo(b);
      if (Number.isFinite(byDistance) && byDistance !== 0) return byDistance;
      return a.name.localeCompare(b.name, "de");
    });

    // Liste nur neu aufbauen, wenn sich etwas Sichtbares geaendert hat (Zeitangaben aendern sich minutenweise).
    const key = members.map(member => [member.id, member.name, member.lat, member.lng, member.accuracy, member.battery, member.sharing, Boolean(member.alert?.active), isOffline(member), Math.floor(memberTime(member, member.lastSeen) / 60000), Math.floor(memberTime(member, member.locatedAt) / 60000), member.speed].join(":")).join("|")
      + `#${state.position ? `${state.position.lat.toFixed(5)},${state.position.lng.toFixed(5)},${Math.round(state.position.accuracy || 0)}` : ""}#${state.sharing}#${Math.floor(Date.now() / 60000)}`;
    if (key === state.membersKey) return;
    state.membersKey = key;

    el.memberList.innerHTML = "";
    members.forEach(member => {
      const isMe = member.id === state.session.memberId;
      const item = document.createElement("li");
      item.className = `member-item${member.alert?.active ? " is-alert" : ""}${!isMe && isOffline(member) ? " is-offline" : ""}`;
      item.dataset.member = member.id;

      const avatar = document.createElement("div");
      avatar.className = "member-avatar";
      avatar.style.background = member.color;
      avatar.textContent = initials(member.name);

      const body = document.createElement("div");
      body.className = "member-body";
      const name = document.createElement("div");
      name.className = "member-name";
      name.textContent = member.name;
      if (isMe) name.appendChild(tag("DU"));
      if (member.alert?.active) name.appendChild(tag("HILFE", "alert"));
      const meta = document.createElement("div");
      meta.className = "member-meta";
      meta.textContent = memberMeta(member, isMe);
      body.append(name, meta);

      const distance = document.createElement("div");
      distance.className = "member-distance";
      const strong = document.createElement("strong");
      if (isMe) strong.textContent = state.position ? `±${Math.round(state.position.accuracy || 0)} m` : "...";
      else if (member.lat !== null && state.position) strong.textContent = formatDistance(distanceMeters(state.position, member));
      else strong.textContent = member.lat !== null ? "?" : "kein Ort";
      distance.appendChild(strong);
      if (!isMe && member.lat !== null && member.accuracy !== null && member.accuracy !== undefined) {
        const acc = document.createElement("small");
        acc.className = "member-accuracy";
        acc.textContent = member.accuracy > APPROX_ACCURACY_M ? `ungefähr, ±${formatDistance(member.accuracy)}` : `±${Math.round(member.accuracy)} m`;
        distance.appendChild(acc);
      }
      if (!isMe && member.lat !== null) {
        const link = document.createElement("a");
        link.href = navigationUrl(member.lat, member.lng);
        if (!isNativeApp) {
          link.target = "_blank";
          link.rel = "noopener";
        }
        link.textContent = "Route";
        distance.appendChild(link);
      }

      item.append(avatar, body, distance);
      el.memberList.appendChild(item);
    });

    if (members.length === 1) {
      const empty = document.createElement("li");
      empty.className = "member-empty";
      empty.textContent = "Du bist noch allein. Teile den Code, damit andere beitreten können.";
      el.memberList.appendChild(empty);
    }
  }

  function memberMeta(member, isMe) {
    const parts = [];
    if (isMe) {
      parts.push(state.sharing ? "Standort wird geteilt" : "Standort pausiert");
    } else if (!member.sharing) {
      parts.push("Standort pausiert");
    } else if (member.lat === null) {
      parts.push("noch kein Standort");
    } else {
      parts.push(`Ort ${formatAgo(memberTime(member, member.locatedAt))}`);
    }
    if (!isMe) parts.push(isOffline(member) ? `offline seit ${formatClock(memberTime(member, member.lastSeen))}` : `online ${formatAgo(memberTime(member, member.lastSeen))}`);
    if (member.battery !== null && member.battery !== undefined) parts.push(`Akku ${member.battery}%${member.battery <= LOW_BATTERY ? " (schwach)" : ""}`);
    if (member.speed && member.speed > 0.8) parts.push(`${Math.round(member.speed * 3.6)} km/h`);
    return parts.join(" | ");
  }

  function tag(text, extra) {
    const span = document.createElement("span");
    span.className = `tag${extra ? ` ${extra}` : ""}`;
    span.textContent = text;
    return span;
  }

  function setupMapControls() {
    el.zoomIn.addEventListener("click", mapView.zoomIn);
    el.zoomOut.addEventListener("click", mapView.zoomOut);
    el.mapStyle.addEventListener("click", () => setMapStyle(document.body.classList.contains("map-light") ? "dark" : "light"));
    let style = "dark";
    try { style = localStorage.getItem(MAP_STYLE_KEY) || "dark"; } catch {}
    setMapStyle(style);
  }

  /** Helle Karte fuer draussen in der Sonne, dunkle fuer abends. */
  function setMapStyle(style) {
    const light = style === "light";
    document.body.classList.toggle("map-light", light);
    el.mapStyle.textContent = light ? "\u263E" : "\u2600";
    el.mapStyle.setAttribute("aria-label", light ? "Dunkle Karte" : "Helle Karte");
    el.mapStyle.title = light ? "Dunkle Karte" : "Helle Karte";
    try { localStorage.setItem(MAP_STYLE_KEY, style); } catch {}
  }

  function startMeetingPick() {
    if (!mapView.map) {
      if (state.position) {
        setMeetingPoint(state.position.lat, state.position.lng, "Treffpunkt");
      } else {
        toast("Ohne Karte und Standort geht das nicht.");
      }
      return;
    }
    setPicking(!state.pickingMeeting);
  }

  function setPicking(active) {
    state.pickingMeeting = active;
    el.pickHint.hidden = !active;
    mapView.setCursor(active ? "crosshair" : "");
  }

  function showGeoCard(permission) {
    const denied = permission === "denied";
    el.geoCardText.textContent = denied
      ? "Der Standort ist für Find Mein Soon gesperrt. Erlaube ihn in den Einstellungen, sonst sieht dich niemand auf der Karte."
      : "Damit deine Familie dich auf der Karte sieht, braucht die App deinen Standort. Er geht verschlüsselt nur an deine Gruppe.";
    el.geoAllow.textContent = denied ? "Erneut versuchen" : "Standort erlauben";
    el.geoSettings.hidden = !(denied && nativeBridge && typeof nativeBridge.openSettings === "function");
    el.geoCard.hidden = false;
    setGeoStatus(denied ? "Standort gesperrt." : "Standort noch nicht erlaubt.", denied ? "error" : "");
  }

  function setGeoStatus(text, kind) {
    el.geoStatus.textContent = text;
    el.geoStatus.className = `geo-status${kind ? ` is-${kind}` : ""}`;
  }

  async function uploadLocation(force) {
    if (!state.session) return;
    const now = Date.now();
    const moved = state.position && state.lastUploadPos ? distanceMeters(state.position, state.lastUploadPos) : Infinity;
    // Der erste Standort nach dem Beitritt geht sofort raus, danach gilt die Drossel.
    const firstFix = Boolean(state.sharing && state.position && !state.lastUploadPos);
    if (!force && !firstFix && (now - state.lastUpload < MIN_UPLOAD_GAP_MS || moved < 15)) return;
    state.lastUpload = now;
    if (state.sharing && state.position) state.lastUploadPos = { lat: state.position.lat, lng: state.position.lng };
    rebuildGroup();
    render();
    try {
      await net.publishSelf();
    } catch {
      // Ohne Verbindung wird nichts gesendet; nach dem Verbinden geht der aktuelle Stand automatisch raus.
    }
  }

  function toggleSharing() {
    setSharing(!state.sharing);
    toast(state.sharing ? "Dein Standort wird wieder geteilt." : "Dein Standort ist pausiert.");
  }

  function setSharing(on) {
    state.sharing = Boolean(on);
    if (state.session) {
      state.session.sharing = state.sharing;
      if (!state.sharing) state.session.sharingUntil = null; // vor dem Speichern, sonst taucht das Zeitlimit spaeter wieder auf
      saveSession();
    }
    applySharingUi();
    if (state.sharing) {
      geo.start();
    } else {
      // Pause: GPS aus, nur der Herzschlag laeuft weiter (Akku).
      geo.stopWatch();
      geo.lowPower = false;
      nativeSetSharing(false);
    }
    uploadLocation(true);
  }

  // ---------- Polling ----------
  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(scheduleRender, POLL_MS);
  }

  function stopPolling() {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  // ---------- SOS / Alerts ----------
  async function toggleSos() {
    if (state.sosActive) {
      const end = await dialog({ title: "Alarm beenden?", text: "Alle in der Gruppe sehen dann, dass es dir gut geht.", ok: "Alarm beenden" });
      if (!end) return;
      setAlert(null);
      vibrate([80]);
      toast("Alarm beendet.");
      return;
    }
    const go = await dialog({ title: "Alarm an alle senden?", text: "Deine Gruppe bekommt sofort Alarm mit deinem Standort. Eine Nachricht kannst du danach ergänzen.", ok: "Alarm senden", danger: true });
    if (!go) return;
    setAlert({ active: true, message: DEFAULT_ALERT_MESSAGE, since: new Date().toISOString() });
    // Sofort Rueckmeldung geben; das Senden darf nie blockieren.
    vibrate([200, 100, 200]);
    toast(net.connected ? "Alarm gesendet. Alle in der Gruppe sehen dich jetzt." : "Alarm gesetzt. Er wird gesendet, sobald Verbindung besteht.");
  }

  function setAlert(alert) {
    state.alert = alert;
    state.sosActive = Boolean(alert);
    if (state.session) {
      state.session.alert = alert;
      saveSession();
    }
    if (alert && !state.sharing) setSharing(true);
    rebuildGroup();
    render();
    uploadLocation(true).catch(() => {});
  }

  function notifyAlert(member) {
    vibrate([300, 120, 300, 120, 500]);
    // In der Android-App uebernimmt im Hintergrund die Benachrichtigung den Ton; die Sirene nur, wenn die App sichtbar
    // ist oder wenn Benachrichtigungen abgeschaltet sind (dann gaebe es sonst gar keinen Ton).
    if (!nativeBridge || document.visibilityState === "visible" || state.nativeNotifications === false) startAlarmSound();
    showAlertNotification(member);
    if (member.lat !== null) mapView.focus(member.lat, member.lng);
  }

  function showAlertNotification(member, update = false) {
    const title = `${member.name} ruft: Finde mich!`;
    const body = member.alert?.message || "Öffne Find Mein Soon, um die Person auf der Karte zu sehen.";
    if (nativeBridge && typeof nativeBridge.showAlert === "function") {
      try { nativeBridge.showAlert(member.id, member.name, member.alert?.message || "", member.lat ?? 0, member.lng ?? 0); } catch {}
      return;
    }
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const options = { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "fms-alert", renotify: !update, silent: update, requireInteraction: true, vibrate: update ? [] : [300, 120, 300, 120, 500] };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(registration => registration.showNotification(title, options)).catch(() => {});
      return;
    }
    try { new Notification(title, options); } catch {}
  }

  function clearAlertNotification() {
    if (nativeBridge && typeof nativeBridge.clearAlert === "function") {
      try { nativeBridge.clearAlert(); } catch {}
      return;
    }
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready
        .then(registration => registration.getNotifications({ tag: "fms-alert" }))
        .then(list => list.forEach(notification => notification.close()))
        .catch(() => {});
    }
  }

  function vibrate(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch {}
    }
  }

  /** Erzeugt den AudioContext und versucht ihn zu starten; onRunning wird gerufen, sobald er wirklich laeuft. */
  function unlockAudio(onRunning) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audio.ctx) audio.ctx = new Ctx();
      if (audio.ctx.state === "running") {
        if (onRunning) onRunning();
        return;
      }
      audio.ctx.resume().then(() => {
        if (audio.ctx.state === "running" && onRunning) onRunning();
      }).catch(() => {});
    } catch {
    }
  }

  /** Sirenenartiger Ton, deutlich lauter als ein Piepser. Spielt, sobald der AudioContext laeuft. */
  function beep() {
    try {
      unlockAudio();
      const ctx = audio.ctx;
      if (!ctx) return;
      const play = () => {
        const gain = ctx.createGain();
        gain.gain.value = 0.4;
        gain.connect(ctx.destination);
        [[0, 880], [0.45, 660], [0.9, 880], [1.35, 660]].forEach(([offset, freq]) => {
          const osc = ctx.createOscillator();
          osc.type = "square";
          osc.frequency.value = freq;
          osc.connect(gain);
          osc.start(ctx.currentTime + offset);
          osc.stop(ctx.currentTime + offset + 0.4);
        });
        setTimeout(() => { try { gain.disconnect(); } catch {} }, 2200);
      };
      if (ctx.state === "running") play();
      else ctx.resume().then(() => { if (ctx.state === "running") play(); }).catch(() => {});
    } catch {
    }
  }

  function startAlarmSound() {
    if (audio.muted) return;
    beep();
    clearInterval(audio.repeatTimer);
    audio.repeatTimer = setInterval(() => {
      if (!activeAlerts().length || audio.muted) {
        stopAlarmSound();
        return;
      }
      beep();
    }, ALARM_REPEAT_MS);
  }

  function stopAlarmSound() {
    clearInterval(audio.repeatTimer);
    audio.repeatTimer = null;
  }

  // ---------- Share / Navigation ----------
  function inviteUrl() {
    const base = isNativeApp || !/^https?:$/.test(location.protocol) ? PUBLIC_APP_URL : `${location.origin}${location.pathname}`;
    return `${base}#join=${formatCode(state.group.code)}`;
  }

  /** "Code teilen": Code gross, QR-Code zum Abfotografieren, dann Teilen/Kopieren. */
  function shareCode() {
    if (!state.group) return;
    el.shareSheetCode.textContent = formatCode(state.group.code);
    el.shareQr.innerHTML = "";
    try {
      if (typeof qrcode === "function") {
        const qr = qrcode(0, "M");
        qr.addData(inviteUrl());
        qr.make();
        el.shareQr.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        const svg = el.shareQr.querySelector("svg");
        if (svg) svg.setAttribute("aria-label", "QR-Code mit Einladungslink");
      }
    } catch {
      el.shareQr.innerHTML = "";
    }
    el.shareSend.textContent = (nativeBridge && typeof nativeBridge.share === "function") || navigator.share ? "Link teilen" : "Link kopieren";
    el.shareSheet.hidden = false;
  }

  async function sendInvite() {
    if (!state.group) return;
    const shown = formatCode(state.group.code);
    const url = inviteUrl();
    const text = `Komm in meine Find-Mein-Soon-Gruppe "${state.group.name}". Code: ${shown}`;
    const hint = "Wer den Code hat, sieht euch, bis ihr im Menü einen neuen erzeugt.";
    if (nativeBridge && typeof nativeBridge.share === "function") {
      try {
        nativeBridge.share("Find Mein Soon", `${text}\n${url}`);
        toast(hint);
        return;
      } catch {
      }
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: "Find Mein Soon", text, url });
        toast(hint);
        return;
      } catch {
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast(`Code und Link kopiert. ${hint}`);
    } catch {
      dialog({ title: "Code zum Kopieren", text: hint, input: true, value: `${text} ${url}`, ok: "Fertig", cancel: null });
    }
  }

  function navigationUrl(lat, lng) {
    return isIos
      ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
  }

  function openNavigation(lat, lng) {
    const url = navigationUrl(lat, lng);
    // In der Android-Huelle faengt die WebView fremde Adressen ab und oeffnet die Karten-App.
    if (isNativeApp) location.href = url;
    else window.open(url, "_blank", "noopener");
  }

  // ---------- Session ----------
  async function rejoinWithName(name) {
    state.session.name = name.slice(0, 40);
    saveSession();
    el.topbarSub.textContent = `Du bist ${state.session.name}`;
    await uploadLocation(true);
    toast(`Du heißt jetzt ${state.session.name}.`);
  }

  async function leaveGroup() {
    const removed = await departGroup();
    toast(removed ? "Du hast die Gruppe verlassen." : "Gruppe verlassen. Dein Eintrag beim Dienst verfällt automatisch.");
    showSetup();
  }

  /** Meldet sich bei den anderen ab und loescht die Sitzung. Liefert, ob die Abmeldung den Dienst erreicht hat. */
  async function departGroup() {
    // Erst Timer stoppen, damit kein Herzschlag den Eintrag nach dem Loeschen wieder anlegt.
    state.leaving = true;
    geo.stop();
    stopPolling();
    let removed = false;
    try {
      removed = await Promise.race([net.leave(), new Promise(resolve => setTimeout(() => resolve(false), 3000))]);
    } catch {
    }
    clearSession();
    state.leaving = false;
    return removed;
  }

  function clearSession() {
    geo.stop();
    stopPolling();
    net.disconnect();
    nativeSetSharing(false);
    clearAlertNotification();
    state.responding = null;
    state.knownAlertsShown = false;
    el.ownAlert.hidden = true;
    state.session = null;
    state.alert = null;
    state.group = null;
    state.sosActive = false;
    state.knownAlerts = new Set();
    state.membersKey = "";
    mapView.clear();
    state.batteryWarned.clear();
    geo.reset();
    el.alertBanner.hidden = true;
    el.geoCard.hidden = true;
    el.iosCard.hidden = true;
    el.shareSheet.hidden = true;
    clearSecretsCache();
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !parsed.code || !parsed.memberId || !parsed.name) return null;
      if (parsed.code.length !== CODE_LENGTH && parsed.code.length !== LEGACY_CODE_LENGTH) return null;
      if (!parsed.color) parsed.color = colorFor(parsed.memberId);
      return parsed;
    } catch {
      return null;
    }
  }

  function saveSession() {
    if (!state.session) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.session)); } catch {}
  }

  // ---------- Install / PWA ----------
  function setupInstall() {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    if (standalone || isNativeApp) return;
    el.installCard.hidden = false;
    el.apkCard.hidden = !isAndroid;
    if (isIos) {
      el.installHint.textContent = "Auf dem iPhone: Teilen-Symbol antippen und \"Zum Home-Bildschirm\" wählen.";
    }
    window.addEventListener("beforeinstallprompt", event => {
      event.preventDefault();
      state.installPrompt = event;
      el.installButton.hidden = false;
      el.menuInstall.hidden = false;
    });
    const install = async () => {
      if (!state.installPrompt) return;
      state.installPrompt.prompt();
      await state.installPrompt.userChoice.catch(() => {});
      state.installPrompt = null;
      el.installButton.hidden = true;
      el.menuInstall.hidden = true;
      openMenu(false);
    };
    el.installButton.addEventListener("click", install);
    el.menuInstall.addEventListener("click", install);
    window.addEventListener("appinstalled", () => {
      el.installCard.hidden = true;
      toast("Find Mein Soon ist installiert.");
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || isNativeApp || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register("sw.js").then(registration => {
      // Eine neue Version wurde im Hintergrund geladen: zum Neuladen einladen, statt alte und neue Dateien zu mischen.
      const watch = worker => {
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) showReloadCard();
        });
      };
      watch(registration.installing);
      if (registration.waiting && navigator.serviceWorker.controller) showReloadCard();
      registration.addEventListener("updatefound", () => watch(registration.installing));
    }).catch(() => {});
  }

  function showReloadCard() {
    el.updateText.textContent = "Eine neue Version von Find Mein Soon ist geladen.";
    el.updateLink.textContent = "Neu laden";
    el.updateLink.href = "#";
    el.updateLink.onclick = event => {
      event.preventDefault();
      location.reload();
    };
    el.updateCard.hidden = false;
    toast("Neue Version geladen. Bitte einmal neu laden.");
  }

  function setupNetworkIndicator() {
    window.addEventListener("online", () => {
      updateNetDot();
      net.ensureConnected(0);
    });
    window.addEventListener("offline", updateNetDot);
    updateNetDot();
  }

  function updateNetDot() {
    const online = navigator.onLine && (net.client ? net.connected : true);
    el.netDot.classList.toggle("is-online", online);
    el.netDot.classList.toggle("is-offline", !online);
    setNetStatus();
  }

  /** Lesbarer Verbindungsstatus unter dem Gruppennamen. */
  function setNetStatus() {
    let text;
    let kind = "";
    if (!navigator.onLine) {
      text = "Offline. Kein Internet.";
      kind = "bad";
    } else if (net.client && net.connected) {
      const host = brokerHost(net.brokers[net.brokerIndex] || "");
      const ack = net.lastAck ? `, gesendet ${formatAgo(net.lastAck)}` : "";
      text = `Verbunden über ${host}${ack}`;
      kind = "ok";
    } else if (net.connecting || net.client) {
      text = "Verbindung wird aufgebaut ...";
    } else if (net.failReason) {
      text = `${net.failReason} Nächster Versuch folgt.`;
      kind = "bad";
    } else {
      text = "";
    }
    if (el.netStatus) {
      el.netStatus.textContent = text;
      el.netStatus.className = `net-status${kind ? ` is-${kind}` : ""}`;
    }
    el.netDot.title = text || "Verbindung";
  }

  function openMenu(open) {
    if (open) renderBrokerInfo();
    el.menu.hidden = !open;
  }

  // ---------- Netz: serverlos ueber einen oeffentlichen MQTT-Broker ----------
  // Aus dem Gruppencode werden ein AES-Schluessel und eine Themen-ID abgeleitet. Jedes Mitglied veroeffentlicht
  // seinen verschluesselten Zustand als "retained" Nachricht unter <root>/<memberId>; Gruppendaten (Name,
  // Treffpunkt) liegen unter <root>/meta. Neue Mitglieder bekommen so sofort den letzten Stand aller anderen.

  function brokerList() {
    try {
      const stored = validBrokerUrl(localStorage.getItem(BROKER_KEY));
      if (stored) return [stored, ...BROKERS.filter(url => url !== stored)];
    } catch {
    }
    return BROKERS;
  }

  /** Eigene Zaehlnummer fuer den Wiedereinspiel-Schutz: steigt mit jeder gesendeten Nachricht. */
  function nextSeq() {
    if (!state.session) return 0;
    // Ein zweiter offener Tab teilt sich die Sitzung: den gespeicherten Stand mitlesen, damit die Nummer nie faellt.
    let stored = 0;
    try { stored = Number(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}").seq) || 0; } catch {}
    state.session.seq = Math.max(Number(state.session.seq) || 0, stored) + 1;
    saveSession();
    return state.session.seq;
  }

  async function publishMeta(changes) {
    // Ohne Verbindung wuerde die Aenderung nur lokal stehen und beim naechsten Verbinden vom Stand des Dienstes
    // ueberschrieben. Deshalb erst senden, dann anzeigen.
    if (!net.client || !net.connected) throw new Error("Keine Verbindung. Treffpunkt und Gruppenname lassen sich gleich wieder ändern.");
    const meta = {
      // Keinen Namen erfinden: Wer beitritt, ohne die Gruppendaten erhalten zu haben, soll die Gruppe nicht umbenennen.
      name: net.meta?.name || state.session.groupName || null,
      meetingPoint: net.meta?.meetingPoint || null,
      ...changes,
      ts: Date.now(),
      proto: PROTOCOL_VERSION,
      by: state.session.memberId,
      seq: nextSeq(),
      // Fortlaufende Nummer der Gruppendaten: schuetzt davor, dass ein mitgeschnittener alter Treffpunkt
      // wieder eingespielt wird, und kommt ohne Uhrenvergleich aus.
      rev: (Number(net.meta?.rev) || 0) + 1
    };
    await net.publish(`${net.root}/meta`, meta, META_EXPIRY_S);
    net.noteOwnMeta(meta);
    rebuildGroup();
    render();
  }

  function setMeetingPoint(lat, lng, label) {
    publishMeta({ meetingPoint: { lat, lng, label: String(label).slice(0, 40), setBy: state.session.name, setAt: new Date().toISOString() } }).catch(showError);
  }

  function showError(error) {
    toast(error?.message || "Das hat nicht geklappt.");
  }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3200);
  }

})();
