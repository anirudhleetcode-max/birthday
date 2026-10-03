// Optional: a video message (only shown when one has been uploaded in the admin).
import { esc, sunEmblem } from '../core/art.js';

export default {
  id: 'video',
  title: 'A little message',
  async enter(ctx, el) {
    const { gsap, ui, audio } = ctx;
    const url = ctx.media('video');
    const caption = ctx.site.media?.videoCaption || '';
    if (!url) { ctx.next(); return; }
    el.innerHTML = `
      <div class="vd-bg"></div>
      <div class="vd-wrap">
        <p class="vd-cap">${esc(caption)}</p>
        <div class="vd-frame">
          <video playsinline preload="metadata" src="${esc(url)}"></video>
          <button type="button" class="vd-play" aria-label="Play">${sunEmblem({ glow: false })}<span>▶</span></button>
        </div>
      </div>`;
    const video = el.querySelector('video');
    const play = el.querySelector('.vd-play');
    const frame = el.querySelector('.vd-frame');
    this.video = video;
    this.ctxAudio = audio;
    ctx.letterbox(true);
    ctx.fx.dust({ density: 0.2 });
    gsap.fromTo(el.querySelector('.vd-cap'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 1.4, delay: 0.6 });
    gsap.fromTo(frame, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 1.6, ease: 'power3.out', delay: 0.3 });

    await new Promise((resolve) => play.addEventListener('click', resolve, { once: true }));
    if (ctx.signal.aborted) return;
    audio.duck(0.04, 3600); // hold the music down while the video plays
    gsap.to(play, { opacity: 0, scale: 1.3, duration: 0.6, onComplete: () => (play.hidden = true) });
    video.controls = true;
    try { await video.play(); } catch { /* user can press play */ }
    await new Promise((resolve) => {
      video.addEventListener('ended', resolve, { once: true });
      // never get stuck: offer continue after a while either way
      setTimeout(resolve, Math.max(20, (video.duration || 60) + 2) * 1000);
    });
    audio.duck(1, 0.1);
    await ui.waitContinue('Continue');
    ctx.next();
  },
  async exit() {
    if (this.video) { this.ctxAudio && this.ctxAudio.duck(1, 0.1); this.video.pause(); this.video.removeAttribute('src'); this.video.load(); }
    this.video = null;
  },
};
