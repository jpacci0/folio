# Verifica della versione 0.1.0

Verifiche eseguite su Windows il 17 ottobre 2026 e su WSL il 18 ottobre 2026.

## WSL — 18 ottobre 2026

Ambiente: Ubuntu 26.04 su WSL2, Node Linux 24.19.0, pnpm 11.25.0, Electron Linux 41.10.7, Chromium Playwright 1248, WSLg disponibile.

| Controllo | Esito |
|---|---|
| Installazione pnpm con `--frozen-lockfile` | Superato, lockfile invariato |
| Compilazione TypeScript strict e build Vite | Superato |
| Test motore PDF | 4 superati |
| Test browser end-to-end Chromium Linux | 3 superati |
| Test desktop Electron sulle risorse compilate | Superato |
| Avvio normale `desktop:dev` con Vite e WSLg | Superato |
| Lettura remote `sync` dalle due copie | Superato, stesso commit iniziale |
| Integrità Git delle due copie e del repository bare | Superato |
| Regole fine riga e sintassi dello script Bash | Superato |

L'installazione Ubuntu è inizialmente priva di `libnss3`, `libnspr4` e `libasound2t64`. I test browser/desktop e l'avvio normale sono stati eseguiti con le librerie Ubuntu estratte sotto `/tmp/folio-wsl-runtime` e `LD_LIBRARY_PATH` limitato ai comandi di verifica. Non sono state installate nel sistema: per gli avvii successivi senza questo ambiente temporaneo occorre eseguire `sudo apt-get install libnss3 libnspr4 libasound2t64`. La sessione non dispone della password sudo.

Chromium richiesto dalla versione Playwright del progetto è stato scaricato nella cache Linux. L'ambiente protetto della sessione blocca le connessioni localhost; i test browser e desktop sono stati eseguiti fuori dalla sandbox della sessione. Non è stato necessario disabilitare la sandbox di Electron per l'avvio normale `desktop:dev`.

Restano avvisi non bloccanti: dimensione del bundle Vite e font standard PDF.js nei test del motore. I test non rilevano errori JavaScript del renderer. Il pacchetto Windows non è stato rigenerato durante la verifica WSL.

## Windows — 17 ottobre 2026

| Controllo | Esito |
|---|---|
| Compilazione TypeScript in modalità strict | Superato |
| Build di produzione Vite | Superato |
| Test motore PDF | 4 superati |
| Test browser end-to-end con Edge headless | 3 superati |
| Test desktop Electron, con risorse compilate | Superato |
| Test della cartella Windows distribuita | Superato |
| Ispezione visiva schermata iniziale e documento | Completata |

## Copertura significativa

- Esportazione e riapertura con verifica del testo originale, testo aggiunto, ordine e rotazione delle pagine.
- Posizionamento del testo su pagine con CropBox spostato e rotazioni originali di 0, 90, 180 e 270 gradi.
- Rifiuto dell'esportazione da fonti contrassegnate in sola lettura.
- Inserimento di testo con accenti, evidenziazione, disegno, firma, annulla/ripristina e riapertura del file scaricato.
- Ricerca, duplicazione e rimozione pagine, annullamento della rimozione e gestione di un file non valido senza perdere il documento aperto.
- Riconoscimento dei moduli interattivi e blocco delle modifiche.
- Preparazione delle sole pagine del documento per la stampa.
- Bridge Electron funzionante con Node.js non esposto al renderer.
- Dialoghi nativi simulati per aprire e salvare file reali; esportazione verificata dal disco.
- Percorso IPC della stampa verificato con callback di sistema simulato.

## Cosa non è stato collaudato

- Invio a una stampante fisica e gestione di ogni driver/formato carta.
- Corpus esteso di PDF complessi, file molto grandi e font di tutti gli alfabeti.
- Firma o validazione crittografica: non implementate.
- macOS, Linux al di fuori dell'ambiente WSL indicato sopra, dispositivi mobili e distribuzione pubblica con code signing.

Il pacchetto è una preview funzionante. Conservare gli originali, soprattutto se contengono metadati, allegati, moduli o firme digitali.
