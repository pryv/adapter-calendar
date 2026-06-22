# adapter-calendar — TODOs

Deferred / not-yet-shipped work. The current release covers **UC1** (Pryv →
iCalendar subscription feed), **UC2a** (external iCalendar → Pryv ingest), and
`/service/info` manifest advertisement.

## Calendar write-back (CalDAV)
- **UC2b — CalDAV endpoint fronting Pryv:** expose Pryv as a CalDAV server so
  calendar apps can create / update / delete events that round-trip into Pryv.
  Needs per-user credential storage (the adapter's own platform account / the
  CMC pattern, same-core deployment) and access tokens with
  create/update/delete on the target streams.
- **UC3 — manual calendar entry → typed Pryv event:** interpret a typed entry
  (e.g. `weight 82.4`) into a typed event (e.g. `body` / `mass/kg`); route
  parser misses to an inbox stream — never drop the entry.

## Ingest (UC2a) enhancements
- Per-source-calendar stream layout (one stream per calendar) + an aggregated
  mode behind a config flag. Today ingest targets a single configurable stream.
- Web UI to add / manage external feed subscriptions. Today ingest is the
  one-shot `just ingest` CLI (cron-friendly).
- Incremental ingest (skip unchanged via `SEQUENCE` / `LAST-MODIFIED`), beyond
  the current de-duplication by VEVENT `UID`.

## Time zones
- Full `TZID` resolution to UTC (IANA tz database) and `VTIMEZONE` handling.
  Today only UTC (`...Z`) and all-day (`VALUE=DATE`) values are exact;
  `TZID` / floating local times are taken as the wall-clock instant in UTC and
  flagged in `clientData`.

## Recurrence & fidelity
- `RRULE` expansion on the feed (materialise occurrences) and richer `RRULE`
  handling on ingest. Today `RRULE` is passed through verbatim.
- `ORGANIZER` / `ATTENDEE` round-trip, `VALARM`, `CATEGORIES`.

## Deployment & auth
- Multi-tenant mode (one adapter serving many cores). Sidecar-first today,
  designed so the switch is a configuration change, not a rewrite.
- Sealed-URL signing-key rotation tooling and per-deployment key management.

## Event type
- Once `calendar/ical-event` is content-validated by the platform (after the
  type catalogue is fetched at boot), confirm ingested writes stay conformant;
  widen the schema only if real-world feeds require it.
