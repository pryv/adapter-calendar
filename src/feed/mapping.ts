/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * Mapping model: turns Pryv events into calendar entries.
 *
 * A mapping is stored as the `content` of an event on the user's own Pryv
 * account (stream `adapters/calendar/mappings`). The feed handler reads it on
 * each poll, so the adapter holds no settings of its own.
 */
import type { CalendarEvent } from '../ical/serialize.ts';
import type { PryvEvent, EventsQuery } from '../pryv/types.ts';

/** Which source events feed the calendar. */
export interface MappingSource {
  streams?: string[];
  types?: string[];
}

/** How each source event is rendered as a calendar entry. */
export interface MappingTarget {
  /** SUMMARY template; defaults to the event content. Tokens: see {@link render}. */
  summary?: string;
  /** DESCRIPTION template. */
  description?: string;
  /** LOCATION template. */
  location?: string;
  /** Render as an all-day entry (VALUE=DATE). */
  allDay?: boolean;
  /** Duration (seconds) applied when an event carries none and is not all-day. */
  defaultDurationSeconds?: number;
}

/** A complete calendar mapping. */
export interface Mapping {
  /** Calendar name shown to the client (X-WR-CALNAME). */
  name?: string;
  source?: MappingSource;
  target?: MappingTarget;
}

/** Validate that an unknown value (mapping-config event content) is a Mapping. */
export function parseMapping (raw: unknown): Mapping {
  if (raw == null || typeof raw !== 'object') {
    throw new Error('mapping content must be an object');
  }
  // Structural pass-through: unknown fields are ignored, the shape is optional.
  return raw as Mapping;
}

/** Render content as a string: primitives directly, objects as JSON. */
function stringifyContent (value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Resolve a dot path within a value, e.g. `a.b` in `{a:{b:1}}`. */
function resolvePath (value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const key of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Substitute `{token}` placeholders in a template against an event.
 * Supported tokens: `{type}`, `{streamId}` (first stream), `{content}` (whole
 * payload), and `{content.<path>}` (a field within an object payload).
 * Unknown tokens render as empty.
 */
export function render (template: string, event: PryvEvent): string {
  return template.replace(/\{([^}]+)\}/g, (_match, token: string) => {
    if (token === 'type') return event.type;
    if (token === 'streamId') return event.streamIds[0] ?? '';
    if (token === 'content') return stringifyContent(event.content);
    if (token.startsWith('content.')) {
      return stringifyContent(resolvePath(event.content, token.slice('content.'.length)));
    }
    return '';
  });
}

/** Build an `events.get` query from a mapping's source filter. */
export function sourceToQuery (source: MappingSource | undefined): EventsQuery {
  const query: EventsQuery = {};
  if (source?.streams != null && source.streams.length > 0) query.streams = source.streams;
  if (source?.types != null && source.types.length > 0) query.types = source.types;
  return query;
}

/** Convert a single Pryv event into a calendar entry per the mapping. */
export function eventToCalendarEvent (event: PryvEvent, mapping: Mapping): CalendarEvent {
  const target = mapping.target ?? {};
  const allDay = target.allDay === true;
  const start = new Date(event.time * 1000);

  let end: Date | undefined;
  const durationSeconds = event.duration ?? (allDay ? undefined : target.defaultDurationSeconds);
  if (durationSeconds != null && durationSeconds > 0) {
    end = new Date((event.time + durationSeconds) * 1000);
  }

  const summary = render(target.summary ?? '{content}', event).trim() || event.type;

  const cal: CalendarEvent = { uid: event.id, start, summary, allDay };
  if (end != null) cal.end = end;
  if (event.modified != null) cal.dtstamp = new Date(event.modified * 1000);
  if (target.description != null) cal.description = render(target.description, event);
  if (target.location != null) cal.location = render(target.location, event);
  return cal;
}
