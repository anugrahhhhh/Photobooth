import nodemailer from 'nodemailer';

const TEXTS = {
  id: {
    subject: 'Foto photobooth kamu 📸',
    greeting: 'Halo! Ini foto photobooth kamu.',
    button: 'Lihat GIF & video',
    note: 'Foto disimpan selama 7 hari.',
  },
  en: {
    subject: 'Your photobooth photos 📸',
    greeting: 'Hi! Here is your photobooth photo.',
    button: 'See GIF & video',
    note: 'Your photo is kept for 7 days.',
  },
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildTransport(mail) {
  if (mail.transport === 'json') return nodemailer.createTransport({ jsonTransport: true });
  return nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.port === 465,
    auth: { user: mail.user, pass: mail.pass },
  });
}

function renderHtml(t, pageUrl) {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:16px;color:#222">
<p style="font-size:16px">${esc(t.greeting)}</p>
<p><img src="cid:photo" alt="" style="max-width:100%;border-radius:8px"></p>
<p><a href="${esc(pageUrl)}" style="display:inline-block;background:#e91e63;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${esc(t.button)}</a></p>
<p style="font-size:13px;color:#666">${esc(t.note)}</p>
</div>`;
}

export function createMailer(mail, { transport } = {}) {
  const tx = transport ?? buildTransport(mail);
  return {
    async send({ to, lang, pageUrl, photoPath }) {
      const t = TEXTS[lang] ?? TEXTS.id;
      await tx.sendMail({
        from: mail.from,
        to,
        subject: t.subject,
        text: `${t.greeting}\n\n${t.button}: ${pageUrl}\n\n${t.note}`,
        html: renderHtml(t, pageUrl),
        attachments: [{ filename: 'photobooth.jpg', path: photoPath, cid: 'photo' }],
      });
    },
    async sendTest(to) {
      await tx.sendMail({
        from: mail.from,
        to,
        subject: 'Email uji Photobooth ✓',
        text: 'Pengaturan email Photobooth berfungsi.',
      });
    },
  };
}
