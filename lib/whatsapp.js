export function createWhatsApp(wa, { fetch = globalThis.fetch } = {}) {
  return {
    async send({ to, photoUrl, pageUrl }) {
      const res = await fetch(`${wa.apiBase}/${wa.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${wa.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: wa.template,
            language: { code: wa.lang },
            components: [
              { type: 'header', parameters: [{ type: 'image', image: { link: photoUrl } }] },
              { type: 'body', parameters: [{ type: 'text', text: pageUrl }] },
            ],
          },
        }),
      });
      // Pesan galat sengaja hanya memuat status; token tidak boleh bocor ke log
      if (!res.ok) throw new Error(`WhatsApp API gagal: HTTP ${res.status}`);
    },
  };
}
