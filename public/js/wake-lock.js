// Menjaga layar tetap menyala. Gagal/tidak didukung diabaikan; release sebelum request selesai
// tetap melepas sentinel yang datang belakangan.
export function createWakeLock(request = () => navigator.wakeLock?.request('screen')) {
  let sentinel = null;
  let pending = null;
  let generation = 0;

  async function start(gen) {
    try {
      const s = await request();
      if (!s) return;
      if (gen !== generation) {
        s.release?.()?.catch?.(() => {});
        return;
      }
      sentinel = s;
    } catch {
      // tidak didukung atau ditolak: layar boleh redup
    } finally {
      if (gen === generation) pending = null;
    }
  }

  return {
    acquire() {
      if (sentinel) return Promise.resolve();
      if (!pending) pending = start(generation);
      return pending;
    },
    release() {
      generation++;
      pending = null;
      const s = sentinel;
      sentinel = null;
      try {
        s?.release()?.catch?.(() => {});
      } catch {
        // sudah dilepas sistem
      }
    },
    held: () => sentinel !== null,
  };
}
