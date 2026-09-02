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
  const CODE_LENGTH = 8;
  const KEY_ITERATIONS = 100000;
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
    toast: $("toast")
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
    leaving: false
  };

  // Verbindung zur Gruppe (serverlos ueber einen oeffentlichen MQTT-Broker).
  const net = {
    client: null,
    key: null,
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
    resyncTimer: null
  };

  const audio = { ctx: null, muted: false, repeatTimer: null };

  init();

  // Kleiner Einblick fuer automatische Tests (keine Geheimnisse).
  window.fmsDebug = () => ({
    connected: net.connected,
    connecting: net.connecting,
    broker: net.brokers[net.brokerIndex] || null,
    protocol: net.client?.options?.protocolVersion || null,
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
    bindSetup();
    bindMain();
    registerServiceWorker();

    const joinParam = new URLSearchParams(location.search).get("join");
    if (joinParam && !state.session) {
      setMode("join");
      el.setupCode.value = cleanCode(joinParam);
    }

    if (state.session) {
      enterGroup();
    } else {
      showSetup();
    }
  }

  // ---------- Setup ----------
  function bindSetup() {
    el.segmented.addEventListener("click", event => {
      const button = event.target.closest("button[data-mode]");
      if (button) setMode(button.dataset.mode);
    });

    el.setupCode.addEventListener("input", () => {
      el.setupCode.value = extractCode(el.setupCode.value);
      el.setupForce.hidden = true;
      state.pendingSession = null;
    });

    el.setupForce.addEventListener("click", () => {
      if (!state.pendingSession) return;
      completeJoin(state.pendingSession);
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
          if (code.length !== CODE_LENGTH) throw new Error(`Der Gruppencode hat ${CODE_LENGTH} Zeichen.`);
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
        completeJoin(session);
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
  function completeJoin(session) {
    state.pendingSession = null;
    el.setupForce.hidden = true;
    state.session = session;
    state.sharing = true;
    state.alert = null;
    state.sosActive = false;
    saveSession();
    if (state.mode === "create") publishMeta({ name: session.groupName, meetingPoint: null }).catch(() => {});
    history.replaceState(null, "", location.pathname);
    enterGroup();
    if (state.mode === "create") toast(`Gruppe erstellt. Code: ${session.code}`);
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
    const unlock = () => {
      unlockAudio();
      ["pointerdown", "touchstart", "keydown"].forEach(type => document.removeEventListener(type, unlock, true));
    };
    ["pointerdown", "touchstart", "keydown"].forEach(type => document.addEventListener(type, unlock, true));
    el.privacyClose.addEventListener("click", () => {
      el.privacy.hidden = true;
    });
    el.menuRename.addEventListener("click", async () => {
      const name = prompt("Dein neuer Name:", state.session?.name || "");
      if (!name || !name.trim()) return;
      openMenu(false);
      await rejoinWithName(name.trim());
    });
    el.menuLeave.addEventListener("click", async () => {
      if (!confirm("Willst du die Gruppe wirklich verlassen?")) return;
      openMenu(false);
      await leaveGroup();
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
    startGeolocation();
    startPolling();
    watchBattery();
    if (net.client) uploadLocation(true);
    else ensureConnected(0);
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
      try {
        await connectGroup(state.session);
        net.retryCount = 0;
        net.failReason = "";
        setNetStatus();
        uploadLocation(true);
      } catch (error) {
        net.failReason = error.message || "Keine Verbindung.";
        const wait = RETRY_DELAYS_MS[Math.min(net.retryCount, RETRY_DELAYS_MS.length - 1)];
        net.retryCount++;
        setNetStatus();
        if (state.session) ensureConnected(wait);
      } finally {
        net.connecting = false;
        setNetStatus();
      }
    }, Math.max(0, delayMs || 0));
  }

  function applySharingUi() {
    el.shareToggle.classList.toggle("is-on", state.sharing);
    el.shareToggle.querySelector(".toggle-state").textContent = state.sharing ? "AN" : "AUS";
  }

  /** Baut state.group aus den empfangenen Mitgliedern, den Gruppendaten und dem eigenen Zustand. */
  function rebuildGroup() {
    if (!state.session) return;
    const cutoff = Date.now() - MEMBER_MAX_AGE_MS;
    const others = [...net.members.values()].filter(member => member.id !== state.session.memberId && memberTime(member, member.lastSeen) > cutoff);
    state.group = {
      code: state.session.code,
      name: net.meta?.name || state.session.groupName || `Gruppe ${state.session.code}`,
      meetingPoint: net.meta?.meetingPoint || null,
      members: [buildMe(), ...others]
    };
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
      lastSeen: new Date().toISOString()
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
    el.groupCode.textContent = state.group.code;
    el.menuInfo.textContent = `${state.session.name} in "${state.group.name}" (Code ${state.group.code}). ${state.group.members.length} Mitglied${state.group.members.length === 1 ? "" : "er"}.`;

    el.sosButton.classList.toggle("is-active", state.sosActive);
    el.sosButton.querySelector(".sos-label").textContent = state.sosActive ? "Ich bin sicher" : "Finde mich!";

    renderAlerts();
    renderMeeting();
    renderMembers();
    renderMarkers();
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
      return;
    }
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
    if (member.battery !== null && member.battery !== undefined) parts.push(`Akku ${member.battery}%`);
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
    state.map.on("click", event => {
      if (!state.pickingMeeting) return;
      const label = prompt("Name für den Treffpunkt:", "Treffpunkt") || "Treffpunkt";
      setPicking(false);
      setMeetingPoint(event.latlng.lat, event.latlng.lng, label);
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
    });

    state.markers.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove();
        state.markers.delete(id);
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
  function startGeolocation() {
    if (!("geolocation" in navigator)) {
      setGeoStatus("Dein Gerät unterstützt keine Standortabfrage.", "error");
      return;
    }
    if (state.watchId !== null) return;
    setGeoStatus("Standort wird gesucht ...");
    state.watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000
    });
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = setInterval(() => uploadLocation(true), HEARTBEAT_MS);
  }

  function stopGeolocation() {
    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }

  function onPosition(position) {
    const coords = position.coords;
    state.position = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      heading: Number.isFinite(coords.heading) ? coords.heading : null,
      speed: Number.isFinite(coords.speed) ? coords.speed : null,
      at: Date.now()
    };
    setGeoStatus(`Standort aktiv (±${Math.round(coords.accuracy)} m)`, "ok");
    if (state.group) {
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
  }

  function setGeoStatus(text, kind) {
    el.geoStatus.textContent = text;
    el.geoStatus.className = `geo-status${kind ? ` is-${kind}` : ""}`;
  }

  async function uploadLocation(force) {
    if (!state.session) return;
    const now = Date.now();
    const moved = state.position && state.lastUploadPos ? distanceMeters(state.position, state.lastUploadPos) : Infinity;
    if (!force && (now - state.lastUpload < MIN_UPLOAD_GAP_MS || moved < 15)) return;
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
    applySharingUi();
    if (state.sharing) startGeolocation();
    uploadLocation(true);
  }

  function watchBattery() {
    if (!navigator.getBattery) return;
    navigator.getBattery().then(battery => {
      const update = () => {
        state.battery = Math.round(battery.level * 100);
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
    const activate = !state.sosActive;
    let message = "";
    if (activate) {
      message = prompt("Kurze Nachricht an alle (optional):", "Ich finde euch nicht. Bitte kommt zu mir!") || "";
    }
    state.alert = activate
      ? { active: true, message: message.slice(0, 160), since: state.alert?.active ? state.alert.since : new Date().toISOString() }
      : null;
    state.sosActive = activate;
    state.session.alert = state.alert;
    saveSession();
    if (activate && !state.sharing) setSharing(true);
    // Sofort Rueckmeldung geben; das Senden darf nie blockieren.
    vibrate(activate ? [200, 100, 200] : [80]);
    if (activate) {
      toast(net.connected ? "Alarm gesendet. Alle in der Gruppe sehen dich jetzt." : "Alarm gesetzt. Er wird gesendet, sobald Verbindung besteht.");
    } else {
      toast("Alarm beendet.");
    }
    uploadLocation(true).catch(() => {});
  }

  function notifyAlert(member) {
    vibrate([300, 120, 300, 120, 500]);
    startAlarmSound();
    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
      try {
        new Notification("Find Mein Soon", { body: `${member.name} ruft: Finde mich!`, icon: "icons/icon-192.png", tag: "fms-alert" });
      } catch {
      }
    }
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    if (state.map && member.lat !== null) state.map.setView([member.lat, member.lng], Math.max(state.map.getZoom(), 16));
  }

  function vibrate(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch {}
    }
  }

  function unlockAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audio.ctx) audio.ctx = new Ctx();
      if (audio.ctx.state !== "running") audio.ctx.resume().catch(() => {});
    } catch {
    }
  }

  /** Sirenenartiger Ton, deutlich lauter als ein Piepser. */
  function beep() {
    try {
      unlockAudio();
      const ctx = audio.ctx;
      if (!ctx || ctx.state !== "running") return;
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
  async function shareCode() {
    if (!state.group) return;
    const base = isNativeApp || !/^https?:$/.test(location.protocol) ? PUBLIC_APP_URL : `${location.origin}${location.pathname}`;
    const url = `${base}?join=${state.group.code}`;
    const text = `Komm in meine Find-Mein-Soon-Gruppe "${state.group.name}". Code: ${state.group.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Find Mein Soon", text, url });
        return;
      } catch {
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast("Code und Link kopiert.");
    } catch {
      prompt("Code zum Kopieren:", `${text}\n${url}`);
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
    toast(removed ? "Du hast die Gruppe verlassen." : "Gruppe verlassen. Dein Eintrag beim Dienst verfällt automatisch.");
    showSetup();
  }

  function clearSession() {
    stopGeolocation();
    stopPolling();
    disconnectNet();
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
    el.alertBanner.hidden = true;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !parsed.code || !parsed.memberId || !parsed.name) return null;
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
    el.menu.hidden = !open;
  }

  // ---------- Netz: serverlos ueber einen oeffentlichen MQTT-Broker ----------
  // Aus dem Gruppencode werden ein AES-Schluessel und eine Themen-ID abgeleitet. Jedes Mitglied veroeffentlicht
  // seinen verschluesselten Zustand als "retained" Nachricht unter <root>/<memberId>; Gruppendaten (Name,
  // Treffpunkt) liegen unter <root>/meta. Neue Mitglieder bekommen so sofort den letzten Stand aller anderen.

  function brokerList() {
    try {
      const param = new URLSearchParams(location.search).get("broker");
      if (param) localStorage.setItem(BROKER_KEY, param);
      const stored = localStorage.getItem(BROKER_KEY);
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
    disconnectNet();
    const secrets = await deriveGroupSecrets(session.code);
    net.key = secrets.key;
    net.root = `fms/v1/${secrets.topicId}`;
    net.members = new Map();
    net.meta = null;
    net.brokers = brokerList();

    let lastError = null;
    for (let index = 0; index < net.brokers.length; index++) {
      const attempts = index === 0 ? 2 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          net.client = await connectBroker(net.brokers[index], session);
          net.brokerIndex = index;
          net.connected = true;
          updateNetDot();
          if (index > 0) startPrimaryProbe(session);
          return;
        } catch (error) {
          lastError = error;
          if (!state.session && !state.pendingSession && !session) return;
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
    net.probeTimer = setInterval(async () => {
      if (!net.client || net.brokerIndex <= 0 || net.connecting) return;
      try {
        const primary = await connectBroker(net.brokers[0], session);
        // Umzug zum Haupt-Broker: alte Verbindung schliessen, Mitglieder aus den retained Nachrichten neu aufbauen.
        const old = net.client;
        net.client = primary;
        net.brokerIndex = 0;
        try { old.end(true); } catch {}
        clearInterval(net.probeTimer);
        net.probeTimer = null;
        scheduleResync();
        publishSelf().catch(() => {});
        if (net.meta) publish(`${net.root}/meta`, net.meta, META_EXPIRY_S).catch(() => {});
        updateNetDot();
      } catch {
        // Haupt-Broker weiterhin nicht erreichbar, spaeter erneut probieren.
      }
    }, PRIMARY_PROBE_MS);
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
        net.connected = true;
        if (settled) {
          // Reconnect: bei clean=true muss neu abonniert und der eigene Stand erneut gesendet werden.
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
        updateNetDot();
      });
      client.on("message", (topic, payload, packet) => {
        if (net.client === client || !settled) handleMessage(topic, payload, packet);
      });
      client.on("error", error => {
        if (!settled) fail(error);
      });
      client.on("close", () => {
        if (net.client === client) {
          net.connected = false;
          updateNetDot();
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

  function disconnectNet() {
    if (net.client) {
      try { net.client.end(true); } catch {}
    }
    clearTimeout(net.retryTimer);
    clearInterval(net.probeTimer);
    clearTimeout(net.resyncTimer);
    net.retryTimer = null;
    net.probeTimer = null;
    net.resyncTimer = null;
    net.client = null;
    net.connected = false;
    net.connecting = false;
    net.key = null;
    net.root = null;
    net.members = new Map();
    net.meta = null;
    net.brokerIndex = -1;
    net.lastAck = 0;
    net.failReason = "";
    updateNetDot();
  }

  async function handleMessage(topic, payload, packet) {
    if (!net.root || !topic.startsWith(`${net.root}/`)) return;
    const sub = topic.slice(net.root.length + 1);
    if (!/^[a-z0-9]+$/.test(sub)) return;
    if (!payload || !payload.length) {
      if (sub !== "meta") {
        net.members.delete(sub);
        rebuildGroup();
        render();
      }
      return;
    }
    let data;
    try {
      data = await decrypt(payload);
    } catch {
      return; // fremde oder beschaedigte Nachricht
    }
    if (!data || typeof data !== "object") return;

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
      ts: Date.now()
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
    // Leere retained Nachricht loescht den eigenen Eintrag beim Broker.
    return new Promise(resolve => net.client.publish(`${net.root}/${state.session.memberId}`, "", { qos: 1, retain: true }, error => resolve(!error)));
  }

  /** Sendet verschluesselt und retained. Ohne Verbindung wird nichts gepuffert: nach dem Verbinden geht der aktuelle Stand raus. */
  async function publish(topic, data, expirySeconds) {
    if (!net.client || !net.connected) return;
    const body = await encrypt(data);
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
  async function deriveGroupSecrets(code) {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: new TextEncoder().encode("find-mein-soon-v1"), iterations: KEY_ITERATIONS, hash: "SHA-256" },
      material,
      512
    );
    const bytes = new Uint8Array(bits);
    const key = await crypto.subtle.importKey("raw", bytes.slice(0, 32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    const topicId = Array.from(bytes.slice(32, 48), byte => byte.toString(16).padStart(2, "0")).join("");
    return { key, topicId };
  }

  async function encrypt(data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(data));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, net.key, plain));
    const out = new Uint8Array(iv.length + cipher.length);
    out.set(iv, 0);
    out.set(cipher, iv.length);
    return out;
  }

  async function decrypt(payload) {
    const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
    if (bytes.length < 13) throw new Error("zu kurz");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, net.key, bytes.slice(12));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function newGroupCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
    return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  }

  function cleanCode(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
  }

  /** Holt den Code auch aus eingefuegtem Einladungstext oder einem Link heraus. */
  function extractCode(value) {
    const raw = String(value || "");
    const fromLink = raw.match(/join=([A-Za-z0-9]{8})/);
    if (fromLink) return cleanCode(fromLink[1]);
    const upper = raw.toUpperCase();
    const alphabetToken = upper.match(new RegExp(`(?:^|[^A-Z0-9])([${CODE_ALPHABET}]{${CODE_LENGTH}})(?:[^A-Z0-9]|$)`));
    if (alphabetToken && upper.replace(/[^A-Z0-9]/g, "").length > CODE_LENGTH) return alphabetToken[1];
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
