# JFolio 0.3.0

JFolio ora compila i moduli PDF standard (AcroForm) direttamente sulla pagina.

- Testo, campi multilinea e a caselle, checkbox, radio, menu ed elenchi.
- Valori condivisi fra i campi ripetuti, annulla/ripristina, zoom e rotazione.
- Salva copia conserva i campi interattivi, le selezioni e le loro apparenze; puoi riaprire e continuare a compilare.
- Annotazioni e firma grafica sono utilizzabili anche sui moduli.
- Recupero dei widget scollegati quando il collegamento è univoco; gestione dei radio con valori di esportazione duplicati e dei menu con etichette diverse dai valori salvati.

Scarica **JFolio-0.3.0-Setup-x64.exe**, chiudi JFolio e installa l’aggiornamento. Avvia l’app dal menu Start o dal Desktop. La firma salvata resta sul dispositivo. Il file **JFolio-0.3.0-Windows.exe** è l’alternativa portable a file singolo.

I calcoli, le convalide e le formattazioni JavaScript del PDF non vengono eseguiti: JFolio mostra un avviso e i campi calcolati mantengono il valore originale. I moduli XFA e i PDF con campi firma digitale restano in sola lettura. Per conservare la struttura dei moduli, unione, duplicazione, riordino e rimozione pagine sono disattivati in questi documenti.

Le firme sono grafiche, senza certificati digitali. Gli eseguibili non sono ancora firmati con un certificato di code signing. I PDF personali restano sul PC e non sono inclusi nel repository o nei test pubblici.
