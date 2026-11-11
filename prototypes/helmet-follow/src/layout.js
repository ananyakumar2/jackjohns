import { MathUtils } from 'three';

// One camera, one stage. The page is laid out in CSS px and every 3D layer is
// placed from that layout, so the DOM, the canvas and the haze agree exactly.
export const CAMERA_Z = 14.4;
export const CAMERA_Y = 0;
export const FOV = 26;
export const CARD_Z = -1.2;
export const WALL_Z = -7;
export const PILL = { z: 0.5, w: 112, h: 36 };
export const TITLE = { size: 28, tracking: 0.22, weight: 600 };
export const HELMET_VISUAL_RADIUS = 1.12;
// The round opening the cards leave for the helmet, in helmet radii. Its centre
// drops a little below the helmet's because the chin bar makes the silhouette
// longer below than above.
export const OPENING = { r: 1.55, drop: 0.13 };
// The shift light runs round the bottom of that opening, between chin and cards.
export const ARC = { r: 1.38, span: MathUtils.degToRad(60), count: 15, z: 0.5, led: 0.056 };
export const FRAME_PX = 4.5;

const TAN = Math.tan(MathUtils.degToRad(FOV / 2));
const PORTRAIT_BELOW = 0.85;

// Narrow screens widen the vertical field so the stage keeps its width.
export function viewTan(aspect) {
  return aspect >= PORTRAIT_BELOW ? TAN : (TAN * PORTRAIT_BELOW) / aspect;
}

export function createView() {
  return {
    W: 1,
    H: 1,
    aspect: 1,
    tan: TAN,
    halfH(z) {
      return (CAMERA_Z - z) * this.tan;
    },
    pxToWorld(z) {
      return (2 * this.halfH(z)) / this.H;
    },
    // CSS px (top-left origin) at depth z → world
    toWorld(x, y, z) {
      const h = this.halfH(z);
      return [((x / this.W) * 2 - 1) * h * this.aspect, CAMERA_Y + (1 - (y / this.H) * 2) * h];
    },
    // world → CSS px
    toScreen(wx, wy, z) {
      const h = this.halfH(z);
      return [((wx / (h * this.aspect)) * 0.5 + 0.5) * this.W, (0.5 - ((wy - CAMERA_Y) / h) * 0.5) * this.H];
    },
  };
}

// The helmet sits at the centre of the screen inside a square of four cards,
// each with its inner corner cut on one circle round the helmet. His name is
// above the square and Book below it, so the three stack centred together.
// Wide screens put the pillar names beside the outer corners; narrow ones
// above and below the square.
export function computeLayout(view) {
  const { W, H, aspect } = view;
  const [hx, hy] = view.toScreen(0, 0, 0);
  const helmetR = HELMET_VISUAL_RADIUS / view.pxToWorld(0);
  const wide = aspect >= 1.15;
  const F = FRAME_PX;

  const titleSize = wide ? TITLE.size : Math.round(TITLE.size * 0.72);
  const titleH = titleSize * 1.5;
  const gap = wide ? 26 : 16;
  const nameRow = wide ? 0 : 24;
  const my = Math.max(24, H * 0.03);
  const mx = wide ? 190 : Math.max(W * 0.04, 12);
  const above = titleH + gap + nameRow;
  const below = nameRow + gap + PILL.h;
  const half = Math.min(hy - my - above, H - hy - my - below, W / 2 - mx);
  const G = wide ? 18 : Math.max(8, W * 0.025);
  const cw = half - G / 2 - 2 * F;
  const x0 = hx - half + F;
  const x1 = hx + G / 2 + F;
  const y0 = hy - half + F;
  const y1 = hy + G / 2 + F;
  const cards = [
    { x: x0, y: y0, w: cw, h: cw },
    { x: x1, y: y0, w: cw, h: cw },
    { x: x0, y: y1, w: cw, h: cw },
    { x: x1, y: y1, w: cw, h: cw },
  ];

  const names = cards.map((c, i) => {
    const right = i % 2 === 1;
    const top = i < 2;
    if (wide) {
      return { x: right ? c.x + c.w + F + 18 : c.x - F - 18, y: top ? c.y - F - 4 : c.y + c.h + F + 4, align: right ? 'left' : 'right', base: top ? 'top' : 'bottom' };
    }
    return { x: right ? c.x + c.w + F : c.x - F, y: top ? c.y - F - 6 : c.y + c.h + F + 6, align: right ? 'right' : 'left', base: top ? 'bottom' : 'top' };
  });

  // The floor sits just under the square, so the cards hang above the wet tarmac.
  const floorY = Math.min(-2.5, view.toWorld(0, hy + half, CARD_Z)[1] - 0.12);

  const pill = { x: hx, y: hy + half + nameRow + gap + PILL.h / 2, w: PILL.w, h: PILL.h };
  const lensR = Math.min(Math.max(helmetR * 1.62, 150), W * 0.44, H * 0.3);
  // rides up if needed so its rim stays clear of the Book pill, which closes it
  const lensY = Math.min(hy + helmetR * 0.08, pill.y - PILL.h / 2 - 14 - lensR);
  return {
    cards,
    names,
    floorY,
    title: { x: hx, y: hy - half - nameRow - gap - titleH / 2, size: titleSize },
    open: { x: hx, y: hy + helmetR * OPENING.drop, r: helmetR * OPENING.r },
    helmet: { x: hx, y: hy, r: helmetR },
    pill,
    lens: { x: hx, y: lensY, r: lensR },
  };
}

export const cardAt = (layout, x, y, pad = 0) => {
  const o = layout.open;
  if (Math.hypot(x - o.x, y - o.y) < o.r - pad) return -1;
  return layout.cards.findIndex((c) => x >= c.x - pad && x <= c.x + c.w + pad && y >= c.y - pad && y <= c.y + c.h + pad);
};
