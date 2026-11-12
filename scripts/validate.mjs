// Validazione statica dei sorgenti del modulo historia-dipire.
//   node scripts/validate.mjs [--historia <cartella del repo historia-it>] [--foundry <cartella resources/app di Foundry>]
// Senza --historia i link e le immagini verso historia-it non vengono verificati (solo avviso).
// Senza --foundry le icone core (icons/...) non vengono verificate (solo avviso); su Windows prova il percorso di installazione predefinito.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSources, readJson } from "./build.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const HISTORIA = opt("--historia");
const FOUNDRY = opt("--foundry") ?? (process.platform === "win32" ? "C:/Program Files/Foundry Virtual Tabletop/resources/app" : null);

const errors = [], warnings = [];
const err = m => errors.push(m);
const warn = m => warnings.push(m);
const exists = async p => { try { await fs.stat(p); return true; } catch { return false; } };

const ID_RE = /^[A-Za-z0-9]{16}$/;
const SKILLS = new Set(["acr","ani","arc","ath","dec","his","ins","itm","inv","med","nat","prc","prf","per","rel","slt","ste","sur"]);
const ABILITIES = new Set(["str","dex","con","int","wis","cha"]);

function* strings(obj, trail = "") {
  if (typeof obj === "string") yield [trail, obj];
  else if (Array.isArray(obj)) for (const [i, v] of obj.entries()) yield* strings(v, `${trail}[${i}]`);
  else if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) yield* strings(v, trail ? `${trail}.${k}` : k);
}

async function main() {
  const manifest = await readJson(path.join(ROOT, "module.json"));
  if (!/^[A-Za-z0-9_-]+$/.test(manifest.id)) err(`module.json: id non valido "${manifest.id}"`);
  for (const k of ["minimum", "verified"]) if (typeof manifest.compatibility?.[k] !== "string") err(`module.json: compatibility.${k} deve essere una stringa`);
  if (manifest.compatibility?.minimum !== "14") err("module.json: compatibilità minima attesa Foundry VTT 14");
  const dnd5e = manifest.relationships?.systems?.find(system => system.id === "dnd5e");
  if (dnd5e?.compatibility?.minimum !== "6.0.6") err("module.json: compatibilità minima attesa dnd5e 6.0.6");
  if (!manifest.esmodules?.includes("scripts/automation.js")) err("module.json: manca l'entry point scripts/automation.js");
  if (!manifest.packs.some(pack => pack.name === "automation" && pack.type === "Macro")) err("module.json: manca il compendio Macro automation");
  for (const p of manifest.packs) {
    if (!p.name || !p.path || !p.type) err(`module.json: pack incompleto ${JSON.stringify(p)}`);
    if (!p.path.startsWith("packs/")) err(`module.json: pack ${p.name} con path inatteso ${p.path}`);
  }
  for (const f of manifest.packFolders ?? []) for (const n of f.packs) if (!manifest.packs.some(p => p.name === n)) err(`module.json: packFolders cita il pack inesistente ${n}`);
  if (!manifest.relationships?.requires?.some(r => r.id === "historia-it")) err("module.json: manca la dipendenza historia-it");

  const src = await loadSources();
  const { actors, journal, automation, scenes, adventure } = src;
  if (!actors.length) err("nessun attore in src/packs/actors/_source");
  if (!journal.length) err("nessun journal in src/packs/journal/_source");
  if (!automation.length) err("nessuna macro in src/packs/automation/_source");
  for (const id of ["DipireScCasa0001", "DipireScOsteria1", "DipireScStanze01"]) {
    if (!scenes.some(scene => scene._id === id)) err(`scena richiesta mancante: ${id}`);
  }
  for (const macro of automation) {
    if (macro.type !== "script") err(`macro ${macro.name}: type ${macro.type}, atteso script`);
    if (typeof macro.command !== "string" || !macro.command.trim()) err(`macro ${macro.name}: comando vuoto`);
    else {
      try { new Function(macro.command); } catch (e) { err(`macro ${macro.name}: sintassi non valida (${e.message})`); }
    }
  }
  try {
    new Function(await fs.readFile(path.join(ROOT, "src/runtime/automation.js"), "utf8"));
  } catch (e) {
    err(`src/runtime/automation.js: sintassi non valida (${e.message})`);
  }

  // --- id univoci
  const ids = new Map();
  const seen = (id, where) => {
    if (!ID_RE.test(id ?? "")) err(`${where}: _id non valido "${id}"`);
    if (ids.has(id)) err(`${where}: _id "${id}" duplicato (già in ${ids.get(id)})`);
    ids.set(id, where);
  };
  for (const macro of automation) seen(macro._id, `macro ${macro.name}`);
  for (const a of actors) {
    seen(a._id, `attore ${a.name}`);
    if (a.type !== "npc") err(`attore ${a.name}: type ${a.type}, atteso npc`);
    const itemIds = new Set();
    for (const it of a.items ?? []) {
      if (!ID_RE.test(it._id)) err(`attore ${a.name}, oggetto ${it.name}: _id non valido`);
      if (itemIds.has(it._id)) err(`attore ${a.name}: oggetto con _id duplicato ${it._id}`);
      itemIds.add(it._id);
      for (const [aid, act] of Object.entries(it.system?.activities ?? {})) {
        if (aid !== act._id) err(`attore ${a.name}, oggetto ${it.name}: activity ${aid} con _id ${act._id}`);
        if (!ID_RE.test(aid)) err(`attore ${a.name}, oggetto ${it.name}: activity id non valido ${aid}`);
      }
    }
    if (!a.prototypeToken?.texture?.src) warn(`attore ${a.name}: token senza immagine`);
    if (a.system?.attributes?.hp?.max == null) err(`attore ${a.name}: PF massimi mancanti`);
  }
  const pageIds = new Map();
  for (const j of journal) {
    seen(j._id, `journal ${j.name}`);
    for (const p of j.pages ?? []) {
      seen(p._id, `journal ${j.name} / pagina ${p.name}`);
      pageIds.set(p._id, j._id);
      if (p.type === "text" && !p.text?.content?.trim()) err(`journal ${j.name} / pagina ${p.name}: vuota`);
    }
  }
  for (const s of scenes) seen(s._id, `scena ${s.name}`);
  seen(adventure._id, "adventure");
  const folderIds = new Set();
  for (const f of adventure.folders ?? []) { seen(f._id, `cartella ${f.name}`); folderIds.add(f._id); }

  // --- cartelle
  const checkFolder = (doc, where, type) => {
    if (!doc.folder) return;
    const f = (adventure.folders ?? []).find(f => f._id === doc.folder);
    if (!f) err(`${where}: cartella ${doc.folder} non definita in adventure.json`);
    else if (f.type !== type) err(`${where}: cartella ${f.name} è di tipo ${f.type}, atteso ${type}`);
  };
  actors.forEach(a => checkFolder(a, `attore ${a.name}`, "Actor"));
  journal.forEach(j => checkFolder(j, `journal ${j.name}`, "JournalEntry"));
  scenes.forEach(s => checkFolder(s, `scena ${s.name}`, "Scene"));

  // --- scene: livelli, token, note
  const actorIds = new Set(actors.map(a => a._id));
  for (const s of scenes) {
    const levelIds = new Set((s.levels ?? []).map(l => l._id));
    if (!levelIds.size) err(`scena ${s.name}: nessun livello`);
    if (s.initialLevel && !levelIds.has(s.initialLevel)) err(`scena ${s.name}: initialLevel ${s.initialLevel} non esiste`);
    if (s.grid?.units !== "m") warn(`scena ${s.name}: unità della griglia ${s.grid?.units}`);
    const tokenIds = new Set();
    for (const t of s.tokens ?? []) {
      if (!ID_RE.test(t._id)) err(`scena ${s.name}: token ${t.name} con _id non valido`);
      if (tokenIds.has(t._id)) err(`scena ${s.name}: token con _id duplicato ${t._id}`);
      tokenIds.add(t._id);
      if (!actorIds.has(t.actorId)) err(`scena ${s.name}: token ${t.name} punta all'attore inesistente ${t.actorId}`);
      if (t.level && !levelIds.has(t.level)) err(`scena ${s.name}: token ${t.name} sul livello inesistente ${t.level}`);
      if (t.x < 0 || t.y < 0 || t.x >= s.width || t.y >= s.height) err(`scena ${s.name}: token ${t.name} fuori dalla scena`);
    }
    for (const n of s.notes ?? []) {
      if (!ID_RE.test(n._id)) err(`scena ${s.name}: nota "${n.text}" con _id non valido`);
      if (!journal.some(j => j._id === n.entryId)) err(`scena ${s.name}: nota "${n.text}" punta al journal inesistente ${n.entryId}`);
      else if (n.pageId && pageIds.get(n.pageId) !== n.entryId) err(`scena ${s.name}: nota "${n.text}" punta alla pagina ${n.pageId} che non appartiene a ${n.entryId}`);
      if (n.x < 0 || n.y < 0 || n.x >= s.width || n.y >= s.height) err(`scena ${s.name}: nota "${n.text}" fuori dalla scena`);
    }
    if (s.journal && !journal.some(j => j._id === s.journal)) err(`scena ${s.name}: journal collegato inesistente`);
    if (s.journalEntryPage && pageIds.get(s.journalEntryPage) !== s.journal) err(`scena ${s.name}: pagina collegata non coerente`);
  }

  // --- link @UUID, enricher, immagini
  const historiaIndex = HISTORIA ? await indexHistoria(HISTORIA) : null;
  if (!historiaIndex) warn("link e immagini verso historia-it non verificati (usa --historia <cartella>)");
  const foundryIcons = FOUNDRY && await exists(path.join(FOUNDRY, "public/icons")) ? path.join(FOUNDRY, "public/icons") : null;
  if (!foundryIcons) warn("icone core non verificate (usa --foundry <cartella resources/app>)");
  const imgCache = new Map();
  const checkImage = async (val, where) => {
    if (imgCache.has(val)) return;
    imgCache.set(val, true);
    const decoded = decodeURIComponent(val);
    if (decoded.startsWith("modules/historia-it/")) {
      if (!historiaIndex) return;
      const rel = decoded.slice("modules/historia-it/".length);
      if (!(await exists(path.join(HISTORIA, rel)))) err(`${where}: immagine ${val} non trovata in historia-it`);
    } else if (decoded.startsWith("icons/")) {
      if (!foundryIcons) return;
      if (!(await exists(path.join(foundryIcons, decoded.slice("icons/".length))))) err(`${where}: icona core ${val} non trovata`);
    } else if (decoded.startsWith(`modules/${manifest.id}/`)) {
      if (!(await exists(path.join(ROOT, decoded.slice(`modules/${manifest.id}/`.length))))) err(`${where}: file ${val} non presente nel modulo`);
    } else err(`${where}: percorso immagine inatteso ${val}`);
  };

  const docsToScan = [...actors.map(a => ["attore " + a.name, a]), ...journal.map(j => ["journal " + j.name, j]), ...scenes.map(s => ["scena " + s.name, s]), ["adventure", adventure]];
  const UUID_RE = /@UUID\[([^\]]+)\](\{[^}]*\})?/g;
  const ENRICH_RE = /\[\[\/(\w+)([^\]]*)\]\]/g;
  for (const [where, doc] of docsToScan) {
    for (const [trail, val] of strings(doc)) {
      if (/\.(webp|png|jpe?g|svg)$/i.test(val) && !val.includes(" ") && !val.startsWith("<")) await checkImage(val, `${where} ${trail}`);
      for (const m of val.matchAll(UUID_RE)) {
        const uuid = m[1];
        if (!m[2]) warn(`${where} ${trail}: link senza etichetta ${uuid}`);
        const parts = uuid.split(".");
        if (parts[0] === "Compendium") {
          const [, pkg, pack, type, id, sub, subId] = parts;
          if (pkg === manifest.id) {
            if (!manifest.packs.some(p => p.name === pack)) err(`${where} ${trail}: pack ${pack} inesistente in ${uuid}`);
            if (type === "Actor" && !actorIds.has(id)) err(`${where} ${trail}: attore ${id} inesistente in ${uuid}`);
            if (type === "JournalEntry") {
              if (!journal.some(j => j._id === id)) err(`${where} ${trail}: journal ${id} inesistente in ${uuid}`);
              if (sub === "JournalEntryPage" && pageIds.get(subId) !== id) err(`${where} ${trail}: pagina ${subId} inesistente in ${uuid}`);
            }
            if (type === "Macro" && !automation.some(m => m._id === id)) err(`${where} ${trail}: macro ${id} inesistente in ${uuid}`);
          } else if (pkg === "historia-it") {
            if (!historiaIndex) continue;
            const key = `${pack}/${id}`;
            if (!historiaIndex.has(key)) err(`${where} ${trail}: documento historia-it ${key} inesistente`);
            else if (sub === "JournalEntryPage" && !historiaIndex.get(key).has(subId)) err(`${where} ${trail}: pagina historia-it ${subId} inesistente`);
          } else err(`${where} ${trail}: link a un pacchetto sconosciuto ${pkg}`);
        } else if (parts[0] === "Scene") {
          if (!scenes.some(s => s._id === parts[1])) err(`${where} ${trail}: scena ${parts[1]} inesistente`);
        } else err(`${where} ${trail}: UUID non gestito ${uuid}`);
      }
      for (const m of val.matchAll(ENRICH_RE)) {
        const [, cmd, rest] = m;
        if (!["check", "damage", "save", "heal", "attack", "item", "lookup", "reference", "award", "concentration", "skill", "tool"].includes(cmd)) err(`${where} ${trail}: enricher sconosciuto ${m[0]}`);
        const skill = /skill=([\w/]+)/.exec(rest)?.[1];
        if (skill) for (const s of skill.split("/")) if (!SKILLS.has(s)) err(`${where} ${trail}: abilità sconosciuta ${s} in ${m[0]}`);
        const ability = /ability=([\w/]+)/.exec(rest)?.[1];
        if (ability) for (const a of ability.split("/")) if (!ABILITIES.has(a)) err(`${where} ${trail}: caratteristica sconosciuta ${a} in ${m[0]}`);
        const dc = /dc=(\S+)/.exec(rest)?.[1];
        if (dc && !/^\d+$/.test(dc)) err(`${where} ${trail}: CD non numerica in ${m[0]}`);
      }
      if (/@Compendium\[/.test(val)) warn(`${where} ${trail}: sintassi @Compendium obsoleta`);
    }
  }

  for (const w of warnings) console.log(`AVVISO  ${w}`);
  for (const e of errors) console.log(`ERRORE  ${e}`);
  console.log(`\n${actors.length} attori, ${journal.length} journal (${pageIds.size} pagine), ${automation.length} macro, ${scenes.length} scene; ${errors.length} errori, ${warnings.length} avvisi`);
  process.exit(errors.length ? 1 : 0);
}

// Indice dei documenti di historia-it: "<pack>/<id>" -> Set di id delle pagine.
async function indexHistoria(dir) {
  const packsDir = path.join(dir, "src/packs");
  if (!(await exists(packsDir))) { console.log(`AVVISO  ${packsDir} non trovata`); return null; }
  const index = new Map();
  for (const pack of await fs.readdir(packsDir)) {
    const srcDir = path.join(packsDir, pack, "_source");
    if (!(await exists(srcDir))) continue;
    for (const f of await fs.readdir(srcDir)) {
      if (!f.endsWith(".json")) continue;
      const d = await readJson(path.join(srcDir, f));
      index.set(`${pack}/${d._id}`, new Set((d.pages ?? []).map(p => p._id)));
    }
  }
  return index;
}

main().catch(e => { console.error(e); process.exit(1); });
