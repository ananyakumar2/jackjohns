# Redline: hero design

The Jack Johns hero. A real-time racing helmet looks at the cursor from the middle of a dark stage, with his name above it. Around it, four framed cards hold the pillars (Sim Racing, Racing, Commentating, Coaching) in a 2×2 grid that runs the full width of the screen, with a round opening cut for the helmet. Heat haze trails the cursor, a shift-light arc in the opening under the helmet fills towards the card it faces, and a small Book pill under the grid opens a lens of availability.

The helmet, livery, logo, clips and availability are placeholders. There is no back end.

## Run, build and publish

```bash
cd prototypes/helmet-follow
npm install
npm run dev                      # http://localhost:5173
npm run build && npm run preview # production build on http://localhost:4173
```

`npm run build` writes a self-contained static site to `dist/`. All paths are relative (`base: './'`), so it works at a domain root or in a subfolder. The KTX2 transcoder (JS and WASM) is bundled from `three` into `dist/assets/`, and everything in `public/content/` is copied as is. Only `three` and `vite` are needed to build, and both are production dependencies, so `npm install --omit=dev` is enough. The asset scripts' packages are dev-only.

The host must serve MP4 with byte ranges (HTTP 206). Safari won't play video without them, and Chrome can't park a clip on its still frame. Every mainstream static host does this.

These URL parameters are for testing and are off by default:

| Parameter | Effect |
| --- | --- |
| `?hud` | Frame time (median and p95), CPU and GPU time per frame, pixel ratio, render count, load timings and bytes by type |
| `?dpr=1.5` | Fixes the pixel ratio and turns the adaptive governor off |
| `?haze=0` | No heat haze |
| `?still` | Same behaviour as `prefers-reduced-motion` |
| `?yaw=40&pitch=10` | Holds the head at a fixed angle (for stills) |
| `?capture` | Steps frames on a fixed clock for an external recorder (used for the proof video on a machine without a GPU) |

## What it does

- **Stage.** A night pit garage: a wall in Jack's blue in deep shade, a soft light pool behind the helmet, and a wet floor that reflects the cards, the arc and the pill with a streaky, patchy smear. The wall picks up the colour of the card that's awake.
- **Name.** "Jack Johns" over the grid, centred, in the site's type at a larger size. It is silver with a faint chrome sheen from the shared studio room, so its highlight slides a little as the helmet turns. It is drawn into the canvas (so the haze bends it), with a transparent `h1` on top for selection and screen readers.
- **Cards.** Four wide cards in a 2×2 grid that fills the screen's width (with normal side padding) and the height between the name and Book. Each has its inner corner cut on one circle round the helmet, so the four read as one frame with a round opening. Each keeps its own silver chrome bezel, which follows the cut, with clear gutters between them. At rest each one is a cool desaturated still, all brought to one brightness so they read as a set. Hovering wakes a card into full-colour footage with a small overshoot. Leaving freezes it on its current frame and lets the colour drain. Cards lean towards the cursor (the hovered one most), and a fast flick knocks them so they wobble and ring out. Each clip cover-fits its own card (cropped, never letterboxed). The only other words are the pillar names. On wide screens they sit at the grid's outer edges in the two rows the name and Book already use: Sim Racing and Racing level with the name, Commentating and Coaching level with Book. On narrow screens the grid is square, with the names above and below it.
- **Helmet.** The motion is unchanged from the prototype: look-at with a spring, roll into turns, two-speed lean, idle float, drag to spin 360°. It is about 18 % smaller. The visor reflects the stage and the cards, desaturated at rest and in colour when awake. The trim is environment-mapped silver chrome.
- **Heat haze** over the whole hero, in the same WebGL canvas. A lagging head chases the cursor and stamps a small velocity and density field, which drifts, blurs and fades at a fixed 60 Hz. One full-screen pass bends the finished frame with it.
  - Strongest over the footage, light over the stage, quiet over the helmet, and gone about a second after the cursor stops.
  - Where the wake folds over, it catches the light like liquid chrome: only bright reflections show, so it glints rather than fogs. A flick at the limiter turns the glints gold.
  - A faint thin-film fringe runs gold, silver and blue, the colours heat leaves on titanium.
- **Shift-light arc.** Fifteen chrome-cupped LEDs in the gap between the helmet's chin and the cards, following the opening's curve, glowing in Jack's blue. They fill from the centre towards the side the helmet faces, kick past and settle when the faced card changes, sweep once on arrival, and flash gold three times at redline (a flick over 2,600 px/s). With nobody steering, only the centre LED breathes. It is a curve that fills by amount, never a row that counts down, so it can't read as start lights.
- **Book.** One small pill under the grid, centred below the gutter between the bottom cards. The helmet's gaze pre-selects the pillar. Clicking fills the pill with liquid chrome from the side the cursor came in, then opens a lens around the helmet: Jesper's lens without the black disc. The rim bends the page around it, the inside is smoked glass, and the pillar name and six placeholder slots sit on top. Picking a slot fills it with blue from the entry point. Esc, a click outside or Book again closes it. On narrow screens it shows four slots in one column.
- **Touch.** With nothing awake, the head looks at each card in turn. A tap wakes a card and turns the head, a finger drag leaves haze, and phone tilt steers the head (not yet tried on a real phone).
- **Reduced motion.** No haze, no overshoot, roll, float, card lean or wobble, and the arc stays at its dim centre LED. The look-at, the card wake and the lens stay.
- **Credits.** A small "Credits" toggle in the bottom-left corner carries the attribution the CC BY and CC BY-SA licences require.

## Look

**Palette.** Taken from Jack: the blue of his Supra, and the silver and gold chrome of his liveries and wheels. Chrome is the signature, and it's real environment-mapped metal everywhere (card bezels, arc LEDs, pill rim and ink, helmet trim, haze glints), all lit by one shared studio environment that turns a little with the helmet, so every highlight slides when the head moves. Blue is the anchor in measured doses: the helmet, the lit LEDs and a picked slot. The stage is Jack's blue in deep shade (`#131821`), not black, so the chrome has something cool to reflect. There is no red, black-and-red, off-white or orange, and no chequered flags, stripes or carbon fibre.

| | Linear RGB | Use |
| --- | --- | --- |
| Stage | 0.0105, 0.0121, 0.0170 (`#131821`) | Wall, floor, lens glass |
| Jack's blue | 0.045, 0.24, 1.0 | LED glow, helmet; `#2f66e0` for a picked slot |
| Silver chrome | F0 0.90, 0.92, 0.95 | Bezels, trim, rims, glints |
| Gold chrome | F0 1.0, 0.77, 0.36 | Redline flash, flick glints |
| Type | `#c6ced9` | Name, pillar names, Book, slots |

**Typeface.** Archivo Expanded SemiBold (Omnibus-Type, SIL Open Font License), self-hosted as one 14 KB WOFF2. It is wide, low-contrast and engineered, like the lettering on a car badge or a dash, so the names feel automotive without an icon. It is set uppercase at 11.5 px with 0.18 em tracking. Inter, Roboto and the system defaults would make it look like an app.

## Reusable parts (for Push Start and Wind Tunnel)

Each part takes the shared room uniforms and an exposure, and knows nothing about this layout:

| Module | Provides |
| --- | --- |
| `palette.js` | The palette in JS, CSS and GLSL, and `toDisplay` / `patchDisplay` for tone mapping inside any material |
| `room.js` | `roomRadiance` (the page as an analytic room), `chromeEnv` and `chromeShade` (silver or gold chrome from one environment) |
| `stage.js` | Back wall, wet floor and the mirror pass that reflects anything on layer 1 |
| `cards.js` | `Card` (framed footage with still/awake states, lean and wobble) and `Spring` |
| `haze.js` | The haze field and the full-screen pass, including the lens. It takes mask rectangles, so any layout can use it |
| `labels.js` | A tracked-text atlas and names drawn inside the canvas, so the haze bends them |
| `arc.js`, `booking.js` | The shift-light arc and the Book pill with its lens |
| `layout.js` | Screen-to-world mapping and this hero's composition (the only file that is Redline-specific, with `redline.js`) |

## Swapping clips, stills, livery and logo

Everything Jack's team replaces lives in `public/content/`. Nothing in `src/` needs to change.

```json
{
  "pillars": [
    { "name": "Sim Racing",   "clip": "clips/sim-racing.mp4",   "still": "clips/sim-racing.webp",   "stillAt": 1.9 },
    { "name": "Racing",       "clip": "clips/racing.mp4",       "still": "clips/racing.webp",       "stillAt": 3.4 },
    { "name": "Commentating", "clip": "clips/commentating.mp4", "still": "clips/commentating.webp", "stillAt": 1.9, "focus": [0.45, 0.5] },
    { "name": "Coaching",     "clip": "clips/coaching.mp4",     "still": "clips/coaching.webp",     "stillAt": 0.4 }
  ],
  "helmet": { "model": "helmet/helmet.glb", "livery": "helmet/livery.ktx2", "logo": "helmet/logo.png", "logoSize": 0.62 }
}
```

- `still` is the card's resting image, and the page reveals as soon as the four stills are in. It's a frame from the clip for now, and can later be an anime still. Any WebP, JPG or PNG works. About 1280×720 at WebP quality 80 is 15–50 KB.
- `stillAt` is the time in seconds where the clip is parked, so waking a card continues from the still. Use the time the still was taken from (or 0 for a still that isn't a frame).
- `focus` is the point of the clip, from 0 to 1, that stays in view when a card crops it. Each card loses its inner corner to the opening, so the subject should sit towards the card's outer side (left for the left-hand cards, right for the right-hand ones).

**What Jack should deliver.**
- **Clips:** one per pillar, 1920×1080 or larger, landscape, 25–60 fps, 4–6 s of continuous action that can loop, no burned-in text or letterboxing, H.264 at a high bitrate or ProRes 422. We encode each to 1280×720 H.264 (CRF 24, 1 s keyframes, `+faststart`, no audio) with `scripts/encode-clips.sh`, about 0.3–1 MB each.
- **Livery:** a 2048×2048 PNG painted over `helmet/livery-template.png` (light grey is paint, dark grey is trim, white lines are the UV islands), converted with KTX-Software:

```bash
ktx create --format R8G8B8_SRGB --assign-tf srgb --encode uastc --uastc-quality 2 --uastc-rdo \
  --zstd 19 --generate-mipmap livery.png public/content/helmet/livery.ktx2
```

- **Logo:** a square PNG with a transparent background, at least 512 px. It sits on the back of the shell.
- **Model:** any glTF with meshes named `Shell`, `Visor`, `Trim`, `Padding` and `Vents`, facing +Z, with the same `Shell` UV layout. `scripts/build-helmet.mjs <source.glb>` turns the current source model into these assets (it needs ffmpeg and KTX-Software).

The best route to Jack's real helmet is a model commissioned from 8–12 photos of it plus its make and model, his livery as flat artwork, his logo and the visor tint.

## How it renders

One WebGL canvas, rendering on demand:

1. **Floor reflection.** A mirror camera renders the cards, arc and pill into a target at one sixth of the resolution.
2. **Scene.** Stage, cards, arc and helmet render into a 4× multisampled target. Every material tone-maps itself (three's Neutral curve) and writes display-ready colour, so the haze can bend a finished image.
3. **Names.** Drawn into the same target from a text atlas.
4. **Haze and lens.** One full-screen pass reads the scene target and the haze field and writes the canvas.
5. **Book pill.** Drawn last, on top, so the haze and the lens never bend or copy it.

The visor, card glass and all the chrome use `roomRadiance`: each reflection ray is traced in closed form into an imaginary room the size of the page, whose front wall is the four cards. That gives zero-lag reflections that update with every video frame, with no cube camera.

## Performance

- **Render on demand.** The loop sleeps when the head, cards, arc, haze and lens have all settled; while one clip plays and nothing moves it renders only on new video frames. Hidden tabs pause everything.
- **Adaptive pixel ratio.** A governor works from the median of the last 90 frame intervals against the display's refresh rate, steps in 0.25s between 1 and 2, drops fast and rises slowly, and keeps under an 8.3 MP budget. It remembers its choice per screen.
- **Haze.** A 256-wide half-float field with at most three small simulation passes per frame. It stops simulating, and the post pass skips its work, about a second after the cursor stops.
- **Loading.** Stills gate the reveal; the clips load 250 ms after it, and each video is parked on its still's frame before it goes live. Every texture is uploaded and every program compiled before the stage appears, and the helmet warms up off-screen before it fades in.
- **Clip watchdog.** A clip that should be playing but makes no progress for 3 s gets nudged, then reloaded from the same time.

### Measured

These were measured on a cloud VM **without a GPU** (Chrome's SwiftShader), so byte counts are exact, load times are pessimistic and GPU time can't be measured.

| | |
| --- | --- |
| JS | 210 KB gzip (three.js and the app, one chunk) + 15 KB transcoder wrapper + 527 KB transcoder WASM (249 KB if the host compresses WASM) |
| CSS, HTML, font, `content.json` | 17 KB |
| Stills | 134 KB (four WebP) |
| Helmet | 387 KB model + 83 KB livery (KTX2) + 10 KB logo |
| Video | 3.0 MB (four clips at 720p), loaded after the reveal |
| Helmet visible | 3.3–3.5 s on localhost in software rendering, most of it CPU shader compilation that a GPU does in a fraction of the time |

**Real GPUs (estimate, not measured).** Per pixel: a card fragment (one filtered video read, two room lookups for glass and bezel), the floor (eight reflection taps), the helmet's physical material inside its footprint, and the post pass (one scene read, five field reads, and chrome only on the haze crest or lens rim). On an integrated laptop GPU (Apple M1/M2, Intel Iris Xe) at a 4–5 MP backbuffer that should be about 3–6 ms per frame, inside 16.7 ms at 60 Hz. If not, the governor lowers the resolution. Check with `?hud` on real hardware before treating this as fact.

## Sources and licences

**Model.** "F1 Helmet ZhouGuanyu 24" by Miopass, [Sketchfab](https://sketchfab.com/3d-models/f1-helmet-zhouguanyu-24-1124fa1f754645d7b9d54de84009d463), CC BY 4.0. Modified: the livery was replaced with a plain metallic blue and a silver mark, the trim turned into chrome, the visor split from the vents and the vents simplified, the camera removed, and everything recompressed. Credit is required wherever it's shown, and the page credits it.

**Clips.**

| Pillar | Source | Licence | Use |
| --- | --- | --- | --- |
| Sim Racing | ["A Woman Playing Driving Simulator"](https://www.pexels.com/video/a-woman-playing-driving-simulator-6498252/), Tima Miroshnichenko, Pexels | Pexels licence | 2.0–6.5 s |
| Racing | ["2023 TCR World Tour at El Pinar – Afternoon race Video 01"](https://commons.wikimedia.org/wiki/File:2023_TCR_World_Tour_at_El_Pinar_-_Afternoon_race_Video_01.webm), NaBUru38, Wikimedia Commons | CC BY-SA 4.0 | 41.6–45.6 s |
| Commentating | ["Man talking in front of a radio station microphone"](https://mixkit.co/free-stock-video/man-talking-in-front-of-a-radio-station-microphone-2963/), Mixkit | Mixkit Stock Video Free License | 2.0–6.5 s, landscape crop of a portrait clip |
| Coaching | ["Dashboard of a car"](https://mixkit.co/free-stock-video/dashboard-of-a-car-72/), Mixkit | Mixkit Stock Video Free License | 6.0–10.5 s |

The Racing clip and its still are share-alike, so the trimmed versions are also CC BY-SA 4.0 and need attribution, which the page gives. The stills are frames from these clips. All of them are placeholders until Jack's footage arrives.

**Type.** Archivo by Omnibus-Type, SIL Open Font License 1.1. The licence is in `src/fonts/OFL.txt`.

## Dependencies

- **`three`** (MIT) is the only runtime dependency: renderer, `GLTFLoader`, `KTX2Loader`, `MeshoptDecoder`. Everything else (look-at, springs, haze, chrome, cards, arc, lens, governor, touch) is about 3,200 lines in `src/`, with no UI or animation libraries.
- **`vite`** builds and serves it.
- **`@gltf-transform/*` and `meshoptimizer`** are used only by `scripts/build-helmet.mjs`. ffmpeg and KTX-Software's `ktx` are needed only to rebuild assets.

## Files

```
src/redline.js   page, loop, input, touch, arrival (this hero)
src/layout.js    screen-to-world mapping and the composition
src/palette.js   palette and in-shader tone mapping
src/room.js      the analytic room and chrome
src/stage.js     wall, wet floor, mirror pass
src/cards.js     framed cards and springs
src/labels.js    text atlas and in-canvas names
src/arc.js       shift-light arc
src/booking.js   Book pill and lens content
src/haze.js      heat haze and the lens pass
src/helmet.js    model, visor, shell and chrome trim
src/motion.js    look-at, springs, roll, idle, drag spin
src/clips.js     stills, videos, watchdog
src/perf.js      pixel-ratio governor, ?hud
src/capture.js   ?capture only
scripts/         asset builds (model, livery, clips)
```
