# Changelog

## 0.0.1 — unreleased

Initial development release. Stack: TypeScript, Node.js ≥ 24, pure ESM.

- **Pryv → iCalendar feed (UC1):** serve selected Pryv events as an iCalendar
  (RFC 5545) subscription feed any calendar client can read. Per-user mapping
  config is stored on the user's own account; subscription URLs come in
  plaintext and sealed (AES-256-GCM) modes, kept under the ~225-character
  calendar-client limit. Minimal web UI to create a mapping and emit its URL.
- **External iCalendar → Pryv ingest (UC2a):** one-shot `just ingest` of an
  external iCalendar URL into `calendar/ical-event` events — well-known fields
  in structured `content`, the verbatim VEVENT in `clientData._raw`. Idempotent
  by VEVENT `UID`.
- **Self-description:** serves `GET /manifest.json`; advertised by a Pryv core's
  `/service/info` `adapters` field.

See [TODOS.md](TODOS.md) for deferred work (CalDAV write-back, full time-zone
resolution, recurrence expansion, multi-tenant deployment).
