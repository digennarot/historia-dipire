# Changelog

## 2.1.0

- Mappe per le tre scene (`img/maps/`, 24 × 16 quadretti): Piazza della Pira, Accampamento dell’Inquisizione, Vetta del Rituale. Disegnate per il modulo con texture CC0 di Poly Haven; il generatore è in `tools/maps/`.
- Muri e porte già tracciati in tutte le scene: case con porte chiuse a chiave, palizzata con cancello e breccia segreta, tende a vista limitata, sbarre del carro-gabbia, pietre ritte, bordo del dirupo, speroni della cengia. Miniature delle scene.
- Corretto lo sfasamento fra sfondo e oggetti delle scene: il `padding` è ora 0, così luci, note e token cadono dove indicato dal journal 05. Spostati il carro-gabbia (accanto al cancello), la finestra di Iginius e i due cultisti del furto notturno (sulla mulattiera).
- Illustrazioni in pubblico dominio (Friedrich, Segantini, Goya, da Wikimedia Commons) all’inizio dei journal 00-04.
- Journal 05 aggiornato, con la nuova pagina *Mappe alternative e crediti*: crediti e link a mappe di terzi scaricabili gratis per uso personale.

## 2.0.0

Riscrittura dell’avventura secondo la nuova struttura in cinque journal. **Non compatibile** con i documenti importati dalla 1.x: reimportate l’Adventure in un mondo pulito.

- Nuova trama: il Patto della Neve, la Fame Bianca, il segreto di Arianna («Piccola Neve»), la denuncia di Iginius, il rito sulla Corona dei Lupi e quattro finali (La Croce, Il Branco, Il Patto della Neve, La Fame), con l’orologio della Fame Bianca.
- Journal 00-04 e 05 (allestimento delle scene: illuminazione, suoni, muri e linea di vista); journal PNG riscritto con stat block riassunti. Rimossi Guida del GM, Atti, Luoghi e Ambientazione.
- Tre scene al posto delle sette segnaposto: Piazza della Pira, Accampamento dell’Inquisizione, Vetta del Rituale, con oscurità, meteo, luci animate, token e note.
- Nuovi compendi **Di Pire - Oggetti** (Teschio di Cerere, Mandato dell’Inquisizione, Simbolo Sacrificale) e **Di Pire - Tabelle** (Dicerie, Effetti orrifici).
- Attori: Guardia dell’Inquisizione con l’Archibugio di Historia, Cultista della Montagna (ex Guardia del branco), Sciame di Corvi della Fame (nuovo), Iginius con statistiche, Arianna con la Pistola di Historia, Enrico con *Ululato della Corona*.
- Strumenti del GM aggiornati: tappe della salita, Scala dei Corvi, Canto della Catena, orologio della Fame Bianca, tabelle, quattro finali.

## 1.1.1

- Nuova presentazione dell’avventura (one shot folk horror per Halloween) nel documento Avventura, nel manifesto e nel README.

## 1.1.0

- Compatibilità dichiarata con Foundry VTT 14 e dnd5e 6.0.6; regole D&D 5e 2014.
- Aggiunto il compendio **Di Pire - Automazioni** con strumenti GM per prove, Sequenza, conseguenze e finali.
- Aggiunte scene segnaposto senza mappe per Casa di Iginius, Osteria e stanze private di Enrico.
- Ritratti propri per tutti i PNG (`img/`): ritratto intero per la scheda, ritaglio sulla testa (`img/tokens/`) con anello dinamico per i token. Miliziano e Guardia condividono lo stesso ritratto.
- Journal PNG: una pagina-immagine con il ritratto dopo ogni scheda, da mostrare ai giocatori senza rivelare le note del GM.
- Valori mancanti o discordanti restano da verificare o decidere dal GM.

## 1.0.0

Prima versione.

- Compendio **Avventura** (`Di Pire - Avventura`): importazione con un clic di cartelle, 5 journal, 6 attori e 4 scene segnaposto.
- Compendio **PNG** (`Di Pire - PNG`): Iginius, Arianna la Cercatora, Enrico De Fredier, Yrmengard da Nochemburgo, Miliziano della Croce d'Ossa, Guardia del branco De Fredier.
- Compendio **Journal** (`Di Pire - Journal`): Guida del GM, Atti, Luoghi, PNG, Ambientazione.
- Dipendenza obbligatoria da `historia-it` (specie, fazioni, regole, ritratti).
