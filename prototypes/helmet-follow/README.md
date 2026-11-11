# Helmet follow: technical prototype

A full-screen page split into four quadrants (Sim Racing, Racing, Commentating, Coaching), each showing its clip, with a real-time 3D racing helmet in the middle. The visor turns towards the cursor, the hovered quadrant's clip plays, and the visor reflects the clips.

This is a technical prototype for the hero, not a design. The helmet, livery, logo mark and clips are placeholders.

## Run it

```bash
cd prototypes/helmet-follow
npm install
npm run dev                      # http://localhost:5173
npm run build && npm run preview # production build on http://localhost:4173
```

These URL parameters are for testing and are off by default:

| Parameter | Effect |
| --- | --- |
| `?hud` | Frame time (median and p95), CPU and GPU time per frame, pixel ratio, render count, time to first quadrants and helmet, and bytes downloaded by type |
| `?dpr=1.5` | Fixes the pixel ratio and turns the adaptive governor off |
| `?yaw=40&pitch=10` | Holds the head at a fixed angle (for stills) |
| `?still` | Same behaviour as `prefers-reduced-motion` |
| `?bg=0` | Helmet only, without the quadrants |
| `?capture` | Steps frames on a fixed clock for an external recorder (used for the proof video on a machine without a GPU) |

## What it does

- **Look-at.** The visor faces the cursor. Each quadrant turns it into that corner, the centre of the screen faces the viewer, and the full range is ±82° of turn and ±60° of nod. A ray from the camera through the cursor lands on a plane just in front of the helmet, and the visor is pointed at the hit point. The rotation is smoothed with `k = 1 − (1 − 0.1)^(60·dt)` and then passed through an orientation spring (ωn 10, ζ 0.4), which gives the head some weight and a slight overshoot.
- **Roll and lean.** On fast turns the head rolls into the corner, up to 11°. The whole head also drifts a little towards the cursor, and more slowly than it turns. That two-speed lag is the Nickho trick.
- **Idle.** Once the cursor rests, a small float and micro-movement fade in, and they fade out again after 12 s so the page can stop rendering.
- **Leaving the window** pauses all clips and eases the head back to neutral at half speed.
- **Clips.** Hovering a quadrant plays its clip from wherever it was paused. Moving away pauses it on its current frame. The quadrant and the visor share one video texture.
- **Drag to spin ("360").** Press on the helmet and drag to turn it any way you like, a full 360°. Let go and it carries on spinning with the drag's momentum, then settles back to looking at the cursor. This answers Ananya's "360" ask without giving up the look-at. The rotations compose as `look-at × spin × rest`. The back of the helmet carries a placeholder mark where Jack's logo goes.
- **Touch.** There's no hover on touch screens. With nothing playing, the head looks into each corner in turn. Tapping a quadrant plays its clip and turns the head towards it, and a second tap pauses it. Phone tilt (DeviceOrientation, which iOS asks permission for on the first tap) steers the head. The tilt part has not been tried on a real phone yet.
- **Reduced motion.** There's no overshoot, roll, float or spin momentum. The look-at itself stays.

## Swapping clips, livery and logo

Everything Jack's team replaces lives in `public/content/`. Nothing in `src/` needs to change.

```
public/content/
  content.json          what goes where
  clips/*.mp4           one per pillar
  helmet/helmet.glb     the model
  helmet/livery.ktx2    the paint (PNG, JPG and WebP also work)
  helmet/livery-template.png   the UV guide to paint on
  helmet/logo.png       the mark on the back of the helmet
```

```json
{
  "pillars": [
    { "name": "Sim Racing",   "corner": "top-left",     "clip": "clips/sim-racing.mp4" },
    { "name": "Racing",       "corner": "top-right",    "clip": "clips/racing.mp4" },
    { "name": "Commentating", "corner": "bottom-left",  "clip": "clips/commentating.mp4", "focus": [0.45, 0.5] },
    { "name": "Coaching",     "corner": "bottom-right", "clip": "clips/coaching.mp4" }
  ],
  "helmet": { "model": "helmet/helmet.glb", "livery": "helmet/livery.ktx2", "logo": "helmet/logo.png", "logoSize": 0.62 }
}
```

`focus` is the point of the clip, from 0 to 1, that stays in view when a quadrant crops it. The default is the centre. `logoSize` is the logo's width as a fraction of the helmet's width.

### What Jack should deliver

**Clips, one per pillar.**
- 1920×1080 or larger, landscape, 25–60 fps.
- 4–6 s of continuous action that can loop. We crossfade the end into the start.
- No burned-in text, logos, watermarks or letterboxing.
- H.264 at a high bitrate, or ProRes 422. Audio is ignored.

We encode each one to 1280×720 H.264 (High profile, CRF 24, a keyframe every second, `+faststart`, no audio), which comes to about 0.3–1 MB per clip. One clip can be encoded by hand like this:

```bash
ffmpeg -ss 0 -t 4.5 -i master.mov -vf "scale=1280:720,format=yuv420p" -an \
  -c:v libx264 -profile:v high -preset slow -crf 24 -g 25 -keyint_min 25 -sc_threshold 0 \
  -movflags +faststart public/content/clips/racing.mp4
```

`scripts/encode-clips.sh` does the same and also adds the loop crossfade. It currently points at the placeholder sources, so add Jack's files to its list.

**Livery.**
- A 2048×2048 PNG painted over `helmet/livery-template.png`.
- In the template, light grey is paint, dark grey is trim (vent caps and the gasket, which stay graphite), black is unused, and the white lines outline the UV islands.
- Helmet painters already work from flat templates like this, so his painter or designer can use it directly.
- Convert it with KTX-Software:

```bash
ktx create --format R8G8B8_SRGB --assign-tf srgb --encode uastc --uastc-quality 2 --uastc-rdo \
  --zstd 19 --generate-mipmap livery.png public/content/helmet/livery.ktx2
```

You can also point `content.json` at the PNG directly. It works, but uses about four times the GPU memory.

**Logo.** A square PNG with a transparent background, at least 512 px. It is projected onto the back of the shell. Dark marks read best on a light livery.

**Model.** See [Jack's real helmet](#jacks-real-helmet) below. Any glTF works, provided its meshes are named `Shell`, `Visor`, `Trim`, `Padding` and `Vents`, faces +Z and has the same UV layout for `Shell`. `scripts/build-helmet.mjs <source.glb>` turns the current source model into these assets. It needs ffmpeg and KTX-Software (`ktx` on `PATH` or `KTX_BIN=…`).

## How the visor reflection works

The visor doesn't reflect a rendered environment. Its shader traces each pixel's reflection ray into an imaginary room around the helmet, the size of the screen:

- The **front wall** is the page itself, with the four clips in their quadrants.
- The **side walls, ceiling and floor** continue the quadrant beside them. For example, the top half of the left wall is Sim Racing and the bottom half is Commentating.
- There are **three softboxes**: a strip in the ceiling, one on the right wall and a rim light behind on the left. They make highlights that slide across the visor as the head turns.

The ray hits a box, so the hit point is a closed-form calculation, with no cube camera, no render-to-texture and no extra pass. That gives the behaviour the brief asked for:

- **Zero lag.** The reflection is computed every frame from the visor's current normal and view direction, so it moves exactly with the head.
- **Updates with the video.** Each clip is uploaded once per decoded frame, using `requestVideoFrameCallback` through three's `VideoTexture`, and that same texture feeds both the quadrant and the visor. The reflection therefore refreshes on every new video frame, not only when the hover changes.
- **No seams.** The room is one continuous function, so there are no cube-map faces to stitch.
- **Sharp at any DPR.** The shader samples the source video texture at a mip level worked out from the ray's footprint (`fwidth` of the reflected direction × distance ÷ incidence). Every screen pixel gets a correctly filtered texel.
- **Mirroring and convex distortion come from the geometry.** The visor's own smooth mesh normals are used, so its curve stretches and squeezes the clips the way a real visor does.
- **Look.**
  - Schlick Fresnel with F0 0.3 for a smoked or iridium visor.
  - A thin-film tint from cool head-on to warm at grazing angles.
  - A near-black interior showing through where the Fresnel term is low.

The shell's clear coat uses the same room function, so the paint also catches faint reflections of the clips. The shell's base layer and the trim are lit by a PMREM of a custom studio scene: a dark box with the same three softboxes and four dim panels. It is not a stock HDRI.

**What it can't do.**
- The room is an approximation of the page, not the true 3D world.
- The helmet doesn't reflect itself, so the vent caps don't show up in the visor.
- Anything placed around the helmet later (sections 2 and 3, the haze) won't appear in the visor unless it is added to the room function.

It also has a cost. A real cube camera would reflect anything automatically, but it re-renders the scene six times per frame, and doing it on alternate frames brings back exactly the lag the brief rules out.

## Performance

Techniques:
- **Mesh and textures.**
  - Meshopt and quantised glTF: 37k vertices and 67k triangles in 388 KB.
  - KTX2 (UASTC + zstd) textures, transcoded in a worker.
  - H.264 clips with a 1 s GOP.
- **Rendering.**
  - Render on demand: the loop sleeps once the head, the quadrant brightness and the entry animation have settled.
  - While a clip plays and nothing else moves, the page renders only on new video frames.
  - Hidden tabs pause the clips and the loop.
  - Delta time is capped at 50 ms.
- **Pixel ratio.**
  - An adaptive governor works from the median of the last 90 frame intervals against the display's own refresh rate.
  - It steps in 0.25 increments and drops quickly but rises slowly.
  - It is capped at 2 and at an 8.3 MP budget, and it remembers the result per screen.
- **Warm-up before the helmet appears.**
  - Every texture is uploaded with `initTexture` and every program is compiled with `compileAsync`.
  - The first frame of every clip is decoded.
  - One hidden render runs into a 64×64 target.
  - Then the helmet appears with a small `back.out` scale and exposure fade, so the first turn never hitches and nothing pops in blank.
- **Clip watchdog.** If a clip that should be playing makes no progress for 3 s it gets a nudge, and a second time it is reloaded from the same timestamp.

### Measured

These were measured on a cloud VM **without a GPU**. Chrome renders WebGL in software (SwiftShader), which affects timings as follows:
- **Byte counts** are exact.
- **Load times** are pessimistic, because shader compilation runs on the CPU here.
- **GPU frame time** can't be measured here.

| | |
| --- | --- |
| JS | 196 KB (gzip) app + 15 KB KTX2 transcoder wrapper + 527 KB transcoder WASM (249 KB if the host compresses WASM, as most CDNs do) |
| Model | 388 KB (`helmet.glb`, including the 256² trim texture) |
| Textures | 99 KB (livery 89 KB as KTX2, logo 10 KB) |
| Video | 2.98 MB (four clips of 4–4.5 s at 720p) |
| Other | 3 KB (HTML, CSS, `content.json`) |
| Quadrants visible | 1.75 s on localhost, 1.36 s on 50 Mbps / 20 ms, 1.98 s on 12 Mbps / 70 ms (simulated 4G) |
| Helmet visible | 1.72 s on localhost, 2.15 s on 50 Mbps, 3.70 s on simulated 4G |
| CPU per frame | 0.6 ms median (motion and draw submission, 1440×900) |
| Motion | Same at 60 and 120 Hz: a corner-to-corner turn is 90 % done in 0.48 s, overshoot is 2.7 %, roll peaks at 10.7°, and a flicked spin settles in about 1.5 s |
| Sleep | The loop stops about 18 s after the last input (after the idle float fades). With no input and nothing playing, it renders 0 frames |

**Real GPUs (estimate, not measured).** Per pixel, the work is the quadrant pass (one filtered texture read) plus, inside the helmet's footprint, a physical material with clear coat and the room function (a ray-box hit and one or two filtered reads). On an integrated laptop GPU (Apple M1, Intel Iris Xe) at a 5 MP backbuffer, that should come to about 2–4 ms per frame. That is well inside 16.7 ms at 60 Hz and 8.3 ms at 120 Hz, and the governor lowers the resolution if not. Check this with `?hud` on real hardware, since `EXT_disjoint_timer_query` reports GPU time, before treating it as fact.

**Where the bytes go.**
- **Video** is 70–75 % of the page. The helmet waits for the first frame of every clip, because the visor shows them, so on a slow connection the clips hold back the helmet: 3.7 s on 4G.
- **KTX2's transcoder** (264 KB compressed) costs more than it saves when there's only one texture. KTX2 earns its place through GPU memory (5.6 MB instead of 22 MB for a 2K livery) and no main-thread decode, and that matters more once sections 2 and 3 add textures. For a hero with only the livery, a WebP livery is a fair choice, and `content.json` already accepts one.

**For production.**
- Serve over HTTP/2 or HTTP/3 with compression on WASM.
- Give each clip a small poster frame, and reveal the helmet when the posters (not the clips) are in.
- Let the clips stream after the helmet.
- Detect software rendering (`WEBGL_debug_renderer_info` reporting SwiftShader or llvmpipe) and show a still instead, as Grail does.

## How this compares to the reference studies

| | Nickho | Grail totems | A24 discs | This prototype |
| --- | --- | --- | --- | --- |
| Object | Pre-rendered 180-frame AVIF turntable (~7.8 MB), spun by scroll | Real-time GLB per figure (~0.7–1.2 MB) | Real-time discs (clear coat, iridescence, glass) | Real-time GLB (388 KB) + 99 KB of textures |
| Follows cursor | Slides ±52 px and leans ±11°, ignores vertical | Leans ±29° turn and ±23° nod | Not studied for this | Looks into every corner (±82° / ±60°), plus drag to spin 360° |
| Feel | Two-speed lag, `back.out` pop | Frame-rate-independent easing, bob | | Both, plus a spring with slight overshoot, roll into turns, idle float, momentum spin |
| Rendering | Redraws only when the frame changes | Every frame while active | Render on demand, adaptive resolution, pause off-screen | Render on demand, adaptive resolution with an MP budget, pauses when hidden |
| Loading | | Loads near the section, no cache, no preload | Worker texture decoding, GPU pre-upload, `compileAsync` | KTX2 worker transcoding, `initTexture`, `compileAsync`, hidden warm-up render, then reveal |

From **edolus** (section 21a):
- **Adopted as written:**
  - The `look-at × dragSpin × rest` composition.
  - `k = 1 − (1 − s)^(60·dt)` smoothing.
  - The camera ray onto a plane with a ±60° pitch clamp.
  - A slerp of 0.1 followed by a spring-damper.
  - Warm-up before the first show.
  - Uploads only on new video frames.
  - The stall watchdog.
  - An adaptive pixel ratio with a megapixel budget.
  - Tap to play and a tilt fallback.
- **The reflection caution is handled.** The reflection refreshes on every new video frame, and head-to-reflection lag is zero by construction.
- **One disagreement: video textures here keep mipmaps.** Edolus drops mipmaps from video textures. Here the visor shows each clip shrunk 5–10×, and without mipmaps that reflection shimmers as the head moves. The mips are rebuilt only when a new frame is uploaded, at 25–30 per second, on one clip at a time.

## Jack's real helmet

The placeholder is a generic closed-face car helmet. To make it Jack's, the choices are:

1. **Commission a model from photos (recommended).** Tell us the make and model of his helmet (for example Bell HP7, Stilo ST5 or Arai GP-7) and send 8–12 photos round it in even light, plus close-ups of the visor, vents and spoiler. A 3D artist can build a clean, game-ready shell, with the visor as its own mesh and UVs laid out for livery painting. This route gives the best result.
2. **Buy a model of the same shell.** Stock models of common racing helmets exist, as this placeholder shows. It is the cheapest route, but check the licence (CC BY or a commercial licence) and the topology.
3. **3D-scan his helmet.** This gets the shape exactly, but glossy paint and a mirrored visor scan badly. The helmet would need a temporary matte spray, and the result still needs retopology and new UVs. It's not worth it for a hero this size.

Whichever route is chosen, also get:
- His livery as flat artwork. Vector is best, otherwise a 2K PNG on the template.
- His logo.
- The visor tint (clear, smoked, iridium and which colour), so the visor shader can match it.

## Sources and licences

**Model.** "F1 Helmet ZhouGuanyu 24" by Miopass, [Sketchfab](https://sketchfab.com/3d-models/f1-helmet-zhouguanyu-24-1124fa1f754645d7b9d54de84009d463), CC BY 4.0. Modifications made here:
- The livery was replaced with a plain placeholder and the team-coloured trim recoloured graphite.
- The visor was split from the vents, and the vents simplified.
- The camera was removed.
- Everything was recompressed.

Credit is required wherever the prototype is shown.

**Clips.**

| Pillar | Source | Licence | Use |
| --- | --- | --- | --- |
| Sim Racing | ["A Woman Playing Driving Simulator"](https://www.pexels.com/video/a-woman-playing-driving-simulator-6498252/), Tima Miroshnichenko, Pexels | Pexels licence | 2.0–6.5 s |
| Racing | ["2023 TCR World Tour at El Pinar – Afternoon race Video 01"](https://commons.wikimedia.org/wiki/File:2023_TCR_World_Tour_at_El_Pinar_-_Afternoon_race_Video_01.webm), NaBUru38, Wikimedia Commons | CC BY-SA 4.0 | 41.6–45.6 s |
| Commentating | ["Man talking in front of a radio station microphone"](https://mixkit.co/free-stock-video/man-talking-in-front-of-a-radio-station-microphone-2963/), Mixkit | Mixkit Stock Video Free License | 2.0–6.5 s, landscape crop of a portrait clip |
| Coaching | ["Dashboard of a car"](https://mixkit.co/free-stock-video/dashboard-of-a-car-72/), Mixkit | Mixkit Stock Video Free License | 6.0–10.5 s |

The Racing clip is share-alike, so the trimmed clip is also CC BY-SA 4.0 and needs attribution. All four are placeholders until Jack's footage arrives.

## Dependencies

- **`three`** (MIT) is the only runtime dependency. It provides the renderer, `GLTFLoader`, `KTX2Loader` and `MeshoptDecoder`. Everything else, including the look-at, springs, reflection, governor and touch handling, is about 1,400 lines in `src/`.
- **`vite`** is the dev server and bundler.
- **`@gltf-transform/*` and `meshoptimizer`** are used only by `scripts/build-helmet.mjs`, to split, clean and compress the source model.
- **Outside npm:**
  - ffmpeg encodes the clips and handles some images.
  - KTX-Software's `ktx` makes the KTX2 textures.

## Files

```
src/main.js      page, render-on-demand loop, input, touch, arrival
src/motion.js    look-at, springs, roll, idle, drag spin
src/room.js      the reflection room shared by the visor, shell coat and quadrants
src/helmet.js    model loading, visor and shell materials, studio environment
src/quadrants.js the four clips as one full-screen pass
src/clips.js     video elements, shared textures, watchdog
src/perf.js      pixel-ratio governor, ?hud
src/capture.js   ?capture only
scripts/         asset build (model, livery, clips)
```
