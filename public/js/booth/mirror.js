// Status awal tombol Cermin: kamera belakang tidak dicermin; kamera depan ikut pilihan tersimpan, lalu default pengaturan.
export function initialMirror({ front, stored, settingDefault }) {
  if (!front) return false;
  if (stored === '1') return true;
  if (stored === '0') return false;
  return settingDefault === 1;
}
