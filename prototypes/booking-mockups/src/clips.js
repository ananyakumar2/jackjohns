import { VideoTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, TextureLoader } from 'three';

const STALL_MS = 3000;

// Brightness gain that pulls a still's mean (linear) luminance part of the way
// towards a shared level, so a dim clip and a bright one rest as a set.
function stillGain(image) {
  try {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 20;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(image, 0, 0, 32, 20);
    const d = g.getImageData(0, 0, 32, 20).data;
    const lin = (v) => (v <= 10 ? v / 3294.6 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
    const mean = sum / (d.length / 4);
    return Math.min(1.8, Math.max(0.65, Math.sqrt(0.15 / Math.max(mean, 1e-3))));
  } catch {
    return 1;
  }
}

// One pillar: a still (the card's resting state, and what gates the reveal)
// and a muted looping <video> loaded after the reveal. The video is parked on
// the still's frame, so waking a card continues from exactly that image. Both
// textures are shared by the card, the visor's room and the floor reflection;
// the video is re-uploaded only when the decoder hands over a new frame.
export class Clip {
  constructor(src, { still, stillAt = 0, focus = [0.5, 0.5], onFrame, manual = false }) {
    const v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');

    this.video = v;
    this.stillAt = stillAt;
    this.live = false;
    this.still = null;
    this.stillGain = 1;
    this.stillReady = still
      ? new TextureLoader().loadAsync(still).then((t) => {
          t.colorSpace = NoColorSpace;
          t.anisotropy = 4;
          this.still = t;
          this.stillGain = stillGain(t.image);
          if (!this.live) onFrame(this);
          return t;
        })
      : Promise.resolve(null);
    this.src = src;
    this.focus = focus;
    this.aspect = 16 / 9;
    this.wantPlay = false;
    this.manual = manual; // capture mode: the caller steps the clip with seek()
    this.ready = new Promise((resolve) => v.addEventListener('loadeddata', resolve, { once: true }));
    this.ready.then(() => this.seek(stillAt)).then(() => {
      this.live = true;
      onFrame(this);
      if (this.wantPlay) this.play();
    });

    const tex = new VideoTexture(v);
    // The visor sees each clip shrunk 5–10×; without mips the reflection would shimmer.
    tex.generateMipmaps = true;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.magFilter = LinearFilter;
    // Uploaded as plain RGBA8 by three; the shaders decode sRGB themselves.
    tex.colorSpace = NoColorSpace;
    this.texture = tex;

    const frame = () => {
      this.lastProgressAt = performance.now();
      onFrame(this);
    };
    const markDirty = () => {
      tex.needsUpdate = true;
      frame();
    };
    v.addEventListener('loadedmetadata', () => {
      if (v.videoWidth && v.videoHeight) this.aspect = v.videoWidth / v.videoHeight;
    });
    // A paused video doesn't always deliver a frame callback for its first frame or a seek.
    v.addEventListener('loadeddata', markDirty);
    v.addEventListener('seeked', markDirty);
    v.addEventListener('error', () => this.recover(true));

    if ('requestVideoFrameCallback' in v) {
      const onVideoFrame = () => {
        frame();
        v.requestVideoFrameCallback(onVideoFrame);
      };
      v.requestVideoFrameCallback(onVideoFrame);
    } else {
      v.addEventListener('timeupdate', markDirty);
    }

    this.lastTime = -1;
    this.lastProgressAt = performance.now();
    this.stalls = 0;
  }

  load() {
    if (!this.video.src) this.video.src = this.src;
  }

  get current() {
    return this.live ? this.texture : this.still;
  }

  play() {
    this.wantPlay = true;
    this.lastProgressAt = performance.now();
    this.load();
    if (this.manual || !this.live) return;
    const p = this.video.play();
    if (p) p.catch(() => {});
  }

  pause() {
    this.wantPlay = false;
    this.video.pause();
  }

  seek(t) {
    const v = this.video;
    return new Promise((resolve) => {
      v.addEventListener('seeked', resolve, { once: true });
      setTimeout(resolve, 3000);
      v.currentTime = t % (v.duration || 1);
    });
  }

  // Edolus-style watchdog: if a clip that should be playing hasn't advanced for
  // 3 s, nudge it; if that didn't help, reload it from where it stopped.
  watch(now) {
    const v = this.video;
    if (!this.wantPlay || !this.live) return;
    if (v.currentTime !== this.lastTime) {
      this.lastTime = v.currentTime;
      this.lastProgressAt = now;
      this.stalls = 0;
      return;
    }
    if (now - this.lastProgressAt > STALL_MS) this.recover(false);
  }

  recover(hard) {
    const v = this.video;
    this.lastProgressAt = performance.now();
    this.stalls++;
    if (hard || this.stalls > 1) {
      const t = v.currentTime || 0;
      v.load();
      v.addEventListener('loadedmetadata', () => { v.currentTime = t; }, { once: true });
    }
    if (this.wantPlay) {
      const p = v.play();
      if (p) p.catch(() => {});
    }
  }
}

export function createClips(pillars, base, onFrame, { manual = false } = {}) {
  const clips = pillars.map(
    (p) => new Clip(new URL(p.clip, base).href, { still: p.still && new URL(p.still, base).href, stillAt: p.stillAt, focus: p.focus, onFrame, manual }),
  );
  let timer = 0;
  const tick = () => {
    const now = performance.now();
    let any = false;
    for (const c of clips) {
      c.watch(now);
      any ||= c.wantPlay;
    }
    if (!any) {
      clearInterval(timer);
      timer = 0;
    }
  };
  return {
    list: clips,
    play(i) {
      clips.forEach((c, j) => (j === i ? c.play() : c.wantPlay && c.pause()));
      if (i >= 0 && !timer && !manual) timer = setInterval(tick, 1000);
    },
    pauseAll() {
      for (const c of clips) if (c.wantPlay) c.pause();
    },
    loadAll() {
      for (const c of clips) c.load();
    },
  };
}
