# Di Pire, Artigli e Zanne - Modulo per Foundry VTT

One shot a tema **folk horror**, perfetta per la serata di Halloween, ambientata nell’oscura cornice rinascimentale di **Historia** (sistema D&D 5e, regole 2014).

> I vostri personaggi giungeranno nel nebbioso e isolato villaggio montano di Brunascio, un luogo soffocato dal terrore dell’Inquisizione. Al centro della piazza svetta ancora il palo di una pira con il teschio bruciacchiato della vecchia erborista Cerere, arsa viva per eresia. Mentre la spietata inquisitrice Arianna “La Cercatora” stringe la sua morsa sul paese, tra i picchi innevati si vocifera che il nobile lupo Enrico De Fredier stia radunando i suoi fedeli per un oscuro e solenne rituale di mezzanotte. Il sovrintendente del villaggio vi ingaggerà per scoprire la verità e impedire che la situazione degeneri in un massacro.

L’avventura è in cinque atti, convertita in un modulo per Foundry VTT. Il testo originale è in [dipire.md](dipire.md).

- **Foundry VTT** 14 o superiore (verificato su 14.369)
- **Sistema** dnd5e 6.0.6 o superiore (verificato su 6.0.6); contenuti per le regole 2014
- **Richiede** il modulo [Historia (Italiano)](https://github.com/digennarot/historia-it) 1.0.43 o superiore: specie, fazioni e regole sono presi da lì.

## Contenuto

| Compendio | Contenuto |
|---|---|
| **Di Pire - Avventura** | Documento Adventure: con "Importa" crea nel mondo le cartelle, i 5 journal, i 6 attori e le 7 scene segnaposto. |
| **Di Pire - PNG** | Attori dnd5e: Iginius, Arianna la Cercatora, Enrico De Fredier, Yrmengard da Nochemburgo, Miliziano della Croce d'Ossa, Guardia del branco De Fredier. |
| **Di Pire - Journal** | Guida del GM (sinossi, bivi e finali, conseguenze, punti a discrezione, discrepanze, crediti), Atti I-V con la Sequenza di infiltrazione, Luoghi, PNG (con una pagina-ritratto per ciascuno, da mostrare ai giocatori), Ambientazione. |
| **Di Pire - Automazioni** | Macro **Strumenti del GM** per prove di gruppo e individuali, Sequenza, conseguenze, danni iniziali e tracciamento dei finali. |

Le scene non hanno mappe: quelle già presenti mantengono i token esistenti; Casa di Iginius, Osteria e stanze private di Enrico hanno scene vuote collegate alle rispettive pagine. Nessuna mappa o token nuovo è stato aggiunto.

Le automazioni si limitano alle regole esplicite dell'avventura. La macro chiede conferma prima di modificare i PF e registra la reputazione come indicatore narrativo, senza convertirla in Fama o assegnare valuta nel sistema. CD, abilità, PF, danni o conseguenze non specificati restano decisioni del GM.

## Installazione

### Da manifesto

1. In Foundry, tab **Moduli Add-on**, **Installa Modulo**.
2. Incolla nel campo **URL Manifesto**:
   ```
   https://github.com/digennarot/historia-dipire/releases/latest/download/module.json
   ```
3. Installa anche **Historia (Italiano)** (manifesto `https://raw.githubusercontent.com/digennarot/historia-it-dist/main/module.json`) se non è già presente.
4. Nel mondo dnd5e attiva entrambi i moduli e importa **Di Pire - Avventura**. Per usare le automazioni, importa la macro **Strumenti del GM** dal compendio **Di Pire - Automazioni** e avviala come GM.

### Manuale

Scarica `historia-dipire.zip` dall'ultima release ed estrailo in `Data/modules/historia-dipire`, oppure compila dai sorgenti (sotto) e copia la cartella `historia-dipire/` in `Data/modules/`.

## Build e sviluppo

```bash
npm install
npm run validate   # controlli statici su id, link @UUID, enricher, scene (vedi opzioni in scripts/validate.mjs)
npm run build      # compila i pack in historia-dipire/
```

Sorgenti:

- `src/packs/actors/_source/*.json` - attori (pack `actors`)
- `src/packs/journal/_source/*.json` - journal (pack `journal`)
- `src/packs/automation/_source/*.json` - macro GM (pack `automation`)
- `src/runtime/automation.js` - API usata dalla macro
- `src/adventure/adventure.json` - metadati e cartelle del documento Adventure
- `src/adventure/scenes/*.json` - scene incluse nell'Adventure

Il documento Adventure viene **assemblato alla build** dagli stessi attori e journal dei pack separati più le scene: non ci sono copie da tenere allineate. Il compendio delle automazioni è separato.

Per riportare nei sorgenti modifiche fatte in Foundry (sui pack sbloccati, non sui documenti importati nel mondo):

```bash
node scripts/extract.mjs <percorso>/Data/modules/historia-dipire
```

Validazione completa, con verifica dei link e delle immagini verso Historia e delle icone core:

```bash
node scripts/validate.mjs --historia <clone di historia-it> --foundry "C:/Program Files/Foundry Virtual Tabletop/resources/app"
```

## Release

Il workflow `.github/workflows/release.yml` si attiva al push di un tag `v*`: valida, compila, crea lo zip e pubblica la release con `module.json` e `historia-dipire.zip`.

1. Aggiorna `version` in `module.json` e `package.json` (il tag deve coincidere).
2. Aggiorna `CHANGELOG.md`.
3. `git tag v<versione> && git push origin v<versione>`

## Crediti

- Avventura e conversione: Tiziano Di Gennaro.
- **Historia** è un'ambientazione di Mana Project Studio. Il modulo non ridistribuisce testo né immagini del manuale: rimanda ai compendi di *Historia (Italiano)*. I ritratti dei PNG sono inclusi nel modulo (`img/`): ritratto intero per schede e journal, ritaglio sulla testa per i token (`img/tokens/`).
- Icone di oggetti e privilegi: libreria di icone inclusa in Foundry VTT.
