// A twinkling star field made of three parallax canvases.
export function makeStars(container, { count = 220, color = '255, 244, 224', className = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = `stars ${className}`;
  const W = Math.max(window.innerWidth, 400);
  const H = Math.max(window.innerHeight, 400);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (let layer = 0; layer < 3; layer++) {
    const c = document.createElement('canvas');
    c.width = W * dpr;
    c.height = H * dpr;
    c.className = `stars-layer l${layer}`;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const n = Math.round((count / 3) * (layer === 0 ? 1.4 : layer === 1 ? 1 : 0.6));
    for (let i = 0; i < n; i++) {
      const x = Math.random() * W;
      const y = Math.pow(Math.random(), 1.35) * H;
      const r = (layer === 2 ? 1.1 : layer === 1 ? 0.8 : 0.55) * (0.6 + Math.random() * 0.8);
      const a = 0.35 + Math.random() * 0.65;
      g.fillStyle = `rgba(${color}, ${a})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      if (layer === 2 && Math.random() < 0.25) {
        const gr = g.createRadialGradient(x, y, 0, x, y, r * 6);
        gr.addColorStop(0, `rgba(255, 226, 170, ${a * 0.5})`);
        gr.addColorStop(1, 'rgba(255, 226, 170, 0)');
        g.fillStyle = gr;
        g.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
      }
    }
    wrap.appendChild(c);
  }
  container.appendChild(wrap);
  return wrap;
}

export function shootingStar(container) {
  const s = document.createElement('i');
  s.className = 'shooting-star';
  const x = 20 + Math.random() * 60;
  const y = 5 + Math.random() * 25;
  s.style.left = `${x}vw`;
  s.style.top = `${y}vh`;
  container.appendChild(s);
  window.gsap.fromTo(s, { opacity: 0, x: 0, y: 0, scaleX: 0.2 }, {
    opacity: 1, x: -220, y: 120, scaleX: 1, duration: 0.9, ease: 'power2.in',
    onComplete: () => window.gsap.to(s, { opacity: 0, duration: 0.3, onComplete: () => s.remove() }),
  });
}
