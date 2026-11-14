// Loaded only with ?capture. An external driver (headless Chrome) moves the
// mouse, then calls step() once per output frame: time advances by exactly
// dt, playing clips are seeked to match, and one frame is rendered. Headless
// screenshots carry no cursor, so a drawn one stands in for it.
export function installCapture({ capture, clips, step }) {
  const cursor = document.createElement('div');
  cursor.innerHTML =
    '<svg width="22" height="30" viewBox="0 0 22 30"><path d="M2 2 L2 24 L8 18.5 L12.5 28 L16 26.5 L11.6 17.2 L19.5 17.2 Z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  Object.assign(cursor.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: 3, display: 'none' });
  document.body.appendChild(cursor);

  const playhead = clips.list.map(() => 0);

  window.__capture = {
    cursor(x, y, visible = true) {
      cursor.style.display = visible ? 'block' : 'none';
      cursor.style.transform = `translate(${x - 2}px, ${y - 2}px)`;
    },
    async step(ms) {
      const dt = ms / 1000;
      capture.now += ms;
      await Promise.all(
        clips.list.map((c, i) => {
          if (!c.wantPlay) {
            playhead[i] = c.video.currentTime;
            return null;
          }
          playhead[i] += dt;
          return c.seek(playhead[i]);
        }),
      );
      step(dt);
    },
  };
}
