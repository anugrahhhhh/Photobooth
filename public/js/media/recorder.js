export const VIDEO_MIMES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

const FLASH_MS = 150;

export function pickVideoMime(isTypeSupported) {
  const mime = VIDEO_MIMES.find((m) => isTypeSupported(m));
  return mime ? { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' } : null;
}

export function canRecord(win = globalThis) {
  if (!win.MediaRecorder || typeof win.HTMLCanvasElement?.prototype?.captureStream !== 'function') return false;
  return pickVideoMime((m) => win.MediaRecorder.isTypeSupported(m)) !== null;
}

// Merekam kanvas yang digambar dari <video> kamera, lengkap dengan angka hitung mundur dan kilatan.
// Jeda (review) menghentikan penggambaran dan perekaman; batas maxMs dihitung dari waktu rekam aktif.
export function createSessionRecorder({ video, mirror, maxMs = 90000, fps = 24, maxSide = 1280, onStateChange = () => {} }) {
  const picked = pickVideoMime((m) => MediaRecorder.isTypeSupported(m));
  if (!picked) throw new Error('Perekaman video tidak didukung');
  const baseMime = picked.mime.split(';')[0];
  const canvas = document.createElement('canvas');
  const c2d = canvas.getContext('2d');
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'sans-serif';
  const chunks = [];
  let rec = null;
  let stream = null;
  let raf = 0;
  let lastDraw = 0;
  let timer = 0;
  let remaining = maxMs;
  let armedAt = 0;
  let paused = false;
  let finished = false;
  let result = null; // promise hasil stop()
  let overlay = { count: null, flash: false };
  let flashAt = 0;
  let settle = null; // penyelesai stop() yang sedang berjalan; discard() menutupnya dengan null
  let waitTimer = 0; // jeda/stop yang menunggu jendela kilatan selesai tergambar

  function sizeCanvas() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return false;
    const k = Math.min(1, maxSide / Math.max(vw, vh));
    canvas.width = Math.max(2, Math.round((vw * k) / 2) * 2);
    canvas.height = Math.max(2, Math.round((vh * k) / 2) * 2);
    return true;
  }

  function draw(now) {
    raf = requestAnimationFrame(draw);
    if (now - lastDraw < 1000 / fps - 1) return;
    lastDraw = now;
    paint();
  }

  function paint() {
    if (!canvas.width && !sizeCanvas()) return;
    const { width: w, height: h } = canvas;
    c2d.fillStyle = '#111';
    c2d.fillRect(0, 0, w, h);
    c2d.save();
    if (mirror()) {
      c2d.translate(w, 0);
      c2d.scale(-1, 1);
    }
    if (video.readyState >= 2) c2d.drawImage(video, 0, 0, w, h);
    c2d.restore();
    if (overlay.count != null) {
      const size = Math.round(h * 0.35);
      c2d.font = `800 ${size}px ${family}`;
      c2d.textAlign = 'center';
      c2d.textBaseline = 'middle';
      c2d.lineJoin = 'round';
      c2d.lineWidth = Math.round(size / 12);
      c2d.strokeStyle = 'rgb(0 0 0 / 60%)';
      c2d.fillStyle = '#fff';
      c2d.strokeText(String(overlay.count), w / 2, h / 2);
      c2d.fillText(String(overlay.count), w / 2, h / 2);
    }
    const flashLeft = 1 - (performance.now() - flashAt) / FLASH_MS;
    if (flashLeft > 0) {
      c2d.fillStyle = `rgb(255 255 255 / ${Math.min(0.95, flashLeft)})`;
      c2d.fillRect(0, 0, w, h);
    }
  }

  function arm() {
    armedAt = performance.now();
    timer = setTimeout(() => void api.stop(), remaining);
  }

  function disarm() {
    clearTimeout(timer);
    timer = 0;
    remaining = Math.max(0, remaining - (performance.now() - armedAt));
  }

  // Sisa jendela kilatan (maks FLASH_MS): jeda dan stop menunggunya agar kilatan ikut terekam.
  const flashLeftMs = () => (rec && !finished ? Math.max(0, FLASH_MS - (performance.now() - flashAt)) : 0);

  function cleanup() {
    finished = true;
    clearTimeout(waitTimer);
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    stream?.getTracks().forEach((tr) => tr.stop());
    stream = null;
    canvas.width = canvas.height = 0;
  }

  const api = {
    start() {
      if (rec || finished) return;
      sizeCanvas();
      raf = requestAnimationFrame(draw);
      stream = canvas.captureStream(fps);
      rec = new MediaRecorder(stream, { mimeType: picked.mime, videoBitsPerSecond: 2_500_000 });
      rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
      rec.start(1000);
      arm();
    },
    pause() {
      if (!rec || finished || paused || waitTimer) return;
      const wait = flashLeftMs();
      if (wait > 0) {
        waitTimer = setTimeout(() => {
          waitTimer = 0;
          api.pause();
        }, wait + 40);
        return;
      }
      paused = true;
      disarm();
      cancelAnimationFrame(raf);
      if (rec.state === 'recording') rec.pause();
      onStateChange();
    },
    resume() {
      if (waitTimer) {
        clearTimeout(waitTimer); // jeda tertunda dibatalkan: tetap merekam
        waitTimer = 0;
      }
      if (!rec || finished || !paused) return;
      paused = false;
      if (rec.state === 'paused') rec.resume();
      raf = requestAnimationFrame(draw);
      arm();
      onStateChange();
    },
    setOverlay({ count = null, flash = false } = {}) {
      overlay = { count, flash };
      if (flash) {
        flashAt = performance.now();
        if (rec && !finished && !paused) paint(); // bingkai kilatan langsung tergambar
      }
    },
    stop() {
      if (result) return result;
      result = new Promise((resolve) => {
        if (!rec || finished) return resolve(null);
        settle = resolve;
        const doStop = () => {
          waitTimer = 0;
          rec.onstop = () => {
            const out = chunks.length ? { blob: new Blob(chunks, { type: baseMime }), ext: picked.ext } : null;
            cleanup();
            resolve(out);
            onStateChange();
          };
          rec.onerror = () => {
            cleanup();
            resolve(null);
          };
          if (rec.state === 'inactive') rec.onstop();
          else rec.stop();
        };
        clearTimeout(waitTimer);
        const wait = flashLeftMs();
        if (wait > 0) waitTimer = setTimeout(doStop, wait + 40);
        else doStop();
      });
      return result;
    },
    discard() {
      if (finished) return;
      if (rec) {
        rec.ondataavailable = null;
        rec.onstop = null;
        if (rec.state !== 'inactive') rec.stop();
      }
      chunks.length = 0;
      cleanup();
      const pending = result;
      result = Promise.resolve(null);
      if (pending) settle?.(null);
      onStateChange();
    },
    active: () => Boolean(rec) && !finished && !paused,
  };
  return api;
}

// Dipanggil setelah foto terakhir: hasil masuk ctx.session.video. Reset di tengah jalan, atau
// videoPending yang dikosongkan (ulang sesi, batas tunggu), membuang hasilnya.
export function finishSessionRecording(ctx) {
  const rec = ctx.recorder;
  if (!rec) return;
  ctx.recorder = null;
  const session = ctx.session;
  const pending = rec.stop().then((out) => {
    if (session.videoPending !== pending) return;
    if (ctx.session === session && out) session.video = out;
    session.videoPending = null;
  });
  session.videoPending = pending;
}

// Tunggu klip terakhir ditutup paling lama ms; bila lewat, sesi dianggap tanpa video.
export async function waitSessionVideo(session, ms) {
  const pending = session.videoPending;
  if (!pending) return;
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve(true), ms);
  });
  const late = await Promise.race([pending.then(() => false), timedOut]);
  clearTimeout(timer);
  if (late && session.videoPending === pending) session.videoPending = null;
}
