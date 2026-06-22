/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * Map parsed VEVENTs into Pryv events for ingest (UC2a, iCalendar → Pryv).
 *
 * Per the storage decision, a calendar entry becomes a `calendar/ical-event`:
 * the well-known fields go in structured `content` (queryable), and the verbatim
 * VEVENT block is kept in `clientData._raw` for lossless round-trips.
 */
import type { ParsedEvent } from '../ical/parse.ts';

/** Pryv event type for an ingested calendar entry. */
export const CALENDAR_EVENT_TYPE = 'calendar/ical-event';

/** Structured content of a `calendar/ical-event`. */
export interface IcalEventContent {
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  rrule?: string;
  organizer?: string;
  status?: string;
  sequence?: number;
  /** Start as ISO 8601. */
  dtstart: string;
  /** End as ISO 8601, when present. */
  dtend?: string;
  /** True for all-day (VALUE=DATE) entries. */
  dateOnly?: boolean;
}

/** A Pryv event ready to be created. */
export interface PryvEventToCreate {
  streamIds: string[];
  type: string;
  time: number;
  duration?: number;
  content: IcalEventContent;
  clientData: Record<string, unknown>;
}

/**
 * Convert a parsed VEVENT into a Pryv `calendar/ical-event` for the given stream.
 * Returns null when the event has no start (nothing to anchor it in time).
 */
export function parsedEventToPryvEvent (event: ParsedEvent, streamId: string): PryvEventToCreate | null {
  if (event.dtstart == null) return null;

  const time = event.dtstart.date.getTime() / 1000;
  const content: IcalEventContent = { dtstart: event.dtstart.date.toISOString() };
  if (event.dtstart.dateOnly) content.dateOnly = true;
  if (event.uid != null) content.uid = event.uid;
  if (event.summary != null) content.summary = event.summary;
  if (event.description != null) content.description = event.description;
  if (event.location != null) content.location = event.location;
  if (event.rrule != null) content.rrule = event.rrule;
  if (event.organizer != null) content.organizer = event.organizer;
  if (event.status != null) content.status = event.status;
  if (event.sequence != null) content.sequence = event.sequence;

  const result: PryvEventToCreate = {
    streamIds: [streamId],
    type: CALENDAR_EVENT_TYPE,
    time,
    content,
    clientData: { _raw: event.raw }
  };

  if (event.dtend != null) {
    content.dtend = event.dtend.date.toISOString();
    const duration = (event.dtend.date.getTime() - event.dtstart.date.getTime()) / 1000;
    if (duration > 0) result.duration = duration;
  }
  // Preserve the source zone hint when it could not be resolved to UTC.
  if (event.dtstart.tzid != null) result.clientData.tzid = event.dtstart.tzid;
  if (event.dtstart.floating === true) result.clientData.floating = true;

  return result;
}
