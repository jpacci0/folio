# Sviluppo in WSL e build su Windows

Le due copie di lavoro sono separate:

- Windows: `C:\Users\Jacopo\Documents\Codex\2026-10-17\new-chat\folio`.
- WSL: `/home/jacopo/projects/folio` (`~/projects/folio`).

Il repository Git bare `folio-sync.git`, accanto alla cartella Windows `folio`, è il punto di scambio locale: non contiene una cartella di lavoro e non serve GitHub per usarlo. Entrambe le copie usano il remote `sync`: su Windows punta a `../folio-sync.git`, su WSL a `/mnt/c/Users/Jacopo/Documents/Codex/2026-10-17/new-chat/folio-sync.git`.

## Preparazione WSL

La copia Linux è già stata creata. Lo script seguente serve soltanto per creare una nuova copia in una destinazione che non esiste:

La destinazione Linux è `~/projects/folio`. Per crearla, esegui nel terminale WSL:

```bash
bash /mnt/c/Users/Jacopo/Documents/Codex/2026-10-17/new-chat/folio/scripts/setup-wsl.sh
```

Lo script non sovrascrive cartelle esistenti. Popola il repository di scambio se vuoto, clona i sorgenti e installa le dipendenze Linux se trova Node Linux e npx. Non copia `node_modules`, build Windows o cache. È possibile passare una destinazione diversa come primo argomento.

Usa Node Linux, non `node.exe` di Windows. Con nvm:

```bash
cd ~/projects/folio
nvm install
nvm use
npx --yes pnpm@11.25.0 install --frozen-lockfile
```

Non serve installare pnpm globalmente: i comandi `npx pnpm@11.25.0 ...` usano la versione del lockfile. `npm run ...` può eseguire gli script con le dipendenze già installate; per installarle e aggiornarle usa pnpm, evitando un secondo lockfile npm.

Electron e Chromium richiedono librerie di sistema Linux. In questa installazione Ubuntu 26.04 mancano inizialmente questi pacchetti:

```bash
sudo apt-get install libnss3 libnspr4 libasound2t64
```

Se un pacchetto non viene trovato, aggiorna prima gli indici con `sudo apt-get update`. Per altre distribuzioni controlla le dipendenze mancanti con `ldd "$(node -p 'require("electron")')"`. WSLg deve essere disponibile per la finestra desktop (`DISPLAY` o `WAYLAND_DISPLAY` impostati).

```bash
# Browser con aggiornamento automatico del codice
npx pnpm@11.25.0 dev
# Apri http://127.0.0.1:5173 nel browser Windows

# Oppure finestra Electron Linux tramite WSLg
npx pnpm@11.25.0 desktop:dev
```

Per verificare anche la versione compilata Linux: `npx pnpm@11.25.0 build`, poi `npx pnpm@11.25.0 start`. `pack` e `pack:exe` richiedono il runtime Electron Windows e vanno eseguiti nella copia Windows.

## Controlli in WSL

```bash
npx pnpm@11.25.0 test
npx pnpm@11.25.0 exec playwright install chromium
npx pnpm@11.25.0 test:ui
npx pnpm@11.25.0 build
npx pnpm@11.25.0 test:desktop
```

Per installare tutte le dipendenze di sistema richieste da Playwright su una nuova macchina puoi usare `npx pnpm@11.25.0 exec playwright install-deps chromium` (richiede sudo). I test desktop non inviano documenti a una stampante fisica.

## Uso quotidiano

In WSL:

```bash
cd ~/projects/folio
git pull --ff-only sync main
npx pnpm@11.25.0 install --frozen-lockfile
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
npx pnpm@11.25.0 run pack
```

Per modifiche fatte su Windows, esegui commit e push da Windows, poi pull in WSL. Il trasferimento è esplicito: Git non sincronizza automaticamente modifiche non committate. `--ff-only` evita merge inattesi; se le due copie divergono, fermati e risolvi il conflitto prima di proseguire.

Esegui `git status --short --branch` prima di un pull. Se ci sono modifiche locali, salvale prima in un commit oppure usa consapevolmente uno stash. Non condividere `node_modules` tra i due ambienti: Electron, esbuild e altri pacchetti contengono eseguibili diversi. Le regole `.gitattributes` mantengono gli script Linux con fine riga LF e i file `.cmd` con CRLF; build, dipendenze e risultati dei test sono esclusi da Git.

Per controllare il collegamento dalla copia corrente:

```bash
git remote -v
git fetch sync
git rev-list --left-right --count HEAD...sync/main
```

`0 0` indica che i commit locali coincidono con il repository di scambio. Le modifiche non committate vanno controllate separatamente con `git status`.

Configura il tuo nome e la tua email Git nei due ambienti prima dei tuoi commit, se non sono già configurati. Il commit iniziale preparato dall'assistente è attribuito a `Codex <codex@localhost>`, senza cambiare la configurazione globale.

## Spostamento e GitHub

Se sposti la copia Windows, mantieni `folio` e `folio-sync.git` nella stessa cartella padre. Aggiorna nella copia Linux l'URL di `sync` al nuovo percorso `/mnt/c/.../folio-sync.git`. Non eliminare il repository condiviso se contiene commit non ancora scaricati dalle copie.

Per sincronizzare anche computer diversi, puoi aggiungere un repository GitHub come remote `origin` a entrambe le copie. Il remote locale `sync` rimane separato. Nessun repository GitHub è stato creato o pubblicato durante questa preparazione.
