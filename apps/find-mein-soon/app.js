(() => {
  const STORAGE_KEY = "findMeinSoon.session";
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
    menuServer: $("menuServer"),
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
    toastTimer: null
  };

  init();

  function init() {
    setupInstall();
    setupNetworkIndicator();
    bindSetup();
    bindMain();
    registerServiceWorker();

    const joinParam = new URLSearchParams(location.search).get("join");
    if (joinParam && !state.session) {
      setMode("join");
      el.setupCode.value = joinParam.toUpperCase().slice(0, 6);
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
      el.setupCode.value = el.setupCode.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
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
      try {
        let response;
        if (state.mode === "create") {
          response = await api("POST", "/api/finder/groups", { memberName, groupName: el.setupGroupName.value.trim() });
        } else {
          const code = el.setupCode.value.trim();
          if (code.length !== 6) throw new Error("Der Gruppencode hat 6 Zeichen.");
          response = await api("POST", "/api/finder/join", { memberName, code });
        }
        state.session = {
          code: response.group.code,
          memberId: response.member.id,
          token: response.member.token,
          name: memberName
        };
        saveSession();
        state.group = response.group;
        history.replaceState(null, "", location.pathname);
        enterGroup();
        if (state.mode === "create") toast(`Gruppe erstellt. Code: ${response.group.code}`);
      } catch (error) {
        showSetupError(error.message || "Das hat nicht geklappt.");
      } finally {
        el.setupSubmit.disabled = false;
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
    el.menuServer.hidden = !isNativeApp;
    el.menuServer.addEventListener("click", () => {
      openMenu(false);
      // Wird von der Android-Huelle abgefangen und oeffnet dort den Dialog fuer die Server-Adresse.
      location.href = "findmeinsoon://settings";
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
    el.meetingClear.addEventListener("click", async () => {
      await api("POST", groupPath("meeting"), { clear: true }).then(applyGroup).catch(showError);
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
        refreshGroup();
      } else {
        stopPolling();
      }
    });
  }

  function enterGroup() {
    el.setupView.hidden = true;
    el.mainView.hidden = false;
    el.topbarSub.textContent = `Du bist ${state.session.name}`;
    initMap();
    startGeolocation();
    startPolling();
    watchBattery();
    refreshGroup();
  }

  function groupPath(action) {
    return `/api/finder/groups/${state.session.code}${action ? `/${action}` : ""}`;
  }

  async function refreshGroup() {
    if (!state.session) return;
    try {
      const response = await api("GET", groupPath());
      applyGroup(response);
    } catch (error) {
      if (error.status === 401 || error.status === 404) {
        toast("Die Gruppe existiert nicht mehr.");
        clearSession();
        showSetup();
      }
    }
  }

  function applyGroup(response) {
    if (!response?.group) return;
    state.group = response.group;
    const me = myMember();
    if (me) {
      state.sosActive = Boolean(me.alert?.active);
      if (me.name !== state.session.name) {
        state.session.name = me.name;
        saveSession();
      }
    }
    render();
  }

  function myMember() {
    return state.group?.members.find(member => member.id === state.session?.memberId) || null;
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
      api("POST", groupPath("meeting"), { lat: event.latlng.lat, lng: event.latlng.lng, label }).then(applyGroup).catch(showError);
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
        api("POST", groupPath("meeting"), { lat: state.position.lat, lng: state.position.lng, label: "Treffpunkt" }).then(applyGroup).catch(showError);
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
    const payload = { sharing: state.sharing, battery: state.battery };
    if (state.sharing && state.position) {
      Object.assign(payload, {
        lat: state.position.lat,
        lng: state.position.lng,
        accuracy: state.position.accuracy,
        heading: state.position.heading,
        speed: state.position.speed
      });
      state.lastUploadPos = { lat: state.position.lat, lng: state.position.lng };
    }
    try {
      const response = await api("POST", groupPath("location"), payload);
      applyGroup(response);
    } catch (error) {
      if (error.status === 401 || error.status === 404) {
        clearSession();
        showSetup();
        toast("Die Gruppe existiert nicht mehr.");
      }
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
    state.pollTimer = setInterval(refreshGroup, POLL_MS);
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
      await uploadLocation(true);
      const response = await api("POST", groupPath("alert"), { active: activate, message });
      state.sosActive = activate;
      applyGroup(response);
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
    const url = `${location.origin}${location.pathname}?join=${state.group.code}`;
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
    try {
      const code = state.session.code;
      const response = await api("POST", "/api/finder/join", { memberName: name, code });
      await api("POST", groupPath("leave"), {}).catch(() => {});
      state.session = { code, memberId: response.member.id, token: response.member.token, name };
      saveSession();
      state.markers.forEach(marker => marker.remove());
      state.markers.clear();
      el.topbarSub.textContent = `Du bist ${name}`;
      applyGroup(response);
      uploadLocation(true);
      toast(`Du heisst jetzt ${name}.`);
    } catch (error) {
      showError(error);
    }
  }

  async function leaveGroup() {
    try {
      await api("POST", groupPath("leave"), {});
    } catch {
    }
    clearSession();
    toast("Du hast die Gruppe verlassen.");
    showSetup();
  }

  function clearSession() {
    stopGeolocation();
    stopPolling();
    state.session = null;
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
      return parsed && parsed.code && parsed.memberId && parsed.token ? parsed : null;
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
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  function setupNetworkIndicator() {
    const update = () => {
      el.netDot.classList.toggle("is-online", navigator.onLine);
      el.netDot.classList.toggle("is-offline", !navigator.onLine);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
  }

  function openMenu(open) {
    el.menu.hidden = !open;
  }

  // ---------- API ----------
  async function api(method, path, body) {
    const headers = { "Accept": "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (state.session) {
      headers["X-Finder-Member"] = state.session.memberId;
      headers["X-Finder-Token"] = state.session.token;
    }
    let response;
    try {
      response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      const error = new Error("Keine Verbindung zum Server.");
      error.status = 0;
      throw error;
    }
    let payload = {};
    const contentType = response.headers.get("content-type") || "";
    try { payload = await response.json(); } catch {}
    if (!response.ok || payload.ok === false) {
      let message = payload.error;
      if (!message && !contentType.includes("application/json")) {
        // Statischer Host (z. B. GitHub Pages) ohne laufendes server.js: die API antwortet mit einer HTML-/Textseite.
        message = "Diese Website hat keinen Find-Mein-Soon-Server. server.js muss online laufen (z. B. auf Render), GitHub Pages allein reicht nicht.";
      }
      const error = new Error(message || `Fehler ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
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
