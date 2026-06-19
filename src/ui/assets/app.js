/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/* global document, fetch, navigator */
'use strict';

const form = document.getElementById('form');
const result = document.getElementById('result');
const urlField = document.getElementById('url');
const errorBox = document.getElementById('error');
const ttlWrap = document.getElementById('ttlWrap');
const sealedBox = form.elements.sealed;

sealedBox.addEventListener('change', () => {
  ttlWrap.hidden = !sealedBox.checked;
});

function splitList (value) {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function buildPayload () {
  const f = form.elements;
  const mapping = {};
  if (f.name.value.trim()) mapping.name = f.name.value.trim();

  const source = {};
  const streams = splitList(f.streams.value);
  const types = splitList(f.types.value);
  if (streams.length) source.streams = streams;
  if (types.length) source.types = types;
  if (Object.keys(source).length) mapping.source = source;

  const target = {};
  if (f.summary.value.trim()) target.summary = f.summary.value.trim();
  if (f.allDay.checked) target.allDay = true;
  if (Object.keys(target).length) mapping.target = target;

  const payload = { apiEndpoint: f.apiEndpoint.value.trim(), mapping };
  if (f.sealed.checked) {
    payload.sealed = true;
    const days = Number(f.ttlDays.value);
    if (days > 0) payload.ttlSeconds = Math.floor(days * 86400);
  }
  return payload;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  result.hidden = true;

  try {
    const res = await fetch('/ui/mappings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildPayload())
    });
    if (!res.ok) {
      throw new Error(await res.text() || `request failed (${res.status})`);
    }
    const data = await res.json();
    urlField.value = data.url;
    result.hidden = false;
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.hidden = false;
  }
});

document.getElementById('copy').addEventListener('click', async () => {
  urlField.select();
  try {
    await navigator.clipboard.writeText(urlField.value);
  } catch {
    /* clipboard unavailable; the field is already selected for manual copy */
  }
});
