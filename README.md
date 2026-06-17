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

## License

[BSD-3-Clause](LICENSE)
