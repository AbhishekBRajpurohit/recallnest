# Design and boundaries

Browser editor -> IndexedDB (source of local edits) -> versioned sync -> SQLite.
The extension opens the app with a text capture in a fragment. The app saves it locally, then syncs.
Server workers read persisted notes to enrich them and prepare opted-in digests.

## Data model

- notes: globally unique UUID, owner, text, URL, tag list, nested folder path, collection, monotonic server version, deletion tombstone, AI metadata.
- users/sessions: scrypt password hashes, hashed opaque session tokens with expiry.
- mutations: (owner, mutation UUID) receipt for retry-safe sync.
- shares: owner/collection with random read-only token and optional public listing.
- deliveries: one immutable email payload per user/due time, with state and retry metadata.
- note_fts: FTS5 external-content index maintained by triggers.

## Sync example

Both devices read version 1. Laptop submits a change with base 1: server stores version 2.
Phone submits a different edit with base 1: server retains version 2 and creates a conflict copy.
A stale delete keeps the server note. A retried mutation returns its stored receipt.
Client edits made while a request is running stay pending and are rebased onto the accepted server version.
Sync reads all account records, including tombstones. No timestamp ordering from device clocks is used for correctness.

## Local-first boundaries

Core capture/edit/organization/search/export uses IndexedDB. Account creation and sync need the server.
Server full-text search, sharing, and scheduled email need the server. Semantic search needs its embedding service.
The app shell must be visited online once before offline reload. Local data is unencrypted and can be evicted by the browser.
Keep exports. Different browser profiles and different origins have separate local stores.

## Honest production limitations

This is a complete educational implementation of the listed workflows, not a production SaaS service.
No password reset, email verification, admin UI, collaborative rich-text editing, E2E encryption, or multi-process scheduler.
No vector index: cosine search is O(number of indexed notes × dimensions). No pagination/full-account sync cursor.
Folders are paths and collections are note fields; empty containers and drag-and-drop are not implemented.
No schema-version migration framework; additive schema checks preserve data between supplied stages.
AI-generated tags merge into tags; changing them alone may trigger another AI suggestion.
Only localhost is the default bind address. Public deployment requires TLS, exact APP_ORIGIN, verified email ownership,
backups, monitoring, request limits at the reverse proxy, and persistent disk.

## Technical references

- https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- https://github.com/ollama/ollama/blob/main/docs/api.md
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/dashboard/emails/idempotency-keys
