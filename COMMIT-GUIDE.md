# One folder, individual-file commits

Extract this ZIP once. Open the inner `second-brain` folder in Antigravity (the folder containing `package.json`). All project files stay in this folder throughout. There are no nested ZIPs or stage folders.

## Run first

Use Node.js 24.x. In Antigravity's PowerShell terminal:

```powershell
node -v
Copy-Item .env.example .env
npm test
npm start
```

Open http://localhost:3000. Stop with Ctrl+C before returning to the terminal for Git commands. No `npm install` is needed.

## Start a fresh repository

Use a new extracted folder for these commands. Do not copy this package over a repository with existing commits unless you intend to update that existing project.

```powershell
git init
git status
```

All files being visible in Antigravity is fine: visibility does not stage them. A `git add` command below selects only its named files. Other files remain untracked until selected later. Do not use `git add .`, `git add -A`, `git commit -a`, or an IDE Stage All button for this workflow.

If Git asks for your identity, set your actual name and GitHub-associated email before committing. Use your own values, not placeholder text.

## What these commits mean

This is a dependency-ordered introduction of modules from one complete project, not the old 16 feature snapshots. Commits 1–5 assemble backend modules; the API server becomes runnable in commit 6. Browser modules are added in commits 7–8, and the full workspace is connected in commit 9. The extension follows, then tests and documentation.

Your extracted folder contains all source files, so it can run immediately. Earlier commits contain only the files selected so far. No automatic Git history, backdated commits, or push is included.

## Commands — one block at a time

Read each group before committing. After `git add`, `git diff --cached --stat` lists what that commit will contain. Untracked files shown by `git status` are expected until the last group.

### Commit 01 — add project configuration

```powershell
git add -- .gitignore .env.example package.json
git diff --cached --stat
git commit -m "chore: add project configuration"
```

### Commit 02 — add SQLite notes and full-text search modules

```powershell
git add -- src/db.js src/notes.js src/search.js
git diff --cached --stat
git commit -m "feat: add SQLite notes and full-text search modules"
```

### Commit 03 — add account and session authentication module

```powershell
git add -- src/auth.js
git diff --cached --stat
git commit -m "feat: add account and session authentication module"
```

### Commit 04 — add AI enrichment and semantic ranking modules

```powershell
git add -- src/ai.js src/semantic.js
git diff --cached --stat
git commit -m "feat: add AI enrichment and semantic ranking modules"
```

### Commit 05 — add sync sharing and digest service modules

```powershell
git add -- src/sync.js src/sharing.js src/digest.js
git diff --cached --stat
git commit -m "feat: add sync sharing and digest service modules"
```

### Commit 06 — connect backend services to the HTTP server

```powershell
git add -- server.js
git diff --cached --stat
git commit -m "feat: connect backend services to the HTTP server"
```

### Commit 07 — add browser utilities and local sync storage

```powershell
git add -- public/ui.js public/local.js public/sync.js
git diff --cached --stat
git commit -m "feat: add browser utilities and local sync storage"
```

### Commit 08 — add account sharing backup and digest interfaces

```powershell
git add -- public/auth.js public/sharing.js public/shared.html public/shared.js public/backup.js public/digest.js
git diff --cached --stat
git commit -m "feat: add account sharing backup and digest interfaces"
```

### Commit 09 — assemble the note workspace and offline app shell

```powershell
git add -- public/index.html public/style.css public/app.js public/sw.js
git diff --cached --stat
git commit -m "feat: assemble the note workspace and offline app shell"
```

### Commit 10 — add browser extension for webpage capture

```powershell
git add -- extension/manifest.json extension/background.js extension/options.html extension/options.js
git diff --cached --stat
git commit -m "feat: add browser extension for webpage capture"
```

### Commit 11 — cover server sync access control and AI adapters

```powershell
git add -- test/health.test.js test/integration.test.js test/ai-digest.test.js
git diff --cached --stat
git commit -m "test: cover server sync access control and AI adapters"
```

### Commit 12 — explain setup architecture and individual-file commits

```powershell
git add -- README.md COMMIT-GUIDE.md docs/ARCHITECTURE.md docs/MANUAL-CHECKS.md docs/VALIDATION.md
git diff --cached --stat
git commit -m "docs: explain setup architecture and individual-file commits"
```

## Check completion

```powershell
git status
git log --oneline
npm test
```

A fresh repository should show 12 commits and a clean working tree (runtime `.env` and `data/` are ignored). `git commit` saves locally; `git push` uploads commits after you connect your GitHub repository. One push preserves all separate commits.

If a commit fails, read the error and fix it before running the next block. Do not repeat `git init` or delete `.git` between commits. If you already committed all these files together, these commands will not split that existing commit; use this guide in a fresh extracted folder instead of rewriting your existing history blindly.
