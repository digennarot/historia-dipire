const MODULE_ID = "historia-dipire";
const DEFAULT_STATE = {
  hunger: 0,
  stages: 0,
  sequence: { actions: 0, successes: 0 },
  outcome: null,
  reputationDelta: 0,
};

const ABILITIES = {
  str: "Forza",
  dex: "Destrezza",
  con: "Costituzione",
  int: "Intelligenza",
  wis: "Saggezza",
  cha: "Carisma",
};

const SKILLS = {
  acr: "Acrobazia",
  ani: "Addestrare Animali",
  arc: "Arcano",
  ath: "Atletica",
  dec: "Inganno",
  his: "Storia",
  ins: "Intuizione",
  itm: "Intimidire",
  inv: "Indagare",
  med: "Medicina",
  nat: "Natura",
  prc: "Percezione",
  prf: "Intrattenere",
  per: "Persuasione",
  rel: "Religione",
  slt: "Rapidità di Mano",
  ste: "Furtività",
  sur: "Sopravvivenza",
};

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "campaignState", {
    name: "Stato della campagna Di Pire",
    scope: "world",
    config: false,
    type: Object,
    default: DEFAULT_STATE,
  });
});

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  if (!module) throw new Error(`Modulo ${MODULE_ID} non disponibile`);
  module.api = { openAutomation };
});

function isGM() {
  if (game.user.isGM) return true;
  ui.notifications.error("Gli strumenti Di Pire sono riservati al GM.");
  return false;
}

function getParticipants() {
  const actors = [...new Set(canvas.tokens.controlled
    .map(token => token.actor)
    .filter(actor => actor?.type === "character"))];
  if (!actors.length) ui.notifications.warn("Seleziona prima i token dei personaggi giocanti.");
  return actors;
}

function getState() {
  const saved = game.settings.get(MODULE_ID, "campaignState") ?? {};
  return {
    ...DEFAULT_STATE,
    ...saved,
    sequence: { ...DEFAULT_STATE.sequence, ...(saved.sequence ?? {}) },
  };
}

async function setState(state) {
  await game.settings.set(MODULE_ID, "campaignState", state);
}

function fieldsFromDialog(dialog) {
  const form = dialog.element.querySelector("form");
  return Object.fromEntries(new FormData(form).entries());
}

async function formDialog(title, content, submitLabel = "Procedi") {
  return foundry.applications.api.DialogV2.wait({
    window: { title },
    content: `<form>${content}</form>`,
    buttons: [
      {
        action: "submit",
        label: submitLabel,
        default: true,
        callback: (_event, _button, dialog) => fieldsFromDialog(dialog),
      },
      { action: "cancel", label: "Annulla", callback: () => null },
    ],
    rejectClose: false,
  });
}

async function confirm(title, content) {
  return foundry.applications.api.DialogV2.confirm({
    window: { title },
    content,
    yes: { label: "Conferma" },
    no: { label: "Annulla" },
  }) === true;
}

function abilityOptions() {
  return Object.entries(ABILITIES)
    .map(([id, name]) => `<option value="${id}">${name}</option>`)
    .join("");
}

function skillOptions(allowed = Object.keys(SKILLS), includeNone = false) {
  const none = includeNone ? '<option value="">Solo caratteristica</option>' : "";
  return none + allowed.map(id => `<option value="${id}">${SKILLS[id]}</option>`).join("");
}

function checkFields({ skillChoices = Object.keys(SKILLS), includeAbility = true, dc = "", mode = true } = {}) {
  return `
    <div class="form-group">
      <label>Competenza</label>
      <select name="skill">${skillOptions(skillChoices, includeAbility)}</select>
    </div>
    ${includeAbility ? `<div class="form-group"><label>Caratteristica se non si usa una competenza</label><select name="ability">${abilityOptions()}</select></div>` : ""}
    ${dc !== null ? `<div class="form-group"><label>CD ${dc === "" ? "(lascia vuoto se non indicata)" : ""}</label><input name="dc" type="number" min="1" value="${dc}" ${dc === "" ? "" : "required"}></div>` : ""}
    ${mode ? `<div class="form-group"><label>Vantaggio o svantaggio</label><select name="mode"><option value="normal">Normale</option><option value="advantage">Vantaggio</option><option value="disadvantage">Svantaggio</option></select></div>` : ""}
  `;
}

function modifierFor(actor, skill, ability) {
  if (skill) {
    const data = actor.system.skills?.[skill];
    if (!data) throw new Error(`${actor.name}: competenza ${skill} non disponibile`);
    const total = Number(data.total);
    if (Number.isFinite(total)) return Math.trunc(total);
    const abilityId = data.ability ?? ability;
    const abilityData = actor.system.abilities?.[abilityId];
    const prof = Number(actor.system.attributes?.prof ?? 2);
    const mod = Number(abilityData?.mod ?? 0);
    return Math.trunc(mod + Number(data.value ?? 0) * prof + Number(data.bonuses?.check ?? 0));
  }
  const value = Number(actor.system.abilities?.[ability]?.mod);
  if (!Number.isFinite(value)) throw new Error(`${actor.name}: caratteristica ${ability} non disponibile`);
  return Math.trunc(value);
}

function rollMode(requestedMode, storyAdvantage) {
  let advantage = requestedMode === "advantage" ? 1 : 0;
  let disadvantage = requestedMode === "disadvantage" ? 1 : 0;
  if (storyAdvantage) advantage++;
  if (advantage === disadvantage) return "normal";
  return advantage > disadvantage ? "advantage" : "disadvantage";
}

async function rollActor(actor, { skill = "", ability = "str", dc = null, mode = "normal", label }) {
  const storyAdvantage = Boolean(skill && ["per", "itm"].includes(skill)
    && await actor.getFlag(MODULE_ID, "inquisitionAdvantage"));
  const effectiveMode = rollMode(mode, storyAdvantage);
  const modifier = modifierFor(actor, skill, ability);
  const dice = effectiveMode === "normal" ? "1d20" : "2d20" + (effectiveMode === "advantage" ? "kh" : "kl");
  const bonus = modifier > 0 ? ` + ${modifier}` : modifier < 0 ? ` - ${Math.abs(modifier)}` : "";
  const roll = await new Roll(`${dice}${bonus}`).evaluate();
  const name = foundry.utils.escapeHTML(actor.name);
  const modeText = effectiveMode === "advantage" ? "vantaggio" : effectiveMode === "disadvantage" ? "svantaggio" : "normale";
  const dcText = dc === null ? "" : `; CD ${dc}`;
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${label} — ${skill ? SKILLS[skill] : ABILITIES[ability]} (${modeText}${dcText})`,
  });
  return {
    actor,
    name,
    total: roll.total,
    success: dc === null ? null : roll.total >= dc,
    storyAdvantage,
  };
}

async function reportGroup(label, results, dc) {
  const successes = results.filter(result => result.success).length;
  const required = Math.ceil(results.length / 2);
  const passed = successes >= required;
  const detail = results.map(result =>
    `<li>${result.name}: ${result.total} — ${result.success ? "successo" : "fallimento"}</li>`).join("");
  await ChatMessage.create({
    content: `<h3>${foundry.utils.escapeHTML(label)}</h3><p>${successes}/${results.length} successi; ne servono ${required} per superare la prova di gruppo (CD ${dc}). Esito: <strong>${passed ? "superata" : "fallita"}</strong>.</p><ul>${detail}</ul>`,
  });
  return passed;
}

async function runGroupCheck({ label, dc, skill, ability, mode = "normal", actors = getParticipants(), checkForActor = null }) {
  if (!actors?.length) return null;
  const results = [];
  for (const actor of actors) {
    const check = checkForActor?.(actor) ?? { skill, ability, mode };
    results.push(await rollActor(actor, { label, dc, ...check }));
  }
  const passed = await reportGroup(label, results, dc);
  return { passed, results };
}

async function applyHpLoss(actors, amount, description) {
  if (!await confirm("Conferma modifica PF", `<p>${foundry.utils.escapeHTML(description)}</p><p>La modifica verrà applicata ai personaggi selezionati.</p>`)) return false;
  for (const actor of actors) {
    const current = Number(actor.system.attributes.hp.value);
    await actor.update({ "system.attributes.hp.value": Math.max(0, current - amount) });
  }
  return true;
}

async function runIndividualChecks(title, skillChoices, dcLabel) {
  const actors = getParticipants();
  if (!actors.length) return;
  const fields = await formDialog(title, checkFields({ skillChoices, dc: "", mode: true }));
  if (!fields) return;
  const dc = fields.dc.trim() === "" ? null : Number(fields.dc);
  if (dc !== null && (!Number.isInteger(dc) || dc < 1)) {
    ui.notifications.error("La CD deve essere un numero intero positivo oppure vuota.");
    return;
  }
  const results = [];
  for (const actor of actors) results.push(await rollActor(actor, {
    label: title,
    dc,
    skill: fields.skill,
    ability: fields.ability,
    mode: fields.mode,
  }));
  const detail = results.map(result => `<li>${result.name}: ${result.total}${dc === null ? "" : ` — ${result.success ? "successo" : "fallimento"} (CD ${dc})`}</li>`).join("");
  await ChatMessage.create({
    content: `<h3>${foundry.utils.escapeHTML(title)}</h3><p>${foundry.utils.escapeHTML(dcLabel)}</p><ul>${detail}</ul>`,
  });
}

const HUNGER_MAX = 6;
const TABLE_IDS = { rumors: "DipireTabDiceri1", horrors: "DipireTabOrrori1" };

function hungerEffect(value) {
  if (value >= 6) return "La Fame si mostra: TS Costituzione CD 13 a ogni round del rito o 2d6 danni da freddo.";
  if (value >= 4) return "Due sciami di Corvi della Fame durante il rito; CD del Canto +2.";
  if (value >= 2) return "Uno sciame di Corvi della Fame durante il rito.";
  return "Il rito è teso ma tranquillo.";
}

async function changeHunger(delta, reason) {
  const state = getState();
  const before = Number(state.hunger) || 0;
  state.hunger = Math.max(0, Math.min(HUNGER_MAX, before + delta));
  await setState(state);
  await ChatMessage.create({
    whisper: game.users.filter(user => user.isGM).map(user => user.id),
    content: `<h3>Orologio della Fame Bianca: ${state.hunger}/${HUNGER_MAX}</h3><p>${foundry.utils.escapeHTML(reason)} (${before} → ${state.hunger}).</p><p>${hungerEffect(state.hunger)}</p>`,
  });
  return state.hunger;
}

async function adjustHunger() {
  const state = getState();
  const fields = await formDialog("Orologio della Fame Bianca", `
    <p>Valore attuale: <strong>${state.hunger}/${HUNGER_MAX}</strong>. ${hungerEffect(state.hunger)}</p>
    <div class="form-group"><label>Variazione</label><select name="delta">
      <option value="1">+1</option><option value="-1">−1</option><option value="0">nessuna (mostra solo)</option>
    </select></div>
    <div class="form-group"><label>Motivo</label><input name="reason" type="text" value="Decisione del GM"></div>
  `);
  if (!fields) return;
  await changeHunger(Number(fields.delta), fields.reason || "Decisione del GM");
}

async function drawTable(key) {
  const id = TABLE_IDS[key];
  let table = game.tables.find(t => t._stats?.compendiumSource?.endsWith(id) || t.id === id);
  if (!table) {
    const pack = game.packs.get(`${MODULE_ID}.tables`);
    table = pack ? await pack.getDocument(id) : null;
  }
  if (!table) {
    ui.notifications.error("Tabella non trovata: importa l'avventura o attiva il compendio Di Pire - Tabelle.");
    return;
  }
  await table.draw({ rollMode: CONST.DICE_ROLL_MODES.PRIVATE });
}

async function runPyreInvestigation() {
  await runIndividualChecks("01 — Indagine alla pira", ["prc", "inv", "nat", "med", "rel", "his", "ins"],
    "CD dal journal 01: Percezione 12, Indagare 13, Natura 13, Medicina 14, Religione 12, Storia 15, Intuizione 13.");
}

async function runMilitiaResistance() {
  const actors = getParticipants();
  if (!actors.length) return;
  const fields = await formDialog("02 — Resistere alla milizia", actors.map(actor => `
    <fieldset><legend>${foundry.utils.escapeHTML(actor.name)}</legend>
      <div class="form-group"><label>Competenza (se pertinente)</label><select name="skill-${actor.id}">${skillOptions(Object.keys(SKILLS), true)}</select></div>
      <div class="form-group"><label>Caratteristica</label><select name="ability-${actor.id}">${abilityOptions()}</select></div>
    </fieldset>
  `).join(""));
  if (!fields) return;
  const result = await runGroupCheck({
    label: "02 — Resistenza alla milizia",
    dc: 15,
    actors,
    checkForActor: actor => ({
      skill: fields[`skill-${actor.id}`],
      ability: fields[`ability-${actor.id}`],
    }),
  });
  if (!result) return;
  if (result.passed) {
    for (const actor of actors) await actor.setFlag(MODULE_ID, "inquisitionAdvantage", true);
    ui.notifications.info("Vantaggio futuro verso l'Inquisizione registrato: lo strumento lo applica ai tiri di Persuasione e Intimidire.");
  }
  await applyHpLoss(actors, 2, "Journal 02: i personaggi perdono 2 PF a prescindere dall'esito.");
}

async function runAscentStage() {
  const actors = getParticipants();
  if (!actors.length) return;
  const state = getState();
  const stage = Math.min(3, (Number(state.stages) || 0) + 1);
  const fields = await formDialog(`03 — Tappa ${stage} della salita`, `
    <p>Prova di gruppo di Sopravvivenza CD 13. Se fallisce: orologio della Fame +1 e TS Costituzione CD 12 per ogni PG (1 livello di indebolimento se fallito).</p>
    <div class="form-group"><label>Tira anche sulla tabella degli orrori</label><input name="horror" type="checkbox" value="yes" checked></div>
  `);
  if (!fields) return;
  const result = await runGroupCheck({ label: `03 — Tappa ${stage}: orientarsi nella tormenta`, dc: 13, skill: "sur", ability: "wis", actors });
  if (!result) return;
  state.stages = stage;
  await setState(state);
  if (!result.passed) {
    await changeHunger(1, `Tappa ${stage} fallita`);
    const frozen = [];
    for (const actor of actors) {
      const rolls = await actor.rollSavingThrow({ ability: "con", target: 12 }, {}, { data: { flavor: "Freddo della montagna (CD 12)" } });
      const roll = Array.isArray(rolls) ? rolls[0] : rolls;
      if (roll && roll.total < 12) frozen.push(actor);
    }
    if (frozen.length && await confirm("Indebolimento per il freddo", `<p>Hanno fallito il tiro salvezza: ${frozen.map(a => foundry.utils.escapeHTML(a.name)).join(", ")}.</p><p>Aggiungere 1 livello di indebolimento a ciascuno?</p>`)) {
      for (const actor of frozen) {
        const current = Number(actor.system.attributes.exhaustion) || 0;
        await actor.update({ "system.attributes.exhaustion": Math.min(6, current + 1) });
      }
    }
  }
  if (fields.horror === "yes") await drawTable("horrors");
}

async function runChant() {
  const actors = getParticipants();
  if (actors.length !== 1) {
    ui.notifications.warn("Seleziona il solo token di chi canta.");
    return;
  }
  const state = getState();
  const bump = state.hunger >= 4 ? 2 : 0;
  const fields = await formDialog("04 — Il Canto della Catena", `
    <p>Orologio della Fame: ${state.hunger}/${HUNGER_MAX}${bump ? " (CD +2)" : ""}. Il rito fallisce dopo due prove fallite.</p>
    <div class="form-group"><label>Round</label><select name="round"><option value="13">1 (CD 13)</option><option value="15">2 (CD 15)</option><option value="17">3 (CD 17)</option></select></div>
    <div class="form-group"><label>Competenza</label><select name="skill">${skillOptions(["rel", "prf", "nat"])}</select></div>
    <div class="form-group"><label>Vantaggio o svantaggio</label><select name="mode"><option value="normal">Normale</option><option value="advantage">Vantaggio (teschio, verso ricordato, Aiuto)</option><option value="disadvantage">Svantaggio</option></select></div>
  `);
  if (!fields) return;
  const dc = Number(fields.round) + bump;
  const result = await rollActor(actors[0], { label: "Il Canto della Catena", dc, skill: fields.skill, mode: fields.mode });
  if (!result.success) await changeHunger(1, "Prova del Canto fallita");
}

const OUTCOMES = {
  croce: { label: "La Croce", delta: 2, reward: "1 Conio a testa da Iginius. Brunascio perde un abitante o una stalla per ogni segmento dell'orologio." },
  branco: { label: "Il Branco", delta: -2, reward: "1 Conio a testa se Iginius non sa; −2 solo se la verità viene fuori. Casata De Fredier alleata." },
  patto: { label: "Il Patto della Neve", delta: 0, reward: "1 Conio a testa. Brunascio salva, Casata De Fredier alleata." },
  fame: { label: "La Fame", delta: 0, reward: "Nessuna ricompensa. Brunascio perde un abitante o una stalla per ogni segmento dell'orologio, più tre." },
};

async function recordOutcome() {
  const fields = await formDialog("04 — Registra il finale", `
    <div class="form-group"><label>Finale</label><select name="outcome">
      ${Object.entries(OUTCOMES).map(([id, o]) => `<option value="${id}">${o.label}</option>`).join("")}
    </select></div>
  `);
  if (!fields) return;
  const outcome = OUTCOMES[fields.outcome];
  if (!outcome) return;
  const state = getState();
  const reputationText = outcome.delta > 0 ? `+${outcome.delta}` : outcome.delta < 0 ? `−${Math.abs(outcome.delta)}` : "nessuna variazione";
  if (!await confirm("Conferma il finale", `<p>${outcome.label}; reputazione con la Chiesa delle Ossa: ${reputationText}.</p><p>${outcome.reward}</p><p>Orologio della Fame: ${state.hunger}/${HUNGER_MAX}. Nessuna valuta o Fama viene assegnata automaticamente.</p>`)) return;
  state.outcome = fields.outcome;
  state.reputationDelta = outcome.delta;
  await setState(state);
  await ChatMessage.create({
    content: `<h3>Finale: ${outcome.label}</h3><p>Reputazione con la Chiesa delle Ossa (indicatore narrativo): ${reputationText}.</p><p>${outcome.reward}</p>`,
  });
}

async function showState() {
  const state = getState();
  await ChatMessage.create({
    whisper: game.users.filter(user => user.isGM).map(user => user.id),
    content: `<h3>Stato di Di Pire</h3><ul><li>Orologio della Fame Bianca: ${state.hunger}/${HUNGER_MAX}. ${hungerEffect(state.hunger)}</li><li>Tappe della salita giocate: ${state.stages}/3.</li><li>Finale: ${foundry.utils.escapeHTML(OUTCOMES[state.outcome]?.label ?? "non registrato")}.</li><li>Reputazione narrativa con la Chiesa: ${state.reputationDelta > 0 ? "+" : ""}${state.reputationDelta}.</li></ul>`,
  });
}

async function resetState() {
  if (!await confirm("Azzera lo stato", "<p>Azzerare orologio della Fame, tappe e finale registrato? I vantaggi verso l'Inquisizione restano sui personaggi.</p>")) return;
  await setState(foundry.utils.deepClone(DEFAULT_STATE));
  ui.notifications.info("Stato di Di Pire azzerato.");
}

async function openAutomation() {
  if (!isGM()) return;
  if (game.system.id !== "dnd5e") {
    ui.notifications.error("Gli strumenti Di Pire richiedono il sistema dnd5e.");
    return;
  }
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: "Di Pire — Strumenti del GM" },
    content: "<p>Seleziona i token dei personaggi coinvolti prima di avviare prove o conseguenze.</p>",
    buttons: [
      { action: "pyre", label: "01 — Indagine alla pira" },
      { action: "rumors", label: "01 — Tira una diceria" },
      { action: "militia", label: "02 — Resistere alla milizia" },
      { action: "stage", label: "03 — Tappa della salita" },
      { action: "horror", label: "03 — Tira un orrore" },
      { action: "ledge", label: "03 — La Scala dei Corvi" },
      { action: "chant", label: "04 — Il Canto della Catena" },
      { action: "hunger", label: "Orologio della Fame Bianca" },
      { action: "outcome", label: "Registra il finale" },
      { action: "state", label: "Mostra stato" },
      { action: "reset", label: "Azzera stato" },
      { action: "close", label: "Chiudi" },
    ],
    rejectClose: false,
  });
  switch (action) {
    case "pyre": await runPyreInvestigation(); break;
    case "rumors": await drawTable("rumors"); break;
    case "militia": await runMilitiaResistance(); break;
    case "stage": await runAscentStage(); break;
    case "horror": await drawTable("horrors"); break;
    case "ledge": await runIndividualChecks("03 — La Scala dei Corvi", ["ath", "acr"], "CD 12. Fallimento: 1d6 contundenti; fallimento di 5 o più: caduta di 6 m (2d6)."); break;
    case "chant": await runChant(); break;
    case "hunger": await adjustHunger(); break;
    case "outcome": await recordOutcome(); break;
    case "state": await showState(); break;
    case "reset": await resetState(); break;
    default: break;
  }
}
