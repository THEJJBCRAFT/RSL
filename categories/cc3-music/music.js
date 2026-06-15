const state = {
  tracks: [],
  playlist: JSON.parse(localStorage.getItem("cc3Playlist") || "[]"),
  currentIndex: 0,
  shuffle: false,
  repeat: false,
  admin: false,
  librarySearch: localStorage.getItem("cc3LibrarySearch") || "",
  librarySort: localStorage.getItem("cc3LibrarySort") || "newest",
  categoryFilter: localStorage.getItem("cc3CategoryFilter") || "all",
  playlistSort: localStorage.getItem("cc3PlaylistSort") || "custom"
};

const els = {
  audio: document.querySelector("#audio"),
  coverArt: document.querySelector("#coverArt"),
  trackArtist: document.querySelector("#trackArtist"),
  trackTitle: document.querySelector("#trackTitle"),
  trackDesc: document.querySelector("#trackDesc"),
  seek: document.querySelector("#seek"),
  volume: document.querySelector("#volume"),
  timeReadout: document.querySelector("#timeReadout"),
  playBtn: document.querySelector("#playBtn"),
  prevBtn: document.querySelector("#prevBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  shuffleBtn: document.querySelector("#shuffleBtn"),
  repeatBtn: document.querySelector("#repeatBtn"),
  bottomCover: document.querySelector("#bottomCover"),
  bottomTitle: document.querySelector("#bottomTitle"),
  bottomArtist: document.querySelector("#bottomArtist"),
  bottomPrevBtn: document.querySelector("#bottomPrevBtn"),
  bottomPlayBtn: document.querySelector("#bottomPlayBtn"),
  bottomNextBtn: document.querySelector("#bottomNextBtn"),
  bottomShuffleBtn: document.querySelector("#bottomShuffleBtn"),
  bottomRepeatBtn: document.querySelector("#bottomRepeatBtn"),
  bottomSeek: document.querySelector("#bottomSeek"),
  bottomTimeReadout: document.querySelector("#bottomTimeReadout"),
  bottomVolume: document.querySelector("#bottomVolume"),
  trackList: document.querySelector("#trackList"),
  librarySearch: document.querySelector("#librarySearch"),
  librarySort: document.querySelector("#librarySort"),
  categoryFilter: document.querySelector("#categoryFilter"),
  playlistForm: document.querySelector("#playlistForm"),
  playlistName: document.querySelector("#playlistName"),
  playlistSort: document.querySelector("#playlistSort"),
  clearPlaylistBtn: document.querySelector("#clearPlaylistBtn"),
  playlistList: document.querySelector("#playlistList"),
  adminPassword: document.querySelector("#adminPassword"),
  loginBtn: document.querySelector("#loginBtn"),
  logoutBtn: document.querySelector("#logoutBtn"),
  loginBox: document.querySelector("#loginBox"),
  uploadForm: document.querySelector("#uploadForm"),
  editForm: document.querySelector("#editForm"),
  cancelEditBtn: document.querySelector("#cancelEditBtn"),
  adminTrackList: document.querySelector("#adminTrackList"),
  statusLine: document.querySelector("#statusLine")
};

function has(el) {
  return Boolean(el);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request fehlgeschlagen.");
  return data;
}

async function loadTracks() {
  try {
    const data = await api("/api/tracks");
    state.tracks = data.tracks || [];
    renderCategoryFilter();
    renderAll();
    if (state.tracks.length) {
      const firstVisible = getVisibleTracks()[0] || state.tracks[0];
      const firstIndex = state.tracks.findIndex(track => track.id === firstVisible.id);
      loadTrack(firstIndex >= 0 ? firstIndex : 0, false);
    }
  } catch (error) {
    setStatus(`Server nicht erreichbar: ${error.message}`);
    renderAll();
  }
}

async function checkSession() {
  try {
    const data = await api("/api/admin/session");
    state.admin = Boolean(data.admin);
    renderAdmin();
  } catch {
    state.admin = false;
    renderAdmin();
  }
}

function renderAll() {
  renderTracks();
  renderPlaylist();
  renderAdminTracks();
}

function renderTracks() {
  if (!has(els.trackList)) return;
  els.trackList.innerHTML = "";
  const tracks = getVisibleTracks();
  if (!state.tracks.length) {
    els.trackList.append(emptyRow("Noch keine Songs. Lade im Admin Panel den ersten Track hoch."));
    return;
  }
  if (!tracks.length) {
    els.trackList.append(emptyRow("Kein Song passt zu Suche oder Kategorie."));
    return;
  }
  els.trackList.append(trackHeader());
  tracks.forEach((track, index) => {
    const row = document.createElement("div");
    row.className = "track-row";
    row.style.setProperty("--row", index);
    row.classList.toggle("is-current", state.tracks[state.currentIndex]?.id === track.id);
    row.innerHTML = `<span class="row-index">${index + 1}</span>${coverHtml(track)}<div class="row-title"><strong></strong><span></span></div><span class="row-artist"></span><span class="row-category"></span><div class="row-actions"></div>`;
    row.querySelector("strong").textContent = track.title;
    row.querySelector(".row-title span").textContent = track.album || "Uploads";
    row.querySelector(".row-artist").textContent = track.artist || "CC3";
    row.querySelector(".row-category").textContent = track.category || "CC3 Music";
    const actions = row.querySelector(".row-actions");
    actions.append(button("Play", () => playTrackById(track.id)));
    actions.append(button("+ Playlist", () => addToPlaylist(track.id)));
    els.trackList.append(row);
  });
}

function renderPlaylist() {
  if (!has(els.playlistList)) return;
  els.playlistList.innerHTML = "";
  const playlistEntries = getPlaylistEntries();
  if (!playlistEntries.length) {
    els.playlistList.append(emptyRow("Playlist ist leer. Fuege Songs aus der Bibliothek hinzu."));
    return;
  }
  playlistEntries.forEach(({ track, playlistIndex }, index) => {
    const row = document.createElement("div");
    row.className = "playlist-row";
    row.style.setProperty("--row", index);
    row.classList.toggle("is-current", state.tracks[state.currentIndex]?.id === track.id);
    row.innerHTML = `${coverHtml(track)}<div class="row-title"><strong></strong><span></span></div><div class="row-actions"></div>`;
    row.querySelector("strong").textContent = track.title;
    row.querySelector("span").textContent = track.artist;
    const actions = row.querySelector(".row-actions");
    actions.append(button("Play", () => playTrackById(track.id)));
    actions.append(button("Up", () => movePlaylistItem(playlistIndex, -1)));
    actions.append(button("Down", () => movePlaylistItem(playlistIndex, 1)));
    actions.append(button("X", () => removeFromPlaylist(playlistIndex)));
    els.playlistList.append(row);
  });
}

function renderAdmin() {
  if (!has(els.loginBox) || !has(els.uploadForm) || !has(els.editForm)) return;
  els.loginBox.classList.toggle("hidden", state.admin);
  els.uploadForm.classList.toggle("hidden", !state.admin);
  els.editForm.classList.add("hidden");
  renderAdminTracks();
}

function renderAdminTracks() {
  if (!has(els.adminTrackList)) return;
  els.adminTrackList.innerHTML = "";
  if (!state.admin) return;
  if (!state.tracks.length) {
    els.adminTrackList.append(emptyRow("Noch keine Admin-Tracks vorhanden."));
    return;
  }
  state.tracks.forEach(track => {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `${coverHtml(track)}<div class="row-title"><strong></strong><span></span></div><div class="row-actions"></div>`;
    row.querySelector("strong").textContent = track.title;
    row.querySelector("span").textContent = `${track.artist} | ${track.tags?.join(", ") || "keine Tags"}`;
    const actions = row.querySelector(".row-actions");
    actions.append(button("Bearbeiten", () => startEditTrack(track.id)));
    actions.append(button("Loeschen", () => deleteTrack(track.id)));
    els.adminTrackList.append(row);
  });
}

function loadTrack(index, autoplay = true) {
  if (!state.tracks.length) return;
  state.currentIndex = (index + state.tracks.length) % state.tracks.length;
  const track = state.tracks[state.currentIndex];
  els.coverArt.classList.add("is-switching");
  els.audio.src = track.audioUrl;
  els.trackArtist.textContent = track.artist || "CC3";
  els.trackTitle.textContent = track.title || "Unbenannt";
  els.trackDesc.textContent = track.description || `${track.album || "Upload"} | ${track.category || "CC3 Music"}`;
  els.coverArt.innerHTML = track.coverUrl ? `<img src="${track.coverUrl}" alt="${escapeHtml(track.title)} Cover">` : "<span>CC3</span>";
  if (has(els.bottomCover)) els.bottomCover.innerHTML = track.coverUrl ? `<img src="${track.coverUrl}" alt="">` : "CC3";
  if (has(els.bottomTitle)) els.bottomTitle.textContent = track.title || "Unbenannt";
  if (has(els.bottomArtist)) els.bottomArtist.textContent = track.artist || "CC3";
  window.setTimeout(() => els.coverArt.classList.remove("is-switching"), 90);
  renderTracks();
  renderPlaylist();
  if (autoplay) els.audio.play().catch(() => setStatus("Browser wartet auf Klick, bevor Audio startet."));
}

function playTrack(index) {
  loadTrack(index, true);
}

function playTrackById(id) {
  const index = state.tracks.findIndex(track => track.id === id);
  if (index >= 0) playTrack(index);
}

function playPlaylistIndex(index) {
  const track = state.tracks.find(item => item.id === state.playlist[index]);
  if (!track) return;
  playTrack(state.tracks.indexOf(track));
}

function nextTrack() {
  if (!state.tracks.length) return;
  if (state.repeat) return playTrack(state.currentIndex);
  if (state.shuffle) return playTrack(Math.floor(Math.random() * state.tracks.length));
  playTrack(state.currentIndex + 1);
}

function prevTrack() {
  playTrack(state.currentIndex - 1);
}

function addToPlaylist(id) {
  state.playlist.push(id);
  savePlaylist();
  renderPlaylist();
}

function removeFromPlaylist(index) {
  state.playlist.splice(index, 1);
  savePlaylist();
  renderPlaylist();
}

function movePlaylistItem(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= state.playlist.length) return;
  const [item] = state.playlist.splice(index, 1);
  state.playlist.splice(target, 0, item);
  savePlaylist();
  state.playlistSort = "custom";
  els.playlistSort.value = "custom";
  localStorage.setItem("cc3PlaylistSort", state.playlistSort);
  renderPlaylist();
}

function clearPlaylist() {
  state.playlist = [];
  savePlaylist();
  renderPlaylist();
  setStatus("Playlist geleert.");
}

function savePlaylist() {
  localStorage.setItem("cc3Playlist", JSON.stringify(state.playlist));
}

function getVisibleTracks() {
  const search = state.librarySearch.toLowerCase().trim();
  const filtered = state.tracks.filter(track => {
    const categoryOk = state.categoryFilter === "all" || (track.category || "CC3 Music") === state.categoryFilter;
    const haystack = [track.title, track.artist, track.album, track.category, track.description, ...(track.tags || [])].join(" ").toLowerCase();
    return categoryOk && (!search || haystack.includes(search));
  });
  return sortTracks(filtered, state.librarySort);
}

function getPlaylistEntries() {
  const entries = state.playlist
    .map((id, playlistIndex) => ({ playlistIndex, track: state.tracks.find(item => item.id === id) }))
    .filter(entry => entry.track);
  if (state.playlistSort === "custom") return entries;
  return entries.sort((a, b) => compareTracks(a.track, b.track, state.playlistSort));
}

function sortTracks(tracks, mode) {
  return [...tracks].sort((a, b) => compareTracks(a, b, mode));
}

function compareTracks(a, b, mode) {
  if (mode === "title") return textCompare(a.title, b.title);
  if (mode === "artist") return textCompare(a.artist, b.artist) || textCompare(a.title, b.title);
  if (mode === "album") return textCompare(a.album, b.album) || textCompare(a.title, b.title);
  if (mode === "category") return textCompare(a.category, b.category) || textCompare(a.title, b.title);
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

function textCompare(a, b) {
  return String(a || "").localeCompare(String(b || ""), "de", { sensitivity: "base", numeric: true });
}

function renderCategoryFilter() {
  if (!has(els.categoryFilter)) return;
  const categories = [...new Set(state.tracks.map(track => track.category || "CC3 Music"))].sort(textCompare);
  if (state.categoryFilter !== "all" && !categories.includes(state.categoryFilter)) state.categoryFilter = "all";
  els.categoryFilter.innerHTML = `<option value="all">Alle Kategorien</option>${categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
  els.categoryFilter.value = state.categoryFilter;
}

async function login() {
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: els.adminPassword.value }) });
    state.admin = true;
    els.adminPassword.value = "";
    setStatus("Admin online.");
    renderAdmin();
  } catch (error) {
    setStatus(error.message);
  }
}

async function logout() {
  await api("/api/admin/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => {});
  state.admin = false;
  renderAdmin();
  setStatus("Admin offline.");
}

async function uploadTrack(event) {
  event.preventDefault();
  try {
    const form = new FormData(els.uploadForm);
    setStatus("Upload laeuft...");
    await api("/api/admin/tracks", { method: "POST", body: form });
    els.uploadForm.reset();
    setStatus("Song hochgeladen.");
    await loadTracks();
    renderAdmin();
  } catch (error) {
    setStatus(error.message);
  }
}

function startEditTrack(id) {
  const track = state.tracks.find(item => item.id === id);
  if (!track) return;
  const fields = els.editForm.elements;
  fields.namedItem("id").value = track.id;
  fields.namedItem("title").value = track.title || "";
  fields.namedItem("artist").value = track.artist || "";
  fields.namedItem("album").value = track.album || "";
  fields.namedItem("category").value = track.category || "";
  fields.namedItem("tags").value = Array.isArray(track.tags) ? track.tags.join(", ") : "";
  fields.namedItem("description").value = track.description || "";
  fields.namedItem("downloadAllowed").checked = Boolean(track.downloadAllowed);
  fields.namedItem("song").value = "";
  fields.namedItem("cover").value = "";
  els.editForm.classList.remove("hidden");
  els.uploadForm.classList.add("hidden");
  setStatus(`Bearbeitung geoeffnet: ${track.title}`);
  els.editForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function updateTrack(event) {
  event.preventDefault();
  const id = els.editForm.elements.namedItem("id").value;
  if (!id) return;
  try {
    const form = new FormData(els.editForm);
    setStatus("Aenderungen werden gespeichert...");
    await api(`/api/admin/tracks/${encodeURIComponent(id)}`, { method: "PATCH", body: form });
    els.editForm.reset();
    els.editForm.classList.add("hidden");
    els.uploadForm.classList.remove("hidden");
    setStatus("Song aktualisiert.");
    await loadTracks();
    renderAdmin();
  } catch (error) {
    setStatus(error.message);
  }
}

function cancelEdit() {
  els.editForm.reset();
  els.editForm.classList.add("hidden");
  els.uploadForm.classList.remove("hidden");
  setStatus("Bearbeitung abgebrochen.");
}

async function deleteTrack(id) {
  try {
    await api(`/api/admin/tracks/${id}`, { method: "DELETE", body: JSON.stringify({}) });
    state.playlist = state.playlist.filter(trackId => trackId !== id);
    savePlaylist();
    await loadTracks();
    setStatus("Song geloescht.");
  } catch (error) {
    setStatus(error.message);
  }
}

function updateTime() {
  const duration = Number.isFinite(els.audio.duration) ? els.audio.duration : 0;
  const current = els.audio.currentTime || 0;
  els.seek.value = duration ? String((current / duration) * 100) : "0";
  if (has(els.bottomSeek)) els.bottomSeek.value = els.seek.value;
  els.timeReadout.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  if (has(els.bottomTimeReadout)) els.bottomTimeReadout.textContent = els.timeReadout.textContent;
}

function coverHtml(track) {
  return `<div class="row-cover">${track.coverUrl ? `<img src="${track.coverUrl}" alt="">` : "CC3"}</div>`;
}

function emptyRow(text) {
  const row = document.createElement("div");
  row.className = "track-row";
  row.textContent = text;
  return row;
}

function trackHeader() {
  const row = document.createElement("div");
  row.className = "track-table-head";
  row.innerHTML = "<span>#</span><span>Titel</span><span>Kuenstler/in</span><span>Kategorie</span><span></span>";
  return row;
}

function button(label, handler) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", handler);
  return btn;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

function setStatus(text) {
  if (has(els.statusLine)) els.statusLine.textContent = text;
}

if (has(els.playBtn)) els.playBtn.addEventListener("click", () => {
  if (!els.audio.src && state.tracks.length) loadTrack(state.currentIndex, false);
  if (els.audio.paused) els.audio.play().catch(() => setStatus("Audio konnte nicht starten."));
  else els.audio.pause();
});
els.audio.addEventListener("play", () => { if (has(els.playBtn)) els.playBtn.textContent = "Pause"; });
els.audio.addEventListener("play", () => { if (has(els.bottomPlayBtn)) els.bottomPlayBtn.textContent = "Pause"; });
els.audio.addEventListener("pause", () => { if (has(els.playBtn)) els.playBtn.textContent = "Play"; });
els.audio.addEventListener("pause", () => { if (has(els.bottomPlayBtn)) els.bottomPlayBtn.textContent = "Play"; });
els.audio.addEventListener("timeupdate", updateTime);
els.audio.addEventListener("ended", nextTrack);
if (has(els.seek)) els.seek.addEventListener("input", () => {
  const duration = Number.isFinite(els.audio.duration) ? els.audio.duration : 0;
  els.audio.currentTime = duration * (Number(els.seek.value) / 100);
});
if (has(els.bottomSeek)) els.bottomSeek.addEventListener("input", () => {
  const duration = Number.isFinite(els.audio.duration) ? els.audio.duration : 0;
  els.audio.currentTime = duration * (Number(els.bottomSeek.value) / 100);
});
if (has(els.volume)) els.volume.addEventListener("input", () => {
  els.audio.volume = Number(els.volume.value);
  if (has(els.bottomVolume)) els.bottomVolume.value = els.volume.value;
});
if (has(els.bottomVolume)) els.bottomVolume.addEventListener("input", () => {
  els.audio.volume = Number(els.bottomVolume.value);
  if (has(els.volume)) els.volume.value = els.bottomVolume.value;
});
if (has(els.prevBtn)) els.prevBtn.addEventListener("click", prevTrack);
if (has(els.nextBtn)) els.nextBtn.addEventListener("click", nextTrack);
if (has(els.bottomPrevBtn)) els.bottomPrevBtn.addEventListener("click", prevTrack);
if (has(els.bottomNextBtn)) els.bottomNextBtn.addEventListener("click", nextTrack);
if (has(els.bottomPlayBtn)) els.bottomPlayBtn.addEventListener("click", () => els.playBtn.click());
if (has(els.bottomShuffleBtn)) els.bottomShuffleBtn.addEventListener("click", () => {
  state.shuffle = !state.shuffle;
  if (has(els.shuffleBtn)) els.shuffleBtn.classList.toggle("main-play", state.shuffle);
  els.bottomShuffleBtn.classList.toggle("main-play", state.shuffle);
});
if (has(els.bottomRepeatBtn)) els.bottomRepeatBtn.addEventListener("click", () => {
  state.repeat = !state.repeat;
  if (has(els.repeatBtn)) els.repeatBtn.classList.toggle("main-play", state.repeat);
  els.bottomRepeatBtn.classList.toggle("main-play", state.repeat);
});
els.shuffleBtn.addEventListener("click", () => {
  state.shuffle = !state.shuffle;
  els.shuffleBtn.classList.toggle("main-play", state.shuffle);
});
els.repeatBtn.addEventListener("click", () => {
  state.repeat = !state.repeat;
  els.repeatBtn.classList.toggle("main-play", state.repeat);
});
if (has(els.librarySearch)) els.librarySearch.value = state.librarySearch;
if (has(els.librarySort)) els.librarySort.value = state.librarySort;
if (has(els.playlistSort)) els.playlistSort.value = state.playlistSort;
if (has(els.librarySearch)) els.librarySearch.addEventListener("input", () => {
  state.librarySearch = els.librarySearch.value;
  localStorage.setItem("cc3LibrarySearch", state.librarySearch);
  renderTracks();
});
if (has(els.librarySort)) els.librarySort.addEventListener("change", () => {
  state.librarySort = els.librarySort.value;
  localStorage.setItem("cc3LibrarySort", state.librarySort);
  renderTracks();
});
if (has(els.categoryFilter)) els.categoryFilter.addEventListener("change", () => {
  state.categoryFilter = els.categoryFilter.value;
  localStorage.setItem("cc3CategoryFilter", state.categoryFilter);
  renderTracks();
});
if (has(els.playlistSort)) els.playlistSort.addEventListener("change", () => {
  state.playlistSort = els.playlistSort.value;
  localStorage.setItem("cc3PlaylistSort", state.playlistSort);
  renderPlaylist();
});
if (has(els.clearPlaylistBtn)) els.clearPlaylistBtn.addEventListener("click", clearPlaylist);
if (has(els.playlistForm)) els.playlistForm.addEventListener("submit", event => {
  event.preventDefault();
  const name = els.playlistName.value.trim();
  setStatus(name ? `Playlist gespeichert: ${name}` : "Playlist lokal gespeichert.");
  savePlaylist();
});
if (has(els.loginBtn)) els.loginBtn.addEventListener("click", login);
if (has(els.logoutBtn)) els.logoutBtn.addEventListener("click", logout);
if (has(els.uploadForm)) els.uploadForm.addEventListener("submit", uploadTrack);
if (has(els.editForm)) els.editForm.addEventListener("submit", updateTrack);
if (has(els.cancelEditBtn)) els.cancelEditBtn.addEventListener("click", cancelEdit);

els.audio.volume = has(els.volume) ? Number(els.volume.value) : 0.86;
if (has(els.bottomVolume) && has(els.volume)) els.bottomVolume.value = els.volume.value;
checkSession();
loadTracks();
