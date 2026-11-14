import { VideoTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace } from 'three';

const STALL_MS = 3000;

// One muted looping <video> per pillar. Its texture is shared by the quadrant
// and by the visor reflection, and is re-uploaded only when the decoder hands
// over a new frame (VideoTexture uses requestVideoFrameCallback for that).
export class Clip {
  constructor(src, { focus = [0.5, 0.5], onFrame, manual = false }) {
    const v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.src = src;

    this.video = v;
    this.src = src;
    this.focus = focus;
    this.aspect = 16 / 9;
    this.wantPlay = false;
    this.manual = manual; // capture mode: the caller steps the clip with seek()
    this.ready = new Promise((resolve) => v.addEventListener('loadeddata', resolve, { once: true }));

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

  play() {
    this.wantPlay = true;
    this.lastProgressAt = performance.now();
    if (this.manual) return;
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
    if (!this.wantPlay) return;
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
  const clips = pillars.map((p) => new Clip(new URL(p.clip, base).href, { focus: p.focus, onFrame, manual }));
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
  };
}
