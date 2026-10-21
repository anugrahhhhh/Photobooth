// Hasil strip yang siap diunduh. Versi dinaikkan setiap begin/invalidate,
// sehingga persiapan lama yang selesai belakangan dibuang tanpa membuat URL.
export function createResultStore({
  createURL = (f) => URL.createObjectURL(f),
  revokeURL = (u) => URL.revokeObjectURL(u),
} = {}) {
  let version = 0;
  let result = null;

  function release() {
    if (result) revokeURL(result.url);
    result = null;
  }

  return {
    begin() {
      return ++version;
    },
    commit(job, file) {
      if (job !== version) return false;
      release();
      result = { file, url: createURL(file) };
      return true;
    },
    invalidate() {
      version++;
      release();
    },
    current: () => result,
  };
}
