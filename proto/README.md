# proto/ — a separate Three.js driving-view proof

This directory is a **standalone proof**, built to answer one question: can the
reference model-viewer's matte Three.js look work during real gameplay, on
desktop and mobile web? It does not touch `index.html`, `factory/CONTRACT.md`,
`test/contract.mjs`, or `tools/make-artifact.mjs`. The signed game is untouched.

See `docs/FEASIBILITY.md` for the full write-up. This file covers only how to
run and build this prototype, and what it found.

## Files

- `sim.js` — the race physics, copied line-for-line from `index.html`'s
  `const K = {...}` through `setInput`, wrapped in `createSim()` so this
  prototype can own an instance without touching `index.html`'s globals. If
  the real game's physics changes, this file must be updated by hand — it is
  a copy, not a shared import.
- `app.js` — the Three.js scene: matte ground and lights, an instanced track,
  a platform zone and signal, two placeholder trains, steam, a follow camera,
  keyboard and touch controls, a DOM HUD, quality tiers, and an FPS meter.
- `drive3d.html` — the dev entry point. It loads Three.js from
  `node_modules` through an import map, so it needs a static file server (ES
  module imports do not work over `file://`).
- `models/` — empty. See "About the model" below.

## Run it (dev)

```
npm install
npm run proto            # starts a static server on :8080
```

Then open `http://localhost:8080/proto/drive3d.html`.

- **Desktop**: W / Arrow-Up for throttle, S / Arrow-Down for brake, Space or
  the START button to start or restart.
- **Mobile / touch**: use the on-screen THROTTLE and BRAKE buttons.
- The **quality** chip (top right) toggles the tier by hand; it otherwise
  auto-detects a coarse pointer or a narrow viewport as "mobile".

## Build the self-contained proof

```
npm run proto:build       # writes dist/drive3d.html
```

`tools/make-proto.mjs` bundles Three.js, `GLTFLoader`, `sim.js`, and `app.js`
into one inline `<script>` with esbuild, and drops it into the same page
shell. The result opens directly from `file://` with **zero** external
requests — this is the proof that a real migration of `index.html` could
satisfy CONTRACT.md's C8 (self-contained, no CDN) if the team chose to inline
Three.js the same way. Current size: ~1.4 MB, far under the 16 MB cap.

## What this prototype found

- **The physics port is correct.** `sim.js` was checked directly against
  CONTRACT.md's C1 (a clean win, pinned to `rivalMax: 28`,
  `platformStart: 1400`, `grip: "DRY"`) and reproduces the same result, stop
  position, and win condition as `index.html`.
- **This sandbox has no GPU** (`/dev/dri` does not exist), so Chromium always
  falls back to SwiftShader software rendering here. A full-viewport WebGL
  canvas is capped at roughly 20 fps in this container regardless of scene
  content — confirmed by hiding every mesh in the scene and seeing no change,
  and by disabling `renderer.render()` entirely and seeing the frame rate jump
  to 60. The scene itself is cheap; the ceiling is this container's lack of a
  real graphics device. Real desktop and mobile GPUs do not have this
  ceiling.
- **A visible side effect in this sandbox**: the game's own
  `MAX_FRAME_DELTA_MS` clamp (copied from `index.html`, used to stop a
  returning background tab from jumping 30 seconds forward in one frame) also
  caps how much simulated time a single slow frame can carry. When the
  container's frame rate is chronically low, this clamp engages on every
  frame and the race runs in slow motion in real time. This is the same
  clamp the real game ships, doing its job — it just has more to do here
  because rendering is slow. On real hardware, at a normal frame rate, it
  rarely engages.
- **No free glTF train model was reachable.** The proxy in this environment
  only reaches `raw.githubusercontent.com` by exact path; general asset hosts
  (Kenney, Poly Pizza) returned a blocked CONNECT, and there is no working
  search over GitHub content to find a train model blind. The prototype uses
  a placeholder loco (boxes for the body and cab, a cylinder for the chimney
  and wheels) as agreed. See "About the model" below.

## About the model

`GLTFLoader` is already wired up in `app.js` (`tryLoadModel`): it tries
`models/loco.glb` and silently keeps the placeholder if that file is missing
or fails to load. To use a real model, drop a `.glb` at `proto/models/loco.glb`
— no code change is needed. Keep it low-poly for the mobile tier (a few
thousand triangles, one or two materials); a dense showroom-grade mesh will
cost real frame time on a phone GPU, unlike the software-rendering ceiling
described above, which is specific to this container.
