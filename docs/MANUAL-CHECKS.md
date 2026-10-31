# Browser acceptance checks

Automated Node tests cover API and pure logic. These steps need a real browser.

1. Register; save a note with URL, tags, nested folder and collection. Reload and edit it.
2. Enter literal HTML into body/title: it must appear as text, never execute.
3. Search body text; filter a parent folder; clear all filters to see all notes.
4. Visit online twice, turn networking off, reload, explicitly open local workspace; edit and export.
5. Reconnect and click Sync now. Use two browser profiles to test a genuine conflicting edit and delete.
6. Edit a large note while sync is in flight; the newest local text must remain pending or synced, never disappear.
7. Load extension unpacked; capture selected text, then full page text. Try chrome://settings: capture should fail safely.
8. Share collection unlisted; open link signed out; verify other notes absent. Revoke and reload.
9. Export/import; verify new IDs/copies and all organization fields. Try malformed JSON and invalid fields.
10. Enable Ollama after pulling models; sync, wait for enrichment, sync again; inspect AI status.
11. Run a paraphrase semantic query. Disable Ollama: keyword filtering still works; meaning search reports unavailable.
12. Preview digest without credentials. Do not enable real delivery until your sender is verified and you intend to receive email.

Use browser DevTools > Application to inspect IndexedDB and service worker caches.
If an old worker is active after updating source files, unregister it and reload (do not erase IndexedDB).
