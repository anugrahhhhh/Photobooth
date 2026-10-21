// Penghitung waktu layar tinjau: murni, jam bisa diganti untuk tes.

export const shouldReview = (reviewSeconds, source) => source === 'camera' && Number(reviewSeconds) > 0;

export function createReviewTimer({ durationMs, now = () => performance.now() }) {
  const start = now();
  let cancelled = false;
  const fraction = () => Math.min(1, Math.max(0, 1 - (now() - start) / durationMs));
  return {
    tick() {
      if (cancelled) return 'cancelled';
      return fraction() <= 0 ? 'expired' : 'running';
    },
    fraction,
    cancel() {
      cancelled = true;
    },
  };
}
