const MODULE_ID = "historia-dipire";
const DEFAULT_STATE = {
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

async function runActII() {
  const actors = getParticipants();
  if (!actors.length) return;
  const fields = await formDialog("Atto II — Resistere alla milizia", actors.map(actor => `
    <fieldset><legend>${foundry.utils.escapeHTML(actor.name)}</legend>
      <div class="form-group"><label>Competenza (se pertinente)</label><select name="skill-${actor.id}">${skillOptions(Object.keys(SKILLS), true)}</select></div>
      <div class="form-group"><label>Caratteristica</label><select name="ability-${actor.id}">${abilityOptions()}</select></div>
    </fieldset>
  `).join(""));
  if (!fields) return;
  const result = await runGroupCheck({
    label: "Atto II — Resistenza alla milizia",
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
    ui.notifications.info("Vantaggio futuro verso l'Inquisizione registrato per i personaggi selezionati. Lo strumento lo applicherà ai successivi tiri di Persuasione e Intimidire.");
  }
  await applyHpLoss(actors, 2, "Atto II: i personaggi perdono 2 PF a prescindere dall'esito.");
}

async function runGateCheck() {
  const actors = getParticipants();
  if (!actors.length) return;
  const fields = await formDialog("Atto III — Parlamentare ai cancelli", `
    ${actors.map(actor => `<div class="form-group"><label>${foundry.utils.escapeHTML(actor.name)}</label><select name="skill-${actor.id}">${skillOptions(["per", "itm"])}</select></div>`).join("")}
    <div class="form-group"><label>Approccio aggressivo</label><input name="aggressive" type="checkbox" value="yes"></div>
  `);
  if (!fields) return;
  const result = await runGroupCheck({
    label: "Atto III — Prova ai cancelli",
    dc: 18,
    actors,
    checkForActor: actor => ({
      skill: fields[`skill-${actor.id}`],
      ability: "cha",
      mode: fields.aggressive === "yes" ? "disadvantage" : "normal",
    }),
  });
  if (result) {
    await ChatMessage.create({
      content: `<p>Conseguenza da adjudicare dal GM: il testo prevede rissa dopo un fallimento aggressivo e allontanamento dopo un fallimento diplomatico.</p>`,
    });
  }
}

async function runSequence() {
  const actors = getParticipants();
  if (!actors.length) return;
  const fields = await formDialog("Sequenza — Infiltrazione", `
    ${checkFields({ dc: 14, mode: true })}
    <div class="form-group"><label>PF per azione (minimo 1)</label><input name="cost" type="number" min="1" value="3" required></div>
  `);
  if (!fields) return;
  const dc = Number(fields.dc);
  const cost = Number(fields.cost);
  if (!Number.isInteger(dc) || dc < 12 || !Number.isInteger(cost) || cost < 1) {
    ui.notifications.error("La Sequenza usa CD minima 12 e costo minimo 1 PF per azione.");
    return;
  }
  const eligible = actors.filter(actor => Number(actor.system.attributes.hp.value) >= cost);
  if (eligible.length !== actors.length) {
    ui.notifications.error("Uno o più personaggi selezionati non hanno PF sufficienti per il costo scelto. Nessun PF è stato modificato.");
    return;
  }
  const actions = eligible.length;
  const totalCost = actions * cost;
  if (!await confirm("Conferma azioni della Sequenza", `<p>${actions} azioni; CD ${dc}; costo ${cost} PF per azione (${totalCost} PF totali).</p><p>La durata o il numero di successi necessario non è definito: lo decide il GM.</p>`)) return;
  for (const actor of eligible) {
    const current = Number(actor.system.attributes.hp.value);
    await actor.update({ "system.attributes.hp.value": Math.max(0, current - cost) });
  }
  const results = [];
  for (const actor of eligible) results.push(await rollActor(actor, { label: "Sequenza di infiltrazione", dc, skill: fields.skill, ability: fields.ability, mode: fields.mode }));
  const state = getState();
  state.sequence.actions += actions;
  state.sequence.successes += results.filter(result => result.success).length;
  await setState(state);
  const detail = results.map(result =>
    `<li>${result.name}: ${result.total} — ${result.success ? "successo" : "fallimento"}</li>`).join("");
  await ChatMessage.create({
    content: `<h3>Progressi della Sequenza — non è un esito finale</h3><ul>${detail}</ul><p>Registrati ${state.sequence.successes} successi in ${state.sequence.actions} azioni. Il testo non definisce la soglia per completare la Sequenza: il GM ne decide l'esito.</p>`,
  });
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

async function runInitialDamage() {
  const actors = getParticipants();
  if (!actors.length) return;
  if (!await confirm("Danni iniziali dell'infiltrazione", `<p>Tira 1d6 per ogni personaggio selezionato. Il tipo di danno non è indicato nel testo, quindi i risultati verranno mostrati in chat ma non applicati automaticamente.</p>`)) return;
  const results = [];
  for (const actor of actors) {
    const roll = await new Roll("1d6").evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: "Danni iniziali — infiltrazione fallita",
    });
    results.push(`${foundry.utils.escapeHTML(actor.name)}: ${roll.total}`);
  }
  const state = getState();
  state.enricoTrust = "persa";
  await setState(state);
  await ChatMessage.create({
    content: `<p>Risultati da applicare manualmente dal GM (tipo di danno non specificato): ${results.join("; ")}.</p><p>Fiducia di Enrico registrata come persa.</p>`,
  });
}

async function recordOutcome() {
  const fields = await formDialog("Atto V — Registra finale", `
    <div class="form-group"><label>Esito</label><select name="outcome">
      <option value="enrico-dead">Enrico è morto</option>
      <option value="rescue">Salvataggio in piazza</option>
      <option value="diplomacy">Finale diplomatico</option>
    </select></div>
  `);
  if (!fields) return;
  const values = {
    "enrico-dead": { delta: 2, label: "Enrico è morto" },
    rescue: { delta: -2, label: "Salvataggio in piazza" },
    diplomacy: { delta: 0, label: "Finale diplomatico" },
  };
  const outcome = values[fields.outcome];
  if (!outcome) return;
  const state = getState();
  const reputationText = outcome.delta > 0 ? "+2" : outcome.delta < 0 ? "−2" : "nessuna variazione definita";
  const rewardText = fields.outcome === "enrico-dead"
    ? "Ricompensa indicata: 1 Conio per personaggio; nessuna valuta verrà assegnata automaticamente."
    : fields.outcome === "rescue"
      ? "Il testo menziona una ricompensa monetaria ma non ne specifica l'importo: decide il GM."
      : "Il testo non specifica ricompense o reputazione per questo finale.";
  if (!await confirm("Conferma registrazione finale", `<p>${outcome.label}; reputazione narrativa ${reputationText}.</p><p>${rewardText}</p><p>Il valore non viene convertito in Fama o valuta di sistema.</p>`)) return;
  state.outcome = fields.outcome;
  state.reputationDelta = outcome.delta;
  await setState(state);
  await ChatMessage.create({
    content: `<h3>Finale registrato: ${foundry.utils.escapeHTML(outcome.label)}</h3><p>Reputazione narrativa: ${reputationText}. ${foundry.utils.escapeHTML(rewardText)}</p>`,
  });
}

async function showState() {
  const state = getState();
  const sequence = state.sequence;
  await ChatMessage.create({
    whisper: game.users.filter(user => user.isGM).map(user => user.id),
    content: `<h3>Stato campagna Di Pire</h3><ul><li>Sequenza: ${sequence.successes} successi in ${sequence.actions} azioni; soglia finale non definita.</li><li>Fiducia di Enrico dopo infiltrazione: ${foundry.utils.escapeHTML(state.enricoTrust ?? "non registrata")}.</li><li>Finale: ${foundry.utils.escapeHTML(state.outcome ?? "non registrato")}.</li><li>Variazione narrativa della reputazione: ${state.reputationDelta > 0 ? "+" : ""}${state.reputationDelta} (non convertita in Fama).</li></ul>`,
  });
}

async function clearSequence() {
  if (!await confirm("Azzera la Sequenza", "<p>Azzerare solo il conteggio di azioni e successi della Sequenza?</p>")) return;
  const state = getState();
  state.sequence = { actions: 0, successes: 0 };
  await setState(state);
  ui.notifications.info("Conteggio della Sequenza azzerato.");
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
      { action: "act2", label: "Atto II — Resistere alla milizia" },
      { action: "gates", label: "Atto III — Prova ai cancelli" },
      { action: "sequence", label: "Sequenza di infiltrazione" },
      { action: "courtyard", label: "Atto IV — Prove nel cortile" },
      { action: "escape", label: "Fuga dalla finestra" },
      { action: "damage", label: "Danni iniziali 1d6" },
      { action: "outcome", label: "Registra finale e reputazione" },
      { action: "state", label: "Mostra stato campagna" },
      { action: "reset-sequence", label: "Azzera Sequenza" },
      { action: "close", label: "Chiudi" },
    ],
    rejectClose: false,
  });
  switch (action) {
    case "act2": await runActII(); break;
    case "gates": await runGateCheck(); break;
    case "sequence": await runSequence(); break;
    case "courtyard": await runIndividualChecks("Atto IV — Prove nel cortile", Object.keys(SKILLS), "Il testo non fissa una CD: il GM valuta i risultati."); break;
    case "escape": await runIndividualChecks("Fuga dalla finestra", ["acr", "ath"], "Il testo non fissa una CD: il GM la decide."); break;
    case "damage": await runInitialDamage(); break;
    case "outcome": await recordOutcome(); break;
    case "state": await showState(); break;
    case "reset-sequence": await clearSequence(); break;
    default: break;
  }
}
