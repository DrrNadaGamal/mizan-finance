import test from 'node:test';
import assert from 'node:assert/strict';
import { T } from '../public/i18n.js';

const flat = (o, p = '', out = {}) => { for (const k in o) { const v = o[k]; const kk = p ? p + '.' + k : k; if (v && typeof v === 'object') flat(v, kk, out); else out[kk] = v; } return out; };

test('Arabic covers every English key except the server-message map', () => {
  const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('srv.')));
  const en = strip(flat(T.en)), ar = strip(flat(T.ar));
  for (const k of Object.keys(en)) assert.ok(k in ar, 'missing Arabic for ' + k);
  for (const k of Object.keys(ar)) assert.ok(k in en, 'extra Arabic key ' + k);
});

test('direction and app name are set per language', () => {
  assert.equal(T.en.dir, 'ltr'); assert.equal(T.ar.dir, 'rtl');
  assert.equal(T.ar.appName, 'ميزان');
});
