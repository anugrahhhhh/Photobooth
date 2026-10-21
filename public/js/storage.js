// Pembungkus localStorage yang tidak pernah melempar (mode privat, data situs diblokir).
export const KEYS = {
  theme: 'pb.theme',
  lang: 'pb.lang',
  kiosk: 'pb.kiosk',
  sound: 'pb.sound',
  kioskLang: 'pb.kioskLang',
  cameraId: 'pb.cameraId',
};

export function read(key, store = globalThis.localStorage) {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

// value null = hapus kunci
export function write(key, value, store = globalThis.localStorage) {
  try {
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    // penyimpanan tidak tersedia
  }
}
