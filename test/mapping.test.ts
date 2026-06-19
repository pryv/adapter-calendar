/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseMapping,
  render,
  sourceToQuery,
  eventToCalendarEvent,
  type Mapping
} from '../src/feed/mapping.ts';
import type { PryvEvent } from '../src/pryv/types.ts';

const SAMPLE: PryvEvent = {
  id: 'e1',
  streamIds: ['body', 'health'],
  type: 'mass/kg',
  time: 1_750_000_000,
  content: 82.4,
  modified: 1_750_000_500
};

test('render substitutes known tokens', () => {
  assert.equal(render('{type}: {content}', SAMPLE), 'mass/kg: 82.4');
  assert.equal(render('{streamId}', SAMPLE), 'body');
  assert.equal(render('{unknown}', SAMPLE), '');
});

test('render resolves a dot path into object content', () => {
  const ev: PryvEvent = { ...SAMPLE, content: { value: 82.4, unit: 'kg' } };
  assert.equal(render('{content.value} {content.unit}', ev), '82.4 kg');
  assert.equal(render('{content.missing}', ev), '');
});

test('parseMapping rejects non-objects', () => {
  assert.throws(() => parseMapping(null), /must be an object/);
  assert.throws(() => parseMapping('x'), /must be an object/);
  assert.deepEqual(parseMapping({ name: 'W' }), { name: 'W' });
});

test('sourceToQuery includes only non-empty filters', () => {
  assert.deepEqual(sourceToQuery({ streams: ['body'], types: ['mass/kg'] }), { streams: ['body'], types: ['mass/kg'] });
  assert.deepEqual(sourceToQuery({ streams: [] }), {});
  assert.deepEqual(sourceToQuery(undefined), {});
});

test('eventToCalendarEvent maps a timed sample', () => {
  const mapping: Mapping = { target: { summary: '{content} kg' } };
  const cal = eventToCalendarEvent(SAMPLE, mapping);
  assert.equal(cal.uid, 'e1');
  assert.equal(cal.summary, '82.4 kg');
  assert.equal(cal.start.getTime(), 1_750_000_000 * 1000);
  assert.equal(cal.dtstamp?.getTime(), 1_750_000_500 * 1000);
  assert.equal(cal.end, undefined); // no duration, not all-day
  assert.equal(cal.allDay, false);
});

test('eventToCalendarEvent applies event duration', () => {
  const ev: PryvEvent = { ...SAMPLE, duration: 1800 };
  const cal = eventToCalendarEvent(ev, {});
  assert.equal(cal.end?.getTime(), (1_750_000_000 + 1800) * 1000);
});

test('eventToCalendarEvent applies default duration when event has none', () => {
  const cal = eventToCalendarEvent(SAMPLE, { target: { defaultDurationSeconds: 900 } });
  assert.equal(cal.end?.getTime(), (1_750_000_000 + 900) * 1000);
});

test('all-day mapping ignores default duration', () => {
  const cal = eventToCalendarEvent(SAMPLE, { target: { allDay: true, defaultDurationSeconds: 900 } });
  assert.equal(cal.allDay, true);
  assert.equal(cal.end, undefined);
});

test('summary falls back to type when template renders empty', () => {
  const ev: PryvEvent = { ...SAMPLE, content: '' };
  const cal = eventToCalendarEvent(ev, { target: { summary: '{content}' } });
  assert.equal(cal.summary, 'mass/kg');
});
