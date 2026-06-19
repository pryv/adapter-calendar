/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { banner, name, version } from '../src/index.ts';

test('package metadata is populated', () => {
  assert.equal(name, '@pryv/adapter-calendar');
  assert.match(version, /^\d+\.\d+\.\d+/);
});

test('banner combines name and version', () => {
  assert.equal(banner(), `${name} ${version}`);
});
