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
  `/service/info` `adapters` field. The manifest carries `baseTemplate` when
  `PUBLIC_BASE_TEMPLATE` is set.
- **Addressed by username behind a Pryv core:** emitted subscription URLs use
  the `X-Adapter-Base` header the core sets on a request addressed to an account
  (`https://alice.example.com/adapter/calendar/`), else `PUBLIC_BASE_URL`, else
  the request's own origin (a bare deployment); routes are served under the
  mount path of that base (and still at the root), the slashless mount answers
  `308` to the slashed form. The UI posts to a relative `ui/mappings`.

See [TODOS.md](TODOS.md) for deferred work (CalDAV write-back, full time-zone
resolution, recurrence expansion, multi-tenant deployment).
