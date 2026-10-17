# Sviluppo in WSL e build su Windows

La copia Windows è il repository `folio` di questa sessione. Il repository Git bare `folio-sync.git`, accanto alla cartella `folio`, è il punto di scambio locale: non contiene una cartella di lavoro e non serve GitHub per usarlo.

La destinazione Linux è `~/projects/folio`. Per crearla, esegui nel terminale WSL:

```bash
bash /mnt/c/Users/Jacopo/Documents/Codex/2026-10-17/new-chat/folio/scripts/setup-wsl.sh
```

Lo script non sovrascrive cartelle esistenti. Popola il repository di scambio se vuoto, clona i sorgenti e installa le dipendenze Linux se trova Node Linux e npx. Non copia `node_modules`, build Windows o cache. La copia in WSL non è stata eseguita dalla sessione Codex, perché il servizio WSL ha restituito `Wsl/E_ACCESSDENIED`. Anche il trasporto Git della sessione è bloccato all'avvio della shell: il repository di scambio è inizializzato ma verrà popolato dallo script in WSL. Il primo commit dei sorgenti Windows è già stato creato.

## Uso quotidiano

In WSL:

```bash
cd ~/projects/folio
git pull --ff-only sync main
npx pnpm@11.25.0 dev
```

Prima di passare a Windows, salva le modifiche con Git:

```bash
git add .
git commit -m "Descrizione delle modifiche"
git push sync main
```

Nella copia Windows, da PowerShell:

```powershell
cd C:\Users\Jacopo\Documents\Codex\2026-10-17\new-chat\folio
git pull --ff-only sync main
npx pnpm@11.25.0 install --frozen-lockfile
npx pnpm@11.25.0 pack
```

Per modifiche fatte su Windows, esegui commit e push da Windows, poi pull in WSL. Il trasferimento è esplicito: Git non sincronizza automaticamente modifiche non committate. `--ff-only` evita merge inattesi; se le due copie divergono, fermati e risolvi il conflitto prima di proseguire.

Configura il tuo nome e la tua email Git nei due ambienti prima dei tuoi commit, se non sono già configurati. Il commit iniziale preparato dall'assistente è attribuito a `Codex <codex@localhost>`, senza cambiare la configurazione globale.

## Spostamento e GitHub

Se sposti la copia Windows, mantieni `folio` e `folio-sync.git` nella stessa cartella padre. Aggiorna nella copia Linux l'URL di `sync` al nuovo percorso `/mnt/c/.../folio-sync.git`. Non eliminare il repository condiviso se contiene commit non ancora scaricati dalle copie.

Per sincronizzare anche computer diversi, puoi aggiungere un repository GitHub come remote `origin` a entrambe le copie. Il remote locale `sync` rimane separato. Nessun repository GitHub è stato creato o pubblicato durante questa preparazione.
