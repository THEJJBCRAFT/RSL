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
  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const CODE_LENGTH = 12; // neue Gruppen (Protokoll v2): 60 Bit Zufall, angezeigt als XXXX-XXXX-XXXX
  const LEGACY_CODE_LENGTH = 8; // Gruppen der ersten Version (Protokoll v1)
  const KEY_ITERATIONS = 100000; // v1
  const KEY_ITERATIONS_V2 = 250000;
  const TOMBSTONE_EXPIRY_S = 24 * 60 * 60;
  const MEMBER_MAX_AGE_MS = 48 * 60 * 60 * 1000;
  const MEMBER_EXPIRY_S = 7 * 24 * 60 * 60;
  const META_EXPIRY_S = 60 * 24 * 60 * 60;
  const RETRY_DELAYS_MS = [5000, 10000, 30000, 60000];
  const PRIMARY_PROBE_MS = 60000;
  const ALARM_REPEAT_MS = 15000;
  const MEMBER_COLORS = ["#4ff4cf", "#ff3248", "#ffd166", "#8b5cf6", "#38bdf8", "#fb923c", "#a3e635", "#f472b6"];
  const POLL_MS = 8000;
  const HEARTBEAT_MS = 25000;
  const MIN_UPLOAD_GAP_MS = 6000;
  const STALE_MS = 3 * 60 * 1000;
  const OFFLINE_MS = 15 * 60 * 1000;
  // Die Android-App (android/find-mein-soon) haengt diesen Marker an den User-Agent.
  const isNativeApp = /FindMeinSoonApp\//.test(navigator.userAgent);
  // iPads ab iPadOS 13 melden sich als Mac, sind aber an den Touchpunkten erkennbar.
  const isIos = (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) && !window.MSStream;
  const isAndroid = /Android/i.test(navigator.userAgent);
  // Bruecke zur Android-App (Vordergrund-Dienst, Benachrichtigungen, Teilen). Im Browser nicht vorhanden.
  const nativeBridge = typeof window.FindMeinSoonNative === "object" && window.FindMeinSoonNative ? window.FindMeinSoonNative : null;
  const NOTIFY_DISMISS_KEY = "findMeinSoon.notifyDismissed";
  const DEFAULT_ALERT_MESSAGE = "Ich finde euch nicht. Bitte kommt zu mir!";
  const APP_VERSION = "2.1.0";
  const PROTOCOL_VERSION = 2; // steht in jeder Nachricht, damit alte und neue Apps sich nicht stumm missverstehen
  const MAP_STYLE_KEY = "findMeinSoon.mapStyle";
  const UPDATE_CHECK_KEY = "findMeinSoon.updateCheck";
  const IOS_HINT_KEY = "findMeinSoon.iosHintDismissed";
  const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
  const RELEASE_API_URL = "https://api.github.com/repos/THEJJBCRAFT/RSL/releases/tags/find-mein-soon-latest";
  const APK_URL = "https://github.com/THEJJBCRAFT/RSL/releases/download/find-mein-soon-latest/FindMeinSoon.apk";
  const ANDROID_PACKAGE = "de.redstonelabs.findmeinsoon";
  const STILL_MS = 5 * 60 * 1000; // ohne Bewegung: Standort mit geringer Genauigkeit (Akku)
  const TRAIL_MAX_AGE_MS = 30 * 60 * 1000;
  const TRAIL_MAX_POINTS = 80;
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
    menuUpdate: $("menuUpdate")
  };

  const state = {
    session: loadSession(),
    group: null,
    mode: "create",
    position: null,
    sharing: true,
    sosActive: false,
    watchId: null,
    pollTimer: null,
    heartbeatTimer: null,
    lastUpload: 0,
    lastUploadPos: null,
    battery: null,
    pickingMeeting: false,
    knownAlerts: new Set(),
    installPrompt: null,
    map: null,
    markers: new Map(),
    accuracyCircle: null,
    meetingMarker: null,
    firstFit: false,
    toastTimer: null,
    alert: null,
    pendingSession: null,
    leaving: false,
    responding: null,
    dialogResolve: null,
    geoAsked: false,
    lastMoveAt: 0,
    lastMovePos: null,
    lowPower: false,
    trails: new Map(),
    trailLines: new Map(),
    accuracyCircles: new Map(),
    batteryWarned: new Set(),
    ownBatteryWarned: false,
    protoHintShown: false,
    updateBuild: 0
  };

  // Verbindung zur Gruppe (serverlos ueber einen oeffentlichen MQTT-Broker).
  const net = {
    client: null,
    key: null,
    protocol: 0,
    secretsCache: new Map(),
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
    lastConnectAt: 0
  };
  const ABORTED = "fms-aborted";

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
    lowPower: state.lowPower,
    watching: state.watchId !== null,
    trails: [...state.trails.entries()].map(([id, points]) => [id, points.length]),
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
    const joinCode = joinParam ? extractCode(joinParam) : "";
    if (joinCode && !state.session) {
      setMode("join");
      el.setupCode.value = formatCode(joinCode);
      showOpenInApp(joinCode);
    } else if (joinCode && state.session && joinCode !== state.session.code) {
      offerGroupSwitch(joinCode);
    } else if (joinCode && state.session) {
      toast("Du bist schon in dieser Gruppe.");
    }
    if (brokerParam) offerBrokerOverride(brokerParam);
    setupMapControls();
    el.menuVersion.textContent = appVersionText();
    checkForUpdate();

    // Hooks fuer die Android-App.
    window.fmsNativePosition = (lat, lng, accuracy, speed, heading, time) => {
      onPosition({ coords: { latitude: lat, longitude: lng, accuracy, speed, heading }, timestamp: time });
    };
    window.fmsSetSharing = on => {
      if (state.session) setSharing(Boolean(on));
    };
    // Antwort der Android-App auf die Standort-Berechtigung.
    window.fmsPermission = granted => {
      if (!state.session) return;
      if (granted) startWatch();
      else showGeoCard("denied");
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

  /** Nur verschluesselte wss://-Adressen (oder ws:// auf dem eigenen Rechner zum Testen) sind als Verbindungsdienst erlaubt. */
  function validBrokerUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
      if (url.protocol !== "wss:" && !(url.protocol === "ws:" && local)) return null;
      if (url.username || url.password) return null;
      return String(value).trim();
    } catch {
      return null;
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
      disconnectNet();
      ensureConnected(0);
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
      el.setupCode.value = formatCode(extractCode(el.setupCode.value));
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
          const wrong = [...code].filter(char => !CODE_ALPHABET.includes(char));
          if (wrong.length) throw new Error(`Der Code enthält nie ${wrong.join(", ")}. Bitte prüfe ihn (z. B. 8 statt B, 5 statt S, 2 statt Z).`);
        }
        const memberId = randomId(8);
        const session = { code, memberId, name: memberName.slice(0, 40), color: colorFor(memberId), groupName, sharing: true, alert: null };
        await connectGroup(session);
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
        if (!state.pendingSession) disconnectNet();
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
    const groupName = state.group?.name || old.groupName || "";
    const meetingPoint = state.group?.meetingPoint || null;
    toast("Neue Gruppe wird erstellt ...");
    await departGroup();
    const memberId = randomId(8);
    const session = { code: newGroupCode(), memberId, name: old.name, color: colorFor(memberId), groupName, sharing: true, alert: null };
    try {
      await connectGroup(session);
    } catch (error) {
      showSetup();
      el.setupName.value = old.name;
      el.setupGroupName.value = groupName;
      setMode("create");
      showSetupError(`Die alte Gruppe wurde verlassen, die neue konnte aber nicht erstellt werden: ${error.message || ""}`);
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
      disconnectNet();
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
      disconnectNet();
      toast("Verbindung wird neu aufgebaut ...");
      ensureConnected(0);
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
    el.menuRenew.addEventListener("click", async () => {
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
    });
    el.menuBrokerReset.addEventListener("click", () => {
      try { localStorage.removeItem(BROKER_KEY); } catch {}
      renderBrokerInfo();
      openMenu(false);
      toast("Standard-Verbindungsdienst wird wieder genutzt.");
      if (state.session) {
        disconnectNet();
        ensureConnected(0);
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
      state.geoAsked = true;
      el.geoCard.hidden = true;
      if (nativeBridge && typeof nativeBridge.setSharing === "function") {
        // Android fragt die Berechtigung ab und meldet die Antwort ueber window.fmsPermission.
        let granted = false;
        try { granted = nativeBridge.locationPermission && nativeBridge.locationPermission() === "granted"; } catch {}
        if (granted) startWatch();
        else nativeSetSharing(true);
        return;
      }
      startWatch();
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
      if (state.map && state.position) state.map.setView([state.position.lat, state.position.lng], Math.max(state.map.getZoom(), 16));
      else toast("Dein Standort ist noch nicht bekannt.");
    });
    el.fitButton.addEventListener("click", fitAll);
    el.sheetHandle.addEventListener("click", () => el.sheet.classList.toggle("is-collapsed"));

    el.memberList.addEventListener("click", event => {
      const item = event.target.closest("[data-member]");
      if (!item || event.target.closest("a")) return;
      const member = state.group?.members.find(entry => entry.id === item.dataset.member);
      if (member && member.lat !== null && state.map) {
        state.map.setView([member.lat, member.lng], Math.max(state.map.getZoom(), 16));
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!state.session) return;
      if (document.visibilityState === "visible") {
        startPolling();
        checkSharingTimer();
        ensureConnected(0);
        if (audio.ctx && audio.ctx.state !== "running") audio.ctx.resume().catch(() => {});
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
    state.alert = state.session.alert && state.session.alert.active ? state.session.alert : null;
    state.sosActive = Boolean(state.alert);
    applySharingUi();
    rebuildGroup();
    render();
    initMap();
    if (state.sharing) startGeolocation();
    else {
      startHeartbeat();
      nativeSetSharing(false);
    }
    startPolling();
    watchBattery();
    showNotifyCardIfUseful();
    showIosHintIfUseful();
    if (net.client) uploadLocation(true);
    else ensureConnected(0);
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

  function showNotifyCardIfUseful() {
    if (nativeBridge || !("Notification" in window) || Notification.permission !== "default") return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(NOTIFY_DISMISS_KEY) === "1"; } catch {}
    el.notifyCard.hidden = dismissed;
  }

  /**
   * Stellt die Verbindung her und versucht es bei Fehlern mit wachsendem Abstand weiter.
   * Wird beim Start, bei "online", beim Sichtbarwerden und von "Neu verbinden" aufgerufen.
   */
  function ensureConnected(delayMs) {
    if (!state.session || net.client || net.connecting) return;
    clearTimeout(net.retryTimer);
    net.retryTimer = setTimeout(async () => {
      if (!state.session || net.client || net.connecting) return;
      net.connecting = true;
      setNetStatus();
      let retryIn = -1;
      try {
        await connectGroup(state.session);
        net.retryCount = 0;
        net.failReason = "";
        uploadLocation(true);
      } catch (error) {
        if (error && error.message === ABORTED) {
          // Jemand hat die Verbindung waehrend des Versuchs neu gestartet oder die Gruppe verlassen.
          retryIn = state.session ? 0 : -1;
        } else {
          net.failReason = error.message || "Keine Verbindung.";
          retryIn = RETRY_DELAYS_MS[Math.min(net.retryCount, RETRY_DELAYS_MS.length - 1)];
          net.retryCount++;
        }
      } finally {
        net.connecting = false;
        setNetStatus();
      }
      if (retryIn >= 0 && state.session && !net.client) ensureConnected(retryIn);
    }, Math.max(0, delayMs || 0));
  }

  function applySharingUi() {
    el.shareToggle.classList.toggle("is-on", state.sharing);
    const until = state.session?.sharingUntil;
    el.shareToggle.querySelector(".toggle-state").textContent = state.sharing ? (until ? `bis ${formatClock(until)}` : "AN") : "AUS";
  }

  /** "20:00" oder "2" (Stunden) -> Zeitpunkt, bis zu dem geteilt wird. */
  function parseUntil(text) {
    const value = String(text || "").trim().replace(",", ".");
    const clock = value.match(/^(\d{1,2})[:.](\d{2})$/);
    if (clock && Number(clock[1]) < 24 && Number(clock[2]) < 60) {
      const date = new Date();
      date.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
      if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
      return date.getTime();
    }
    const hours = Number(value.replace(/\s*(h|std\.?|stunden?)$/i, ""));
    if (Number.isFinite(hours) && hours > 0 && hours <= 48) return Date.now() + hours * 3600000;
    return null;
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

  /** Zeitpunkt eines Mitglieds in unserer Uhr: Versatz der Senderuhr (bei Live-Nachrichten gemessen) wird herausgerechnet. */
  function memberTime(member, iso) {
    const time = Date.parse(iso || "");
    if (!Number.isFinite(time)) return 0;
    return time + (Number.isFinite(member.skew) ? member.skew : 0);
  }

  function isOffline(member) {
    return Date.now() - memberTime(member, member.lastSeen) > OFFLINE_MS;
  }

  function myMember() {
    return state.session ? buildMe() : null;
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

    el.sosButton.classList.toggle("is-active", state.sosActive);
    el.sosButton.querySelector(".sos-label").textContent = state.sosActive ? "Ich bin sicher" : "Finde mich!";

    renderAlerts();
    renderOwnAlert();
    renderMeeting();
    renderMembers();
    renderMarkers();
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
    if (newAlerts.length) notifyAlert(newAlerts[0]);

    el.alertBanner.hidden = !alerts.length;
    if (!alerts.length) {
      stopAlarmSound();
      audio.muted = false;
      el.alertMute.textContent = "Ton stumm";
      if (state.knownAlertsShown) {
        state.knownAlertsShown = false;
        clearAlertNotification();
      }
      return;
    }
    state.knownAlertsShown = true;
    const target = alerts[0];
    el.alertRespond.textContent = state.responding === target.id ? "Bin unterwegs ✓" : "Ich komme";
    const first = alerts[0];
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

  // ---------- Map ----------
  function initMap() {
    if (state.map) return;
    if (typeof L === "undefined") {
      el.mapFallback.hidden = false;
      return;
    }
    state.map = L.map(el.map, { zoomControl: false, attributionControl: true }).setView([51.1657, 10.4515], 6);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>"
    }).addTo(state.map);
    state.map.on("click", async event => {
      if (!state.pickingMeeting) return;
      setPicking(false);
      const label = await dialog({ title: "Treffpunkt", text: "Wie soll der Treffpunkt heißen?", input: true, value: "Treffpunkt", ok: "Setzen" });
      if (label === null) return;
      setMeetingPoint(event.latlng.lat, event.latlng.lng, label || "Treffpunkt");
    });
  }

  function renderMarkers() {
    if (!state.map) return;
    const seen = new Set();
    state.group.members.forEach(member => {
      if (member.lat === null || member.lng === null) return;
      seen.add(member.id);
      const isMe = member.id === state.session.memberId;
      const stale = Date.now() - memberTime(member, member.locatedAt) > STALE_MS;
      const classes = ["fms-pin"];
      if (isMe) classes.push("is-me");
      if (member.alert?.active) classes.push("is-alert");
      if (stale && !isMe) classes.push("is-stale");
      const icon = L.divIcon({
        className: "fms-marker",
        html: `<div class="${classes.join(" ")}" style="background:${member.color}"><span>${escapeHtml(initials(member.name))}</span></div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 38],
        popupAnchor: [0, -36]
      });
      let marker = state.markers.get(member.id);
      if (!marker) {
        marker = L.marker([member.lat, member.lng], { icon, zIndexOffset: isMe ? 1000 : member.alert?.active ? 900 : 0 }).addTo(state.map);
        state.markers.set(member.id, marker);
      } else {
        marker.setLatLng([member.lat, member.lng]);
        marker.setIcon(icon);
      }
      marker.bindPopup(`<strong>${escapeHtml(member.name)}</strong><br>${escapeHtml(memberMeta(member, isMe))}`);
      renderAccuracy(member, isMe);
      renderTrail(member);
    });

    state.markers.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove();
        state.markers.delete(id);
        const circle = state.accuracyCircles.get(id);
        if (circle) { circle.remove(); state.accuracyCircles.delete(id); }
        const line = state.trailLines.get(id);
        if (line) { line.remove(); state.trailLines.delete(id); }
        state.trails.delete(id);
      }
    });

    if (state.position) {
      const latLng = [state.position.lat, state.position.lng];
      const radius = Math.min(state.position.accuracy || 0, 500);
      if (!state.accuracyCircle) {
        state.accuracyCircle = L.circle(latLng, { radius, color: "#4ff4cf", weight: 1, fillOpacity: .08 }).addTo(state.map);
      } else {
        state.accuracyCircle.setLatLng(latLng).setRadius(radius);
      }
    }

    const point = state.group.meetingPoint;
    if (point) {
      const icon = L.divIcon({ className: "fms-marker", html: "<div class=\"fms-meeting\">&#9873;</div>", iconSize: [34, 34], iconAnchor: [17, 34] });
      if (!state.meetingMarker) state.meetingMarker = L.marker([point.lat, point.lng], { icon }).addTo(state.map);
      else state.meetingMarker.setLatLng([point.lat, point.lng]).setIcon(icon);
      state.meetingMarker.bindPopup(`<strong>${escapeHtml(point.label)}</strong><br>gesetzt von ${escapeHtml(point.setBy)}`);
    } else if (state.meetingMarker) {
      state.meetingMarker.remove();
      state.meetingMarker = null;
    }

    if (!state.firstFit && (state.markers.size || state.position)) {
      state.firstFit = true;
      fitAll();
    }
  }

  /** Genauigkeitskreis auch fuer andere: ab 30 m sichtbar, damit "800 m ungenau" nicht wie ein exakter Punkt aussieht. */
  function renderAccuracy(member, isMe) {
    if (isMe) return; // der eigene Kreis kommt aus state.position
    const radius = Math.min(Number(member.accuracy) || 0, 1500);
    let circle = state.accuracyCircles.get(member.id);
    if (radius < 30) {
      if (circle) { circle.remove(); state.accuracyCircles.delete(member.id); }
      return;
    }
    const latLng = [member.lat, member.lng];
    if (!circle) {
      circle = L.circle(latLng, { radius, color: member.color, weight: 1, dashArray: "4 4", fillOpacity: .06, interactive: false }).addTo(state.map);
      state.accuracyCircles.set(member.id, circle);
    } else {
      circle.setLatLng(latLng).setRadius(radius).setStyle({ color: member.color });
    }
  }

  /** Spur der letzten 30 Minuten je Mitglied. */
  function renderTrail(member) {
    const at = memberTime(member, member.locatedAt) || Date.now();
    let trail = state.trails.get(member.id);
    if (!trail) {
      trail = [];
      state.trails.set(member.id, trail);
    }
    const last = trail[trail.length - 1];
    if (!last || (distanceMeters(last, member) > 10 && at > last.at)) trail.push({ lat: member.lat, lng: member.lng, at });
    const cutoff = Date.now() - TRAIL_MAX_AGE_MS;
    while (trail.length && (trail[0].at < cutoff || trail.length > TRAIL_MAX_POINTS)) trail.shift();
    const points = trail.map(point => [point.lat, point.lng]);
    let line = state.trailLines.get(member.id);
    if (points.length < 2) {
      if (line) { line.remove(); state.trailLines.delete(member.id); }
      return;
    }
    if (!line) {
      line = L.polyline(points, { color: member.color, weight: 3, opacity: .55, dashArray: "1 6", lineCap: "round", interactive: false }).addTo(state.map);
      state.trailLines.set(member.id, line);
    } else {
      line.setLatLngs(points).setStyle({ color: member.color });
    }
  }

  function setupMapControls() {
    el.zoomIn.addEventListener("click", () => state.map && state.map.zoomIn());
    el.zoomOut.addEventListener("click", () => state.map && state.map.zoomOut());
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

  function fitAll() {
    if (!state.map) return;
    const points = [];
    state.markers.forEach(marker => points.push(marker.getLatLng()));
    if (state.position) points.push(L.latLng(state.position.lat, state.position.lng));
    if (state.group?.meetingPoint) points.push(L.latLng(state.group.meetingPoint.lat, state.group.meetingPoint.lng));
    if (!points.length) {
      toast("Noch keine Standorte vorhanden.");
      return;
    }
    if (points.length === 1) {
      state.map.setView(points[0], 16);
      return;
    }
    state.map.fitBounds(L.latLngBounds(points).pad(0.25), { maxZoom: 17 });
  }

  function startMeetingPick() {
    if (!state.map) {
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
    el.map.style.cursor = active ? "crosshair" : "";
  }

  // ---------- Geolocation ----------
  /** Standort starten: erst erklaeren, dann fragen. Der Herzschlag laeuft auch ohne Standort (Pause, keine Berechtigung). */
  function startGeolocation() {
    startHeartbeat();
    if (!("geolocation" in navigator)) {
      setGeoStatus("Dein Gerät unterstützt keine Standortabfrage.", "error");
      return;
    }
    if (state.watchId !== null) return;
    geoPermissionState().then(permission => {
      if (state.watchId !== null || !state.session || !state.sharing) return;
      if (permission === "granted" || state.geoAsked) startWatch();
      else showGeoCard(permission);
    });
  }

  function geoPermissionState() {
    if (nativeBridge && typeof nativeBridge.locationPermission === "function") {
      try { return Promise.resolve(nativeBridge.locationPermission() === "granted" ? "granted" : "prompt"); } catch {}
    }
    if (!navigator.permissions?.query) return Promise.resolve("prompt");
    return navigator.permissions.query({ name: "geolocation" }).then(result => result.state).catch(() => "prompt");
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

  function startWatch(highAccuracy = !state.lowPower) {
    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    el.geoCard.hidden = true;
    setGeoStatus("Standort wird gesucht ...");
    state.watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: highAccuracy,
      maximumAge: highAccuracy ? 5000 : 30000,
      timeout: 20000
    });
    nativeSetSharing(state.sharing);
  }

  function stopWatch() {
    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  function startHeartbeat() {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = setInterval(() => {
      checkSharingTimer();
      checkStillness();
      uploadLocation(true);
    }, HEARTBEAT_MS);
  }

  function stopGeolocation() {
    stopWatch();
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }

  /** Nach 5 Minuten ohne Bewegung reicht der Netz-Standort; bei Bewegung geht es zurueck auf GPS. */
  function checkStillness() {
    if (!state.sharing || state.watchId === null || !state.position || state.lowPower) return;
    if (Date.now() - state.lastMoveAt > STILL_MS) {
      state.lowPower = true;
      startWatch(false);
      nativeSetLowPower(true);
    }
  }

  function nativeSetLowPower(on) {
    if (!nativeBridge || typeof nativeBridge.setLowPower !== "function") return;
    try { nativeBridge.setLowPower(Boolean(on)); } catch {}
  }

  function onPosition(position) {
    const coords = position.coords;
    const now = Date.now();
    state.position = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      heading: Number.isFinite(coords.heading) ? coords.heading : null,
      speed: Number.isFinite(coords.speed) ? coords.speed : null,
      at: now
    };
    const moveThreshold = Math.max(30, Number(coords.accuracy) || 0);
    if (!state.lastMovePos || distanceMeters(state.position, state.lastMovePos) > moveThreshold) {
      state.lastMovePos = { lat: coords.latitude, lng: coords.longitude };
      state.lastMoveAt = now;
      if (state.lowPower) {
        state.lowPower = false;
        startWatch(true);
        nativeSetLowPower(false);
      }
    }
    if (coords.accuracy > 1000) {
      setGeoStatus(`Nur ungefährer Standort (±${formatDistance(coords.accuracy)}). Erlaube in den Einstellungen den genauen Standort.`, "warn");
    } else {
      setGeoStatus(`Standort aktiv (±${Math.round(coords.accuracy)} m${state.lowPower ? ", Stromsparmodus" : ""})`, "ok");
    }
    if (state.group) {
      rebuildGroup(); // eigener Eintrag (Marker, Spur, Entfernungen) sofort aktuell, auch wenn das Senden gedrosselt ist
      renderMarkers();
      renderMembers();
      renderMeeting();
    }
    uploadLocation(false);
  }

  function onPositionError(error) {
    const messages = {
      1: "Standort verweigert. Bitte in den Einstellungen erlauben.",
      2: "Standort gerade nicht verfügbar.",
      3: "Standortsuche dauert zu lange ..."
    };
    setGeoStatus(messages[error.code] || "Standortfehler.", "error");
    if (error.code === 1) {
      stopWatch();
      showGeoCard("denied");
    }
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
      await publishSelf();
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
      saveSession();
    }
    if (!state.sharing && state.session) state.session.sharingUntil = null;
    applySharingUi();
    if (state.sharing) {
      startGeolocation();
    } else {
      // Pause: GPS aus, nur der Herzschlag laeuft weiter (Akku).
      stopWatch();
      state.lowPower = false;
      nativeSetSharing(false);
    }
    uploadLocation(true);
  }

  function watchBattery() {
    if (!navigator.getBattery) return;
    navigator.getBattery().then(battery => {
      const update = () => {
        state.battery = Math.round(battery.level * 100);
        if (state.group) rebuildGroup();
      };
      update();
      battery.addEventListener("levelchange", update);
    }).catch(() => {});
  }

  // ---------- Polling ----------
  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(() => {
      rebuildGroup();
      render();
    }, POLL_MS);
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
    startAlarmSound();
    showAlertNotification(member);
    if (state.map && member.lat !== null) state.map.setView([member.lat, member.lng], Math.max(state.map.getZoom(), 16));
  }

  function showAlertNotification(member) {
    const title = `${member.name} ruft: Finde mich!`;
    const body = member.alert?.message || "Öffne Find Mein Soon, um die Person auf der Karte zu sehen.";
    if (nativeBridge && typeof nativeBridge.showAlert === "function") {
      try { nativeBridge.showAlert(member.id, member.name, member.alert?.message || "", member.lat ?? 0, member.lng ?? 0); } catch {}
      return;
    }
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const options = { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "fms-alert", renotify: true, requireInteraction: true, vibrate: [300, 120, 300, 120, 500] };
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
    stopGeolocation();
    stopPolling();
    let removed = false;
    try {
      removed = await Promise.race([leaveNet(), new Promise(resolve => setTimeout(() => resolve(false), 3000))]);
    } catch {
    }
    clearSession();
    state.leaving = false;
    return removed;
  }

  function clearSession() {
    stopGeolocation();
    stopPolling();
    disconnectNet();
    nativeSetSharing(false);
    clearAlertNotification();
    state.responding = null;
    state.knownAlertsShown = false;
    el.ownAlert.hidden = true;
    state.session = null;
    state.alert = null;
    state.group = null;
    state.sosActive = false;
    state.firstFit = false;
    state.knownAlerts = new Set();
    state.markers.forEach(marker => marker.remove());
    state.markers.clear();
    if (state.meetingMarker) {
      state.meetingMarker.remove();
      state.meetingMarker = null;
    }
    if (state.accuracyCircle) {
      state.accuracyCircle.remove();
      state.accuracyCircle = null;
    }
    state.accuracyCircles.forEach(circle => circle.remove());
    state.accuracyCircles.clear();
    state.trailLines.forEach(line => line.remove());
    state.trailLines.clear();
    state.trails.clear();
    state.batteryWarned.clear();
    state.lowPower = false;
    state.geoAsked = false;
    el.alertBanner.hidden = true;
    el.geoCard.hidden = true;
    el.iosCard.hidden = true;
    el.shareSheet.hidden = true;
    net.secretsCache.clear();
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
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  function setupNetworkIndicator() {
    window.addEventListener("online", () => {
      updateNetDot();
      ensureConnected(0);
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

  function brokerHost(url) {
    try { return new URL(url).host.replace(/:\d+$/, ""); } catch { return url; }
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

  /**
   * Verbindet mit dem ersten erreichbaren Broker. Der Haupt-Broker wird mehrfach versucht, damit alle
   * Mitglieder moeglichst beim selben Dienst landen. Landet man doch auf einem Ersatz, wird regelmaessig
   * zurueck zum Haupt-Broker gewechselt (probePrimary).
   */
  async function connectGroup(session) {
    if (typeof mqtt === "undefined") throw new Error("Die Netzwerk-Bibliothek konnte nicht geladen werden.");
    resetNet();
    const generation = net.generation;
    const secrets = await deriveGroupSecrets(session.code);
    if (generation !== net.generation) throw new Error(ABORTED);
    net.key = secrets.key;
    net.protocol = secrets.version;
    net.root = `fms/v${secrets.version}/${secrets.topicId}`;
    net.members = new Map();
    net.meta = null;
    net.brokers = brokerList();

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
          updateNetDot();
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
      if (net.client !== current || net.root !== root || generation !== net.generation || !state.session) {
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
      scheduleResync();
      publishSelf().catch(() => {});
      if (net.meta) publish(`${net.root}/meta`, net.meta, META_EXPIRY_S).catch(() => {});
      updateNetDot();
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
      const client = mqtt.connect(url, options);
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
          client.subscribe(`${net.root}/#`, { qos: 1 });
          scheduleResync();
          publishSelf().catch(() => {});
          if (net.meta) publish(`${net.root}/meta`, net.meta, META_EXPIRY_S).catch(() => {});
          updateNetDot();
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
          updateNetDot();
          // Watchdog: haengt der Broker laenger als eine Minute, obwohl Internet da ist, die Liste neu durchgehen.
          if (navigator.onLine && state.session && !state.leaving && Date.now() - net.lastConnectAt > 60000) {
            disconnectNet();
            ensureConnected(0);
          }
        }
      });
      client.on("offline", () => {
        if (net.client === client) {
          net.connected = false;
          updateNetDot();
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
      if (changed) {
        rebuildGroup();
        render();
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
    net.brokerIndex = -1;
    net.lastAck = 0;
  }

  /** Vollstaendiges Trennen (Gruppe verlassen, "Neu verbinden"). Ein laufender Verbindungsversuch bricht sich selbst ab. */
  function disconnectNet() {
    resetNet();
    clearTimeout(net.retryTimer);
    net.retryTimer = null;
    net.failReason = "";
    updateNetDot();
  }

  async function handleMessage(topic, payload, packet) {
    if (!net.root || !topic.startsWith(`${net.root}/`)) return;
    const sub = topic.slice(net.root.length + 1);
    if (!/^[a-z0-9]+$/.test(sub)) return;
    if (!payload || !payload.length) {
      // Leere retained Nachricht. Nur im alten Protokoll heisst das "hat verlassen". In v2 zaehlt allein die
      // verschluesselte Abschiedsnachricht, sonst koennte jeder, der die Themen-ID sieht, Mitglieder von der Karte nehmen.
      if (net.protocol === 1 && sub !== "meta" && net.members.delete(sub)) {
        rebuildGroup();
        render();
      }
      return;
    }
    let data;
    try {
      data = await decrypt(payload, topic);
    } catch {
      return; // fremde, beschaedigte oder auf ein anderes Thema kopierte Nachricht
    }
    if (!data || typeof data !== "object") return;
    if (Number(data.proto) > PROTOCOL_VERSION && !state.protoHintShown) {
      state.protoHintShown = true;
      toast("Jemand in der Gruppe nutzt eine neuere App-Version. Bitte aktualisiere Find Mein Soon.");
    }

    if (sub === "meta") {
      // Der Broker liefert Nachrichten in der Reihenfolge, in der er sie angenommen hat: die letzte gilt.
      net.meta = {
        name: cleanText(data.name, 40) || net.meta?.name || null,
        meetingPoint: sanitizeMeeting(data.meetingPoint),
        ts: Number(data.ts || 0)
      };
    } else {
      if (sub === state.session?.memberId) return; // eigener Eintrag: der lokale Zustand ist aktueller
      const existing = net.members.get(sub);
      if (data.left === true) {
        // Abschiedsnachricht (v2): gilt nur, wenn sie nicht aelter als der bekannte Stand ist.
        if (!existing || Number(data.ts || 0) < existing.ts) return;
        net.members.delete(sub);
        rebuildGroup();
        render();
        return;
      }
      const member = sanitizeMember(sub, data);
      if (existing && member.ts < existing.ts) return;
      // Uhrenversatz nur aus Live-Nachrichten ableiten; retained Nachrichten koennen beliebig alt sein.
      member.skew = packet && !packet.retain && member.ts ? Date.now() - member.ts : (existing ? existing.skew : undefined);
      net.members.set(sub, member);
    }
    rebuildGroup();
    render();
  }

  function sanitizeMember(id, data) {
    const num = value => (value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null);
    const lat = num(data.lat);
    const lng = num(data.lng);
    const valid = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    return {
      id,
      name: cleanText(data.name, 40) || "Unbekannt",
      color: /^#[0-9a-f]{6}$/i.test(String(data.color || "")) ? data.color : colorFor(id),
      lat: valid ? lat : null,
      lng: valid ? lng : null,
      accuracy: num(data.accuracy),
      heading: num(data.heading),
      speed: num(data.speed),
      battery: num(data.battery),
      sharing: data.sharing !== false,
      alert: data.alert && data.alert.active ? { active: true, message: cleanText(data.alert.message, 160), since: String(data.alert.since || "") } : null,
      responding: typeof data.responding === "string" && /^[a-z0-9]{1,32}$/.test(data.responding) ? data.responding : null,
      locatedAt: typeof data.locatedAt === "string" ? data.locatedAt : null,
      lastSeen: typeof data.lastSeen === "string" ? data.lastSeen : new Date().toISOString(),
      ts: Number(data.ts || 0),
      receivedAt: Date.now()
    };
  }

  function sanitizeMeeting(point) {
    if (!point || typeof point !== "object") return null;
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, label: cleanText(point.label, 40) || "Treffpunkt", setBy: cleanText(point.setBy, 40) || "?", setAt: String(point.setAt || "") };
  }

  function cleanText(value, max) {
    return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
  }

  async function publishSelf() {
    if (!net.client || !state.session || state.leaving) return;
    const me = { ...buildMe(), ts: Date.now() };
    await publish(`${net.root}/${state.session.memberId}`, me, MEMBER_EXPIRY_S);
  }

  async function publishMeta(changes) {
    if (!net.client) throw new Error("Nicht verbunden.");
    const meta = {
      name: net.meta?.name || state.session.groupName || `Gruppe ${state.session.code}`,
      meetingPoint: net.meta?.meetingPoint || null,
      ...changes,
      ts: Date.now(),
      proto: PROTOCOL_VERSION
    };
    net.meta = meta;
    rebuildGroup();
    render();
    await publish(`${net.root}/meta`, meta, META_EXPIRY_S);
  }

  function setMeetingPoint(lat, lng, label) {
    publishMeta({ meetingPoint: { lat, lng, label: String(label).slice(0, 40), setBy: state.session.name, setAt: new Date().toISOString() } }).catch(showError);
  }

  async function leaveNet() {
    if (!net.client || !state.session || !net.connected) return false;
    const topic = `${net.root}/${state.session.memberId}`;
    if (net.protocol === 1) {
      // Altes Protokoll: leere retained Nachricht loescht den eigenen Eintrag beim Broker.
      return new Promise(resolve => net.client.publish(topic, "", { qos: 1, retain: true }, error => resolve(!error)));
    }
    // v2: verschluesselte Abschiedsnachricht, die nur mit dem Gruppenschluessel entstehen kann. Sie ersetzt den
    // eigenen Eintrag beim Broker und verfaellt von selbst.
    try {
      await publish(topic, { left: true, ts: Date.now() }, TOMBSTONE_EXPIRY_S);
      return true;
    } catch {
      return false;
    }
  }

  /** Sendet verschluesselt und retained. Ohne Verbindung wird nichts gepuffert: nach dem Verbinden geht der aktuelle Stand raus. */
  async function publish(topic, data, expirySeconds) {
    if (!net.client || !net.connected) return;
    const body = await encrypt(data, topic);
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
        setNetStatus();
        resolve();
      });
    });
  }

  // ---------- Verschluesselung ----------
  // Protokoll v1 (8-stelliger Code): PBKDF2 liefert Schluessel und Themen-ID in einem Rutsch, Nachrichten ohne Kanal-Bindung.
  // Protokoll v2 (12-stelliger Code): PBKDF2 streckt den Code, HKDF trennt Schluessel und Themen-ID; jede Nachricht ist
  // ueber AES-GCM an ihr Thema gebunden (kopierte Nachrichten sind auf anderen Themen ungueltig) und Verlassen ist eine
  // verschluesselte Abschiedsnachricht statt einer beliebig faelschbaren leeren Nachricht.
  function protocolFor(code) {
    return code.length === LEGACY_CODE_LENGTH ? 1 : 2;
  }

  async function deriveGroupSecrets(code) {
    const cached = net.secretsCache.get(code);
    if (cached) return cached;
    const enc = text => new TextEncoder().encode(text);
    const version = protocolFor(code);
    const material = await crypto.subtle.importKey("raw", enc(code), "PBKDF2", false, ["deriveBits"]);
    let secrets;
    if (version === 1) {
      const bytes = new Uint8Array(await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: enc("find-mein-soon-v1"), iterations: KEY_ITERATIONS, hash: "SHA-256" },
        material,
        512
      ));
      const key = await crypto.subtle.importKey("raw", bytes.slice(0, 32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
      secrets = { version, key, topicId: toHex(bytes.slice(32, 48)) };
    } else {
      const prk = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: enc("find-mein-soon-v2"), iterations: KEY_ITERATIONS_V2, hash: "SHA-256" },
        material,
        256
      );
      const hkdf = await crypto.subtle.importKey("raw", prk, "HKDF", false, ["deriveBits"]);
      const derive = (info, bits) => crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: enc("find-mein-soon-v2"), info: enc(info) }, hkdf, bits);
      const key = await crypto.subtle.importKey("raw", await derive("fms-v2/key", 256), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
      secrets = { version, key, topicId: toHex(new Uint8Array(await derive("fms-v2/topic", 128))) };
    }
    net.secretsCache.set(code, secrets);
    return secrets;
  }

  function aadFor(topic) {
    return net.protocol >= 2 ? new TextEncoder().encode(String(topic)) : undefined;
  }

  async function encrypt(data, topic) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(data));
    const params = { name: "AES-GCM", iv };
    const aad = aadFor(topic);
    if (aad) params.additionalData = aad;
    const cipher = new Uint8Array(await crypto.subtle.encrypt(params, net.key, plain));
    const out = new Uint8Array(iv.length + cipher.length);
    out.set(iv, 0);
    out.set(cipher, iv.length);
    return out;
  }

  async function decrypt(payload, topic) {
    const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
    if (bytes.length < 13) throw new Error("zu kurz");
    const params = { name: "AES-GCM", iv: bytes.slice(0, 12) };
    const aad = aadFor(topic);
    if (aad) params.additionalData = aad;
    const plain = await crypto.subtle.decrypt(params, net.key, bytes.slice(12));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function toHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function newGroupCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
    return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  }

  function cleanCode(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
  }

  /** Anzeigeform: Vierergruppen mit Bindestrich (ABCD-EFGH-JKLM). */
  function formatCode(code) {
    return cleanCode(code).replace(/(.{4})(?=.)/g, "$1-");
  }

  /** Holt den Code auch aus eingefuegtem Einladungstext oder einem Link heraus (8 oder 12 Zeichen, mit oder ohne Bindestriche). */
  function extractCode(value) {
    const raw = String(value || "");
    const fromLink = raw.match(/join=([A-Za-z0-9-]{8,14})/);
    if (fromLink) return cleanCode(fromLink[1]);
    const upper = raw.toUpperCase();
    const block = `[${CODE_ALPHABET}]{4}`;
    const codePattern = `${block}-?${block}(?:-?${block})?`;
    const labelled = upper.match(new RegExp(`CODE[:\\s]*(${codePattern})`));
    if (labelled) return cleanCode(labelled[1]);
    if (upper.replace(/[^A-Z0-9]/g, "").length > CODE_LENGTH) {
      // Laengerer Text: das letzte passende Wort ist der Code (steht in Einladungen am Ende).
      const tokens = [...upper.matchAll(new RegExp(`(?:^|[^A-Z0-9])(${codePattern})(?=[^A-Z0-9]|$)`, "g"))];
      if (tokens.length) return cleanCode(tokens[tokens.length - 1][1]);
    }
    return cleanCode(raw);
  }

  function randomId(bytes) {
    return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function colorFor(id) {
    let hash = 0;
    for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return MEMBER_COLORS[hash % MEMBER_COLORS.length];
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

  // ---------- Helpers ----------
  function distanceMeters(a, b) {
    const R = 6371000;
    const toRad = value => value * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return "?";
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0).replace(".", ",")} km`;
  }

  function formatClock(time) {
    if (!Number.isFinite(time) || !time) return "?";
    return new Date(time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  function formatAgo(iso) {
    const time = typeof iso === "number" ? iso : Date.parse(iso || "");
    if (!Number.isFinite(time) || !time) return "nie";
    const diff = Date.now() - time;
    if (diff < 20000) return "gerade eben";
    if (diff < 60000) return `vor ${Math.round(diff / 1000)} Sek.`;
    if (diff < 3600000) return `vor ${Math.round(diff / 60000)} Min.`;
    if (diff < OFFLINE_MS * 8) return `vor ${Math.round(diff / 3600000)} Std.`;
    return new Date(time).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function initials(name) {
    return String(name || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "?";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
  }
})();
