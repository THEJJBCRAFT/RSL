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
  const MEMBER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
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
    alert: null
  };

  // Verbindung zur Gruppe (serverlos ueber einen oeffentlichen MQTT-Broker).
  const net = {
    client: null,
    key: null,
    root: null,
    connected: false,
    members: new Map(),
    meta: null
  };

  init();

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
      el.setupCode.value = cleanCode(el.setupCode.value);
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
        if (!window.crypto?.subtle) throw new Error("Dieser Browser unterstuetzt die Verschluesselung nicht (HTTPS noetig).");
        let code;
        let groupName = "";
        if (state.mode === "create") {
          code = newGroupCode();
          groupName = el.setupGroupName.value.trim().slice(0, 40) || `${memberName}s Gruppe`;
        } else {
          code = cleanCode(el.setupCode.value);
          if (code.length !== CODE_LENGTH) throw new Error(`Der Gruppencode hat ${CODE_LENGTH} Zeichen.`);
        }
        const memberId = randomId(8);
        const session = { code, memberId, name: memberName.slice(0, 40), color: colorFor(memberId), groupName };
        await connectGroup(session);
        state.session = session;
        saveSession();
        if (state.mode === "create") await publishMeta({ name: groupName, meetingPoint: null });
        history.replaceState(null, "", location.pathname);
        enterGroup();
        if (state.mode === "create") toast(`Gruppe erstellt. Code: ${code}`);
      } catch (error) {
        disconnectNet();
        showSetupError(error.message || "Das hat nicht geklappt.");
      } finally {
        el.setupSubmit.disabled = false;
        setMode(state.mode);
      }
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
    rebuildGroup();
    render();
    initMap();
    startGeolocation();
    startPolling();
    watchBattery();
    if (!net.client) {
      connectGroup(state.session)
        .then(() => uploadLocation(true))
        .catch(error => toast(error.message || "Keine Verbindung."));
    } else {
      uploadLocation(true);
    }
  }

  /** Baut state.group aus den empfangenen Mitgliedern, den Gruppendaten und dem eigenen Zustand. */
  function rebuildGroup() {
    if (!state.session) return;
    const cutoff = Date.now() - MEMBER_MAX_AGE_MS;
    const others = [...net.members.values()].filter(member => member.id !== state.session.memberId && Date.parse(member.lastSeen || 0) > cutoff);
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
    if (!alerts.length) return;
    const first = alerts[0];
    el.alertTitle.textContent = alerts.length === 1 ? `${first.name} ruft: Finde mich!` : `${alerts.length} Personen rufen um Hilfe`;
    const parts = [];
    if (first.alert?.message) parts.push(first.alert.message);
    if (first.lat !== null && state.position) parts.push(`${formatDistance(distanceMeters(state.position, first))} entfernt`);
    parts.push(`zuletzt ${formatAgo(first.lastSeen)}`);
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
    const members = [...state.group.members].sort((a, b) => {
      if (a.id === state.session.memberId) return -1;
      if (b.id === state.session.memberId) return 1;
      if (Boolean(a.alert?.active) !== Boolean(b.alert?.active)) return a.alert?.active ? -1 : 1;
      return a.name.localeCompare(b.name, "de");
    });

    el.memberList.innerHTML = "";
    members.forEach(member => {
      const isMe = member.id === state.session.memberId;
      const item = document.createElement("li");
      item.className = `member-item${member.alert?.active ? " is-alert" : ""}`;
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
      empty.textContent = "Du bist noch allein. Teile den Code, damit andere beitreten koennen.";
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
      parts.push(`Ort ${formatAgo(member.locatedAt)}`);
    }
    if (!isMe) parts.push(`online ${formatAgo(member.lastSeen)}`);
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
      const label = prompt("Name fuer den Treffpunkt:", "Treffpunkt") || "Treffpunkt";
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
      const stale = Date.now() - Date.parse(member.locatedAt || 0) > STALE_MS;
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
      setGeoStatus("Dein Geraet unterstuetzt keine Standortabfrage.", "error");
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
      2: "Standort gerade nicht verfuegbar.",
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
    if (!force && now - state.lastUpload < MIN_UPLOAD_GAP_MS && moved < 15) return;
    state.lastUpload = now;
    if (state.sharing && state.position) state.lastUploadPos = { lat: state.position.lat, lng: state.position.lng };
    rebuildGroup();
    render();
    try {
      await publishSelf();
    } catch {
      // Ohne Verbindung merkt sich MQTT.js die Nachricht und sendet sie nach dem Reconnect.
    }
  }

  function toggleSharing() {
    state.sharing = !state.sharing;
    el.shareToggle.classList.toggle("is-on", state.sharing);
    el.shareToggle.querySelector(".toggle-state").textContent = state.sharing ? "AN" : "AUS";
    if (state.sharing) startGeolocation();
    uploadLocation(true);
    toast(state.sharing ? "Dein Standort wird wieder geteilt." : "Dein Standort ist pausiert.");
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
    try {
      if (activate && !state.sharing) {
        state.sharing = true;
        el.shareToggle.classList.add("is-on");
        el.shareToggle.querySelector(".toggle-state").textContent = "AN";
        startGeolocation();
      }
      state.alert = activate
        ? { active: true, message: message.slice(0, 160), since: state.alert?.active ? state.alert.since : new Date().toISOString() }
        : null;
      state.sosActive = activate;
      await uploadLocation(true);
      vibrate(activate ? [200, 100, 200] : [80]);
      toast(activate ? "Alarm gesendet. Alle in der Gruppe sehen dich jetzt." : "Alarm beendet.");
    } catch (error) {
      showError(error);
    }
  }

  function notifyAlert(member) {
    vibrate([300, 120, 300, 120, 500]);
    beep();
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

  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const gain = ctx.createGain();
      gain.gain.value = 0.08;
      gain.connect(ctx.destination);
      [0, 0.25, 0.5].forEach(offset => {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = 880;
        osc.connect(gain);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.18);
      });
      setTimeout(() => ctx.close().catch(() => {}), 1200);
    } catch {
    }
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
    toast(`Du heisst jetzt ${state.session.name}.`);
  }

  async function leaveGroup() {
    try {
      await leaveNet();
    } catch {
    }
    clearSession();
    toast("Du hast die Gruppe verlassen.");
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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.session)); } catch {}
  }

  // ---------- Install / PWA ----------
  function setupInstall() {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    if (standalone || isNativeApp) return;
    el.installCard.hidden = false;
    el.apkCard.hidden = !isAndroid;
    if (isIos) {
      el.installHint.textContent = "Auf dem iPhone: Teilen-Symbol antippen und \"Zum Home-Bildschirm\" waehlen.";
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
    window.addEventListener("online", updateNetDot);
    window.addEventListener("offline", updateNetDot);
    updateNetDot();
  }

  function updateNetDot() {
    const online = navigator.onLine && (net.client ? net.connected : true);
    el.netDot.classList.toggle("is-online", online);
    el.netDot.classList.toggle("is-offline", !online);
    el.netDot.title = net.client ? (net.connected ? "Verbunden" : "Verbindung wird aufgebaut ...") : (navigator.onLine ? "Online" : "Offline");
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
      if (stored) return [stored];
    } catch {
    }
    return BROKERS;
  }

  async function connectGroup(session) {
    if (typeof mqtt === "undefined") throw new Error("Die Netzwerk-Bibliothek konnte nicht geladen werden.");
    disconnectNet();
    const secrets = await deriveGroupSecrets(session.code);
    net.key = secrets.key;
    net.root = `fms/v1/${secrets.topicId}`;
    net.members = new Map();
    net.meta = null;

    let lastError = null;
    for (const url of brokerList()) {
      try {
        net.client = await connectBroker(url, session);
        net.connected = true;
        updateNetDot();
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(lastError?.message || "Kein Verbindungsdienst erreichbar. Pruefe deine Internetverbindung.");
  }

  function connectBroker(url, session) {
    return new Promise((resolve, reject) => {
      const client = mqtt.connect(url, {
        clientId: `fms-${session.memberId}-${randomId(4)}`,
        clean: true,
        keepalive: 30,
        connectTimeout: 12000,
        reconnectPeriod: 3000,
        protocolVersion: 4
      });
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        try { client.end(true); } catch {}
        reject(new Error(`Verbindung zu ${url} fehlgeschlagen${error?.message ? ` (${error.message})` : ""}.`));
      };
      const timer = setTimeout(() => fail(new Error("Zeitueberschreitung")), 15000);

      client.on("connect", () => {
        net.connected = true;
        updateNetDot();
        if (settled) {
          // Reconnect: bei clean=true muss neu abonniert und der eigene Stand erneut gesendet werden.
          client.subscribe(`${net.root}/#`, { qos: 1 });
          publishSelf().catch(() => {});
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
      client.on("message", (topic, payload) => handleMessage(topic, payload));
      client.on("error", error => {
        if (!settled) fail(error);
      });
      client.on("close", () => {
        net.connected = false;
        updateNetDot();
      });
      client.on("offline", () => {
        net.connected = false;
        updateNetDot();
      });
    });
  }

  function disconnectNet() {
    if (net.client) {
      try { net.client.end(true); } catch {}
    }
    net.client = null;
    net.connected = false;
    net.key = null;
    net.root = null;
    net.members = new Map();
    net.meta = null;
    updateNetDot();
  }

  async function handleMessage(topic, payload) {
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
      if (!net.meta || Number(data.ts || 0) >= Number(net.meta.ts || 0)) {
        net.meta = {
          name: cleanText(data.name, 40) || null,
          meetingPoint: sanitizeMeeting(data.meetingPoint),
          ts: Number(data.ts || 0)
        };
      }
    } else {
      if (sub === state.session?.memberId) return; // eigener Eintrag: der lokale Zustand ist aktueller
      const existing = net.members.get(sub);
      if (existing && Number(data.ts || 0) < Number(existing.ts || 0)) return;
      net.members.set(sub, sanitizeMember(sub, data));
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
      ts: Number(data.ts || 0)
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
    if (!net.client || !state.session) return;
    const me = { ...buildMe(), ts: Date.now() };
    await publish(`${net.root}/${state.session.memberId}`, me);
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
    await publish(`${net.root}/meta`, meta);
  }

  function setMeetingPoint(lat, lng, label) {
    publishMeta({ meetingPoint: { lat, lng, label: String(label).slice(0, 40), setBy: state.session.name, setAt: new Date().toISOString() } }).catch(showError);
  }

  async function leaveNet() {
    if (!net.client || !state.session) return;
    // Leere retained Nachricht loescht den eigenen Eintrag beim Broker.
    await new Promise(resolve => net.client.publish(`${net.root}/${state.session.memberId}`, "", { qos: 1, retain: true }, () => resolve()));
  }

  async function publish(topic, data) {
    const body = await encrypt(data);
    return new Promise((resolve, reject) => {
      net.client.publish(topic, body, { qos: 1, retain: true }, error => (error ? reject(error) : resolve()));
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

  function formatAgo(iso) {
    const time = Date.parse(iso || "");
    if (!Number.isFinite(time)) return "nie";
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
