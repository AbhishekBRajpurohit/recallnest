# Second Brain — single project folder

Requires **Node.js 24.x**. No npm dependencies or database installation required.

```powershell
Copy-Item .env.example .env
npm start
```

Open **http://localhost:3000** (use this same origin consistently).
Run `npm test` in another terminal. Stop the server with Ctrl+C when finished.

This is an educational full-stack implementation, using native Node.js HTTP, vanilla JavaScript, SQLite, and IndexedDB. It is not a MERN implementation. SQLite FTS5 replaces the originally suggested Postgres/Meilisearch to keep local setup small. See COMMIT-GUIDE.md for exact filename-based commit commands.

Only source files are included. Never commit `.env`, runtime `data/`, or account data. This ZIP contains one complete project, without `.git`. You can keep all files visible and commit selected modules in the order in COMMIT-GUIDE.md. No copying between snapshots is required.

Data persists in `data/brain.sqlite`. The server binds to localhost by default; account endpoints protect private notes.

Folders use nested paths, e.g. `College/OS/Unit 2`. Collections group notes independently of the folder. Empty folders/collections are not stored as separate entities.

Accounts isolate user data. For compatibility with the earlier prototype, the first registered account adopts any existing owner-zero notes. Subsequent accounts start empty. Passwords use salted scrypt; sessions use HttpOnly cookies and expire after seven days.

Editing saves to IndexedDB first. Sync reconciles local and server changes; do not clear browser site data before exporting or syncing. Browser text filtering works offline; the server FTS API remains available.

Sync uses server versions and persistent mutation IDs. Stale edits create conflict copies; stale deletes preserve the current server note. Retries are idempotent. Tombstones and mutation receipts are retained (no pruning in this educational version). Sync downloads all account notes, so this implementation targets small personal libraries, not millions of records.

Caches only the app shell (never account APIs or public shares). Visit once online and reload before testing offline. A previously signed-in user can explicitly open the cached local workspace if the session/server is unavailable. This does not authenticate with the server. IndexedDB is not encrypted: do not use on a shared device. Signing out hides but does not erase local notes; clear browser site data only after syncing/exporting.

## Browser extension

Open `chrome://extensions` → Developer mode → Load unpacked → select `extension/`. Pin the action. Click on an ordinary HTTP(S) webpage to save selected text or the first 12,000 characters of visible page text. A workspace tab opens and saves the capture after sign-in/local unlock. Restricted pages (browser settings, web store) cannot be captured. Configure your app origin in extension options. The payload uses a URL fragment and is removed after saving; no API secret or all-sites permission is needed. Captures are text snapshots, not a complete webpage archive. Repeated clicks intentionally create separate notes.

Sharing is a bearer read-only link: anyone who has it can read the collection. Optional public listing makes it discoverable. Only the owner can edit/revoke; no collaborator editing is implemented. Public links need a reachable hosted app; localhost links work only on your computer. Revocation stops future access, not copies already downloaded.

Exports portable note content from this browser, including unsynced changes. Import creates new IDs and does not overwrite existing notes. Import is capped at 500 notes/10 MB. Export excludes passwords, sessions, AI vectors, sharing tokens, and deleted notes; it is a content backup, not a full server disaster-recovery backup.

## Optional local AI

Install Ollama, then run `ollama pull llama3.2:3b` and `ollama pull nomic-embed-text`. Set `AI_ENABLED=true` in `.env` and restart Node. The background worker enriches one synced note at a time with a summary, suggested tags, and a real model embedding. Click Sync now after processing to pull AI results. Failures retry after five minutes and are shown under AI status. Captures and ordinary new/edited notes use the same queue.

The local app still works without Ollama; there is no fake semantic fallback. Model downloads require internet, disk space, and suitable hardware. Once downloaded, local inference can run offline while the local Node/Ollama services are running. The configured Ollama endpoint receives note text. AI suggestions can be incorrect. Text is truncated to 12,000 characters for inference. Editing a note schedules reprocessing; AI uses an optimistic version check so it cannot overwrite a concurrent edit. Changing embedding models requires editing/resaving notes to rebuild their embeddings.

Semantic search uses real Ollama embeddings and exact cosine similarity across the current user’s indexed notes. It is a linear scan, not an ANN/vector database. Scores are similarities, not confidence percentages. Keyword filtering works offline in the browser; semantic search needs the Node and Ollama services. Only embeddings for the current model and current note version participate. Semantic search covers the whole workspace, independent of folder/tag filters.

## Weekly email

Set `RESEND_API_KEY` and `EMAIL_FROM` to your own Resend key and verified sender. In the app, preview the digest, then explicitly enable it. First delivery is due seven days later; the running server checks every minute. If it was offline, it sends when it restarts (content covers the last seven days). Digests combine saved summaries and connections based on shared tags; they do not invent AI relationships. The recipient is the signed-in account email. Preview never sends anything.

Deliveries persist their payload and reuse an idempotency key for retries. Ambiguous failures stop for operator review after the bounded retry window. Check the provider logs before resetting a failed delivery. Only one Node process should run against this database. This demo has no email ownership verification; add it before public signup/email deployment. No external emails were sent while preparing this project.

## Final verification and scope

Run `npm test`. Read `docs/ARCHITECTURE.md` for decisions and limits, and `docs/MANUAL-CHECKS.md` for browser/extension acceptance checks. Node 24's built-in SQLite may print an experimental warning; the project deliberately pins the supported major version.

The code has no external npm dependencies, so there is no package lock to install. `npm start` and `npm test` work directly. Use Node 24.x rather than an older Node version. Keep `.env` and `data/` private. Run only one Node process against the database.
