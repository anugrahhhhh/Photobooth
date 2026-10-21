import { fitWithin } from './geometry.js';
import { KEYS, read, write } from './storage.js';

/* ---------- Bagian murni (diuji di Node) ---------- */

export function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'InsecureContextError':
      return 'Kamera hanya bisa dipakai jika situs dibuka lewat HTTPS.';
    case 'NotAllowedError':
    case 'SecurityError':
      return (
        'Izin kamera ditolak. Chrome/Android: ketuk ikon di kiri alamat situs › Izin › Kamera › Izinkan, lalu muat ulang. ' +
        'Safari iPhone/iPad: ketuk "aA" di bilah alamat › Pengaturan Situs Web › Kamera › Izinkan. ' +
        'Laptop: klik ikon kamera di bilah alamat lalu izinkan.'
      );
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Kamera tidak ditemukan. Sambungkan kamera atau pakai foto dari galeri.';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut (Zoom, Meet, dan sejenisnya) lalu coba lagi.';
    default:
      return 'Kamera tidak bisa dinyalakan. Coba muat ulang halaman atau pakai foto dari galeri.';
  }
}

// Kamera depan/webcam → pratinjau dicermin, dan hasil boleh dicermin bila mirror_output = 1.
export function isFrontCamera({ facingRequested, reportedFacing, pickedByDeviceId = false, isTouch = false }) {
  if (reportedFacing) return reportedFacing === 'user';
  if (pickedByDeviceId && !isTouch) return true;
  return facingRequested === 'user';
}

export function createRestartPolicy(max = 3) {
  let attempts = 0;
  return {
    shouldRetry: () => ++attempts <= max,
    success: () => {
      attempts = 0;
    },
  };
}

/* ---------- Bagian DOM ---------- */

let stream = null;
let lostHandler = null;
// Naik setiap start()/stop(); start yang tersusul membuang stream yang didapatnya.
let generation = 0;

export function savedCameraId() {
  return read(KEYS.cameraId);
}

export function saveCameraId(id) {
  write(KEYS.cameraId, id || null);
}

export function onStreamLost(cb) {
  lostHandler = cb;
}

export function isLive() {
  return Boolean(stream?.getVideoTracks().some((t) => t.readyState === 'live'));
}

function stopStream(s) {
  for (const t of s.getTracks()) {
    t.onended = null;
    t.stop();
  }
}

// Stop yang disengaja: lepas onended dulu supaya tidak dianggap stream mati.
// Juga membatalkan start() yang masih menunggu getUserMedia.
export function stop() {
  generation++;
  if (!stream) return;
  stopStream(stream);
  stream = null;
}

// pref: { deviceId } atau { facingMode }. Mengembalikan info kamera yang benar-benar dipakai,
// atau null bila start ini tersusul oleh start()/stop() lain selama menunggu izin.
export async function start(video, pref = {}) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('Bukan konteks aman'), { name: 'InsecureContextError' });
  }
  stop();
  const myGeneration = generation;
  const base = { width: { ideal: 1920 }, height: { ideal: 1080 } };
  const video_ = pref.deviceId ? { ...base, deviceId: { exact: pref.deviceId } } : { ...base, facingMode: pref.facingMode ?? 'user' };
  let usedFallback = false;
  let got;
  try {
    got = await navigator.mediaDevices.getUserMedia({ video: video_, audio: false });
  } catch (err) {
    if (myGeneration !== generation) return null;
    if (err.name !== 'OverconstrainedError' && !(pref.deviceId && err.name === 'NotFoundError')) throw err;
    if (pref.deviceId) saveCameraId(null); // kamera tersimpan sudah tidak ada
    got = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    usedFallback = true;
  }
  if (myGeneration !== generation) {
    stopStream(got);
    return null;
  }
  stream = got;

  const [track] = stream.getVideoTracks();
  track.onended = () => lostHandler?.();
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.srcObject = stream;
  await video.play().catch(() => {});

  const settings = track.getSettings?.() ?? {};
  return { deviceId: settings.deviceId ?? null, reportedFacing: settings.facingMode || null, usedFallback };
}

export async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Kamera ${i + 1}` }));
}

export function flip(video, currentFacing) {
  const facingMode = currentFacing === 'user' ? 'environment' : 'user';
  return start(video, { facingMode }).then((info) => ({ ...info, facingMode }));
}

// Frame penuh dari video, sisi terpanjang dibatasi maxSide (tidak pernah diperbesar).
export function capture(video, maxSide, { mirror = false } = {}) {
  const { w, h } = fitWithin(video.videoWidth, video.videoHeight, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);
  return canvas;
}
