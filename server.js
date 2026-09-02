const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const root = __dirname;
const port = Number(process.env.PORT || 5177);
const host = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const dataDir = path.join(root, "data");
const tracksFile = path.join(dataDir, "tracks.json");
const finderFile = path.join(dataDir, "finder.json");
const finderGroupMaxAgeMs = 30 * 24 * 60 * 60 * 1000;
const finderColors = ["#4ff4cf", "#ff3248", "#ffd166", "#8b5cf6", "#38bdf8", "#fb923c", "#a3e635", "#f472b6"];
const musicDir = path.join(root, "uploads", "music");
const coversDir = path.join(root, "uploads", "covers");
const sessions = new Map();
const uploadMaxBytes = 500 * 1024 * 1024;
const jsonMaxBytes = 2 * 1024 * 1024;
const youtubeCacheMs = 15 * 60 * 1000;
let youtubeCache = { createdAt: 0, payload: null };

const youtubeChannels = [
  { key: "jaro", name: "JARO", handle: "@jaro-JJB", url: "https://www.youtube.com/@jaro-JJB" },
  { key: "delta", name: "DELTA", handle: "@deltajoelplay", url: "https://www.youtube.com/@deltajoelplay" },
  { key: "chaoscinders", name: "CHAOSCINDERS", handle: "@ChaosCinders", url: "https://www.youtube.com/@ChaosCinders" },
  { key: "cjulfy", name: "cjulfy", handle: "@Cjulfy", url: "https://www.youtube.com/@Cjulfy" }
];

const passwordSalt = "cc3-music-admin-v1";
const passwordHash = "928a2c48a8be16dc452608618e98b2e6a86d1784dd425cd68098e55f49ad7310";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac"
};

ensureStorage();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "Serverfehler" });
  }
});

server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  console.log(`JARO & DELTA Server laeuft: http://${displayHost}:${port}/`);
});

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/tracks") {
    sendJson(res, 200, { ok: true, tracks: publicTracks(readTracks()) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/youtube/latest") {
    const payload = await getLatestYoutubeUploads();
    sendJson(res, 200, { ok: true, ...payload });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await readJson(req);
    const candidate = hashPassword(String(body.password || ""));
    if (!constantEqual(candidate, passwordHash)) {
      sendJson(res, 401, { ok: false, error: "Passwort falsch." });
      return;
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { createdAt: Date.now() });
    res.setHeader("Set-Cookie", `cc3_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
    sendJson(res, 200, { ok: true, message: "Admin online." });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/logout") {
    const token = getSessionToken(req);
    if (token) sessions.delete(token);
    res.setHeader("Set-Cookie", "cc3_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/session") {
    sendJson(res, 200, { ok: true, admin: isAdmin(req) });
    return;
  }

  if (url.pathname.startsWith("/api/finder/")) {
    await handleFinderApi(req, res, url);
    return;
  }

  if (!isAdmin(req)) {
    sendJson(res, 401, { ok: false, error: "Admin-Login benoetigt." });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/tracks") {
    const parts = await readMultipart(req, uploadMaxBytes);
    const created = createTrack(parts);
    sendJson(res, 201, { ok: true, track: publicTrack(created) });
    return;
  }

  const match = url.pathname.match(/^\/api\/admin\/tracks\/([a-zA-Z0-9_-]+)$/);
  if (match && req.method === "PATCH") {
    const contentType = req.headers["content-type"] || "";
    const updated = contentType.startsWith("multipart/form-data")
      ? updateTrackFromMultipart(match[1], await readMultipart(req, uploadMaxBytes))
      : updateTrack(match[1], await readJson(req));
    if (!updated) {
      sendJson(res, 404, { ok: false, error: "Song nicht gefunden." });
      return;
    }
    sendJson(res, 200, { ok: true, track: publicTrack(updated) });
    return;
  }

  if (match && req.method === "DELETE") {
    const removed = deleteTrack(match[1]);
    if (!removed) {
      sendJson(res, 404, { ok: false, error: "Song nicht gefunden." });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { ok: false, error: "API nicht gefunden." });
}

async function handleFinderApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/finder/groups") {
    const body = await readJson(req);
    const memberName = cleanName(body.memberName);
    if (!memberName) {
      sendJson(res, 400, { ok: false, error: "Bitte gib deinen Namen ein." });
      return;
    }
    const store = readFinder();
    const group = {
      code: newGroupCode(store),
      name: cleanName(body.groupName) || `${memberName}s Gruppe`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      meetingPoint: null,
      members: {}
    };
    const member = addFinderMember(group, memberName);
    store.groups[group.code] = group;
    writeFinder(store);
    sendJson(res, 201, { ok: true, group: publicFinderGroup(group), member: { id: member.id, token: member.token } });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/finder/join") {
    const body = await readJson(req);
    const memberName = cleanName(body.memberName);
    const code = cleanCode(body.code);
    if (!memberName) {
      sendJson(res, 400, { ok: false, error: "Bitte gib deinen Namen ein." });
      return;
    }
    const store = readFinder();
    const group = store.groups[code];
    if (!group) {
      sendJson(res, 404, { ok: false, error: "Gruppe nicht gefunden. Pruefe den Code." });
      return;
    }
    if (Object.keys(group.members).length >= 30) {
      sendJson(res, 409, { ok: false, error: "Diese Gruppe ist voll." });
      return;
    }
    const member = addFinderMember(group, memberName);
    touchFinderGroup(group);
    writeFinder(store);
    sendJson(res, 200, { ok: true, group: publicFinderGroup(group), member: { id: member.id, token: member.token } });
    return;
  }

  const match = url.pathname.match(/^\/api\/finder\/groups\/([A-Z0-9]{6})(?:\/([a-z]+))?$/);
  if (!match) {
    sendJson(res, 404, { ok: false, error: "API nicht gefunden." });
    return;
  }

  const store = readFinder();
  const group = store.groups[match[1]];
  const memberId = String(req.headers["x-finder-member"] || "");
  const token = String(req.headers["x-finder-token"] || "");
  const member = group && group.members[memberId];
  if (!group || !member || !constantEqualText(member.token, token)) {
    sendJson(res, 401, { ok: false, error: "Du bist nicht mehr in dieser Gruppe." });
    return;
  }

  const action = match[2] || "";

  if (req.method === "GET" && !action) {
    sendJson(res, 200, { ok: true, group: publicFinderGroup(group), serverTime: new Date().toISOString() });
    return;
  }

  if (req.method === "POST" && action === "location") {
    const body = await readJson(req);
    const lat = toNumber(body.lat);
    const lng = toNumber(body.lng);
    member.sharing = body.sharing !== false;
    if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      member.lat = lat;
      member.lng = lng;
      member.accuracy = toNumber(body.accuracy);
      member.heading = toNumber(body.heading);
      member.speed = toNumber(body.speed);
      member.locatedAt = new Date().toISOString();
    }
    const battery = toNumber(body.battery);
    member.battery = battery === null ? null : Math.max(0, Math.min(100, Math.round(battery)));
    member.lastSeen = new Date().toISOString();
    touchFinderGroup(group);
    writeFinder(store);
    sendJson(res, 200, { ok: true, group: publicFinderGroup(group), serverTime: new Date().toISOString() });
    return;
  }

  if (req.method === "POST" && action === "alert") {
    const body = await readJson(req);
    member.alert = body.active
      ? { active: true, message: cleanText(body.message || "").slice(0, 160), since: member.alert?.active ? member.alert.since : new Date().toISOString() }
      : null;
    member.lastSeen = new Date().toISOString();
    touchFinderGroup(group);
    writeFinder(store);
    sendJson(res, 200, { ok: true, group: publicFinderGroup(group) });
    return;
  }

  if (req.method === "POST" && action === "meeting") {
    const body = await readJson(req);
    if (body.clear) {
      group.meetingPoint = null;
    } else {
      const lat = toNumber(body.lat);
      const lng = toNumber(body.lng);
      if (lat === null || lng === null) {
        sendJson(res, 400, { ok: false, error: "Treffpunkt braucht eine Position." });
        return;
      }
      group.meetingPoint = {
        lat,
        lng,
        label: cleanName(body.label) || "Treffpunkt",
        setBy: member.name,
        setAt: new Date().toISOString()
      };
    }
    touchFinderGroup(group);
    writeFinder(store);
    sendJson(res, 200, { ok: true, group: publicFinderGroup(group) });
    return;
  }

  if (req.method === "POST" && action === "leave") {
    delete group.members[memberId];
    if (!Object.keys(group.members).length) delete store.groups[group.code];
    else touchFinderGroup(group);
    writeFinder(store);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { ok: false, error: "API nicht gefunden." });
}

function addFinderMember(group, name) {
  const used = new Set(Object.values(group.members).map(item => item.color));
  const color = finderColors.find(item => !used.has(item)) || finderColors[Object.keys(group.members).length % finderColors.length];
  const member = {
    id: crypto.randomBytes(8).toString("hex"),
    token: crypto.randomBytes(24).toString("hex"),
    name,
    color,
    joinedAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    locatedAt: null,
    lat: null,
    lng: null,
    accuracy: null,
    heading: null,
    speed: null,
    battery: null,
    sharing: true,
    alert: null
  };
  group.members[member.id] = member;
  return member;
}

function touchFinderGroup(group) {
  group.updatedAt = new Date().toISOString();
}

function newGroupCode(store) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 50; attempt++) {
    const bytes = crypto.randomBytes(6);
    const code = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
    if (!store.groups[code]) return code;
  }
  throw new Error("Kein freier Gruppencode gefunden.");
}

function publicFinderGroup(group) {
  return {
    code: group.code,
    name: group.name,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    meetingPoint: group.meetingPoint,
    members: Object.values(group.members).map(member => {
      const { token, ...rest } = member;
      return rest;
    })
  };
}

function readFinder() {
  try {
    const store = JSON.parse(fs.readFileSync(finderFile, "utf8"));
    if (!store || typeof store !== "object" || !store.groups) return { groups: {} };
    return store;
  } catch {
    return { groups: {} };
  }
}

function writeFinder(store) {
  const cutoff = Date.now() - finderGroupMaxAgeMs;
  Object.keys(store.groups).forEach(code => {
    const updated = Date.parse(store.groups[code].updatedAt || 0);
    if (!Number.isFinite(updated) || updated < cutoff) delete store.groups[code];
  });
  fs.writeFileSync(finderFile, JSON.stringify(store, null, 2) + "\n", "utf8");
}

function cleanName(value) {
  return cleanText(value).slice(0, 40);
}

function cleanCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function constantEqualText(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function createTrack(parts) {
  const { fields, files } = splitParts(parts);

  if (!files.song || !files.song.data.length) {
    throw new Error("Songdatei fehlt.");
  }

  const id = crypto.randomBytes(10).toString("hex");
  const songExt = safeExt(files.song.filename, [".mp3", ".wav", ".ogg", ".m4a", ".flac"]);
  const audioFile = `${id}${songExt}`;
  fs.writeFileSync(path.join(musicDir, audioFile), files.song.data);

  let coverFile = "";
  if (files.cover && files.cover.data.length) {
    const coverExt = safeExt(files.cover.filename, [".png", ".jpg", ".jpeg", ".webp", ".gif"]);
    coverFile = `${id}${coverExt}`;
    fs.writeFileSync(path.join(coversDir, coverFile), files.cover.data);
  }

  const track = {
    id,
    title: cleanText(fields.title || "Unbenannter Track"),
    artist: cleanText(fields.artist || "CC3"),
    album: cleanText(fields.album || "Uploads"),
    category: cleanText(fields.category || "CC3 Music"),
    description: cleanText(fields.description || ""),
    tags: splitTags(fields.tags || ""),
    downloadAllowed: fields.downloadAllowed === "on" || fields.downloadAllowed === "true",
    audioUrl: `/uploads/music/${audioFile}`,
    coverUrl: coverFile ? `/uploads/covers/${coverFile}` : "",
    createdAt: new Date().toISOString()
  };

  const tracks = readTracks();
  tracks.unshift(track);
  writeTracks(tracks);
  return track;
}

function updateTrack(id, changes) {
  const tracks = readTracks();
  const track = tracks.find(item => item.id === id);
  if (!track) return null;
  ["title", "artist", "album", "category", "description"].forEach(key => {
    if (Object.prototype.hasOwnProperty.call(changes, key)) track[key] = cleanText(changes[key]);
  });
  if (Object.prototype.hasOwnProperty.call(changes, "tags")) track.tags = Array.isArray(changes.tags) ? changes.tags.map(cleanText).filter(Boolean) : splitTags(changes.tags);
  if (Object.prototype.hasOwnProperty.call(changes, "downloadAllowed")) track.downloadAllowed = Boolean(changes.downloadAllowed);
  writeTracks(tracks);
  return track;
}

function updateTrackFromMultipart(id, parts) {
  const tracks = readTracks();
  const track = tracks.find(item => item.id === id);
  if (!track) return null;
  const { fields, files } = splitParts(parts);

  ["title", "artist", "album", "category", "description"].forEach(key => {
    if (Object.prototype.hasOwnProperty.call(fields, key)) track[key] = cleanText(fields[key]);
  });
  if (Object.prototype.hasOwnProperty.call(fields, "tags")) track.tags = splitTags(fields.tags);
  track.downloadAllowed = fields.downloadAllowed === "on" || fields.downloadAllowed === "true";

  if (files.cover && files.cover.data.length) {
    removeUpload(track.coverUrl);
    const coverExt = safeExt(files.cover.filename, [".png", ".jpg", ".jpeg", ".webp", ".gif"]);
    const coverFile = `${id}-cover-${Date.now()}${coverExt}`;
    fs.writeFileSync(path.join(coversDir, coverFile), files.cover.data);
    track.coverUrl = `/uploads/covers/${coverFile}`;
  }

  if (files.song && files.song.data.length) {
    removeUpload(track.audioUrl);
    const songExt = safeExt(files.song.filename, [".mp3", ".wav", ".ogg", ".m4a", ".flac"]);
    const audioFile = `${id}-audio-${Date.now()}${songExt}`;
    fs.writeFileSync(path.join(musicDir, audioFile), files.song.data);
    track.audioUrl = `/uploads/music/${audioFile}`;
  }

  track.updatedAt = new Date().toISOString();
  writeTracks(tracks);
  return track;
}

function deleteTrack(id) {
  const tracks = readTracks();
  const index = tracks.findIndex(item => item.id === id);
  if (index < 0) return false;
  const [track] = tracks.splice(index, 1);
  removeUpload(track.audioUrl);
  removeUpload(track.coverUrl);
  writeTracks(tracks);
  return true;
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const requested = path.normalize(path.join(root, pathname));
  if (!requested.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  let filePath = requested;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Nicht gefunden");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const headers = { "Content-Type": mimeTypes[ext] || "application/octet-stream" };
  if (path.basename(filePath) === "sw.js" || ext === ".webmanifest") headers["Cache-Control"] = "no-cache";
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let position = buffer.indexOf(delimiter);
  while (position >= 0) {
    let start = position + delimiter.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    const next = buffer.indexOf(delimiter, start);
    if (next < 0) break;
    let part = buffer.slice(start, next);
    if (part.length >= 2 && part[part.length - 2] === 13 && part[part.length - 1] === 10) {
      part = part.slice(0, -2);
    }
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd >= 0) {
      const rawHeaders = part.slice(0, headerEnd).toString("utf8");
      const data = part.slice(headerEnd + 4);
      const disposition = rawHeaders.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || "";
      const name = disposition.match(/name="([^"]+)"/)?.[1] || "";
      const filename = disposition.match(/filename="([^"]*)"/)?.[1] || "";
      if (name) parts.push({ name, filename, data });
    }
    position = next;
  }
  return parts;
}

async function readMultipart(req, maxBytes) {
  const contentType = req.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
  if (!boundary) throw new Error("Multipart Upload erwartet.");
  const body = await readBuffer(req, maxBytes);
  return parseMultipart(body, boundary);
}

function splitParts(parts) {
  const fields = {};
  const files = {};
  parts.forEach(part => {
    if (part.filename) files[part.name] = part;
    else fields[part.name] = part.data.toString("utf8").trim();
  });
  return { fields, files };
}

function readBuffer(req, maxBytes = jsonMaxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let tooLarge = false;
    req.on("data", chunk => {
      if (tooLarge) return;
      length += chunk.length;
      if (length > maxBytes) {
        tooLarge = true;
        reject(new Error(`Upload ist zu gross. Maximal erlaubt sind ${Math.round(maxBytes / 1024 / 1024)} MB.`));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!tooLarge) resolve(Buffer.concat(chunks));
    });
    req.on("error", error => {
      if (!tooLarge) reject(error);
    });
  });
}

async function readJson(req) {
  const buffer = await readBuffer(req);
  if (!buffer.length) return {};
  return JSON.parse(buffer.toString("utf8"));
}

function readTracks() {
  try {
    return JSON.parse(fs.readFileSync(tracksFile, "utf8"));
  } catch {
    return [];
  }
}

function writeTracks(tracks) {
  fs.writeFileSync(tracksFile, JSON.stringify(tracks, null, 2) + "\n", "utf8");
}

function publicTracks(tracks) {
  return tracks.map(publicTrack);
}

function publicTrack(track) {
  return { ...track };
}

async function getLatestYoutubeUploads() {
  if (youtubeCache.payload && Date.now() - youtubeCache.createdAt < youtubeCacheMs) {
    return youtubeCache.payload;
  }

  const channels = await Promise.all(youtubeChannels.map(async channel => {
    try {
      return await getLatestYoutubeUpload(channel);
    } catch (error) {
      return {
        ...channel,
        ok: false,
        error: error.message || "YouTube konnte nicht geladen werden."
      };
    }
  }));

  const payload = {
    updatedAt: new Date().toISOString(),
    channels
  };
  youtubeCache = { createdAt: Date.now(), payload };
  return payload;
}

async function getLatestYoutubeUpload(channel) {
  const channelId = await resolveYoutubeChannelId(channel.url);
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  try {
    const xml = await fetchText(rssUrl);
    const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
    if (!entry) throw new Error("Keine Videos im RSS Feed gefunden.");

    const videoId = decodeXml(entry.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/)?.[1] || "");
    const title = decodeXml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "Neuestes Video");
    const published = decodeXml(entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] || "");
    const link = decodeXml(entry.match(/<link rel="alternate" href="([^"]+)"/)?.[1] || `https://www.youtube.com/watch?v=${videoId}`);
    const thumbnail = entry.match(/<media:thumbnail url="([^"]+)"/)?.[1] || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");

    return {
      ...channel,
      ok: true,
      channelId,
      videoId,
      title,
      published,
      publishedLabel: published,
      link,
      embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}` : "",
      thumbnail
    };
  } catch {
    return scrapeLatestYoutubeUpload(channel, channelId);
  }
}

async function scrapeLatestYoutubeUpload(channel, channelId) {
  const candidates = [];
  for (const pathPart of ["/videos", "/shorts"]) {
    try {
      const html = await fetchText(`${channel.url}${pathPart}`);
      const first = parseFirstYoutubeLockup(html);
      if (first) candidates.push({ ...first, sourcePath: pathPart });
    } catch {
    }
  }
  const item = candidates[0];
  if (!item) throw new Error("Keine Uploads auf der YouTube-Seite gefunden.");
  const videoId = item.videoId;
  const isShort = item.sourcePath === "/shorts";
  const link = videoId
    ? `https://www.youtube.com/${isShort ? "shorts/" : "watch?v="}${videoId}`
    : channel.url;

  return {
    ...channel,
    ok: true,
    channelId,
    videoId,
    title: item.title || "Neuestes YouTube-Video",
    published: "",
    publishedLabel: item.publishedLabel || "YouTube",
    link,
    embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}` : "",
    thumbnail: item.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "")
  };
}

async function resolveYoutubeChannelId(channelUrl) {
  const html = await fetchText(channelUrl);
  const patterns = [
    /"channelId":"(UC[a-zA-Z0-9_-]+)"/,
    /"browseId":"(UC[a-zA-Z0-9_-]+)"/,
    /<meta itemprop="channelId" content="(UC[a-zA-Z0-9_-]+)">/,
    /\/channel\/(UC[a-zA-Z0-9_-]+)/
  ];
  for (const pattern of patterns) {
    const id = html.match(pattern)?.[1];
    if (id) return id;
  }
  throw new Error("Channel-ID nicht gefunden.");
}

function parseFirstYoutubeLockup(html) {
  const json = extractJsonAfter(html, "var ytInitialData =");
  if (!json) return null;
  const data = JSON.parse(json);
  const lockups = [];
  collectYoutubeLockups(data, lockups);
  const lockup = lockups.find(item => item.contentId && getLockupTitle(item));
  if (!lockup) return null;
  const thumbnailSources = lockup.contentImage?.thumbnailViewModel?.image?.sources || [];
  const metadataParts = lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts || [];
  return {
    videoId: lockup.contentId,
    title: getLockupTitle(lockup),
    publishedLabel: metadataParts.map(part => part.text?.content || "").filter(Boolean).join(" | "),
    thumbnail: thumbnailSources.length ? thumbnailSources[thumbnailSources.length - 1].url : ""
  };
}

function collectYoutubeLockups(value, out) {
  if (!value || typeof value !== "object") return;
  if (value.lockupViewModel) out.push(value.lockupViewModel);
  Object.values(value).forEach(child => {
    if (child && typeof child === "object") collectYoutubeLockups(child, out);
  });
}

function getLockupTitle(lockup) {
  return lockup.metadata?.lockupMetadataViewModel?.title?.content || "";
}

function extractJsonAfter(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return "";
  const start = text.indexOf("{", markerIndex);
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
    } else {
      if (char === "\"") inString = true;
      else if (char === "{") depth++;
      else if (char === "}") {
        depth--;
        if (depth === 0) return text.slice(start, index + 1);
      }
    }
  }
  return "";
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 RedstoneLabs/1.0",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} bei ${url}`);
  return response.text();
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, passwordSalt, 120000, 32, "sha256").toString("hex");
}

function constantEqual(a, b) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getSessionToken(req) {
  const cookie = req.headers.cookie || "";
  return cookie.split(";").map(part => part.trim()).find(part => part.startsWith("cc3_admin="))?.split("=")[1] || "";
}

function isAdmin(req) {
  const token = getSessionToken(req);
  const session = token && sessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function ensureStorage() {
  [dataDir, musicDir, coversDir].forEach(dir => fs.mkdirSync(dir, { recursive: true }));
  if (!fs.existsSync(tracksFile)) writeTracks([]);
  if (!fs.existsSync(finderFile)) writeFinder({ groups: {} });
}

function safeExt(filename, allowed) {
  const ext = path.extname(filename || "").toLowerCase();
  if (!allowed.includes(ext)) throw new Error(`Dateityp nicht erlaubt: ${ext || "ohne Endung"}`);
  return ext;
}

function cleanText(value) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 600);
}

function splitTags(value) {
  return String(value || "").split(",").map(tag => cleanText(tag)).filter(Boolean).slice(0, 18);
}

function removeUpload(url) {
  if (!url || !url.startsWith("/uploads/")) return;
  const file = path.normalize(path.join(root, url));
  if (file.startsWith(path.join(root, "uploads")) && fs.existsSync(file)) fs.unlinkSync(file);
}
