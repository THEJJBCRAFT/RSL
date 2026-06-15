const latestUploads = document.querySelector("#latestUploads");
const eventsGrid = document.querySelector("#eventsGrid");
const serversGrid = document.querySelector("#serversGrid");
const updatesGrid = document.querySelector("#updatesGrid");
const shopPanel = document.querySelector("#shopPanel");
const nextEventTitle = document.querySelector("#nextEventTitle");
const nextEventMeta = document.querySelector("#nextEventMeta");
const serverStatusTitle = document.querySelector("#serverStatusTitle");
const serverStatusMeta = document.querySelector("#serverStatusMeta");
const latestUpdateTitle = document.querySelector("#latestUpdateTitle");
const latestUpdateMeta = document.querySelector("#latestUpdateMeta");

const fallbackHubData = {
  events: [
    {
      title: "CONTENTCR3W Event",
      datetime: "",
      status: "PLANNED",
      description: "Neue Events werden hier angezeigt, sobald die lokale JSON-Datei bereit ist.",
      cta: "Coming Soon"
    }
  ],
  servers: [
    {
      name: "CONTENTCR3W Server",
      game: "Minecraft / Projekte",
      status: "SOON",
      players: "TBA",
      description: "Serverdaten konnten nicht geladen werden. Die Seite bleibt trotzdem nutzbar."
    }
  ],
  updates: [
    {
      version: "CC3-HUB",
      date: "",
      category: "UPDATE",
      title: "Updates bereit",
      description: "Patch Notes werden aus data/contentcr3w.json geladen."
    }
  ],
  shop: {
    status: "SOON",
    title: "Shop kommt bald",
    description: "Der Shop ist in Vorbereitung und hat noch keine Kauf-Funktion.",
    categories: ["Merch", "Downloads", "Server-Packs", "Assets"]
  }
};

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatDate(value) {
  if (!value) return "Gerade geladen";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Gerade geladen";
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "Termin folgt";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Termin folgt";
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function loadHubData() {
  try {
    const response = await fetch("/data/contentcr3w.json");
    const data = await response.json();
    if (!response.ok) throw new Error("CONTENTCR3W JSON konnte nicht geladen werden.");
    renderHubData(normalizeHubData(data));
  } catch {
    renderHubData(fallbackHubData);
  }
}

function normalizeHubData(data) {
  return {
    events: Array.isArray(data.events) && data.events.length ? data.events : fallbackHubData.events,
    servers: Array.isArray(data.servers) && data.servers.length ? data.servers : fallbackHubData.servers,
    updates: Array.isArray(data.updates) && data.updates.length ? data.updates : fallbackHubData.updates,
    shop: data.shop && typeof data.shop === "object" ? data.shop : fallbackHubData.shop
  };
}

function renderHubData(data) {
  renderHeroStatus(data);
  renderEvents(data.events);
  renderServers(data.servers);
  renderUpdates(data.updates);
  renderShop(data.shop);
}

function renderHeroStatus(data) {
  const event = data.events[0];
  const liveServer = data.servers.find(server => String(server.status).toUpperCase() === "LIVE") || data.servers[0];
  const update = data.updates[0];

  nextEventTitle.textContent = event?.title || "Event folgt";
  nextEventMeta.textContent = event ? `${event.status || "PLANNED"} | ${formatDateTime(event.datetime)}` : "Kalender wird vorbereitet.";
  serverStatusTitle.textContent = liveServer?.name || "Server folgt";
  serverStatusMeta.textContent = liveServer ? `${liveServer.status || "SOON"} | ${liveServer.players || "TBA"}` : "Serverstatus folgt.";
  latestUpdateTitle.textContent = update?.title || "Update folgt";
  latestUpdateMeta.textContent = update ? `${update.category || "UPDATE"} | ${update.version || formatDate(update.date)}` : "Patch Notes folgen.";
}

function renderEvents(events) {
  if (!eventsGrid) return;
  eventsGrid.innerHTML = events.map((event, index) => `
    <article class="hub-card event-card" style="--card:${index}">
      <span class="status-pill">${escapeHtml(event.status || "PLANNED")}</span>
      <h3>${escapeHtml(event.title)}</h3>
      <p class="hub-meta">${formatDateTime(event.datetime)}</p>
      <p>${escapeHtml(event.description)}</p>
      <button type="button">${escapeHtml(event.cta || "Event ansehen")}</button>
    </article>
  `).join("");
}

function renderServers(servers) {
  if (!serversGrid) return;
  serversGrid.innerHTML = servers.map((server, index) => `
    <article class="hub-card server-card" style="--card:${index}">
      <span class="status-pill ${String(server.status || "").toLowerCase()}">${escapeHtml(server.status || "SOON")}</span>
      <h3>${escapeHtml(server.name)}</h3>
      <p class="hub-meta">${escapeHtml(server.game || "Projekt")} | ${escapeHtml(server.players || "TBA")}</p>
      <p>${escapeHtml(server.description)}</p>
      <div class="server-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    </article>
  `).join("");
}

function renderUpdates(updates) {
  if (!updatesGrid) return;
  updatesGrid.innerHTML = updates.map((update, index) => `
    <article class="hub-card update-card" style="--card:${index}">
      <span class="status-pill">${escapeHtml(update.category || "UPDATE")}</span>
      <h3>${escapeHtml(update.title)}</h3>
      <p class="hub-meta">${escapeHtml(update.version || "CC3")} | ${formatDate(update.date)}</p>
      <p>${escapeHtml(update.description)}</p>
    </article>
  `).join("");
}

function renderShop(shop) {
  if (!shopPanel) return;
  const categories = Array.isArray(shop.categories) ? shop.categories : fallbackHubData.shop.categories;
  shopPanel.innerHTML = `
    <article class="shop-card">
      <span class="status-pill">${escapeHtml(shop.status || "SOON")}</span>
      <h3>${escapeHtml(shop.title || "Shop kommt bald")}</h3>
      <p>${escapeHtml(shop.description || fallbackHubData.shop.description)}</p>
      <div class="shop-tags">
        ${categories.map(category => `<span>${escapeHtml(category)}</span>`).join("")}
      </div>
    </article>
  `;
}

async function loadLatestUploads() {
  if (!latestUploads) return;
  try {
    const response = await fetch("/api/youtube/latest");
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "YouTube Daten konnten nicht geladen werden.");
    renderUploads(data.channels || []);
  } catch (error) {
    latestUploads.innerHTML = `
      <article class="video-card short-card loading-card">
        <div class="video-thumb"><span>ERROR</span></div>
        <h3>YouTube konnte nicht geladen werden</h3>
        <p>${escapeHtml(error.message)}</p>
      </article>
    `;
  }
}

function renderUploads(channels) {
  latestUploads.innerHTML = channels.map(channel => {
    if (!channel.ok) {
      return `
        <article class="video-card short-card">
          <div class="video-thumb"><span>${escapeHtml(channel.name)}</span></div>
          <h3>${escapeHtml(channel.name)}</h3>
          <p>${escapeHtml(channel.error || "Kein Upload gefunden.")}</p>
          <a class="enter-button" href="${escapeHtml(channel.url)}" target="_blank" rel="noreferrer">Kanal oeffnen</a>
        </article>
      `;
    }

    const thumb = channel.thumbnail
      ? `<img src="${escapeHtml(channel.thumbnail)}" alt="${escapeHtml(channel.title)} Thumbnail">`
      : `<span>${escapeHtml(channel.name)}</span>`;
    return `
      <article class="video-card short-card live-upload-card">
        <a class="video-thumb video-thumb-link" href="${escapeHtml(channel.link)}" target="_blank" rel="noreferrer">
          ${thumb}
          <span class="play-badge">Play</span>
        </a>
        <div class="video-channel">${escapeHtml(channel.name)} | ${escapeHtml(channel.handle)}</div>
        <h3>${escapeHtml(channel.title)}</h3>
        <p>Neuester Upload: ${escapeHtml(channel.published ? formatDate(channel.published) : channel.publishedLabel || "YouTube")}</p>
        <a class="enter-button" href="${escapeHtml(channel.link)}" target="_blank" rel="noreferrer">Auf YouTube ansehen</a>
      </article>
    `;
  }).join("");
}

loadHubData();
loadLatestUploads();
