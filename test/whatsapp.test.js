import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsApp } from '../lib/whatsapp.js';

const wa = { phoneNumberId: '555', token: 'SECRET-TOKEN', template: 'photo_ready', lang: 'id', apiBase: 'https://graph.test/v21.0' };

test('send: URL, header, dan body persis', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
  await createWhatsApp(wa, { fetch }).send({ to: '628123', photoUrl: 'https://x/p.jpg', pageUrl: 'https://x/r/1' });
  const { url, init } = calls[0];
  assert.equal(url, 'https://graph.test/v21.0/555/messages');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer SECRET-TOKEN');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), {
    messaging_product: 'whatsapp',
    to: '628123',
    type: 'template',
    template: {
      name: 'photo_ready',
      language: { code: 'id' },
      components: [
        { type: 'header', parameters: [{ type: 'image', image: { link: 'https://x/p.jpg' } }] },
        { type: 'body', parameters: [{ type: 'text', text: 'https://x/r/1' }] },
      ],
    },
  });
});

test('respons 400 -> reject berisi status, tanpa token', async () => {
  const fetch = async () => ({ ok: false, status: 400, text: async () => 'bad SECRET-TOKEN' });
  await assert.rejects(
    createWhatsApp(wa, { fetch }).send({ to: '1', photoUrl: 'u', pageUrl: 'p' }),
    (e) => /400/.test(e.message) && !e.message.includes('SECRET-TOKEN'),
  );
});

test('fetch menerima signal timeout', async () => {
  let init;
  const fetch = async (u, i) => { init = i; return { ok: true, status: 200 }; };
  await createWhatsApp(wa, { fetch }).send({ to: '1', photoUrl: 'u', pageUrl: 'p' });
  assert.ok(init.signal instanceof AbortSignal);
});
