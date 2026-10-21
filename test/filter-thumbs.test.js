import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFilterThumbs } from '../public/js/booth/filter-thumbs.js';

function setup() {
  const made = [];
  const released = [];
  const thumbs = createFilterThumbs({
    make: (photo, id) => {
      const c = { photo, id };
      made.push(c);
      return c;
    },
    release: (c) => released.push(c),
  });
  return { thumbs, made, released };
}

test('get memakai cache per foto dan filter', () => {
  const { thumbs, made } = setup();
  const p = {};
  const a = thumbs.get(p, 'bw');
  assert.equal(thumbs.get(p, 'bw'), a);
  assert.equal(made.length, 1);
  thumbs.get(p, 'sepia');
  assert.equal(made.length, 2);
  thumbs.get({}, 'bw');
  assert.equal(made.length, 3);
});

test('drop melepas canvas foto itu saja dan membuat ulang saat diminta lagi', () => {
  const { thumbs, made, released } = setup();
  const p = {};
  const other = {};
  const bw = thumbs.get(p, 'bw');
  const sepia = thumbs.get(p, 'sepia');
  const keep = thumbs.get(other, 'bw');
  thumbs.drop(p);
  assert.deepEqual(released, [bw, sepia]);
  assert.notEqual(thumbs.get(p, 'bw'), bw);
  assert.equal(thumbs.get(other, 'bw'), keep);
  assert.equal(made.length, 4);
});

test('clear melepas semuanya', () => {
  const { thumbs, released } = setup();
  const c = [thumbs.get({}, 'bw'), thumbs.get({}, 'sepia')];
  thumbs.clear();
  assert.deepEqual(released, c);
});
