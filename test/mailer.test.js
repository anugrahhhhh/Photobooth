import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { createMailer } from '../lib/mailer.js';

function recorder() {
  const real = nodemailer.createTransport({ jsonTransport: true });
  const sent = [];
  return { sent, sendMail: async (msg) => { sent.push(structuredClone(msg)); return real.sendMail(msg); } };
}
const PHOTO = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-')), 'p.jpg');
fs.writeFileSync(PHOTO, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
const mail = { transport: 'json', from: 'photobooth@localhost' };
const base = { to: 'a@b.com', pageUrl: 'https://x.test/r/abc?x=1&y="2"', photoPath: PHOTO };

test('send en: subjek, lampiran cid, HTML memuat pageUrl, teks', async () => {
  const t = recorder();
  await createMailer(mail, { transport: t }).send({ ...base, lang: 'en' });
  const m = t.sent[0];
  assert.equal(m.subject, 'Your photobooth photos 📸');
  assert.equal(m.to, 'a@b.com');
  assert.equal(m.from, 'photobooth@localhost');
  assert.deepEqual(m.attachments, [{ filename: 'photobooth.jpg', path: PHOTO, cid: 'photo' }]);
  assert.match(m.html, /cid:photo/);
  assert.match(m.html, /See GIF &amp; video/);
  assert.ok(m.html.includes('https://x.test/r/abc?x=1&amp;y=&quot;2&quot;'));
  assert.ok(m.text.includes(base.pageUrl));
});

test('send id: subjek Indonesia', async () => {
  const t = recorder();
  await createMailer(mail, { transport: t }).send({ ...base, lang: 'id' });
  assert.equal(t.sent[0].subject, 'Foto photobooth kamu 📸');
  assert.match(t.sent[0].html, /Lihat GIF &amp; video/);
});

test('transport json bawaan bekerja tanpa injeksi', async () => {
  await createMailer(mail).send({ ...base, lang: 'id' });
});

test('sendTest tanpa lampiran', async () => {
  const t = recorder();
  await createMailer(mail, { transport: t }).sendTest('z@b.com');
  assert.equal(t.sent[0].subject, 'Email uji Photobooth ✓');
  assert.equal(t.sent[0].to, 'z@b.com');
  assert.equal(t.sent[0].attachments, undefined);
});
