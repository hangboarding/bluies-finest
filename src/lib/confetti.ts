export function confetti(colours?: string[]) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let c = document.getElementById('fx') as HTMLCanvasElement | null;
  if (!c) { c = document.createElement('canvas'); c.id = 'fx'; document.body.append(c); }
  const x = c.getContext('2d')!; c.width = innerWidth; c.height = innerHeight;
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#8fb3d1';
  const cols = colours?.length ? colours : [acc, '#f2c14e', '#ffffff', '#ff5a4e', '#5aa9e6', '#b48cff'];
  const ps = Array.from({ length: 200 }, () => ({ x: innerWidth / 2, y: innerHeight * 0.4, vx: (Math.random() - 0.5) * 16, vy: Math.random() * -16 - 4, r: Math.random() * 6 + 3, c: cols[Math.floor(Math.random() * cols.length)]!, a: Math.random() * 6, h: Math.random() < 0.3 }));
  let n = 0;
  (function f() {
    x.clearRect(0, 0, c!.width, c!.height);
    for (const p of ps) { p.vy += 0.4; p.x += p.vx; p.y += p.vy; p.a += 0.2; x.fillStyle = p.c; x.beginPath(); p.h ? x.arc(p.x, p.y, p.r, 0, 7) : x.ellipse(p.x, p.y, p.r, p.r / 2, p.a, 0, 7); x.fill(); }
    if (n++ < 200) requestAnimationFrame(f); else x.clearRect(0, 0, c!.width, c!.height);
  })();
}
