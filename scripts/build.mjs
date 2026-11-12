// Compila il modulo historia-dipire nella cartella `historia-dipire/` (pronta da copiare in Data/modules).
//
// Sorgenti:
//   src/packs/actors/_source/*.json    -> pack Actor "actors"
//   src/packs/journal/_source/*.json   -> pack JournalEntry "journal"
//   src/packs/automation/_source/*.json -> pack Macro "automation"
//   src/packs/items/_source/*.json     -> pack Item "items"
//   src/packs/tables/_source/*.json    -> pack RollTable "tables"
//   src/adventure/adventure.json       -> metadati e cartelle del documento Adventure
//   src/adventure/scenes/*.json        -> scene incluse nell'Adventure
// Il documento Adventure viene assemblato qui: contiene gli stessi attori, journal, oggetti e tabelle dei pack separati,
// più le scene e le cartelle. Non esistono quindi due copie da tenere allineate.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli/lib/package.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "historia-dipire");
const TMP = path.join(ROOT, "build", "_source");

export async function readJson(file) {
  let text = await fs.readFile(file, "utf8");
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return JSON.parse(text);
}

export async function readDocs(dir) {
  let files;
  try { files = await fs.readdir(dir); } catch { return []; }
  const docs = [];
  for (const f of files.filter(f => f.endsWith(".json")).sort()) docs.push(await readJson(path.join(dir, f)));
  return docs;
}

export async function loadSources() {
  const actors = await readDocs(path.join(ROOT, "src/packs/actors/_source"));
  const journal = await readDocs(path.join(ROOT, "src/packs/journal/_source"));
  const automation = await readDocs(path.join(ROOT, "src/packs/automation/_source"));
  const items = await readDocs(path.join(ROOT, "src/packs/items/_source"));
  const tables = await readDocs(path.join(ROOT, "src/packs/tables/_source"));
  const scenes = await readDocs(path.join(ROOT, "src/adventure/scenes"));
  const adventure = await readJson(path.join(ROOT, "src/adventure/adventure.json"));
  return { actors, journal, automation, items, tables, scenes, adventure };
}

// Chiavi LevelDB come le scrive Foundry: !<collezione>!<id>, con gli embedded in !<coll>.<sub>!<id>.<subId>.
const EMBEDDED = {
  actors: { items: "items", effects: "effects" },
  items: { effects: "effects" },
  journal: { pages: "pages" },
  tables: { results: "results" },
};
function injectKeys(doc, collection, prefix = "", idPrefix = "") {
  const sub = [prefix, collection].filter(Boolean).join(".");
  const id = [idPrefix, doc._id].filter(Boolean).join(".");
  doc._key = `!${sub}!${id}`;
  for (const [field, coll] of Object.entries(EMBEDDED[collection] ?? {})) {
    for (const e of doc[field] ?? []) injectKeys(e, coll, sub, id);
  }
  return doc;
}

export function assembleAdventure({ actors, journal, items = [], tables = [], scenes, adventure }) {
  const clone = o => JSON.parse(JSON.stringify(o));
  return {
    ...clone({ ...adventure, itemFolder: undefined, tableFolder: undefined }),
    actors: clone(actors),
    journal: clone(journal),
    scenes: clone(scenes),
    items: clone(items).map(i => ({ ...i, folder: adventure.itemFolder ?? null })),
    tables: clone(tables).map(t => ({ ...t, folder: adventure.tableFolder ?? null })),
    macros: [], cards: [], playlists: [], combats: [],
    folder: null, sort: 0, ownership: { default: 0 }, flags: adventure.flags ?? {},
  };
}

async function writeTemp(name, docs, collection) {
  const dir = path.join(TMP, name);
  await fs.mkdir(dir, { recursive: true });
  for (const d of docs) {
    const doc = injectKeys(JSON.parse(JSON.stringify(d)), collection);
    await fs.writeFile(path.join(dir, `${d._id}.json`), JSON.stringify(doc), "utf8");
  }
  return dir;
}

async function main() {
  const manifest = await readJson(path.join(ROOT, "module.json"));
  console.log(`${manifest.id} ${manifest.version}`);
  const src = await loadSources();
  console.log(`attori: ${src.actors.length}, journal: ${src.journal.length}, oggetti: ${src.items.length}, tabelle: ${src.tables.length}, automazioni: ${src.automation.length}, scene: ${src.scenes.length}`);

  await fs.rm(OUT, { recursive: true, force: true });
  await fs.rm(TMP, { recursive: true, force: true });
  await fs.mkdir(path.join(OUT, "packs"), { recursive: true });

  const adventureDoc = assembleAdventure(src);
  const jobs = [
    ["actors", src.actors, "actors"],
    ["journal", src.journal, "journal"],
    ["automation", src.automation, "macros"],
    ["items", src.items, "items"],
    ["tables", src.tables, "tables"],
    ["adventure", [adventureDoc], "adventures"],
  ];
  for (const [name, docs, collection] of jobs) {
    const dir = await writeTemp(name, docs, collection);
    await compilePack(dir, path.join(OUT, "packs", name), { log: false });
    console.log(`pack ${name}: ${docs.length} documenti`);
  }
  await fs.rm(path.join(ROOT, "build"), { recursive: true, force: true });

  await fs.writeFile(path.join(OUT, "module.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await fs.mkdir(path.join(OUT, "scripts"), { recursive: true });
  await fs.copyFile(path.join(ROOT, "src/runtime/automation.js"), path.join(OUT, "scripts/automation.js"));
  // Ritratti dei PNG: referenziati come modules/historia-dipire/img/<file>.
  await fs.cp(path.join(ROOT, "img"), path.join(OUT, "img"), { recursive: true });
  for (const f of ["README.md", "CHANGELOG.md", "LICENSE"]) {
    try { await fs.copyFile(path.join(ROOT, f), path.join(OUT, f)); } catch { /* facoltativo */ }
  }
  console.log(`build completata in ${path.relative(ROOT, OUT)}/`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
