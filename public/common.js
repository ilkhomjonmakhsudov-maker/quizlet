// Helpers shared by the teacher and student pages.

const SHAPES = ['▲', '◆', '●', '■'];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function toast(message, ms = 3000) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// Counts down a server-provided duration locally, calling onTick(secondsLeft).
function countdown(ms, onTick) {
  const end = Date.now() + ms;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    onTick(left);
    if (left > 0) setTimeout(tick, 200);
  };
  tick();
  return () => { stopped = true; };
}
