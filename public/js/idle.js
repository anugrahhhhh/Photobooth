// Timer menganggur kiosk. createIdleTimer murni (jam bisa diganti untuk tes);
// attachIdle memasangkannya ke DOM.

export function createIdleTimer({ timeoutMs, warnMs, now = () => Date.now() }) {
  let lastActivity = now();
  let pauseDepth = 0;
  // status 'expired' bertahan sampai activity() atau resume() terakhir
  let expired = false;

  function activity() {
    // aktivitas saat dijeda juga mereset jam; resume() akan mereset lagi, jadi tidak berbahaya
    lastActivity = now();
    expired = false;
  }

  function pause() {
    pauseDepth += 1;
  }

  function resume() {
    if (pauseDepth === 0) return;
    pauseDepth -= 1;
    // jam baru berjalan lagi dari nol saat jeda terakhir ditutup
    if (pauseDepth === 0) activity();
  }

  function tick() {
    if (pauseDepth > 0) return 'idle';
    const elapsed = now() - lastActivity;
    if (expired || elapsed >= timeoutMs) {
      expired = true;
      return 'expired';
    }
    if (elapsed >= timeoutMs - warnMs) return 'warn';
    return 'idle';
  }

  return {
    activity,
    pause,
    resume,
    tick,
    paused: () => pauseDepth > 0,
  };
}

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel'];

export function attachIdle(
  timer,
  { target = document, intervalMs = 250, onWarn, onExpire, onActive } = {},
) {
  let last = 'idle';

  // callback hanya saat status berubah
  function check() {
    const next = timer.tick();
    if (next === last) return;
    const prev = last;
    last = next;
    if (next === 'warn') onWarn?.();
    else if (next === 'expired') onExpire?.();
    else if (prev === 'warn') onActive?.();
  }

  function onEvent() {
    timer.activity();
    check();
  }

  const opts = { capture: true, passive: true };
  for (const type of ACTIVITY_EVENTS) target.addEventListener(type, onEvent, opts);
  const handle = setInterval(check, intervalMs);

  return function detach() {
    for (const type of ACTIVITY_EVENTS) target.removeEventListener(type, onEvent, opts);
    clearInterval(handle);
  };
}
