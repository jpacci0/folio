# Verifica JFolio 0.3.0 - stato prima della pubblicazione

26 ottobre 2026.

## Completato

- Compilazione TypeScript strict e build Vite superate.
- 11 test automatici del motore PDF, dei moduli e della persistenza firme superati.
- Test aggiuntivo sul PDF locale indicato dall’utente superato. Il documento non è incluso nel repository.
- Verifica indipendente con pypdf e Poppler: 8 pagine e 126 widget conservati; 78 campi canonici dopo il recupero di un widget orfano; nessun orfano residuo.
- Valori testo, radio e menu coerenti tra campo canonico, widget e appearance. Opzioni e flag conservati. 124 appearance invariate.
- Rendering delle pagine modificate verificato: testo e selezioni posizionati correttamente.
- Aggiunti test UI e test dell’app installata per compilazione, annulla/ripristina, campi ripetuti, rotazioni, stampa e salvataggio dopo riavvio.

## Da completare sul runner Windows

- Esecuzione dei test UI: in questa sessione l’avvio è bloccato dalla connessione loopback dell’ambiente. Nessun test UI è dichiarato superato.
- Generazione installer e portable e test dell’app realmente installata.
- Pubblicazione della release soltanto dopo il superamento di tutti i controlli previsti nel workflow.

## Limiti funzionali

JavaScript incorporato (calcoli, convalide e formattazioni) non eseguito; avviso presente. XFA e campi firma digitale in sola lettura. Nei moduli sono disattivate le operazioni che cambiano la struttura delle pagine; compilazione, annotazioni, firma grafica, rotazione, salvataggio e stampa sono previste.
