const versions = [
  { id: "1.8", label: "1.8 - Legacy", era: "legacy", note: "Alte Syntax mit Data-Werten und kurzer NBT-Schreibweise." },
  { id: "1.9", label: "1.9", era: "legacy", note: "Legacy-Syntax, Commands vor dem Flattening." },
  { id: "1.10", label: "1.10", era: "legacy", note: "Legacy-Syntax, Entity- und Item-IDs bleiben klassisch." },
  { id: "1.11", label: "1.11", era: "legacy", note: "Legacy-Syntax mit alten Effect- und Execute-Formen." },
  { id: "1.12.2", label: "1.12.2 - letzter Legacy-Block", era: "legacy", note: "Letzte grosse Version vor dem 1.13-Flattening." },
  { id: "1.13", label: "1.13 - Flattening", era: "flattened", note: "Neue ID-Welt: Namespaces, neue Execute-Syntax, modernere Commands." },
  { id: "1.14", label: "1.14", era: "flattened", note: "Moderne Namespaced IDs mit klassischem Item-NBT." },
  { id: "1.15", label: "1.15", era: "flattened", note: "Moderne Commands mit Item-NBT." },
  { id: "1.16.5", label: "1.16.5", era: "flattened", note: "Stabile Datapack-/Command-Basis fuer viele Server." },
  { id: "1.17.1", label: "1.17.1", era: "flattened", note: "Moderne Java-Commands, noch vor Item Components." },
  { id: "1.18.2", label: "1.18.2", era: "flattened", note: "Hoehere Welt, gleiche Grundsyntax fuer die meisten Commands." },
  { id: "1.19.4", label: "1.19.4", era: "flattened", note: "Moderne Command-Syntax mit NBT-Itemdaten." },
  { id: "1.20.4", label: "1.20.4 - letzter NBT-Stil", era: "flattened", note: "Letzte Linie vor dem grossen Item-Component-Wechsel." },
  { id: "1.20.5", label: "1.20.5 - Item Components", era: "components", note: "Give/Item nutzt moderne Components statt altem Item-NBT." },
  { id: "1.21.1", label: "1.21.1", era: "components", note: "Moderne Component-Syntax und aktuelle 1.21-Basis." },
  { id: "1.21.7", label: "1.21.7", era: "components", note: "Spaetere 1.21-Linie mit Component-System." },
  { id: "1.21.11", label: "1.21.11 - neuste Vorlage", era: "components", note: "Vorlage fuer 1.21.11/Mounts-of-Mayhem-Linie." }
];

const state = {
  mode: "give",
  attributeRows: [{ id: 1 }],
  componentRows: [{ id: 2 }],
  effectRows: [{ id: 1 }],
  stack: JSON.parse(localStorage.getItem("redstone-command-stack") || "[]")
};

let dynamicRowId = 3;

const commandDataFallback = {
  meta: { source: "Fallback IDs" },
  items: [
    { id: "minecraft:stone", label: "Stone" },
    { id: "minecraft:diamond_sword", label: "Diamond Sword" },
    { id: "minecraft:netherite_sword", label: "Netherite Sword" },
    { id: "minecraft:ice", label: "Ice" }
  ],
  blocks: [
    { id: "minecraft:stone", label: "Stone" },
    { id: "minecraft:redstone_block", label: "Redstone Block" },
    { id: "minecraft:command_block", label: "Command Block" }
  ],
  particles: [
    { id: "minecraft:flame", label: "Flame" },
    { id: "minecraft:soul_fire_flame", label: "Soul Fire Flame" }
  ],
  entities: [
    { id: "minecraft:item", label: "Item" },
    { id: "minecraft:snowball", label: "Snowball" },
    { id: "minecraft:zombie", label: "Zombie" }
  ],
  effects: [
    { id: "minecraft:strength", label: "Strength" },
    { id: "minecraft:speed", label: "Speed" }
  ],
  enchantments: [
    { id: "minecraft:sharpness", label: "Sharpness" },
    { id: "minecraft:unbreaking", label: "Unbreaking" }
  ],
  attributes: [
    { id: "minecraft:generic.attack_damage", label: "Attack Damage" },
    { id: "minecraft:generic.attack_speed", label: "Attack Speed" }
  ],
  targets: [
    { id: "@p", label: "Nearest player" },
    { id: "@a", label: "All players" },
    { id: "@s", label: "Self" },
    { id: "@e", label: "All entities" },
    { id: "@r", label: "Random player" }
  ]
};

let commandData = prepareCommandData(commandDataFallback);

const form = document.querySelector("#commandForm");
const output = document.querySelector("#commandOutput");
const report = document.querySelector("#commandReport");
const versionSelect = document.querySelector("#versionSelect");
const versionReadout = document.querySelector("#versionReadout");
const syntaxTimeline = document.querySelector("#syntaxTimeline");
const stackList = document.querySelector("#stackList");

const itemComponentDefinitions = [
  componentDef("minecraft:custom_data", "Custom Data", "{redstone_labs:1b}", "NBT-Daten fuer eigene Systeme."),
  componentDef("minecraft:max_stack_size", "Max Stack Size", "1"),
  componentDef("minecraft:max_damage", "Max Damage", "2031"),
  componentDef("minecraft:damage", "Damage", "0", "", "Damage"),
  componentDef("minecraft:unbreakable", "Unbreakable", "{}", "", "Unbreakable"),
  componentDef("minecraft:custom_name", "Custom Name", "'{\"text\":\"Redstone Labs\"}'"),
  componentDef("minecraft:item_name", "Item Name", "'{\"text\":\"Redstone Labs\"}'"),
  componentDef("minecraft:item_model", "Item Model", "\"minecraft:diamond_sword\""),
  componentDef("minecraft:lore", "Lore", "['{\"text\":\"Line 1\",\"color\":\"gray\"}']"),
  componentDef("minecraft:rarity", "Rarity", "epic"),
  componentDef("minecraft:enchantments", "Enchantments", "{levels:{\"minecraft:sharpness\":5}}"),
  componentDef("minecraft:stored_enchantments", "Stored Enchantments", "{levels:{\"minecraft:sharpness\":5}}", "", "StoredEnchantments"),
  componentDef("minecraft:attribute_modifiers", "Attribute Modifiers", "[{id:\"redstone:power\",type:\"minecraft:generic.attack_damage\",amount:5,operation:\"add_value\",slot:\"mainhand\"}]"),
  componentDef("minecraft:custom_model_data", "Custom Model Data", "1", "", "CustomModelData"),
  componentDef("minecraft:hide_additional_tooltip", "Hide Additional Tooltip", "{}"),
  componentDef("minecraft:hide_tooltip", "Hide Tooltip", "{}"),
  componentDef("minecraft:repair_cost", "Repair Cost", "0", "", "RepairCost"),
  componentDef("minecraft:creative_slot_lock", "Creative Slot Lock", "{}"),
  componentDef("minecraft:enchantment_glint_override", "Glint Override", "true"),
  componentDef("minecraft:intangible_projectile", "Intangible Projectile", "{}"),
  componentDef("minecraft:can_place_on", "Can Place On", "{predicates:[{blocks:\"minecraft:stone\"}]}", "Modernes Predicate-Format.", "CanPlaceOn"),
  componentDef("minecraft:can_break", "Can Break", "{predicates:[{blocks:\"minecraft:stone\"}]}", "Modernes Predicate-Format.", "CanDestroy"),
  componentDef("minecraft:food", "Food", "{nutrition:4,saturation_modifier:0.3,can_always_eat:true}"),
  componentDef("minecraft:consumable", "Consumable", "{consume_seconds:1.6,animation:\"eat\",sound:\"minecraft:entity.generic.eat\"}"),
  componentDef("minecraft:use_remainder", "Use Remainder", "{id:\"minecraft:bowl\",count:1}"),
  componentDef("minecraft:use_cooldown", "Use Cooldown", "{seconds:1.0}"),
  componentDef("minecraft:damage_resistant", "Damage Resistant", "{types:\"minecraft:is_fire\"}"),
  componentDef("minecraft:tool", "Tool", "{rules:[{blocks:\"minecraft:mineable/pickaxe\",speed:8.0,correct_for_drops:true}]}"),
  componentDef("minecraft:weapon", "Weapon", "{item_damage_per_attack:1}"),
  componentDef("minecraft:equippable", "Equippable", "{slot:\"head\",equip_sound:\"minecraft:item.armor.equip_generic\"}"),
  componentDef("minecraft:glider", "Glider", "{}"),
  componentDef("minecraft:tooltip_style", "Tooltip Style", "\"minecraft:default\""),
  componentDef("minecraft:death_protection", "Death Protection", "{}"),
  componentDef("minecraft:blocks_attacks", "Blocks Attacks", "{}"),
  componentDef("minecraft:dyed_color", "Dyed Color", "{rgb:16711680,show_in_tooltip:true}"),
  componentDef("minecraft:map_color", "Map Color", "16711680"),
  componentDef("minecraft:map_id", "Map ID", "1"),
  componentDef("minecraft:map_decorations", "Map Decorations", "{}"),
  componentDef("minecraft:map_post_processing", "Map Post Processing", "lock"),
  componentDef("minecraft:charged_projectiles", "Charged Projectiles", "[{id:\"minecraft:arrow\",count:1}]"),
  componentDef("minecraft:bundle_contents", "Bundle Contents", "[{id:\"minecraft:diamond\",count:1}]"),
  componentDef("minecraft:potion_contents", "Potion Contents", "{potion:\"minecraft:strength\"}"),
  componentDef("minecraft:suspicious_stew_effects", "Suspicious Stew Effects", "[{id:\"minecraft:night_vision\",duration:160}]"),
  componentDef("minecraft:writable_book_content", "Writable Book Content", "{pages:[\"Redstone Labs\"]}"),
  componentDef("minecraft:written_book_content", "Written Book Content", "{title:\"Book\",author:\"JARO\",pages:[\"Redstone Labs\"]}"),
  componentDef("minecraft:trim", "Armor Trim", "{material:\"minecraft:redstone\",pattern:\"minecraft:spire\"}"),
  componentDef("minecraft:debug_stick_state", "Debug Stick State", "{}"),
  componentDef("minecraft:entity_data", "Entity Data", "{id:\"minecraft:zombie\"}", "", "EntityTag"),
  componentDef("minecraft:bucket_entity_data", "Bucket Entity Data", "{NoAI:1b}"),
  componentDef("minecraft:block_entity_data", "Block Entity Data", "{id:\"minecraft:chest\"}", "", "BlockEntityTag"),
  componentDef("minecraft:instrument", "Instrument", "\"minecraft:ponder_goat_horn\""),
  componentDef("minecraft:provides_trim_material", "Provides Trim Material", "\"minecraft:redstone\""),
  componentDef("minecraft:ominous_bottle_amplifier", "Ominous Bottle Amplifier", "0"),
  componentDef("minecraft:jukebox_playable", "Jukebox Playable", "{song:\"minecraft:13\",show_in_tooltip:true}"),
  componentDef("minecraft:recipes", "Recipes", "[\"minecraft:crafting_table\"]"),
  componentDef("minecraft:lodestone_tracker", "Lodestone Tracker", "{target:{dimension:\"minecraft:overworld\",pos:[I;0,64,0]},tracked:true}"),
  componentDef("minecraft:firework_explosion", "Firework Explosion", "{shape:\"small_ball\",colors:[I;16711680]}"),
  componentDef("minecraft:fireworks", "Fireworks", "{flight_duration:1,explosions:[{shape:\"small_ball\",colors:[I;16711680]}]}"),
  componentDef("minecraft:profile", "Profile", "{name:\"JARO\"}"),
  componentDef("minecraft:note_block_sound", "Note Block Sound", "\"minecraft:block.note_block.pling\""),
  componentDef("minecraft:banner_patterns", "Banner Patterns", "[{pattern:\"minecraft:stripe_downright\",color:\"red\"}]"),
  componentDef("minecraft:base_color", "Base Color", "red"),
  componentDef("minecraft:pot_decorations", "Pot Decorations", "[\"minecraft:brick\",\"minecraft:brick\",\"minecraft:brick\",\"minecraft:brick\"]"),
  componentDef("minecraft:container", "Container", "[{slot:0,item:{id:\"minecraft:diamond\",count:1}}]"),
  componentDef("minecraft:container_loot", "Container Loot", "{loot_table:\"minecraft:chests/simple_dungeon\"}"),
  componentDef("minecraft:bees", "Bees", "[]"),
  componentDef("minecraft:lock", "Lock", "\"redstone\"")
];

const itemComponentMap = new Map(itemComponentDefinitions.map((definition) => [definition.id, definition]));

const fieldSets = {
  give: [
    field("target", "Spieler / Target", "@p", "text", "", "targets"),
    field("item", "Item suchen", "minecraft:diamond_sword", "text", "", "items"),
    field("count", "Anzahl", "1", "number"),
    field("damage", "Legacy Data", "0", "number"),
    field("name", "Custom Name", "THE SWORD OF THE NETHER GOD", "text", "wide"),
    field("lore", "Lore Zeilen", "Diese Klinge wurde aus dem Herzen des Nethers geboren.\nBesitzer: Nether Lord JARO\nGOD-TIER WEAPON", "textarea", "wide"),
    field("enchant", "Enchant suchen", "minecraft:sharpness", "text", "", "enchantments"),
    field("level", "Enchant-Level", "5", "number")
  ],
  summon: [
    field("entity", "Entity suchen", "minecraft:item", "text", "", "entities"),
    field("x", "X", "~"),
    field("y", "Y", "~1"),
    field("z", "Z", "~"),
    field("nbt", "NBT / Daten", '{Item:{id:"minecraft:ice",Count:1b}}', "textarea", "wide")
  ],
  particle: [
    field("particle", "Particle suchen", "minecraft:flame", "text", "", "particles"),
    field("x", "X", "~"),
    field("y", "Y", "~1"),
    field("z", "Z", "~"),
    field("dx", "Breite X", "0.2"),
    field("dy", "Hoehe Y", "0.2"),
    field("dz", "Tiefe Z", "0.2"),
    field("speed", "Speed", "0.02"),
    field("count", "Anzahl", "35", "number"),
    field("target", "Viewer", "@a", "text", "", "targets"),
    selectField("mode", "Darstellung", ["force", "normal"])
  ],
  setblock: [
    field("x", "X", "~"),
    field("y", "Y", "~"),
    field("z", "Z", "~"),
    field("block", "Block suchen", "minecraft:redstone_block", "text", "", "blocks"),
    field("data", "Legacy Data", "0", "number"),
    selectField("mode", "Modus", ["replace", "destroy", "keep"])
  ],
  effect: [
    field("target", "Target", "@p", "text", "", "targets")
  ],
  execute: [
    field("target", "Ausfuehrer", "@p", "text", "", "targets"),
    field("at", "Position bei", "@s", "text", "", "targets"),
    field("condition", "If/Unless optional", "if block ~ ~-1 ~ minecraft:stone", "text", "wide"),
    field("command", "Command ohne Slash", "say Redstone Labs ist online", "textarea", "wide")
  ]
};

function field(id, label, value, type = "text", className = "", source = "") {
  return { id, label, value, type, className, source };
}

function selectField(id, label, options) {
  return { id, label, type: "select", options, value: options[0] };
}

function checkboxField(id, label, value) {
  return { id, label, type: "checkbox", value };
}

function componentDef(id, label, defaultValue, note = "", legacyTag = "") {
  return { id, label, defaultValue, note, legacyTag };
}

function actionField(kind, title, body) {
  return { kind, title, body, type: "custom" };
}

async function loadCommandData() {
  try {
    const response = await fetch("command-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    commandData = prepareCommandData({ ...commandDataFallback, ...data });
  } catch (error) {
    commandData = prepareCommandData(commandDataFallback);
  }
}

function prepareCommandData(data) {
  const prepared = { ...data };
  Object.keys(prepared).forEach((key) => {
    if (!Array.isArray(prepared[key])) return;
    prepared[key] = prepared[key].map((entry) => {
      const id = typeof entry === "string" ? entry : entry.id;
      const label = typeof entry === "string" ? humanizeId(entry) : (entry.label || humanizeId(entry.id));
      const cleanId = stripNamespace(id).toLowerCase();
      const cleanLabel = normalizeSearch(label);
      return {
        id,
        label,
        cleanId,
        cleanLabel,
        search: normalizeSearch(`${id} ${cleanId} ${label}`)
      };
    });
  });
  return prepared;
}

async function init() {
  await loadCommandData();
  versionSelect.innerHTML = versions.map((version) => {
    return `<option value="${version.id}">${version.label}</option>`;
  }).join("");
  versionSelect.value = "1.21.11";
  renderTimeline();
  renderFields();
  renderStack();
  updateCommand();
}

function renderTimeline() {
  syntaxTimeline.innerHTML = ["legacy", "flattened", "components"].map((era) => {
    return `<span data-era="${era}"></span>`;
  }).join("");
}

function renderFields() {
  const fields = getFieldsForMode(state.mode);
  form.innerHTML = fields.map((item) => {
    if (item.type === "custom") {
      return `<section class="dynamic-group wide" data-dynamic="${item.kind}"><div class="dynamic-heading"><h3>${item.title}</h3>${item.body.action || ""}</div>${item.body.content}</section>`;
    }
    const className = item.className ? ` class="${item.className}"` : "";
    if (item.type === "textarea") {
      return `<label${className}>${item.label}<textarea name="${item.id}">${escapeHtml(item.value)}</textarea></label>`;
    }
    if (item.type === "select") {
      return `<label${className}>${item.label}<select name="${item.id}">${item.options.map((option) => `<option value="${option}">${option}</option>`).join("")}</select></label>`;
    }
    if (item.type === "checkbox") {
      return `<label class="check-line${item.className ? ` ${item.className}` : ""}"><input type="checkbox" name="${item.id}" ${item.value ? "checked" : ""}>${item.label}</label>`;
    }
    if (item.source) {
      return `<label${className}>${item.label}<div class="suggest-field"><input name="${item.id}" type="${item.type}" value="${escapeHtml(item.value)}" data-source="${item.source}" autocomplete="off" spellcheck="false"><div class="suggestions" role="listbox" aria-label="${escapeHtml(item.label)} Vorschlaege"></div></div></label>`;
    }
    return `<label${className}>${item.label}<input name="${item.id}" type="${item.type}" value="${escapeHtml(item.value)}"></label>`;
  }).join("");
}

function rerenderFieldsPreservingValues() {
  const values = getValues();
  renderFields();
  Object.entries(values).forEach(([name, value]) => {
    const element = form.elements.namedItem(name);
    if (!element) return;
    if (element.type === "checkbox") {
      element.checked = Boolean(value);
    } else {
      element.value = value;
    }
  });
}

function getFieldsForMode(mode) {
  const fields = [...fieldSets[mode]];
  if (mode === "give") {
    fields.push(actionField("components", "Item Components je nach Version", {
      action: `<button type="button" data-add-component>Component hinzufuegen</button>`,
      content: renderComponentRows()
    }));
    fields.push(actionField("attributes", "Attribut-Modifier", {
      action: `<button type="button" data-add-attribute>Attribut hinzufuegen</button>`,
      content: renderAttributeRows()
    }));
  }
  if (mode === "effect") {
    fields.push(actionField("effects", "Effect Stack", {
      action: `<button type="button" data-add-effect>Effect hinzufuegen</button>`,
      content: renderEffectRows()
    }));
  }
  return fields;
}

function renderComponentRows() {
  return state.componentRows.map((row, index) => {
    const selected = index === 0 ? "minecraft:enchantment_glint_override" : "minecraft:custom_model_data";
    const definition = itemComponentMap.get(selected) || itemComponentDefinitions[0];
    return `<div class="dynamic-row component-row" data-component-row="${row.id}">
      <div class="row-index">#${index + 1}</div>
      ${renderMiniSelect(`component_${row.id}`, "Component", itemComponentDefinitions.map((item) => item.id), selected, itemComponentDefinitions)}
      ${renderMiniInput(`componentValue_${row.id}`, "Wert / SNBT", definition.defaultValue, "", "text")}
      <div class="component-note">${escapeHtml(definition.note || "1.20.5+ Component; aeltere Versionen nur wenn NBT-Mapping existiert.")}</div>
      <button type="button" data-remove-component="${row.id}" ${state.componentRows.length === 1 ? "disabled" : ""}>Entfernen</button>
    </div>`;
  }).join("");
}

function renderAttributeRows() {
  return state.attributeRows.map((row, index) => {
    const fallback = index === 0 ? "" : "minecraft:generic.attack_damage";
    return `<div class="dynamic-row" data-attribute-row="${row.id}">
      <div class="row-index">#${index + 1}</div>
      ${renderMiniInput(`attribute_${row.id}`, "Attribut suchen", fallback, "attributes")}
      ${renderMiniInput(`attributeAmount_${row.id}`, "Wert", index === 0 ? "0" : "2", "", "number")}
      ${renderMiniSelect(`attributeOperation_${row.id}`, "Operation", ["add_value", "add_multiplied_base", "add_multiplied_total"])}
      ${renderMiniSelect(`attributeSlot_${row.id}`, "Slot", ["mainhand", "offhand", "head", "chest", "legs", "feet", "any"])}
      <button type="button" data-remove-attribute="${row.id}" ${state.attributeRows.length === 1 ? "disabled" : ""}>Entfernen</button>
    </div>`;
  }).join("");
}

function renderEffectRows() {
  return state.effectRows.map((row, index) => {
    const defaults = [
      ["minecraft:strength", "30", "1"],
      ["minecraft:speed", "30", "0"],
      ["minecraft:resistance", "30", "0"]
    ][index] || ["minecraft:strength", "30", "0"];
    return `<div class="dynamic-row effect-row" data-effect-row="${row.id}">
      <div class="row-index">#${index + 1}</div>
      ${renderMiniInput(`effect_${row.id}`, "Effect suchen", defaults[0], "effects")}
      ${renderMiniInput(`seconds_${row.id}`, "Sekunden", defaults[1], "", "number")}
      ${renderMiniInput(`amplifier_${row.id}`, "Amplifier", defaults[2], "", "number")}
      <label class="mini-check"><input type="checkbox" name="hide_${row.id}" checked>Partikel aus</label>
      <button type="button" data-remove-effect="${row.id}" ${state.effectRows.length === 1 ? "disabled" : ""}>Entfernen</button>
    </div>`;
  }).join("");
}

function renderMiniInput(name, label, value, source = "", type = "text") {
  if (source) {
    return `<label>${label}<div class="suggest-field"><input name="${name}" type="${type}" value="${escapeHtml(value)}" data-source="${source}" autocomplete="off" spellcheck="false"><div class="suggestions" role="listbox" aria-label="${escapeHtml(label)} Vorschlaege"></div></div></label>`;
  }
  return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}"></label>`;
}

function renderMiniSelect(name, label, options, value = "", definitions = null) {
  return `<label>${label}<select name="${name}">${options.map((option) => {
    const definition = definitions ? itemComponentMap.get(option) : null;
    const text = definition ? `${definition.label} (${option})` : option;
    return `<option value="${option}" ${option === value ? "selected" : ""}>${escapeHtml(text)}</option>`;
  }).join("")}</select></label>`;
}

function renderSuggestions(input) {
  if (!input || !input.dataset.source) return;
  const box = input.parentElement.querySelector(".suggestions");
  const matches = getSuggestionMatches(input.dataset.source, input.value);
  if (!matches.length) {
    box.innerHTML = `<div class="suggest-empty">Keine Treffer</div>`;
    box.classList.add("is-open");
    return;
  }
  box.innerHTML = matches.map((item, index) => {
    return `<button type="button" role="option" data-suggestion-value="${escapeHtml(item.id)}" class="${index === 0 ? "is-active" : ""}"><strong>${escapeHtml(item.id)}</strong><span>${escapeHtml(item.label)}</span></button>`;
  }).join("");
  box.classList.add("is-open");
}

function getSuggestionMatches(source, value) {
  const entries = commandData[source] || [];
  const query = normalizeSearch(value);
  if (!query) return entries.slice(0, 60);
  const prefix = entries.filter((item) => item.cleanId.startsWith(query) || item.cleanLabel.startsWith(query));
  const contains = entries.filter((item) => !prefix.includes(item) && item.search.includes(query));
  return [...prefix, ...contains].slice(0, 80);
}

function hideSuggestions() {
  form.querySelectorAll(".suggestions.is-open").forEach((box) => box.classList.remove("is-open"));
}

function setActiveSuggestion(box, direction) {
  const buttons = [...box.querySelectorAll("button[data-suggestion-value]")];
  if (!buttons.length) return;
  const current = buttons.findIndex((button) => button.classList.contains("is-active"));
  const next = (current + direction + buttons.length) % buttons.length;
  buttons.forEach((button, index) => button.classList.toggle("is-active", index === next));
  buttons[next].scrollIntoView({ block: "nearest" });
}

function acceptActiveSuggestion(input) {
  const box = input.parentElement.querySelector(".suggestions");
  const active = box.querySelector("button.is-active[data-suggestion-value]");
  if (!active) return false;
  input.value = active.dataset.suggestionValue;
  hideSuggestions();
  updateCommand();
  return true;
}

function getValues() {
  const data = {};
  new FormData(form).forEach((value, key) => {
    data[key] = `${value}`.trim();
  });
  form.querySelectorAll("input[type='checkbox']").forEach((input) => {
    data[input.name] = input.checked;
  });
  return data;
}

function getVersion() {
  return versions.find((version) => version.id === versionSelect.value) || versions[versions.length - 1];
}

function updateCommand() {
  const version = getVersion();
  const values = getValues();
  const command = builders[state.mode](values, version);
  output.textContent = command;
  updateVersionReadout(version);
  report.innerHTML = getReport(state.mode, version, values);
}

function updateVersionReadout(version) {
  versionReadout.innerHTML = `<strong>${version.label}</strong>${version.note}`;
  document.querySelectorAll(".syntax-timeline span").forEach((span) => {
    span.classList.toggle("is-active", span.dataset.era === version.era);
  });
}

const builders = {
  give(values, version) {
    const target = values.target || "@p";
    const item = normalizeId(values.item || "minecraft:stone", version);
    const count = cleanNumber(values.count, 1);
    const damage = cleanNumber(values.damage, 0);
    const name = values.name || "";
    const lore = splitLines(values.lore);
    const enchant = values.enchant || "";
    const level = cleanNumber(values.level, 1);
    const extraComponents = collectComponentRows(values);
    const attributes = collectAttributeRows(values);

    if (version.era === "components") {
      const components = buildComponents(name, lore, enchant, level, attributes, extraComponents);
      return `/give ${target} ${item}${components} ${count}`;
    }

    const nbt = buildItemNbt(name, lore, enchant, level, version, attributes, extraComponents);
    if (version.era === "legacy") {
      return `/give ${target} ${item} ${count} ${damage}${nbt ? ` ${nbt}` : ""}`;
    }
    return `/give ${target} ${item}${nbt} ${count}`;
  },

  summon(values, version) {
    const entity = normalizeId(values.entity || "minecraft:pig", version);
    const x = values.x || "~";
    const y = values.y || "~";
    const z = values.z || "~";
    const nbt = values.nbt || "";
    return `/summon ${entity} ${x} ${y} ${z}${nbt ? ` ${nbt}` : ""}`;
  },

  particle(values, version) {
    const particle = version.era === "legacy" ? stripNamespace(values.particle || "flame") : normalizeId(values.particle || "minecraft:flame", version);
    const x = values.x || "~";
    const y = values.y || "~";
    const z = values.z || "~";
    const dx = values.dx || "0";
    const dy = values.dy || "0";
    const dz = values.dz || "0";
    const speed = values.speed || "0";
    const count = cleanNumber(values.count, 1);
    const mode = values.mode || "force";
    const target = values.target || "@a";
    if (version.era === "legacy") {
      return `/particle ${particle} ${x} ${y} ${z} ${dx} ${dy} ${dz} ${speed} ${count} ${mode}`;
    }
    return `/particle ${particle} ${x} ${y} ${z} ${dx} ${dy} ${dz} ${speed} ${count} ${mode} ${target}`;
  },

  setblock(values, version) {
    const x = values.x || "~";
    const y = values.y || "~";
    const z = values.z || "~";
    const block = normalizeId(values.block || "minecraft:stone", version);
    const data = cleanNumber(values.data, 0);
    const mode = values.mode || "replace";
    if (version.era === "legacy") {
      return `/setblock ${x} ${y} ${z} ${block} ${data} ${mode}`;
    }
    return `/setblock ${x} ${y} ${z} ${block} ${mode}`;
  },

  effect(values, version) {
    const target = values.target || "@p";
    const effects = collectEffectRows(values);
    return effects.map((effectRow) => {
      const effect = version.era === "legacy" ? stripNamespace(effectRow.effect) : normalizeId(effectRow.effect, version);
      const hide = effectRow.hide ? "true" : "false";
      if (version.era === "legacy") {
        return `/effect ${target} ${effect} ${effectRow.seconds} ${effectRow.amplifier} ${hide}`;
      }
      return `/effect give ${target} ${effect} ${effectRow.seconds} ${effectRow.amplifier} ${hide}`;
    }).join("\n");
  },

  execute(values, version) {
    const target = values.target || "@p";
    const at = values.at || "@s";
    const condition = (values.condition || "").trim();
    const command = stripSlash(values.command || "say Redstone Labs");
    if (version.era === "legacy") {
      return `/execute ${target} ~ ~ ~ ${command}`;
    }
    return `/execute as ${target} at ${at}${condition ? ` ${condition}` : ""} run ${command}`;
  }
};

function collectAttributeRows(values) {
  return state.attributeRows.map((row) => {
    const attribute = values[`attribute_${row.id}`] || "";
    const amount = cleanFloat(values[`attributeAmount_${row.id}`], 0);
    const operation = values[`attributeOperation_${row.id}`] || "add_value";
    const slot = values[`attributeSlot_${row.id}`] || "mainhand";
    return { rowId: row.id, attribute, amount, operation, slot };
  }).filter((row) => row.attribute && row.amount !== 0);
}

function collectComponentRows(values) {
  return state.componentRows.map((row) => {
    const component = values[`component_${row.id}`] || "";
    const value = `${values[`componentValue_${row.id}`] || ""}`.trim();
    const definition = itemComponentMap.get(component);
    return { rowId: row.id, component, value, definition };
  }).filter((row) => row.component && row.value);
}

function collectEffectRows(values) {
  return state.effectRows.map((row) => {
    return {
      effect: values[`effect_${row.id}`] || "minecraft:strength",
      seconds: cleanNumber(values[`seconds_${row.id}`], 30),
      amplifier: cleanNumber(values[`amplifier_${row.id}`], 0),
      hide: Boolean(values[`hide_${row.id}`])
    };
  }).filter((row) => row.effect);
}

function buildComponents(name, lore, enchant, level, attributes, extraComponents) {
  const parts = new Map();
  if (name) {
    parts.set("custom_name", `'${jsonText(name)}'`);
  }
  if (lore.length) {
    parts.set("lore", `[${lore.map((line) => `'${jsonText(line, "gray")}'`).join(",")}]`);
  }
  if (enchant) {
    parts.set("enchantments", `{levels:{"${normalizeId(enchant, { era: "components" })}":${level}}}`);
  }
  if (attributes.length) {
    const modifiers = attributes.map((row, index) => {
      const attributeId = normalizeId(row.attribute, { era: "components" });
      const id = `redstone:${slugId(stripNamespace(attributeId))}_${index + 1}`;
      const slot = row.slot === "any" ? "" : `,slot:"${row.slot}"`;
      return `{id:"${id}",type:"${attributeId}",amount:${formatNumber(row.amount)},operation:"${row.operation}"${slot}}`;
    });
    parts.set("attribute_modifiers", `[${modifiers.join(",")}]`);
  }
  extraComponents.forEach((row) => {
    parts.set(stripNamespace(row.component), row.value);
  });
  return parts.size ? `[${[...parts.entries()].map(([key, value]) => `${key}=${value}`).join(",")}]` : "";
}

function buildItemNbt(name, lore, enchant, level, version, attributes, extraComponents) {
  const display = [];
  if (name) {
    display.push(`Name:'${jsonText(name)}'`);
  }
  if (lore.length) {
    display.push(`Lore:[${lore.map((line) => `'${jsonText(line, "gray")}'`).join(",")}]`);
  }
  const nbt = [];
  if (display.length) {
    nbt.push(`display:{${display.join(",")}}`);
  }
  if (enchant) {
    if (version.era === "legacy") {
      nbt.push(`ench:[{id:${legacyEnchantId(enchant)},lvl:${level}s}]`);
    } else {
      nbt.push(`Enchantments:[{id:"${normalizeId(enchant, version)}",lvl:${level}s}]`);
    }
  }
  if (attributes.length) {
    const modifiers = attributes.map((row, index) => {
      const slot = row.slot === "any" ? "" : `,Slot:"${row.slot}"`;
      return `{AttributeName:"${normalizeId(row.attribute, version)}",Name:"redstone_stacker_${index + 1}",Amount:${formatNumber(row.amount)}d,Operation:${legacyAttributeOperation(row.operation)},UUID:[I;1337,2026,17,${index + 1}]${slot}}`;
    });
    nbt.push(`AttributeModifiers:[${modifiers.join(",")}]`);
  }
  extraComponents.forEach((row) => {
    const mapped = componentToLegacyNbt(row);
    if (mapped) nbt.push(mapped);
  });
  return nbt.length ? `{${nbt.join(",")}}` : "";
}

function componentToLegacyNbt(row) {
  const key = stripNamespace(row.component);
  const value = row.value;
  if (key === "unbreakable") return "Unbreakable:1b";
  if (key === "custom_model_data") return `CustomModelData:${cleanNumber(value, 0)}`;
  if (key === "damage") return `Damage:${cleanNumber(value, 0)}`;
  if (key === "repair_cost") return `RepairCost:${cleanNumber(value, 0)}`;
  if (key === "can_place_on") return `CanPlaceOn:${legacyBlockList(value)}`;
  if (key === "can_break") return `CanDestroy:${legacyBlockList(value)}`;
  if (key === "entity_data") return `EntityTag:${value}`;
  if (key === "block_entity_data") return `BlockEntityTag:${value}`;
  if (key === "stored_enchantments") return `StoredEnchantments:${legacyStoredEnchantments(value)}`;
  return "";
}

function legacyBlockList(value) {
  const raw = `${value}`.trim();
  if (raw.startsWith("[")) return raw;
  if (raw.includes("blocks:")) {
    const matches = [...raw.matchAll(/minecraft:[a-z0-9_./-]+/g)].map((match) => match[0]);
    if (matches.length) return `[${matches.map((id) => `"${id}"`).join(",")}]`;
  }
  const blocks = raw.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean).map((item) => normalizeId(item, { era: "flattened" }));
  return `[${blocks.map((id) => `"${id}"`).join(",")}]`;
}

function legacyStoredEnchantments(value) {
  const raw = `${value}`.trim();
  if (raw.startsWith("[")) return raw;
  const match = raw.match(/minecraft:[a-z0-9_./-]+["']?\s*:\s*(\d+)/);
  if (match) {
    const idMatch = raw.match(/minecraft:[a-z0-9_./-]+/);
    return `[{id:"${idMatch[0]}",lvl:${match[1]}s}]`;
  }
  return raw;
}

function getReport(mode, version, values = {}) {
  const lines = [
    `<strong>${version.label}</strong> nutzt ${labelEra(version.era)}.`,
    getDataReport(mode),
    mode === "give" && version.era === "components" ? "Give baut Item Components fuer 1.20.5+." : "",
    mode === "give" ? getComponentReport(values, version) : "",
    mode === "give" ? "Item, Enchant und mehrere echte Attribute koennen ohne minecraft: gesucht werden." : "",
    mode === "effect" ? "Mehrere Effekte werden als mehrere Minecraft-Commands ausgegeben, weil /effect immer nur einen Effekt pro Command setzt." : "",
    mode === "execute" && version.era === "legacy" ? "Legacy Execute hat keine moderne if/unless-Kette; Bedingung wird ignoriert." : "",
    version.era === "legacy" ? "Legacy-Versionen brauchen bei manchen Items alte Namen oder Data-Werte." : ""
  ].filter(Boolean);
  return lines.join("<br>");
}

function getComponentReport(values, version) {
  const components = collectComponentRows(values);
  if (!components.length) {
    return "Components: keine extra Component-Zeile aktiv.";
  }
  if (version.era === "components") {
    return `Components: ${components.length} extra Component${components.length === 1 ? "" : "s"} werden in [] ausgegeben.`;
  }
  const mapped = components.filter(componentToLegacyNbt);
  const ignored = components.length - mapped.length;
  return `Components: ${mapped.length} als NBT moeglich${ignored ? `, ${ignored} in dieser Version nicht moeglich` : ""}.`;
}

function getDataReport(mode) {
  const map = {
    give: ["items", "enchantments", "attributes"],
    summon: ["entities"],
    particle: ["particles"],
    setblock: ["blocks"],
    effect: ["effects"],
    execute: ["targets"]
  };
  const parts = (map[mode] || []).map((key) => `${(commandData[key] || []).length} ${key}`);
  return parts.length ? `ID-Suche geladen: ${parts.join(", ")}.` : "";
}

function labelEra(era) {
  if (era === "legacy") return "Legacy-Syntax";
  if (era === "flattened") return "moderne Namespaces mit NBT";
  return "Item-Component-Syntax";
}

function normalizeId(value, version) {
  const clean = `${value}`.trim();
  if (!clean) return "minecraft:stone";
  if (version.era === "legacy" && clean.includes(":")) return clean;
  return clean.includes(":") ? clean : `minecraft:${clean}`;
}

function stripNamespace(value) {
  return `${value}`.replace(/^minecraft:/, "").trim();
}

function stripSlash(value) {
  return `${value}`.replace(/^\//, "").trim();
}

function splitLines(value) {
  return `${value || ""}`.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function cleanNumber(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function cleanFloat(value, fallback) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value) {
  return `${Number(value).toFixed(4)}`.replace(/\.?0+$/, "");
}

function legacyAttributeOperation(operation) {
  const map = {
    add_value: 0,
    add_multiplied_base: 1,
    add_multiplied_total: 2
  };
  return map[operation] ?? 0;
}

function normalizeSearch(value) {
  return stripNamespace(value).toLowerCase().trim().replace(/\s+/g, "_");
}

function humanizeId(id) {
  return stripNamespace(id).replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function slugId(id) {
  return `${id}`.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^[^a-z]+/, "attr_");
}

function jsonText(text, color = "white") {
  return JSON.stringify({ text, color, italic: false });
}

function legacyEnchantId(enchant) {
  const key = stripNamespace(enchant);
  const map = {
    sharpness: 16,
    smite: 17,
    efficiency: 32,
    unbreaking: 34,
    fortune: 35,
    power: 48,
    punch: 49,
    flame: 50,
    infinity: 51
  };
  return map[key] || 16;
}

function renderStack() {
  if (!state.stack.length) {
    stackList.innerHTML = `<li><span>0</span><code>Noch keine Commands im Stack.</code><button type="button" disabled>Leer</button></li>`;
    return;
  }
  stackList.innerHTML = state.stack.map((command, index) => {
    return `<li><span>${index + 1}</span><code>${escapeHtml(command)}</code><button type="button" data-remove="${index}">Entfernen</button></li>`;
  }).join("");
}

function saveStack() {
  localStorage.setItem("redstone-command-stack", JSON.stringify(state.stack));
  renderStack();
}

function copyText(text) {
  navigator.clipboard.writeText(text).catch(() => {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  });
}

function downloadFunction() {
  const content = state.stack.flatMap((command) => command.split(/\r?\n/).map(stripSlash).filter(Boolean)).join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "redstone_command_stack.mcfunction";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return `${value}`.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

document.querySelectorAll(".mode-tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll(".mode-tabs button").forEach((tab) => tab.classList.toggle("is-active", tab === button));
    renderFields();
    updateCommand();
  });
});

versionSelect.addEventListener("change", updateCommand);
form.addEventListener("input", (event) => {
  const input = event.target.closest("input[data-source]");
  if (input) renderSuggestions(input);
  updateCommand();
});

form.addEventListener("change", (event) => {
  const select = event.target.closest("select[name^='component_']");
  if (select) {
    const row = select.closest(".component-row");
    const valueInput = row ? row.querySelector("input[name^='componentValue_']") : null;
    const note = row ? row.querySelector(".component-note") : null;
    const definition = itemComponentMap.get(select.value);
    if (definition && valueInput) valueInput.value = definition.defaultValue;
    if (definition && note) note.textContent = definition.note || "1.20.5+ Component; aeltere Versionen nur wenn NBT-Mapping existiert.";
  }
  updateCommand();
});

form.addEventListener("focusin", (event) => {
  const input = event.target.closest("input[data-source]");
  if (input) renderSuggestions(input);
});

form.addEventListener("keydown", (event) => {
  const input = event.target.closest("input[data-source]");
  if (!input) return;
  const box = input.parentElement.querySelector(".suggestions");
  if (!box.classList.contains("is-open")) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setActiveSuggestion(box, 1);
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    setActiveSuggestion(box, -1);
  }
  if (event.key === "Enter" && acceptActiveSuggestion(input)) {
    event.preventDefault();
  }
  if (event.key === "Escape") {
    hideSuggestions();
  }
});

form.addEventListener("click", (event) => {
  const addComponent = event.target.closest("button[data-add-component]");
  if (addComponent) {
    state.componentRows.push({ id: dynamicRowId++ });
    rerenderFieldsPreservingValues();
    updateCommand();
    return;
  }

  const removeComponent = event.target.closest("button[data-remove-component]");
  if (removeComponent) {
    state.componentRows = state.componentRows.filter((row) => row.id !== Number(removeComponent.dataset.removeComponent));
    if (!state.componentRows.length) state.componentRows = [{ id: dynamicRowId++ }];
    rerenderFieldsPreservingValues();
    updateCommand();
    return;
  }

  const addAttribute = event.target.closest("button[data-add-attribute]");
  if (addAttribute) {
    state.attributeRows.push({ id: dynamicRowId++ });
    rerenderFieldsPreservingValues();
    updateCommand();
    return;
  }

  const removeAttribute = event.target.closest("button[data-remove-attribute]");
  if (removeAttribute) {
    state.attributeRows = state.attributeRows.filter((row) => row.id !== Number(removeAttribute.dataset.removeAttribute));
    if (!state.attributeRows.length) state.attributeRows = [{ id: dynamicRowId++ }];
    rerenderFieldsPreservingValues();
    updateCommand();
    return;
  }

  const addEffect = event.target.closest("button[data-add-effect]");
  if (addEffect) {
    state.effectRows.push({ id: dynamicRowId++ });
    rerenderFieldsPreservingValues();
    updateCommand();
    return;
  }

  const removeEffect = event.target.closest("button[data-remove-effect]");
  if (removeEffect) {
    state.effectRows = state.effectRows.filter((row) => row.id !== Number(removeEffect.dataset.removeEffect));
    if (!state.effectRows.length) state.effectRows = [{ id: dynamicRowId++ }];
    rerenderFieldsPreservingValues();
    updateCommand();
    return;
  }

  const button = event.target.closest("button[data-suggestion-value]");
  if (!button) return;
  const input = button.closest(".suggest-field").querySelector("input");
  input.value = button.dataset.suggestionValue;
  input.focus();
  hideSuggestions();
  updateCommand();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".suggest-field")) hideSuggestions();
});

document.querySelector("#resetButton").addEventListener("click", () => {
  renderFields();
  updateCommand();
});

document.querySelector("#copyButton").addEventListener("click", () => copyText(output.textContent));

document.querySelector("#addStackButton").addEventListener("click", () => {
  state.stack.push(output.textContent);
  saveStack();
});

document.querySelector("#copyStackButton").addEventListener("click", () => copyText(state.stack.join("\n")));
document.querySelector("#downloadFunctionButton").addEventListener("click", downloadFunction);
document.querySelector("#clearStackButton").addEventListener("click", () => {
  state.stack = [];
  saveStack();
});

stackList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-remove]");
  if (!button) return;
  state.stack.splice(Number(button.dataset.remove), 1);
  saveStack();
});

document.querySelector("#quickExampleButton").addEventListener("click", () => {
  state.mode = "give";
  document.querySelectorAll(".mode-tabs button").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.mode === "give"));
  renderFields();
  form.elements.namedItem("target").value = "@p";
  form.elements.namedItem("item").value = "minecraft:netherite_sword";
  form.elements.namedItem("count").value = "1";
  form.elements.namedItem("name").value = "THE SWORD OF THE NETHER GOD";
  form.elements.namedItem("lore").value = [
    "Diese Klinge wurde nicht geschmiedet...",
    "sie wurde aus dem Herzen des Nethers geboren.",
    "Besitzer: Nether Lord JARO",
    "Move I: Hellfire Slash",
    "Ultimate: God of the Nether"
  ].join("\n");
  form.elements.namedItem("enchant").value = "minecraft:sharpness";
  form.elements.namedItem("level").value = "10";
  updateCommand();
  document.querySelector("#builder").scrollIntoView({ behavior: "smooth" });
});

init();
