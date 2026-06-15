const tracks = ["World", "Player", "Entities", "UI", "Logic"];
const ticksPerSecond = 20;
const timelineLeft = 98;

const state = {
  selectedId: null,
  playing: false,
  playTimer: null,
  validation: [],
  simLog: [],
  bridgeLog: [],
  bridge: {
    socket: null,
    connected: false,
    status: "offline",
    world: null,
    livePlaying: false,
    livePaused: false,
    lastTick: 0
  },
  clips: [
    { id: createId(), track: "UI", start: 0, duration: 30, type: "title", label: "Intro Titel", value: "@a|Redstone Labs|red", mode: "both" },
    { id: createId(), track: "World", start: 40, duration: 20, type: "setblock", label: "Redstone Block", value: "~ ~1 ~|minecraft:redstone_block", mode: "both" },
    { id: createId(), track: "Entities", start: 80, duration: 20, type: "summon", label: "Blitz", value: "minecraft:lightning_bolt|~ ~ ~", mode: "both" },
    { id: createId(), track: "Player", start: 120, duration: 20, type: "give", label: "Give Redstone", value: "@p|minecraft:redstone|16", mode: "both" }
  ]
};

const els = {
  timeline: document.querySelector("#timeline"),
  timelineHead: document.querySelector("#timelineHead"),
  playhead: document.querySelector("#playhead"),
  currentTick: document.querySelector("#currentTick"),
  currentSecond: document.querySelector("#currentSecond"),
  packName: document.querySelector("#packName"),
  namespace: document.querySelector("#namespace"),
  packFormat: document.querySelector("#packFormat"),
  lengthSeconds: document.querySelector("#lengthSeconds"),
  autoStart: document.querySelector("#autoStart"),
  exportRealSim: document.querySelector("#exportRealSim"),
  exportFirstPersonSim: document.querySelector("#exportFirstPersonSim"),
  resourcePackName: document.querySelector("#resourcePackName"),
  resourcePackFormat: document.querySelector("#resourcePackFormat"),
  shaderMode: document.querySelector("#shaderMode"),
  emptyInspector: document.querySelector("#emptyInspector"),
  clipForm: document.querySelector("#clipForm"),
  clipLabel: document.querySelector("#clipLabel"),
  clipTrack: document.querySelector("#clipTrack"),
  clipStart: document.querySelector("#clipStart"),
  clipDuration: document.querySelector("#clipDuration"),
  clipType: document.querySelector("#clipType"),
  clipValue: document.querySelector("#clipValue"),
  valueHint: document.querySelector("#valueHint"),
  commandPreview: document.querySelector("#commandPreview"),
  commandState: document.querySelector("#commandState"),
  validationList: document.querySelector("#validationList"),
  validationState: document.querySelector("#validationState"),
  projectBadge: document.querySelector("#projectBadge"),
  clipBadge: document.querySelector("#clipBadge"),
  filePreview: document.querySelector("#filePreview"),
  minecraftStartPreview: document.querySelector("#minecraftStartPreview"),
  realSimPreview: document.querySelector("#realSimPreview"),
  statClips: document.querySelector("#statClips"),
  statFunctions: document.querySelector("#statFunctions"),
  statIssues: document.querySelector("#statIssues"),
  statBridge: document.querySelector("#statBridge"),
  simObjects: document.querySelector("#simObjects"),
  simCurrent: document.querySelector("#simCurrent"),
  simUpcoming: document.querySelector("#simUpcoming"),
  simLog: document.querySelector("#simLog"),
  bridgePort: document.querySelector("#bridgePort"),
  bridgeAutoConnect: document.querySelector("#bridgeAutoConnect"),
  bridgeStatusBadge: document.querySelector("#bridgeStatusBadge"),
  bridgeConnectBtn: document.querySelector("#bridgeConnectBtn"),
  bridgeDisconnectBtn: document.querySelector("#bridgeDisconnectBtn"),
  bridgeWorldStatus: document.querySelector("#bridgeWorldStatus"),
  bridgeLog: document.querySelector("#bridgeLog"),
  livePlayBtn: document.querySelector("#livePlayBtn"),
  livePauseBtn: document.querySelector("#livePauseBtn"),
  liveStopBtn: document.querySelector("#liveStopBtn"),
  liveStepBtn: document.querySelector("#liveStepBtn"),
  liveSendClipBtn: document.querySelector("#liveSendClipBtn"),
  liveSyncBtn: document.querySelector("#liveSyncBtn"),
  clipMode: document.querySelector("#clipMode")
};

function maxTicks() {
  return Math.max(ticksPerSecond, Number(els.lengthSeconds.value || 30) * ticksPerSecond);
}

function namespace() {
  return sanitizeId(els.namespace.value || "redstone_labs");
}

function sanitizeId(value) {
  return value.toLowerCase().replace(/[^a-z0-9_.-]/g, "_").replace(/^_+/, "") || "redstone_labs";
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `clip_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function selectedClip() {
  return state.clips.find(clip => clip.id === state.selectedId);
}

function render() {
  els.playhead.max = maxTicks();
  if (Number(els.playhead.value) > maxTicks()) {
    els.playhead.value = maxTicks();
  }
  state.validation = validateProject();
  renderStats();
  renderRuler();
  renderTimeline();
  renderInspector();
  renderValidation();
  renderProjectPreview();
  renderSimulation();
  renderBridge();
}

function renderStats() {
  const functions = generateDatapackFiles().size;
  const errors = state.validation.filter(item => item.level === "error").length;
  els.statClips.textContent = state.clips.length;
  els.statFunctions.textContent = functions;
  els.statIssues.textContent = errors;
  els.statBridge.textContent = state.bridge.connected ? "ON" : "OFF";
  els.statBridge.className = state.bridge.connected ? "bridge-ok" : "bridge-warn";
  els.projectBadge.textContent = errors ? "FEHLER" : "OK";
  els.projectBadge.className = `badge ${errors ? "error" : "ok"}`;
}

function renderRuler() {
  const seconds = Math.max(1, Number(els.lengthSeconds.value || 30));
  const marks = Math.min(10, Math.max(4, Math.ceil(seconds / 5) + 1));
  els.timelineHead.style.gridTemplateColumns = `repeat(${marks}, 1fr)`;
  els.timelineHead.innerHTML = "";
  for (let i = 0; i < marks; i++) {
    const second = Math.round((seconds / (marks - 1)) * i);
    const span = document.createElement("span");
    span.textContent = `${second}s`;
    els.timelineHead.append(span);
  }
}

function renderTimeline() {
  els.timeline.innerHTML = "";
  const marker = document.createElement("div");
  marker.className = "play-marker";
  marker.style.left = `calc(${timelineLeft}px + ${(Number(els.playhead.value) / maxTicks()) * 100}%)`;
  els.timeline.append(marker);

  const template = document.querySelector("#trackTemplate");
  tracks.forEach(track => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".track-label").textContent = track;
    const lane = node.querySelector(".track-lane");
    lane.dataset.track = track;
    lane.addEventListener("dblclick", event => addClipAtTrack(track, tickFromLaneEvent(event)));

    state.clips
      .filter(clip => clip.track === track)
      .sort((a, b) => a.start - b.start)
      .forEach(clip => lane.append(createClipElement(clip)));

    els.timeline.append(node);
  });
}

function createClipElement(clip) {
  const node = document.createElement("div");
  const commandInfo = commandForClip(clip);
  node.className = "clip";
  node.dataset.type = clip.type;
  node.dataset.mode = clip.mode || "both";
  node.dataset.invalid = commandInfo.errors.length > 0;
  node.style.left = `${(clip.start / maxTicks()) * 100}%`;
  node.style.width = `${Math.max(6, (clip.duration / maxTicks()) * 100)}%`;
  if (clip.id === state.selectedId) {
    node.classList.add("selected");
  }
  node.innerHTML = `<div class="clip-title"></div><div class="clip-meta"></div>`;
  node.querySelector(".clip-title").textContent = clip.label || clip.type;
  node.querySelector(".clip-meta").textContent = `${clip.start}t | ${clip.type} | ${modeLabel(clip.mode)}`;
  node.addEventListener("click", () => {
    state.selectedId = clip.id;
    render();
  });
  node.addEventListener("pointerdown", event => startDrag(event, clip));
  return node;
}

function tickFromLaneEvent(event) {
  const laneRect = event.currentTarget.getBoundingClientRect();
  const ratio = clamp((event.clientX - laneRect.left) / laneRect.width, 0, 1);
  return snapTick(Math.round(ratio * maxTicks()));
}

function startDrag(event, clip) {
  if (event.button !== 0) return;
  const lane = event.currentTarget.parentElement;
  const laneRect = lane.getBoundingClientRect();
  const startX = event.clientX;
  const originalStart = clip.start;
  event.currentTarget.setPointerCapture(event.pointerId);

  const move = moveEvent => {
    const deltaRatio = (moveEvent.clientX - startX) / laneRect.width;
    clip.start = clamp(snapTick(originalStart + Math.round(deltaRatio * maxTicks())), 0, maxTicks());
    state.selectedId = clip.id;
    render();
  };

  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function snapTick(tick) {
  return Math.round(tick / 5) * 5;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function renderInspector() {
  const clip = selectedClip();
  if (!clip) {
    els.emptyInspector.classList.remove("hidden");
    els.clipForm.classList.add("hidden");
    els.commandPreview.textContent = "// Kein Clip ausgewaehlt";
    els.valueHint.textContent = "";
    els.commandState.textContent = "LEER";
    els.commandState.className = "badge warn";
    return;
  }

  const commandInfo = commandForClip(clip);
  els.emptyInspector.classList.add("hidden");
  els.clipForm.classList.remove("hidden");
  els.clipLabel.value = clip.label;
  els.clipTrack.value = clip.track;
  els.clipStart.value = clip.start;
  els.clipDuration.value = clip.duration;
  els.clipMode.value = clip.mode || "both";
  els.clipType.value = clip.type;
  els.clipValue.value = clip.value;
  els.valueHint.textContent = valueHint(clip.type);
  els.commandPreview.textContent = commandInfo.command;
  els.commandState.textContent = commandInfo.errors.length ? "FEHLER" : "OK";
  els.commandState.className = `badge ${commandInfo.errors.length ? "error" : "ok"}`;
  els.clipBadge.textContent = clip.type.toUpperCase();
}

function renderValidation() {
  const errors = state.validation.filter(item => item.level === "error").length;
  els.validationState.textContent = errors ? "FEHLER" : "OK";
  els.validationState.className = `badge ${errors ? "error" : "ok"}`;
  els.validationList.innerHTML = "";
  state.validation.forEach(item => {
    const row = document.createElement("div");
    row.className = `validation-item ${item.level}`;
    row.textContent = item.message;
    els.validationList.append(row);
  });
}

function renderProjectPreview() {
  els.currentTick.textContent = els.playhead.value;
  els.currentSecond.textContent = (Number(els.playhead.value) / ticksPerSecond).toFixed(2);
  els.minecraftStartPreview.textContent = [
    `/reload`,
    `/function ${namespace()}:control/start`,
    `/function ${namespace()}:control/stop`,
    `/function ${namespace()}:control/reset`
  ].join("\n");
  els.realSimPreview.textContent = [
    `/reload`,
    `/function ${namespace()}:sim/setup`,
    `/function ${namespace()}:sim/start`,
    `/function ${namespace()}:sim/stop`,
    `/function ${namespace()}:sim/clear`,
    `/function ${namespace()}:sim/fp_start`,
    `/function ${namespace()}:sim/fp_stop`
  ].join("\n");
  els.filePreview.textContent = [...generateDatapackFiles().keys()].join("\n");
}

function renderSimulation() {
  const tick = Number(els.playhead.value);
  const active = activeClipsAt(tick);
  const upcoming = nextClipsAfter(tick, 6);

  els.simObjects.innerHTML = "";
  active.forEach((clip, index) => els.simObjects.append(createSimObject(clip, index, active.length)));

  els.simCurrent.textContent = active.length
    ? active.map(clip => `[${clip.track}] ${clip.label}\n${commandForClip(clip).command}`).join("\n\n")
    : "In diesem Tick passiert noch nichts.";

  els.simUpcoming.textContent = upcoming.length
    ? upcoming.map(clip => `${clip.start}t  ${clip.label}  (${clip.type})`).join("\n")
    : "Keine weiteren Aktionen.";

  renderSimLog();
}

function activeClipsAt(tick) {
  return state.clips
    .filter(clip => Number(clip.start) === tick)
    .sort((a, b) => tracks.indexOf(a.track) - tracks.indexOf(b.track));
}

function nextClipsAfter(tick, limit) {
  return state.clips
    .filter(clip => Number(clip.start) > tick)
    .sort((a, b) => a.start - b.start)
    .slice(0, limit);
}

function createSimObject(clip, index, total) {
  const node = document.createElement("div");
  node.className = `sim-object ${clip.type}`;
  node.dataset.label = clip.label;

  const positions = {
    World: [30, 66],
    Player: [50, 52],
    Entities: [68, 55],
    UI: [50, 20],
    Logic: [84, 34]
  };
  const base = positions[clip.track] || [50, 50];
  const spread = total > 1 ? (index - (total - 1) / 2) * 7 : 0;
  node.style.left = `${clamp(base[0] + spread, 8, 92)}%`;
  node.style.top = `${base[1]}%`;
  return node;
}

function recordSimulationTick(tick) {
  const active = activeClipsAt(tick);
  if (!active.length) return;
  active.forEach(clip => {
    state.simLog.unshift({
      tick,
      label: clip.label,
      command: commandForClip(clip).command
    });
  });
  state.simLog = state.simLog.slice(0, 40);
}

function renderSimLog() {
  els.simLog.innerHTML = "";
  if (!state.simLog.length) {
    const empty = document.createElement("div");
    empty.className = "validation-item";
    empty.textContent = "Noch keine simulierten Events. Druecke Play oder steppe durch die Timeline.";
    els.simLog.append(empty);
    return;
  }

  state.simLog.forEach(entry => {
    const row = document.createElement("div");
    row.className = "sim-log-entry";
    row.textContent = `${entry.tick}t - ${entry.label}: /${entry.command}`;
    els.simLog.append(row);
  });
}

function addClipAtTrack(track, start) {
  const type = track === "World" ? "setblock" : track === "Entities" ? "summon" : track === "UI" ? "title" : track === "Player" ? "give" : "command";
  const clip = createClip(type, start, track);
  state.clips.push(clip);
  state.selectedId = clip.id;
  render();
}

function addClip(type) {
  const clip = createClip(type, Number(els.playhead.value), defaultTrack(type));
  state.clips.push(clip);
  state.selectedId = clip.id;
  render();
}

function createClip(type, start, track) {
  return {
    id: createId(),
    track,
    start: clamp(snapTick(start), 0, maxTicks()),
    duration: 20,
    type,
    label: defaultLabel(type),
    value: defaultValue(type),
    mode: "both"
  };
}

function modeLabel(mode) {
  return {
    export: "Export",
    live: "Live",
    both: "Export+Live"
  }[mode || "both"] || "Export+Live";
}

function defaultTrack(type) {
  return {
    setblock: "World",
    summon: "Entities",
    title: "UI",
    effect: "Player",
    give: "Player",
    function: "Logic"
  }[type] || "Logic";
}

function defaultLabel(type) {
  return {
    command: "Command",
    say: "Say",
    give: "Give",
    setblock: "Setblock",
    summon: "Summon",
    effect: "Effect",
    title: "Title",
    function: "Function"
  }[type] || "Command";
}

function defaultValue(type) {
  return {
    command: "time set day",
    say: "Hallo aus Redstone Labs!",
    give: "@p|minecraft:redstone|64",
    setblock: "~ ~1 ~|minecraft:redstone_block",
    summon: "minecraft:lightning_bolt|~ ~ ~",
    effect: "@p|minecraft:night_vision|600|0",
    title: "@a|Redstone Labs|red",
    function: `${namespace()}:custom/my_function`
  }[type] || "say empty command";
}

function valueHint(type) {
  return {
    command: "Direkter Minecraft-Befehl ohne Slash, z.B. time set day.",
    say: "Text, der im Chat erscheinen soll.",
    give: "Format: ziel|item|anzahl, z.B. @p|minecraft:redstone|64.",
    setblock: "Format: position|block, z.B. ~ ~1 ~|minecraft:redstone_block.",
    summon: "Format: entity|position, z.B. minecraft:pig|~ ~ ~.",
    effect: "Format: ziel|effect|dauer|staerke, z.B. @p|minecraft:speed|60|1.",
    title: "Format: ziel|text|farbe, z.B. @a|Redstone Labs|red.",
    function: "Function-ID, z.B. redstone_labs:custom/my_function."
  }[type] || "";
}

function updateSelected(field, value) {
  const clip = selectedClip();
  if (!clip) return;
  if (field === "start") {
    clip[field] = clamp(snapTick(Number(value)), 0, maxTicks());
  } else if (field === "duration") {
    clip[field] = Math.max(1, Number(value));
  } else {
    clip[field] = value;
  }
  render();
}

function commandForClip(clip) {
  const parts = String(clip.value || "").split("|").map(part => part.trim());
  const errors = [];
  let command = "";

  switch (clip.type) {
    case "say":
      command = `say ${clip.value || ""}`.trim();
      if (!clip.value.trim()) errors.push("Say-Text fehlt.");
      break;
    case "give":
      command = `give ${parts[0] || "@p"} ${parts[1] || ""} ${parts[2] || "1"}`.trim();
      if (!parts[1]) errors.push("Give braucht ein Item.");
      break;
    case "setblock":
      command = `setblock ${parts[0] || "~ ~ ~"} ${parts[1] || ""}`.trim();
      if (!parts[1]) errors.push("Setblock braucht einen Block.");
      break;
    case "summon":
      command = `summon ${parts[0] || ""} ${parts[1] || "~ ~ ~"}`.trim();
      if (!parts[0]) errors.push("Summon braucht eine Entity.");
      break;
    case "effect":
      command = `effect give ${parts[0] || "@p"} ${parts[1] || ""} ${parts[2] || "600"} ${parts[3] || "0"}`.trim();
      if (!parts[1]) errors.push("Effect braucht einen Effekt.");
      break;
    case "title":
      command = `title ${parts[0] || "@a"} title {"text":"${escapeJson(parts[1] || "Redstone Labs")}","color":"${parts[2] || "red"}"}`;
      break;
    case "function":
      command = `function ${clip.value || ""}`.trim();
      if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(clip.value || "")) errors.push("Function-ID muss namespace:path sein.");
      break;
    default:
      command = String(clip.value || "").replace(/^\//, "").trim();
      if (!command) errors.push("Command fehlt.");
      break;
  }

  command = normalizeCommand(command);

  if (command.startsWith("/")) {
    errors.push("Commands im Datapack duerfen nicht mit Slash starten.");
  }

  return { command, errors };
}

function normalizeCommand(command) {
  return String(command || "").trim().replace(/^\/+/, "").trim();
}

function escapeJson(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function validateProject() {
  const results = [];
  const ns = namespace();
  const packFormat = Number(els.packFormat.value);

  if (!/^[a-z0-9_.-]+$/.test(ns)) {
    results.push({ level: "error", message: "Namespace darf nur a-z, 0-9, _, . und - enthalten." });
  }
  if (!Number.isFinite(packFormat) || packFormat < 4) {
    results.push({ level: "error", message: "Pack-Format muss eine Zahl sein." });
  }
  if (!state.clips.length) {
    results.push({ level: "warn", message: "Noch keine Clips in der Timeline." });
  }

  state.clips.forEach(clip => {
    if (clip.start < 0 || clip.start > maxTicks()) {
      results.push({ level: "error", message: `${clip.label}: Start-Tick liegt ausserhalb der Timeline.` });
    }
    if (clip.duration < 1) {
      results.push({ level: "error", message: `${clip.label}: Dauer muss mindestens 1 Tick sein.` });
    }
    const commandInfo = commandForClip(clip);
    commandInfo.errors.forEach(error => results.push({ level: "error", message: `${clip.label}: ${error}` }));
    if ((clip.mode || "both") === "live") {
      results.push({ level: "warn", message: `${clip.label}: Nur Live, wird nicht in das Datapack exportiert.` });
    }
  });

  if (!results.some(item => item.level === "error")) {
    results.push({ level: "ok", message: "Alle Commands koennen als mcfunction exportiert werden." });
  }
  return results;
}

function exportableClips() {
  return state.clips.filter(clip => (clip.mode || "both") !== "live");
}

function liveClips() {
  return state.clips.filter(clip => (clip.mode || "both") !== "export");
}

function generateDatapackFiles() {
  const ns = namespace();
  const files = new Map();
  const packName = els.packName.value || "Redstone Labs Timeline";
  const packFormat = Number(els.packFormat.value || 88);

  files.set("pack.mcmeta", `${JSON.stringify({
    pack: {
      pack_format: packFormat,
      description: `${packName} - Redstone Labs Timeline`
    }
  }, null, 2)}\n`);

  files.set("data/minecraft/tags/function/load.json", `${JSON.stringify({ values: [`${ns}:load`] }, null, 2)}\n`);
  files.set("data/minecraft/tags/function/tick.json", `${JSON.stringify({ values: [`${ns}:tick`] }, null, 2)}\n`);

  files.set(`data/${ns}/function/load.mcfunction`, [
    "# Redstone Labs Datapack Timeline Studio",
    "scoreboard objectives add rls_time dummy",
    "scoreboard objectives add rls_running dummy",
    "scoreboard objectives add rls_sim dummy",
    "scoreboard players set #time rls_time 0",
    `scoreboard players set #run rls_running ${els.autoStart.checked ? 1 : 0}`,
    "scoreboard players set #sim rls_sim 0",
    "scoreboard players set #fp rls_sim 0",
    `tellraw @a {"text":"${escapeJson(packName)} geladen","color":"red"}`,
    ""
  ].join("\n"));

  files.set(`data/${ns}/function/control/start.mcfunction`, [
    "scoreboard players set #time rls_time 0",
    "scoreboard players set #run rls_running 1",
    "scoreboard players set #sim rls_sim 0",
    `tellraw @a {"text":"Timeline gestartet","color":"green"}`,
    ""
  ].join("\n"));

  files.set(`data/${ns}/function/control/stop.mcfunction`, [
    "scoreboard players set #run rls_running 0",
    `tellraw @a {"text":"Timeline gestoppt","color":"yellow"}`,
    ""
  ].join("\n"));

  files.set(`data/${ns}/function/control/reset.mcfunction`, [
    "scoreboard players set #time rls_time 0",
    "scoreboard players set #run rls_running 0",
    `tellraw @a {"text":"Timeline zurueckgesetzt","color":"aqua"}`,
    ""
  ].join("\n"));

  if (els.exportRealSim.checked) {
    addRealSimulationFiles(files, ns, packName);
  }

  if (els.exportFirstPersonSim.checked) {
    addFirstPersonSimulationFiles(files, ns);
  }

  const byTick = new Map();
  exportableClips().sort((a, b) => a.start - b.start).forEach(clip => {
    const tick = Math.max(0, Number(clip.start || 0));
    if (!byTick.has(tick)) byTick.set(tick, []);
    byTick.get(tick).push(clip);
  });

  const runLines = [
    "# Timeline runner",
    "scoreboard players add #time rls_time 1"
  ];

  [...byTick.keys()].sort((a, b) => a - b).forEach(tick => {
    const functionName = `timeline/t${String(tick).padStart(5, "0")}`;
    runLines.push(`execute if score #time rls_time matches ${tick} run function ${ns}:${functionName}`);
    const functionLines = byTick.get(tick).map(clip => [
      `# ${clip.label} | Track: ${clip.track} | Dauer: ${clip.duration}t`,
      commandForClip(clip).command,
      ""
    ].join("\n"));
    files.set(`data/${ns}/function/${functionName}.mcfunction`, functionLines.join("\n"));
  });

  runLines.push(`execute if score #time rls_time matches ${maxTicks()}.. run function ${ns}:control/stop`);
  runLines.push("");
  files.set(`data/${ns}/function/timeline/run.mcfunction`, runLines.join("\n"));

  files.set(`data/${ns}/function/tick.mcfunction`, [
    "# Wird jeden Tick von Minecraft ausgefuehrt.",
    `execute if score #run rls_running matches 1 run function ${ns}:timeline/run`,
    els.exportRealSim.checked ? `execute if score #sim rls_sim matches 1 as @p at @e[tag=redstone_labs_sim_origin,limit=1] run function ${ns}:sim/run` : "",
    els.exportFirstPersonSim.checked ? `execute if score #fp rls_sim matches 1 run function ${ns}:sim/fp_run` : "",
    ""
  ].filter(Boolean).join("\n"));

  files.set(`data/${ns}/function/readme.mcfunction`, [
    "# In Minecraft:",
    "# /reload",
    `# /function ${ns}:control/start`,
    `# /function ${ns}:control/stop`,
    `# /function ${ns}:control/reset`,
    ""
  ].join("\n"));

  return files;
}

function addRealSimulationFiles(files, ns, packName) {
  files.set(`data/${ns}/function/sim/setup.mcfunction`, [
    "# Baut den Redstone-Labs-Simulationsplatz an deiner Position.",
    `function ${ns}:sim/clear`,
    "fill ~-8 ~-1 ~-6 ~8 ~-1 ~6 minecraft:smooth_stone",
    "fill ~-8 ~ ~-6 ~8 ~5 ~6 minecraft:air",
    "setblock ~-7 ~ ~-4 minecraft:red_concrete",
    "setblock ~-7 ~ ~-2 minecraft:lime_concrete",
    "setblock ~-7 ~ ~ minecraft:purple_concrete",
    "setblock ~-7 ~ ~2 minecraft:cyan_concrete",
    "setblock ~-7 ~ ~4 minecraft:blue_concrete",
    "summon minecraft:armor_stand ~ ~ ~ {Invisible:1b,Marker:1b,NoGravity:1b,Tags:[\"redstone_labs_sim\",\"redstone_labs_sim_origin\"],CustomName:'{\"text\":\"SIM ORIGIN\",\"color\":\"red\"}',CustomNameVisible:1b}",
    "summon minecraft:armor_stand ~-8 ~ ~-4 {Invisible:1b,Marker:1b,NoGravity:1b,Tags:[\"redstone_labs_sim\"],CustomName:'{\"text\":\"World\",\"color\":\"red\"}',CustomNameVisible:1b}",
    "summon minecraft:armor_stand ~-8 ~ ~-2 {Invisible:1b,Marker:1b,NoGravity:1b,Tags:[\"redstone_labs_sim\"],CustomName:'{\"text\":\"Player\",\"color\":\"green\"}',CustomNameVisible:1b}",
    "summon minecraft:armor_stand ~-8 ~ ~0 {Invisible:1b,Marker:1b,NoGravity:1b,Tags:[\"redstone_labs_sim\"],CustomName:'{\"text\":\"Entities\",\"color\":\"light_purple\"}',CustomNameVisible:1b}",
    "summon minecraft:armor_stand ~-8 ~ ~2 {Invisible:1b,Marker:1b,NoGravity:1b,Tags:[\"redstone_labs_sim\"],CustomName:'{\"text\":\"UI\",\"color\":\"aqua\"}',CustomNameVisible:1b}",
    "summon minecraft:armor_stand ~-8 ~ ~4 {Invisible:1b,Marker:1b,NoGravity:1b,Tags:[\"redstone_labs_sim\"],CustomName:'{\"text\":\"Logic\",\"color\":\"blue\"}',CustomNameVisible:1b}",
    `tellraw @a {"text":"${escapeJson(packName)} Simulationsplatz gebaut. Starte mit /function ${ns}:sim/start","color":"aqua"}`,
    ""
  ].join("\n"));

  files.set(`data/${ns}/function/sim/start.mcfunction`, [
    "scoreboard players set #time rls_time 0",
    "scoreboard players set #run rls_running 0",
    "scoreboard players set #fp rls_sim 0",
    "scoreboard players set #sim rls_sim 1",
    `title @a actionbar {"text":"Redstone Labs Simulation gestartet","color":"green"}`,
    ""
  ].join("\n"));

  files.set(`data/${ns}/function/sim/stop.mcfunction`, [
    "scoreboard players set #sim rls_sim 0",
    `title @a actionbar {"text":"Redstone Labs Simulation gestoppt","color":"yellow"}`,
    ""
  ].join("\n"));

  files.set(`data/${ns}/function/sim/clear.mcfunction`, [
    "execute at @e[tag=redstone_labs_sim_origin,limit=1] run fill ~-8 ~-1 ~-6 ~8 ~5 ~6 minecraft:air",
    "kill @e[tag=redstone_labs_sim]",
    "scoreboard players set #sim rls_sim 0",
    ""
  ].join("\n"));

  const byTick = new Map();
  exportableClips().sort((a, b) => a.start - b.start).forEach(clip => {
    const tick = Math.max(0, Number(clip.start || 0));
    if (!byTick.has(tick)) byTick.set(tick, []);
    byTick.get(tick).push(clip);
  });

  const runLines = [
    "# Echte Minecraft-Simulation auf dem Simulationsplatz.",
    "scoreboard players add #time rls_time 1"
  ];

  [...byTick.keys()].sort((a, b) => a - b).forEach(tick => {
    const functionName = `sim/t${String(tick).padStart(5, "0")}`;
    runLines.push(`execute if score #time rls_time matches ${tick} run function ${ns}:${functionName}`);
    files.set(`data/${ns}/function/${functionName}.mcfunction`, byTick.get(tick).flatMap(clip => realSimClipLines(clip, tick)).join("\n") + "\n");
  });

  runLines.push(`execute if score #time rls_time matches ${maxTicks()}.. run function ${ns}:sim/stop`);
  runLines.push("");
  files.set(`data/${ns}/function/sim/run.mcfunction`, runLines.join("\n"));
}

function addFirstPersonSimulationFiles(files, ns) {
  files.set(`data/${ns}/function/sim/fp_start.mcfunction`, [
    "scoreboard players set #time rls_time 0",
    "scoreboard players set #run rls_running 0",
    "scoreboard players set #sim rls_sim 0",
    "scoreboard players set #fp rls_sim 1",
    `title @a actionbar {"text":"First-Person-Simulation gestartet","color":"green"}`,
    "playsound minecraft:block.note_block.pling master @a ~ ~ ~ 0.8 1.2",
    ""
  ].join("\n"));

  files.set(`data/${ns}/function/sim/fp_stop.mcfunction`, [
    "scoreboard players set #fp rls_sim 0",
    `title @a actionbar {"text":"First-Person-Simulation gestoppt","color":"yellow"}`,
    ""
  ].join("\n"));

  const byTick = new Map();
  exportableClips().sort((a, b) => a.start - b.start).forEach(clip => {
    const tick = Math.max(0, Number(clip.start || 0));
    if (!byTick.has(tick)) byTick.set(tick, []);
    byTick.get(tick).push(clip);
  });

  const runLines = [
    "# First-Person-Simulation: Spieler sieht Effekte vor sich.",
    "scoreboard players add #time rls_time 1"
  ];

  [...byTick.keys()].sort((a, b) => a - b).forEach(tick => {
    const functionName = `sim/fp/t${String(tick).padStart(5, "0")}`;
    runLines.push(`execute if score #time rls_time matches ${tick} as @a at @s run function ${ns}:${functionName}`);
    files.set(`data/${ns}/function/${functionName}.mcfunction`, byTick.get(tick).flatMap(clip => firstPersonClipLines(clip, tick)).join("\n") + "\n");
  });

  runLines.push(`execute if score #time rls_time matches ${maxTicks()}.. run function ${ns}:sim/fp_stop`);
  runLines.push("");
  files.set(`data/${ns}/function/sim/fp_run.mcfunction`, runLines.join("\n"));
}

function firstPersonClipLines(clip, tick) {
  const command = commandForClip(clip).command;
  return [
    `# FIRST PERSON SIM ${tick}t - ${clip.label}`,
    `particle ${simParticleForType(clip.type)} ^ ^1.45 ^2.2 0.35 0.35 0.35 0.02 30 force`,
    `particle minecraft:electric_spark ^ ^1.2 ^1.2 0.18 0.18 0.18 0.02 12 force`,
    `title @s actionbar {"text":"${escapeJson(`${tick}t | ${clip.label}`)}","color":"aqua"}`,
    `playsound minecraft:block.note_block.hat master @s ~ ~ ~ 0.25 1.6`,
    command,
    ""
  ];
}

function realSimClipLines(clip, tick) {
  const command = commandForClip(clip).command;
  const x = Math.round((clip.start / maxTicks()) * 14) - 6;
  const z = trackZ(clip.track);
  return [
    `# SIM ${tick}t - ${clip.label}`,
    `setblock ${rel(x)} ~ ${rel(z)} ${simBlockForType(clip.type)}`,
    `particle ${simParticleForType(clip.type)} ${rel(x)} ~1 ${rel(z)} 0.35 0.35 0.35 0.03 35 force`,
    `title @a actionbar {"text":"${escapeJson(`${tick}t | ${clip.label}`)}","color":"aqua"}`,
    `tellraw @a [{"text":"[SIM ${tick}t] ","color":"gray"},{"text":"${escapeJson(clip.label)}","color":"aqua"},{"text":" /${escapeJson(command)}","color":"white"}]`,
    command,
    ""
  ];
}

function trackZ(track) {
  return { World: -4, Player: -2, Entities: 0, UI: 2, Logic: 4 }[track] ?? 0;
}

function simParticleForType(type) {
  return {
    command: "minecraft:cloud",
    say: "minecraft:happy_villager",
    give: "minecraft:happy_villager",
    setblock: "minecraft:flame",
    summon: "minecraft:portal",
    effect: "minecraft:witch",
    title: "minecraft:firework",
    function: "minecraft:electric_spark"
  }[type] || "minecraft:cloud";
}

function simBlockForType(type) {
  return {
    command: "minecraft:white_concrete",
    say: "minecraft:yellow_concrete",
    give: "minecraft:lime_concrete",
    setblock: "minecraft:red_concrete",
    summon: "minecraft:purple_concrete",
    effect: "minecraft:cyan_concrete",
    title: "minecraft:magenta_concrete",
    function: "minecraft:blue_concrete"
  }[type] || "minecraft:white_concrete";
}

function rel(value) {
  return value === 0 ? "~" : `~${value}`;
}

async function exportZip() {
  const errors = validateProject().filter(item => item.level === "error");
  if (errors.length) {
    render();
    alert("Export gestoppt: Bitte erst die Fehler im Check-Feld beheben.");
    return;
  }

  const files = generateDatapackFiles();
  const zipBlob = createZip(files);
  const filename = `${sanitizeId(els.packName.value || "redstone_labs_timeline")}.zip`;
  downloadBlob(zipBlob, filename);
}

async function exportResourcePackZip() {
  const files = generateResourcePackFiles();
  const zipBlob = createZip(files);
  const filename = `${sanitizeId(els.resourcePackName.value || "redstone_labs_resources")}.zip`;
  downloadBlob(zipBlob, filename);
}

function generateResourcePackFiles() {
  const ns = namespace();
  const rpName = els.resourcePackName.value || "Redstone Labs Timeline Resources";
  const rpFormat = Number(els.resourcePackFormat.value || 75);
  const files = new Map();

  files.set("pack.mcmeta", `${JSON.stringify({
    pack: {
      pack_format: rpFormat,
      description: `${rpName} - Resource Pack fuer Redstone Labs Timeline`
    }
  }, null, 2)}\n`);

  files.set(`assets/${ns}/lang/en_us.json`, `${JSON.stringify({
    "redstone_labs.timeline": els.packName.value || "Redstone Labs Timeline",
    "redstone_labs.simulation": "Redstone Labs Simulation",
    "redstone_labs.first_person": "First Person Simulation"
  }, null, 2)}\n`);

  files.set(`assets/${ns}/sounds.json`, `${JSON.stringify({
    timeline_ping: {
      sounds: [
        { name: "minecraft:block/note_block/pling", volume: 0.8, pitch: 1.2 }
      ]
    }
  }, null, 2)}\n`);

  files.set(`assets/${ns}/README.txt`, [
    "Redstone Labs Timeline Resource Pack",
    "",
    "Dieses Pack wird vom Datapack Timeline Studio erzeugt.",
    "Es enthaelt Spracheintraege, Sound-Metadaten und optional Shader-Dateien.",
    "Shader/Post-Effects koennen von Minecraft/Mods/Resource-Pack-Tools geladen werden, werden aber von Vanilla-Datapacks nicht automatisch aktiviert.",
    ""
  ].join("\n"));

  if (els.shaderMode.value !== "none") {
    addShaderFiles(files, ns, els.shaderMode.value);
  }

  return files;
}

function addShaderFiles(files, ns, mode) {
  const shaderName = mode === "scanline" ? "redstone_labs_scanline" : "redstone_labs_tint";
  const fragment = mode === "scanline" ? scanlineShaderSource() : tintShaderSource();

  files.set(`assets/minecraft/post_effect/${shaderName}.json`, `${JSON.stringify({
    targets: {
      swap: {}
    },
    passes: [
      {
        vertex_shader: "minecraft:core/screenquad",
        fragment_shader: `minecraft:post/${shaderName}`,
        inputs: [
          { sampler_name: "In", target: "minecraft:main" }
        ],
        output: "swap"
      },
      {
        vertex_shader: "minecraft:core/screenquad",
        fragment_shader: "minecraft:post/blit",
        inputs: [
          { sampler_name: "In", target: "swap" }
        ],
        uniforms: {
          BlitConfig: [
            { name: "ColorModulate", type: "vec4", value: [1.0, 1.0, 1.0, 1.0] }
          ]
        },
        output: "minecraft:main"
      }
    ]
  }, null, 2)}\n`);

  files.set(`assets/minecraft/shaders/post/${shaderName}.fsh`, fragment);
  files.set(`assets/${ns}/shader_note.txt`, [
    `Shader-Dateien: ${shaderName}`,
    "Pfad:",
    `assets/minecraft/post_effect/${shaderName}.json`,
    `assets/minecraft/shaders/post/${shaderName}.fsh`,
    "",
    "Hinweis: Vanilla-Datapacks koennen Post-Effects nicht automatisch einschalten.",
    "Das Resource Pack stellt die Shader-Dateien bereit; Aktivierung braucht Minecraft/Mod/Debug-Kontext.",
    ""
  ].join("\n"));
}

function tintShaderSource() {
  return `#version 150

uniform sampler2D In;
in vec2 texCoord;
out vec4 fragColor;

void main() {
    vec4 color = texture(In, texCoord);
    vec3 tint = vec3(1.0, 0.18, 0.24);
    fragColor = vec4(mix(color.rgb, color.rgb * tint + vec3(0.08, 0.0, 0.0), 0.22), color.a);
}
`;
}

function scanlineShaderSource() {
  return `#version 150

uniform sampler2D In;
in vec2 texCoord;
out vec4 fragColor;

void main() {
    vec4 color = texture(In, texCoord);
    float line = step(0.5, fract(texCoord.y * 360.0));
    vec3 glow = vec3(0.1, 0.95, 0.8) * 0.08;
    fragColor = vec4(color.rgb * (0.86 + line * 0.12) + glow, color.a);
}
`;
}

function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = concatBytes([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc),
      u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data
    ]);
    localParts.push(local);

    const central = concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc),
      u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameBytes
    ]);
    centralParts.push(central);
    offset += local.length;
  }

  const centralStart = offset;
  const central = concatBytes(centralParts);
  const end = concatBytes([
    u32(0x06054b50), u16(0), u16(0), u16(files.size), u16(files.size),
    u32(central.length), u32(centralStart), u16(0)
  ]);

  return new Blob([...localParts, central, end], { type: "application/zip" });
}

function u16(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}

function u32(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  parts.forEach(part => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}

function crc32(data) {
  let crc = -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 255];
  }
  return (crc ^ -1) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function togglePlayback() {
  state.playing = !state.playing;
  document.querySelector("#playBtn").textContent = state.playing ? "Pause" : "Play";
  clearInterval(state.playTimer);
  if (!state.playing) return;
  state.playTimer = setInterval(() => {
    const next = Number(els.playhead.value) + 1;
    els.playhead.value = next > maxTicks() ? 0 : next;
    recordSimulationTick(Number(els.playhead.value));
    render();
  }, 50);
}

function stepTimeline(delta) {
  els.playhead.value = clamp(Number(els.playhead.value) + delta, 0, maxTicks());
  recordSimulationTick(Number(els.playhead.value));
  render();
}

async function copyStartCommands() {
  const text = els.minecraftStartPreview.textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt("Start-Commands kopieren:", text);
  }
}

async function copyRealSimCommands() {
  const text = els.realSimPreview.textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt("Sim-Commands kopieren:", text);
  }
}

function loadBridgeSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("redstoneLabsTimelineBridge") || "{}");
    if (saved.port) els.bridgePort.value = saved.port;
    els.bridgeAutoConnect.checked = Boolean(saved.autoConnect);
  } catch {
    appendBridgeLog("Bridge-Einstellungen konnten nicht gelesen werden.", "warn");
  }
}

function saveBridgeSettings() {
  localStorage.setItem("redstoneLabsTimelineBridge", JSON.stringify({
    port: Number(els.bridgePort.value || 24864),
    autoConnect: els.bridgeAutoConnect.checked
  }));
}

function bridgeUrl() {
  return `ws://127.0.0.1:${Number(els.bridgePort.value || 24864)}`;
}

function renderBridge() {
  const connected = state.bridge.connected;
  const label = connected ? (state.bridge.livePlaying ? "LIVE" : "ONLINE") : state.bridge.status.toUpperCase();
  els.bridgeStatusBadge.textContent = label;
  els.bridgeStatusBadge.className = `badge ${connected ? "ok" : state.bridge.status === "connecting" ? "warn" : "error"}`;
  els.bridgeWorldStatus.textContent = state.bridge.world
    ? [
        `Version: ${state.bridge.world.bridgeVersion || "?"}`,
        `Welt: ${state.bridge.world.world || "Keine Welt"}`,
        `Dimension: ${state.bridge.world.dimension || "-"}`,
        `Spieler: ${state.bridge.world.player || "-"}`,
        `Modus: ${state.bridge.world.singleplayer ? "Singleplayer" : "Multiplayer"}`,
        `Hinweis: ${state.bridge.world.permission || "Commands laufen mit deinen Spielerrechten."}`
      ].join("\n")
    : "Bridge offline. Starte Minecraft mit dem Redstone Labs Timeline Bridge Mod und klicke Verbinden.";
  renderBridgeLog();
}

function renderBridgeLog() {
  els.bridgeLog.innerHTML = "";
  if (!state.bridgeLog.length) {
    const row = document.createElement("div");
    row.className = "bridge-log-entry";
    row.textContent = "Noch keine Live-Minecraft-Meldungen.";
    els.bridgeLog.append(row);
    return;
  }
  state.bridgeLog.slice(0, 60).forEach(entry => {
    const row = document.createElement("div");
    row.className = `bridge-log-entry ${entry.level || "ok"}`;
    row.textContent = `${entry.time} - ${entry.message}`;
    els.bridgeLog.append(row);
  });
}

function appendBridgeLog(message, level = "ok") {
  state.bridgeLog.unshift({
    level,
    message,
    time: new Date().toLocaleTimeString()
  });
  state.bridgeLog = state.bridgeLog.slice(0, 120);
  renderBridgeLog();
}

function bridgeConnect() {
  saveBridgeSettings();
  bridgeDisconnect(false);
  state.bridge.status = "connecting";
  renderBridge();
  appendBridgeLog(`Verbinde mit ${bridgeUrl()} ...`, "warn");

  try {
    const socket = new WebSocket(bridgeUrl());
    state.bridge.socket = socket;

    socket.addEventListener("open", () => {
      state.bridge.connected = true;
      state.bridge.status = "online";
      appendBridgeLog("Bridge verbunden.", "ok");
      bridgeSend("hello", { studio: "Datapack Timeline Studio", protocol: 1 });
      requestWorldStatus();
      render();
    });

    socket.addEventListener("message", event => handleBridgeMessage(event.data));
    socket.addEventListener("error", () => {
      appendBridgeLog("Bridge-Fehler. Ist Minecraft mit dem Bridge-Mod gestartet?", "error");
    });
    socket.addEventListener("close", () => {
      state.bridge.connected = false;
      state.bridge.status = "offline";
      state.bridge.livePlaying = false;
      state.bridge.socket = null;
      appendBridgeLog("Bridge getrennt.", "warn");
      render();
    });
  } catch (error) {
    state.bridge.status = "offline";
    appendBridgeLog(`Bridge konnte nicht starten: ${error.message}`, "error");
    render();
  }
}

function bridgeDisconnect(log = true) {
  if (state.bridge.socket) {
    state.bridge.socket.close();
  }
  state.bridge.socket = null;
  state.bridge.connected = false;
  state.bridge.status = "offline";
  state.bridge.livePlaying = false;
  if (log) appendBridgeLog("Bridge-Verbindung beendet.", "warn");
  renderBridge();
}

function bridgeSend(type, payload = {}) {
  if (!state.bridge.socket || state.bridge.socket.readyState !== WebSocket.OPEN) {
    appendBridgeLog("Nicht verbunden: Live-Befehl wurde nicht gesendet.", "error");
    return false;
  }
  state.bridge.socket.send(JSON.stringify({ type, ...payload }));
  return true;
}

function handleBridgeMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    appendBridgeLog(`Unlesbare Bridge-Meldung: ${raw}`, "warn");
    return;
  }

  if (message.type === "hello" || message.type === "worldStatus") {
    state.bridge.world = message;
    appendBridgeLog(message.message || "Weltstatus aktualisiert.", "ok");
  } else if (message.type === "tick") {
    state.bridge.lastTick = Number(message.tick || 0);
    els.playhead.value = clamp(state.bridge.lastTick, 0, maxTicks());
  } else if (message.type === "timelineStopped") {
    state.bridge.livePlaying = false;
    appendBridgeLog(message.message || "Live-Timeline gestoppt.", "warn");
  } else if (message.type === "log" || message.type === "commandResult") {
    appendBridgeLog(message.message || message.command || "Bridge-Meldung", message.level || (message.ok === false ? "error" : "ok"));
  } else {
    appendBridgeLog(message.message || `Bridge: ${message.type}`, message.level || "ok");
  }
  render();
}

function requestWorldStatus() {
  bridgeSend("worldStatus");
}

function liveTimelineEvents() {
  const eventsByTick = new Map();
  liveClips()
    .sort((a, b) => a.start - b.start)
    .forEach(clip => {
      const commandInfo = commandForClip(clip);
      if (commandInfo.errors.length) return;
      const tick = Math.max(0, Number(clip.start || 0));
      if (!eventsByTick.has(tick)) eventsByTick.set(tick, []);
      eventsByTick.get(tick).push({
        id: clip.id,
        label: clip.label,
        track: clip.track,
        type: clip.type,
        command: commandInfo.command
      });
    });

  return [...eventsByTick.entries()].map(([tick, commands]) => ({ tick, commands }));
}

function livePlay() {
  const events = liveTimelineEvents();
  if (!events.length) {
    appendBridgeLog("Keine Live-Clips ohne Fehler gefunden.", "warn");
    return;
  }
  const startTick = Number(els.playhead.value || 0);
  state.bridge.livePlaying = true;
  const sent = bridgeSend("timelinePlay", {
    startTick,
    maxTick: maxTicks(),
    tickMs: 50,
    namespace: namespace(),
    events
  });
  if (!sent) {
    state.bridge.livePlaying = false;
    render();
    return;
  }
  appendBridgeLog(`Live-Timeline ab ${startTick}t gesendet.`, "ok");
  render();
}

function livePause() {
  state.bridge.livePlaying = false;
  bridgeSend("timelineStop", { reason: "pause" });
  appendBridgeLog("Live-Timeline pausiert.", "warn");
  render();
}

function liveStop() {
  state.bridge.livePlaying = false;
  els.playhead.value = 0;
  bridgeSend("timelineStop", { reason: "stop" });
  appendBridgeLog("Live-Timeline gestoppt und Playhead auf 0.", "warn");
  render();
}

function liveStep() {
  const tick = Number(els.playhead.value || 0);
  const events = liveTimelineEvents().filter(event => event.tick === tick);
  if (!events.length) {
    appendBridgeLog(`Bei ${tick}t gibt es keinen Live-Clip.`, "warn");
    return;
  }
  bridgeSend("timelinePlay", {
    startTick: tick,
    maxTick: tick,
    tickMs: 50,
    namespace: namespace(),
    events
  });
  appendBridgeLog(`Live-Step fuer ${tick}t gesendet.`, "ok");
}

function liveSendSelectedClip() {
  const clip = selectedClip();
  if (!clip) {
    appendBridgeLog("Kein Clip ausgewaehlt.", "warn");
    return;
  }
  const commandInfo = commandForClip(clip);
  if (commandInfo.errors.length) {
    appendBridgeLog(`Clip hat Fehler: ${commandInfo.errors.join(", ")}`, "error");
    return;
  }
  bridgeSend("runCommand", {
    command: commandInfo.command,
    label: clip.label,
    track: clip.track,
    clipId: clip.id
  });
  appendBridgeLog(`Clip gesendet: ${clip.label}`, "ok");
}

function liveSyncDatapack() {
  const files = generateDatapackFiles();
  const report = [
    `${files.size} Datapack-Dateien bereit.`,
    `Namespace: ${namespace()}`,
    `Export-Clips: ${exportableClips().length}`,
    `Live-Clips: ${liveClips().length}`,
    `Start: /function ${namespace()}:control/start`
  ].join("\n");
  bridgeSend("log", { message: report });
  appendBridgeLog(`Sync-Report an Bridge gesendet: ${files.size} Dateien.`, "ok");
}

document.querySelectorAll("[data-add]").forEach(button => {
  button.addEventListener("click", () => addClip(button.dataset.add));
});

document.querySelector("#playBtn").addEventListener("click", togglePlayback);
document.querySelector("#resetBtn").addEventListener("click", () => {
  els.playhead.value = 0;
  state.simLog = [];
  render();
});
document.querySelector("#validateBtn").addEventListener("click", render);
document.querySelector("#exportBtn").addEventListener("click", exportZip);
document.querySelector("#exportResourcePackBtn").addEventListener("click", exportResourcePackZip);
document.querySelector("#copyStartBtn").addEventListener("click", copyStartCommands);
document.querySelector("#copyRealSimBtn").addEventListener("click", copyRealSimCommands);
document.querySelector("#addMarkerBtn").addEventListener("click", () => addClip("command"));
document.querySelector("#stepBackBtn").addEventListener("click", () => stepTimeline(-1));
document.querySelector("#stepForwardBtn").addEventListener("click", () => stepTimeline(1));
els.bridgeConnectBtn.addEventListener("click", bridgeConnect);
els.bridgeDisconnectBtn.addEventListener("click", () => bridgeDisconnect());
els.livePlayBtn.addEventListener("click", livePlay);
els.livePauseBtn.addEventListener("click", livePause);
els.liveStopBtn.addEventListener("click", liveStop);
els.liveStepBtn.addEventListener("click", liveStep);
els.liveSendClipBtn.addEventListener("click", liveSendSelectedClip);
els.liveSyncBtn.addEventListener("click", liveSyncDatapack);
document.querySelector("#clearSimBtn").addEventListener("click", () => {
  state.simLog = [];
  render();
});

[els.playhead, els.lengthSeconds, els.namespace, els.packName, els.packFormat, els.autoStart, els.exportRealSim, els.exportFirstPersonSim, els.resourcePackName, els.resourcePackFormat, els.shaderMode, els.bridgePort, els.bridgeAutoConnect].forEach(input => {
  input.addEventListener("input", render);
  input.addEventListener("change", render);
});
els.bridgePort.addEventListener("change", saveBridgeSettings);
els.bridgeAutoConnect.addEventListener("change", saveBridgeSettings);

els.clipLabel.addEventListener("input", event => updateSelected("label", event.target.value));
els.clipTrack.addEventListener("change", event => updateSelected("track", event.target.value));
els.clipStart.addEventListener("input", event => updateSelected("start", event.target.value));
els.clipDuration.addEventListener("input", event => updateSelected("duration", event.target.value));
els.clipMode.addEventListener("change", event => updateSelected("mode", event.target.value));
els.clipType.addEventListener("change", event => {
  updateSelected("type", event.target.value);
  const clip = selectedClip();
  if (clip) updateSelected("value", defaultValue(event.target.value));
});
els.clipValue.addEventListener("input", event => updateSelected("value", event.target.value));

document.querySelector("#deleteBtn").addEventListener("click", () => {
  state.clips = state.clips.filter(clip => clip.id !== state.selectedId);
  state.selectedId = state.clips[0]?.id || null;
  render();
});

document.querySelector("#duplicateBtn").addEventListener("click", () => {
  const clip = selectedClip();
  if (!clip) return;
  const copy = { ...clip, id: createId(), start: clamp(clip.start + clip.duration, 0, maxTicks()), label: `${clip.label} Kopie` };
  state.clips.push(copy);
  state.selectedId = copy.id;
  render();
});

state.selectedId = state.clips[0].id;
loadBridgeSettings();
render();

if (els.bridgeAutoConnect.checked) {
  bridgeConnect();
}
