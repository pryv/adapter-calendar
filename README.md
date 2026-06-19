# adapter-calendar

Calendar adapter for Pryv.io accounts.

A transient, memory-less converter between the Pryv API and the iCalendar standard
([RFC 5545](https://www.rfc-editor.org/rfc/rfc5545)). Designed to be deployed alongside a
Pryv core or as a multi-tenant service.

## Status

Early development — interfaces are not yet stable.

## What it does

Two directions:

1. **Pryv data as a calendar feed.** Expose selected Pryv events (for example body weight
   samples) as an iCal subscription URL that Apple Calendar, Google Calendar, Microsoft
   Outlook, or Mozilla Thunderbird can subscribe to. The user configures which streams /
   types map to which calendar entries, receives a subscription URL, and pastes it into
   their calendar application.

2. **Calendar entries as Pryv events.** Ingest external iCalendar feeds into Pryv, storing
   each `VEVENT` as a structured Pryv event under a dedicated event type. Stream layout is
   configurable — one stream per source calendar by default.

The adapter holds no canonical user data. Per-user mapping configuration lives on the
user's own Pryv account as ordinary events, fetched on each request.

## Development

TypeScript on Node.js ≥ 24, pure ESM. Node runs the `.ts` sources directly via native
type stripping, so there is no build step in the dev/test loop.
[`just`](https://github.com/casey/just) is the task runner; every recipe also has an
equivalent npm script.

```sh
just install     # npm install
just lint        # eslint
just typecheck   # tsc --noEmit
just test        # node --test
just build       # compile to dist/
just start       # run the feed server from source
```

### Running the server

`just start` serves three routes:

- `GET /<prefix>/<envelope>.ics` — the calendar subscription feed.
- `GET /` — a small web UI to create a mapping and get its subscription URL.
- `POST /ui/mappings` — create a mapping (used by the UI).

Configuration is read from the environment:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3010` | TCP port to listen on |
| `ROUTE_PREFIX` | `cal` | first path segment, e.g. `/cal/<envelope>.ics` |
| `AES_KEY_BASE64` | — | base64 of a 32-byte key; required to serve sealed (`s`) URLs |
| `PUBLIC_BASE_URL` | request host | base URL used when emitting subscription URLs |

The browser only talks to this server; the server talks to Pryv. The user's apiEndpoint
(with its token) stays server-side — only the encoded subscription URL is handed back.

The `<envelope>` segment carries the user's Pryv apiEndpoint and mapping id (plaintext
or sealed AES-256-GCM). Every subscription URL is kept under Google Calendar's ~225-char
limit — see [docs/url-length-constraints.md](docs/url-length-constraints.md).

See [AGENTS.md](AGENTS.md) for the full conventions.

## License

[BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
