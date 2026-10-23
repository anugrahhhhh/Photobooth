import { GIFEncoder, quantize, applyPalette } from '/vendor/gifenc.js';

// Menerima { frames: [{ width, height, data }], delay } dan membalas { ok, buffer } / { ok: false, error }.
self.onmessage = (e) => {
  try {
    const { frames, delay } = e.data;
    const gif = GIFEncoder();
    for (const { width, height, data } of frames) {
      const palette = quantize(data, 256);
      const index = applyPalette(data, palette);
      gif.writeFrame(index, width, height, { palette, delay, repeat: 0 });
    }
    gif.finish();
    const bytes = gif.bytes();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    self.postMessage({ ok: true, buffer }, [buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err?.message ?? err) });
  }
};
