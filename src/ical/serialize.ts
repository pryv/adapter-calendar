/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * Minimal RFC 5545 (iCalendar) serializer.
 *
 * Produces a `VCALENDAR` document from plain event descriptors. Handles the
 * three things naive string concatenation gets wrong: text escaping, content
 * line folding at 75 octets (UTF-8 safe), and CRLF line endings.
 *
 * Scope is intentionally the subset UC1 needs (one-shot read-only feeds): no
 * VTIMEZONE, VALARM or attendee modelling. Timed values are emitted in UTC.
 */

/** A single calendar entry to serialize as a `VEVENT`. */
export interface CalendarEvent {
  /** Globally unique identifier (RFC 5545 UID). Stable across polls. */
  uid: string;
  /** Event start. Interpreted as a calendar date when `allDay` is true. */
  start: Date;
  /** Optional end. Omitted for instantaneous points (e.g. samples). */
  end?: Date;
  /** Short title (SUMMARY). */
  summary: string;
  /** Long text (DESCRIPTION). */
  description?: string;
  /** Location (LOCATION). */
  location?: string;
  /** All-day event: emit DTSTART/DTEND as VALUE=DATE. */
  allDay?: boolean;
  /** Raw RRULE value, e.g. `FREQ=DAILY;COUNT=10`. Not escaped. */
  rrule?: string;
  /** DTSTAMP (object revision time). Defaults to `start` for stable output. */
  dtstamp?: Date;
}

/** Calendar-level options for the enclosing `VCALENDAR`. */
export interface CalendarOptions {
  /** PRODID value. Defaults to the adapter identifier. */
  prodId?: string;
  /** Human-readable calendar name (X-WR-CALNAME). */
  name?: string;
}

const CRLF = '\r\n';
const MAX_OCTETS = 75;
const DEFAULT_PRODID = '-//Pryv//adapter-calendar//EN';

/** Escape a TEXT value per RFC 5545 §3.3.11. */
function escapeText (value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Format a Date as a UTC date-time: `YYYYMMDDTHHMMSSZ`. */
function formatDateTimeUtc (d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Format a Date as a UTC calendar date: `YYYYMMDD`. */
function formatDate (d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Fold a single content line at 75 octets, inserting CRLF + a single space.
 * Folds on code-point boundaries so multi-byte characters are never split.
 */
function foldLine (content: string): string {
  const pieces: string[] = [];
  let current = '';
  let octets = 0;
  for (const ch of content) {
    const chOctets = Buffer.byteLength(ch, 'utf8');
    if (octets + chOctets > MAX_OCTETS) {
      pieces.push(current);
      current = ' ' + ch;
      octets = 1 + chOctets;
    } else {
      current += ch;
      octets += chOctets;
    }
  }
  pieces.push(current);
  return pieces.join(CRLF);
}

/** Build one folded content line from a property name (with params) and value. */
function prop (nameWithParams: string, value: string): string {
  return foldLine(`${nameWithParams}:${value}`);
}

/** Serialize one event to its folded VEVENT lines. */
function serializeEvent (ev: CalendarEvent): string[] {
  const lines: string[] = [];
  lines.push(prop('BEGIN', 'VEVENT'));
  lines.push(prop('UID', escapeText(ev.uid)));
  lines.push(prop('DTSTAMP', formatDateTimeUtc(ev.dtstamp ?? ev.start)));

  if (ev.allDay === true) {
    lines.push(prop('DTSTART;VALUE=DATE', formatDate(ev.start)));
    if (ev.end != null) lines.push(prop('DTEND;VALUE=DATE', formatDate(ev.end)));
  } else {
    lines.push(prop('DTSTART', formatDateTimeUtc(ev.start)));
    if (ev.end != null) lines.push(prop('DTEND', formatDateTimeUtc(ev.end)));
  }

  lines.push(prop('SUMMARY', escapeText(ev.summary)));
  if (ev.description != null) lines.push(prop('DESCRIPTION', escapeText(ev.description)));
  if (ev.location != null) lines.push(prop('LOCATION', escapeText(ev.location)));
  if (ev.rrule != null) lines.push(prop('RRULE', ev.rrule));
  lines.push(prop('END', 'VEVENT'));
  return lines;
}

/**
 * Serialize a list of events into a complete iCalendar document.
 * The result is CRLF-delimited and terminated, ready to send as
 * `text/calendar; charset=utf-8`.
 */
export function serializeCalendar (events: CalendarEvent[], options: CalendarOptions = {}): string {
  const lines: string[] = [];
  lines.push(prop('BEGIN', 'VCALENDAR'));
  lines.push(prop('VERSION', '2.0'));
  lines.push(prop('PRODID', options.prodId ?? DEFAULT_PRODID));
  lines.push(prop('CALSCALE', 'GREGORIAN'));
  if (options.name != null) lines.push(prop('X-WR-CALNAME', escapeText(options.name)));
  for (const ev of events) lines.push(...serializeEvent(ev));
  lines.push(prop('END', 'VCALENDAR'));
  return lines.join(CRLF) + CRLF;
}
