import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sound from '../public/js/sound.js';

test('soundEnabled: simpanan menang, selain itu bawaan pengaturan', () => {
  assert.equal(sound.soundEnabled({ stored: '0', settingDefault: 1 }), false);
  assert.equal(sound.soundEnabled({ stored: '1', settingDefault: 0 }), true);
  assert.equal(sound.soundEnabled({ stored: null, settingDefault: 1 }), true);
  assert.equal(sound.soundEnabled({ stored: 'x', settingDefault: 0 }), false);
});

test('aman di Node tanpa AudioContext', () => {
  assert.equal(sound.TICK_HZ, 880);
  assert.equal(sound.LAST_HZ, 1320);
  assert.doesNotThrow(() => {
    sound.beep();
    sound.beep(true);
    sound.shutter();
    sound.unlock();
    sound.unlock();
  });
});
