# Folio PDF

Un'app desktop per Windows, con interfaccia in italiano, per leggere, annotare, firmare graficamente e organizzare PDF. Versione 0.1.0: una base funzionante da sviluppare, non una sostituzione completa di Acrobat Pro.

## Per provarla

La distribuzione Windows si trova in `release`. L'app compilata non richiede Node.js, WSL, account o server. La prima schermata contiene **Prova un documento**, un PDF di esempio generato in memoria.

Per l'uso quotidiano scegli **`Folio-0.1.0-Setup-x64.exe`**: installa Folio per il tuo utente Windows, crea i collegamenti sul Desktop e nel menu Start e include la disinstallazione da Impostazioni > App. Dopo l'installazione avvia Folio dal collegamento, non rilanciare il setup. I file vengono estratti solo durante l'installazione.

**`Folio-0.1.0-Windows.exe`** resta la versione portable a file singolo: non richiede installazione ma estrae il runtime a ogni avvio, che può quindi impiegare più tempo. Entrambe le versioni sono per Windows x64 e non hanno ancora una firma con certificato di code signing.

Per sviluppare nella cartella richiesta, estrai la cartella `folio` dall'archivio dei sorgenti in `Documenti\progetti`. Il codice non dipende dal percorso di questa sessione.

## Funzioni disponibili

- Apertura da finestra nativa, file picker o trascinamento; fino a 150 MB per file.
- Rendering PDF con miniature, testo selezionabile, zoom e adattamento alla finestra.
- Ricerca nel testo del documento e nelle annotazioni testuali aggiunte.
- Testo aggiunto con dimensione e colore, modificabile fino all'esportazione.
- Evidenziazioni rettangolari e disegno a mano libera.
- Firma disegnata con mouse, penna o touch; inserimento, spostamento e ridimensionamento.
- Selezione, spostamento e rimozione delle annotazioni.
- Rotazione, duplicazione, riordino e rimozione pagine; aggiunta di un altro PDF.
- Annulla e ripristina, fino a 40 revisioni della sessione.
- Esportazione in PDF, conservando i contenuti originali vettoriali delle pagine.
- Preparazione di tutte le pagine con le annotazioni e apertura della stampa di sistema.
- Tema chiaro/scuro, scorciatoie, indicatore modifiche e avviso prima della chiusura.
- PDF con moduli o campi firma: apertura e stampa in sola lettura.

Le annotazioni esportate vengono incorporate nella pagina; alla riapertura sono parte del PDF e non oggetti Folio separatamente modificabili. La firma disegnata è tenuta solo in memoria e viene eliminata alla chiusura dell'app.

## Limiti della versione iniziale

- **Non sostituisce il testo già esistente** nel PDF. Inserisce nuovo testo; non simula modifiche nascondendo informazioni con rettangoli bianchi.
- **Non applica e non verifica firme digitali con certificati**. La firma grafica non equivale a una firma PAdES o a una firma qualificata.
- Non include OCR, redazione sicura, conversione Word, compressione avanzata, firme da immagini, compilazione moduli o collaborazione.
- I PDF con password non sono supportati. Non viene tentata la rimozione delle protezioni.
- Il controllo dei campi firma serve a limitare modifiche accidentali, non è una validazione crittografica.
- L'esportazione ricompone le pagine: allegati, segnalibri, struttura di accessibilità e metadati a livello di documento non sono preservati. Conserva sempre il file originale.
- Il testo aggiunto usa Inter Latin: italiano e alfabeti latini comuni; non tutti gli alfabeti o le emoji sono supportati.
- La stampa usa immagini delle pagine a 108 dpi. L'esportazione PDF rimane vettoriale; per stampa tipografica o formati misti preferire l'esportazione e verificare formato/scalatura nel dialogo di stampa.
- Non c'è ancora un salvataggio automatico del progetto o ripristino dopo un crash. Salva una copia del PDF prima di chiudere.
- Documenti molto grandi non sono stati collaudati. Le miniature vengono renderizzate solo quando vicine all'area visibile; la stampa prepara tutte le pagine in memoria.
- La distribuzione iniziale non è firmata con un certificato di code signing.

## Desktop o webapp?

| Aspetto | Desktop | Webapp |
|---|---|---|
| Uso quotidiano di PDF locali | Dialoghi nativi, controllo della finestra, integrazioni future col sistema | File picker e download; capacità variabili fra browser |
| Stampa | Dialogo del sistema tramite Electron | Dialogo del browser |
| Offline | Inclusi motore PDF, font e risorse | Possibile con PWA e cache, ancora da implementare |
| Privacy | Nessun server in questo progetto | Può essere altrettanto locale: il cloud non è obbligatorio |
| Distribuzione | Eseguibile e aggiornamenti da gestire | Un URL; aggiornamenti immediati |
| Collaborazione e accesso da più dispositivi | Richiedono un backend | Più naturale, ma richiede comunque un backend |
| Peso | Electron include Chromium ed è più pesante | Utilizza il browser già installato |

**Scelta iniziale: desktop, con un nucleo web riutilizzabile.** Electron semplifica stampa e dialoghi e mantiene tutto lo sviluppo in JavaScript/TypeScript. React può essere eseguito già ora in un browser locale. Se il peso diventa prioritario, possiamo valutare Tauri dopo aver collaudato rendering e stampa nei WebView. WSL non è necessario: per questa app Windows conviene testare direttamente su Windows.

## Stack e struttura

- React 19, TypeScript, Vite e CSS, senza framework UI pesante.
- PDF.js per rendering, ricerca ed estrazione del testo.
- pdf-lib e fontkit per pagine, annotazioni e font incorporati.
- Electron con preload isolato, renderer senza Node.js e sandbox attiva.
- Lucide e Inter, inclusi localmente.

```text
electron/          Main process, dialoghi file/stampa e bridge IPC
src/App.tsx        Stato della sessione e interfaccia
src/components/   Pagina, miniature e dialogo firma
src/pdf-engine.ts Coordinate, annotazioni ed esportazione
src/pdf-loader.ts Apertura PDF e modalità sola lettura
src/useHistory.ts Cronologia modifiche
src/styles.css    Temi e layout
scripts/          Avvio sviluppo e risorse locali PDF.js
tests/            Test del motore, browser e desktop
```

Le annotazioni sono memorizzate in coordinate normalizzate rispetto alla pagina originale visibile. Rotazione della vista e conversione nelle coordinate PDF sono separate; questo evita spostamenti delle firme su pagine ruotate o con CropBox non nullo.

Il processo Electron espone solo `open`, `save`, `print` e `dirty`. I messaggi IPC verificano finestra e frame di provenienza. I percorsi di apertura/salvataggio vengono scelti nei dialoghi nativi, non passati liberamente dal renderer. Navigazioni esterne, nuove finestre e richieste di permesso vengono rifiutate. Nessun contenuto dei PDF viene caricato su servizi esterni. In produzione non vengono eseguiti JavaScript o collegamenti incorporati nei PDF.

## Sviluppo

Prerequisiti: Windows oppure Linux/WSL, Node.js 22.12+ oppure 24+, npm/npx. pnpm 11.25.0 è la versione usata per il lockfile ed è fissata in `package.json`. In WSL con nvm puoi usare `nvm install` e `nvm use` dalla cartella del progetto (`.nvmrc`: Node 24).

Per requisiti Linux, avvio desktop con WSLg e scambio delle modifiche tra Windows e WSL, vedi [Sviluppo Windows/WSL](docs/WINDOWS-WSL.md). Installa le dipendenze separatamente nei due ambienti; la creazione del pacchetto `.exe` va eseguita su Windows.

```powershell
cd "$env:USERPROFILE\Documents\progetti\folio"
npx pnpm@11.25.0 install --frozen-lockfile
npx pnpm@11.25.0 desktop:dev
```

Per la sola interfaccia browser:

```powershell
npx pnpm@11.25.0 dev
```

Apri `http://127.0.0.1:5173`. Per la build:

```powershell
npx pnpm@11.25.0 build
npx pnpm@11.25.0 start
```

Per la cartella Windows portatile: `npx pnpm@11.25.0 run pack`. Usa esplicitamente `run`: `pnpm pack` è un comando di pnpm che crea un archivio npm dei sorgenti. Il risultato dello script è `release/Folio-Windows`: avvia `Folio.exe` e conserva accanto tutti gli altri file della cartella. Non richiede ulteriori strumenti di packaging. Per creare anche l'eseguibile autoestraente: `npx pnpm@11.25.0 pack:exe`; questo passaggio può scaricare gli strumenti NSIS. L'app già compilata funziona offline.

Per generare l'installer Windows, dopo `pack` esegui `npx pnpm@11.25.0 pack:installer`. Il risultato è `release/Folio-0.1.0-Setup-x64.exe`. La procedura guidata è disponibile in italiano e inglese. La disinstallazione conserva le preferenze dell'app. Pubblica il setup come allegato della Release GitHub, insieme all'eventuale portable; gli eseguibili restano esclusi dalla cronologia Git.

## Verifica

```powershell
npx pnpm@11.25.0 test
npx pnpm@11.25.0 exec playwright install chromium
npx pnpm@11.25.0 test:ui
npx pnpm@11.25.0 build
npx pnpm@11.25.0 test:desktop
```

In alternativa, per usare Edge nei test browser:

```powershell
$env:PLAYWRIGHT_BROWSER_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npx pnpm@11.25.0 test:ui
```

Il test desktop intercetta i dialoghi di apertura/salvataggio, salva e riapre un vero PDF in `test-results` e simula il callback della stampa: non invia fogli alla stampante. Il test browser stampa nel DOM e verifica che vengano preparate solo le pagine del documento.

## Scorciatoie

| Comando | Tasti |
|---|---|
| Apri PDF | Ctrl+O |
| Salva copia | Ctrl+S |
| Stampa | Ctrl+P |
| Cerca | Ctrl+F |
| Annulla | Ctrl+Z |
| Ripristina | Ctrl+Shift+Z / Ctrl+Y |
| Elimina annotazione selezionata | Canc |
| Torna a selezione | Esc |

## Prossimi passi consigliati

1. Decidere se per “modificare” è essenziale cambiare il testo originale o se annotazioni e compilazione coprono l'uso principale.
2. Aggiungere compilazione AcroForm e formato progetto con salvataggio automatico.
3. Scegliere un motore per il vero editing del contenuto: valutare SDK commerciale contro costo e complessità di un motore open source; esaminare le relative licenze prima di distribuire.
4. Aggiungere OCR, associazione dei file `.pdf`, trascinamento per riordino e aggiornamenti firmati.
5. Valutare PAdES separatamente: certificati, provider, verifica delle firme e conservazione del documento firmato.

Riferimenti tecnici: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Electron printing](https://www.electronjs.org/docs/latest/api/web-contents#contentsprintoptions-callback), [PDF.js](https://mozilla.github.io/pdf.js/), [pdf-lib e limitazioni](https://github.com/Hopding/pdf-lib#limitations).
