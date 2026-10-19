# JFolio 0.2.0

Folio diventa **JFolio**, con una nuova icona nell’app, nell’eseguibile e nei collegamenti Windows.

- La firma disegnata resta salvata sul dispositivo dopo la chiusura.
- Puoi importare una firma da un’immagine PNG o JPG, sostituirla ed eliminarla.
- Le firme mantengono proporzioni e trasparenza nell’anteprima e nel PDF esportato.
- Sistemato lo scroll superfluo della schermata iniziale.

**Download consigliato:** `JFolio-0.2.0-Setup-x64.exe`. Installalo e avvia JFolio dal menu Start: non serve scaricare i sorgenti, Node.js o WSL.

`JFolio-0.2.0-Windows.exe` è la versione portable: l’estrazione a ogni avvio può renderla più lenta.

La firma resta locale all’utente Windows (condivisa tra installer e portable); non viene inviata online né inclusa nel codice del progetto. Per rimuoverla usa **Firma → Elimina firma salvata**. Le firme già inserite nei PDF restano nei documenti.

Le firme sono grafiche, senza certificati digitali. Gli eseguibili Windows non sono ancora firmati con un certificato di code signing.
