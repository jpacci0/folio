# Verifica JFolio 0.3.0

Verificata il 26 ottobre 2026. Codice distribuito: `e021ec327a9ad95c5ddebc20bf37f12fe6a1aec2`.

[Workflow Windows completato](https://github.com/jpacci0/folio/actions/runs/40413480168) · [Release](https://github.com/jpacci0/folio/releases/tag/v0.3.0)

## Risultati

- Compilazione TypeScript strict e build Vite superate.
- 11 test automatici del motore PDF, dei moduli e delle firme superati.
- 7 test UI superati: editing, firme, layout, compilazione dei controlli standard, annulla/ripristina, campi ripetuti, rotazioni, stampa e riapertura.
- Installer NSIS e portable generati su Windows x64, con verifica del nome prodotto e dell’icona incorporata.
- App installata verificata: apertura e salvataggio tramite dialoghi Windows, stampa simulata, persistenza delle firme e loro eliminazione dopo riavvii completi.
- Moduli nell’app installata verificati: testo su più pagine, checkbox, radio con opzioni duplicate, menu con valori esportati diversi dalle etichette, segnalazione modifiche, stampa aggiornata anche prima del salvataggio e riapertura con campi ancora compilabili.
- Avvio fino all’interfaccia pronta: 911 ms sul runner Windows; non è una misura del PC dell’utente.
- Installer, portable e checksum SHA256 presenti nella release pubblica. Il tag corrisponde al codice verificato.

## Controllo locale del documento di regressione

Il PDF indicato dall’utente è rimasto sul PC. Il test locale ha conservato 8 pagine e 126 widget, recuperando un campo orfano per un totale di 78 campi canonici. La verifica indipendente con pypdf e Poppler conferma valori coerenti, opzioni e flag conservati, nessun orfano e 124 appearance invariate. Rendering delle pagine modificate verificato, senza spostamenti o testo tagliato.

I test che richiedono un PDF personale sono opzionali e non vengono eseguiti nel runner pubblico; i test automatici pubblici usano solo documenti sintetici. Nessun file personale è incluso negli artefatti pubblicati.

## Ambito e limiti

Il supporto verificato copre testo, multilinea, comb, checkbox, radio, menu a scelta singola ed elenchi multiselezione. I menu Combo multiselezione e i menu con testo libero ed etichette separate dai valori non rientrano nella compatibilità verificata di questa versione.

JavaScript incorporato (calcoli, convalide e formattazioni) non viene eseguito; l’app mostra un avviso. XFA e campi firma digitale restano in sola lettura. Nei moduli sono disattivate le operazioni che cambiano la struttura delle pagine; compilazione, annotazioni, firma grafica, rotazione, salvataggio e stampa restano disponibili. La stampa dei test è simulata, senza inviare fogli a una stampante.

