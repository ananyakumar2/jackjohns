import { MathUtils } from 'three';

// One camera, one stage. The page is laid out in CSS px and every 3D layer is
// placed from that layout, so the DOM, the canvas and the haze agree exactly.
export const CAMERA_Z = 14.4;
export const CAMERA_Y = -0.4;
export const FOV = 26;
export const CARD_Z = -1.2;
export const WALL_Z = -7;
export const ARC = { radius: 1.7, span: MathUtils.degToRad(52), count: 15, z: 0.5, led: 0.056 };
export const PILL = { y: -2.18, z: 0.5, w: 112, h: 36 };
export const HELMET_VISUAL_RADIUS = 1.12;
export const CARD_ASPECT = 1.6;

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

export function computeLayout(view) {
  const { W, H, aspect } = view;
  const helmet = view.toScreen(0, 0, 0);
  const helmetR = HELMET_VISUAL_RADIUS / view.pxToWorld(0);
  const cards = [];
  let names;

  if (aspect >= 1.15) {
    const mx = Math.max(W * 0.055, 28);
    const clear = helmetR + W * 0.045;
    let ch = H * 0.27;
    let cw = ch * CARD_ASPECT;
    const maxW = W / 2 - mx - clear;
    if (cw > maxW) {
      cw = maxW;
      ch = cw / CARD_ASPECT;
    }
    const top = H * 0.11;
    const bottom = H * 0.75 - ch;
    cards.push({ x: mx, y: top, w: cw, h: ch });
    cards.push({ x: W - mx - cw, y: top, w: cw, h: ch });
    cards.push({ x: mx, y: bottom, w: cw, h: ch });
    cards.push({ x: W - mx - cw, y: bottom, w: cw, h: ch });
    names = cards.map((c, i) => ({ x: i % 2 ? c.x + c.w : c.x, y: i < 2 ? c.y - 22 : c.y + c.h + 22, align: i % 2 ? 'right' : 'left', base: i < 2 ? 'bottom' : 'top' }));
  } else {
    const mx = Math.max(W * 0.045, 14);
    const gap = Math.max(W * 0.035, 10);
    const cw = (W - 2 * mx - gap) / 2;
    const ch = cw / CARD_ASPECT;
    const top = H * 0.07 + 18;
    const bottom = Math.max(H * 0.8 - ch, helmet[1] + helmetR * 2.4);
    cards.push({ x: mx, y: top, w: cw, h: ch });
    cards.push({ x: mx + cw + gap, y: top, w: cw, h: ch });
    cards.push({ x: mx, y: bottom, w: cw, h: ch });
    cards.push({ x: mx + cw + gap, y: bottom, w: cw, h: ch });
    names = cards.map((c, i) => ({ x: i % 2 ? c.x + c.w : c.x, y: i < 2 ? c.y - 10 : c.y + c.h + 10, align: i % 2 ? 'right' : 'left', base: i < 2 ? 'bottom' : 'top' }));
  }

  // The floor sits just under the lowest card, so the cards hang above the wet tarmac.
  const lowest = Math.max(...cards.map((c) => c.y + c.h));
  const floorY = Math.min(-2.5, view.toWorld(0, lowest, CARD_Z)[1] - 0.12);

  const pill = view.toScreen(0, PILL.y, PILL.z);
  const lensR = Math.min(Math.max(helmetR * 1.62, 150), W * 0.44, H * 0.3);
  // rides up if needed so its rim stays clear of the Book pill, which closes it
  const lensY = Math.min(helmet[1] + helmetR * 0.08, pill[1] - PILL.h / 2 - 14 - lensR);
  return {
    cards,
    names,
    floorY,
    helmet: { x: helmet[0], y: helmet[1], r: helmetR },
    pill: { x: pill[0], y: pill[1], w: PILL.w, h: PILL.h },
    lens: { x: helmet[0], y: lensY, r: lensR },
  };
}

export const cardAt = (layout, x, y, pad = 0) =>
  layout.cards.findIndex((c) => x >= c.x - pad && x <= c.x + c.w + pad && y >= c.y - pad && y <= c.y + c.h + pad);
