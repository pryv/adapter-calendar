/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * Minimal RFC 5545 (iCalendar) parser — the inverse of `serialize.ts`.
 *
 * Parses a `text/calendar` document into VEVENT records: unfolds content lines,
 * splits property name/params/value, unescapes TEXT, and resolves DATE / UTC
 * date-time values.
 *
 * Scope is the subset UC2a ingest needs. Time-zone handling is deliberately
 * limited (see {@link IcalDateValue}): UTC (`...Z`) and DATE values are exact;
 * `TZID`/floating local times are parsed as the wall-clock instant in UTC and
 * flagged, so callers can decide how to treat them. The verbatim VEVENT block
 * is preserved on each record for lossless round-trips.
 */

/** A parsed date or date-time value with its zone disposition. */
export interface IcalDateValue {
  /** Resolved instant. Exact for UTC and DATE; best-effort for tzid/floating. */
  date: Date;
  /** True for `VALUE=DATE` (all-day) values. */
  dateOnly: boolean;
  /** TZID parameter if present (not resolved to an offset — see module note). */
  tzid?: string;
  /** True when the value carried neither `Z` nor a TZID (local/floating time). */
  floating?: boolean;
}

/** A parsed VEVENT (the subset the adapter maps to Pryv). */
export interface ParsedEvent {
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  rrule?: string;
  organizer?: string;
  status?: string;
  sequence?: number;
  dtstart?: IcalDateValue;
  dtend?: IcalDateValue;
  /** The verbatim (unfolded) VEVENT block, BEGIN..END inclusive. */
  raw: string;
}

/** A parsed calendar document. */
export interface ParsedCalendar {
  name?: string;
  events: ParsedEvent[];
}

interface ContentLine {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Unfold per RFC 5545: a CRLF/LF followed by a space or tab is a continuation. */
function unfold (ics: string): string[] {
  return ics
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '')
    .split(/\r\n|\n/)
    .filter((line) => line.length > 0);
}

/** Unescape a TEXT value (reverse of RFC 5545 §3.3.11). */
function unescapeText (value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_m, ch: string) => (ch === 'n' || ch === 'N' ? '\n' : ch));
}

/** Split a content line into name, params and raw value at the first unquoted colon. */
function parseContentLine (line: string): ContentLine | null {
  let inQuote = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ':' && !inQuote) { colon = i; break; }
  }
  if (colon === -1) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segments = head.split(';');
  const name = segments[0].toUpperCase();
  const params: Record<string, string> = {};
  for (const seg of segments.slice(1)) {
    const eq = seg.indexOf('=');
    if (eq === -1) continue;
    const key = seg.slice(0, eq).toUpperCase();
    let val = seg.slice(eq + 1);
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    params[key] = val;
  }
  return { name, params, value };
}

/** Parse a DATE (`YYYYMMDD`) as UTC midnight. */
function parseDate (value: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (m == null) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Parse a date-time (`YYYYMMDDTHHMMSS` with optional trailing `Z`) as a UTC instant. */
function parseDateTime (value: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(value);
  if (m == null) return null;
  return new Date(Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6])
  ));
}

/** Resolve a DATE/DATE-TIME property value + params into an {@link IcalDateValue}. */
function parseDateValue (value: string, params: Record<string, string>): IcalDateValue | undefined {
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(value)) {
    const date = parseDate(value);
    return date != null ? { date, dateOnly: true } : undefined;
  }
  const date = parseDateTime(value);
  if (date == null) return undefined;
  const isUtc = value.endsWith('Z');
  const result: IcalDateValue = { date, dateOnly: false };
  if (params.TZID != null) result.tzid = params.TZID;
  else if (!isUtc) result.floating = true;
  return result;
}

/** Parse a full iCalendar document into a {@link ParsedCalendar}. */
export function parseCalendar (ics: string): ParsedCalendar {
  const lines = unfold(ics);
  const calendar: ParsedCalendar = { events: [] };
  let current: ParsedEvent | null = null;
  let block: string[] = [];

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = { raw: '' };
      block = [line];
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current != null) {
        block.push(line);
        current.raw = block.join('\r\n');
        calendar.events.push(current);
      }
      current = null;
      block = [];
      continue;
    }

    const parsed = parseContentLine(line);
    if (parsed == null) continue;

    if (current == null) {
      // Calendar-level properties.
      if (parsed.name === 'X-WR-CALNAME') calendar.name = unescapeText(parsed.value);
      continue;
    }

    block.push(line);
    switch (parsed.name) {
      case 'UID': current.uid = unescapeText(parsed.value); break;
      case 'SUMMARY': current.summary = unescapeText(parsed.value); break;
      case 'DESCRIPTION': current.description = unescapeText(parsed.value); break;
      case 'LOCATION': current.location = unescapeText(parsed.value); break;
      case 'RRULE': current.rrule = parsed.value; break;
      case 'ORGANIZER': current.organizer = parsed.value; break;
      case 'STATUS': current.status = parsed.value; break;
      case 'SEQUENCE': {
        const n = Number(parsed.value);
        if (Number.isInteger(n)) current.sequence = n;
        break;
      }
      case 'DTSTART': current.dtstart = parseDateValue(parsed.value, parsed.params); break;
      case 'DTEND': current.dtend = parseDateValue(parsed.value, parsed.params); break;
      default: break;
    }
  }

  return calendar;
}
