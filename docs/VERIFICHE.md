# Verifica della versione 0.1.0

Verifiche eseguite su Windows, il 17 ottobre 2026.

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
- macOS, Linux, dispositivi mobili e distribuzione pubblica con code signing.

Il pacchetto è una preview funzionante. Conservare gli originali, soprattutto se contengono metadati, allegati, moduli o firme digitali.
