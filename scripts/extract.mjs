// Riporta nei sorgenti le modifiche fatte in Foundry: estrae i pack compilati di un modulo installato
// e li scrive in src/ nello stesso formato del generatore.
//   node scripts/extract.mjs <cartella del modulo installato, es. .../Data/modules/historia-dipire>
// - pack actors   -> src/packs/actors/_source
// - pack journal  -> src/packs/journal/_source
// - pack automation -> src/packs/automation/_source
// - pack adventure -> src/adventure/adventure.json (metadati e cartelle) e src/adventure/scenes/*.json
//   (attori e journal dell'Adventure vengono scartati: alla build si riassemblano dai pack separati).
// Attenzione: i pack vanno sbloccati e modificati in Foundry; i documenti importati nel mondo non sono letti.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPack } from "@foundryvtt/foundryvtt-cli/lib/package.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MODULE_DIR = process.argv[2];
if (!MODULE_DIR) { console.error("uso: node scripts/extract.mjs <cartella del modulo installato>"); process.exit(1); }

const safeName = n => n.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
const strip = doc => { delete doc._key; return doc; };
const stripKeysDeep = obj => {
  if (Array.isArray(obj)) obj.forEach(stripKeysDeep);
  else if (obj && typeof obj === "object") { delete obj._key; Object.values(obj).forEach(stripKeysDeep); }
  return obj;
};

async function extractTo(packName, destDir, transform = d => d) {
  const tmp = path.join(ROOT, "build", "extract", packName);
  await fs.rm(tmp, { recursive: true, force: true });
  await extractPack(path.join(MODULE_DIR, "packs", packName), tmp, { log: false });
  await fs.rm(destDir, { recursive: true, force: true });
  await fs.mkdir(destDir, { recursive: true });
  let n = 0;
  for (const f of (await fs.readdir(tmp)).filter(f => f.endsWith(".json"))) {
    const doc = stripKeysDeep(JSON.parse(await fs.readFile(path.join(tmp, f), "utf8")));
    const out = transform(doc);
    if (!out) continue;
    await fs.writeFile(path.join(destDir, `${safeName(out.name)}_${out._id}.json`), JSON.stringify(out, null, 2) + "\n", "utf8");
    n++;
  }
  console.log(`${packName}: ${n} documenti -> ${path.relative(ROOT, destDir)}`);
}

await extractTo("actors", path.join(ROOT, "src/packs/actors/_source"), strip);
await extractTo("journal", path.join(ROOT, "src/packs/journal/_source"), strip);
await extractTo("automation", path.join(ROOT, "src/packs/automation/_source"), strip);

// Adventure: scene in file separati, metadati senza attori/journal.
const tmp = path.join(ROOT, "build", "extract", "adventure");
await fs.rm(tmp, { recursive: true, force: true });
await extractPack(path.join(MODULE_DIR, "packs", "adventure"), tmp, { log: false });
const files = (await fs.readdir(tmp)).filter(f => f.endsWith(".json"));
if (files.length !== 1) { console.error(`atteso un solo documento Adventure, trovati ${files.length}`); process.exit(1); }
const adv = stripKeysDeep(JSON.parse(await fs.readFile(path.join(tmp, files[0]), "utf8")));
const scenesDir = path.join(ROOT, "src/adventure/scenes");
await fs.rm(scenesDir, { recursive: true, force: true });
await fs.mkdir(scenesDir, { recursive: true });
for (const s of adv.scenes ?? []) await fs.writeFile(path.join(scenesDir, `${safeName(s.name)}_${s._id}.json`), JSON.stringify(s, null, 2) + "\n", "utf8");
const meta = { _id: adv._id, name: adv.name, img: adv.img, caption: adv.caption, description: adv.description, folders: adv.folders ?? [], flags: adv.flags ?? {}, _stats: adv._stats };
await fs.writeFile(path.join(ROOT, "src/adventure/adventure.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
console.log(`adventure: ${adv.scenes?.length ?? 0} scene -> src/adventure/`);
await fs.rm(path.join(ROOT, "build"), { recursive: true, force: true });
