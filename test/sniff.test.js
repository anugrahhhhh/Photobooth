import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniff } from '../lib/sniff.js';

test('sniff mengenali JPEG, GIF, MP4 dan WebM', () => {
  assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])), 'jpg');
  assert.equal(sniff(Buffer.from('GIF89a....')), 'gif');
  assert.equal(sniff(Buffer.from('GIF87a....')), 'gif');
  assert.equal(sniff(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom')])), 'mp4');
  assert.equal(sniff(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2])), 'webm');
});

test('sniff mengembalikan null untuk PNG, kosong, dan bukan Buffer', () => {
  assert.equal(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), null);
  assert.equal(sniff(Buffer.alloc(0)), null);
  assert.equal(sniff(null), null);
});
