# FEASIBILITY.md — a Three.js showroom UI, applied to a driving game

## The question

The user wants `drivetrain`'s UI to look like a reference image: a clean,
matte, studio-lit Three.js model viewer, with floating labels and inspection
controls ("Explode", "Steam", rotate, undo). Is that style feasible for this
game — a one-job, mobile-portrait train braking/racing game — while the
player is actually driving? What has to change, and what are the performance
risks?

A working proof lives in `proto/` (see `proto/README.md`). This document is
the analysis; the numbers it cites came from building and testing that proof.

## 1. What the reference UI actually is

Broken into Three.js parts, the reference is a **showroom**, not a game view:

- A matte "clay" studio look: a neutral ground, a soft key light, a fill
  light, and a soft contact shadow.
- An **orbit camera** circling one centered model. Nothing else is in the
  scene.
- Floating labels anchored to points on the model (name plates, part call-outs).
- Action controls with no time pressure: **Explode** (pull the assembly
  apart), **Steam** (a particle effect), rotate, undo.

Every one of these choices assumes low frame pressure and one static subject.
There is no track, no opponent, no clock.

## 2. This game is not a showroom

`drivetrain` (per `factory/BRIEF.md`) gives the player one job: hold the
throttle, then brake, to stop inside a moving platform zone before a rival
train stops — on a phone, in portrait, against a clock. The two UIs solve
different problems. Mapping one onto the other, feature by feature:

| Reference feature | In this game | Why |
|---|---|---|
| Matte studio look, soft light | **Carries over** | It suits the calm rail theme and reads well on a phone screen in daylight. |
| Steam / chimney smoke | **Carries over**, capped | It is atmospheric, cheap in small doses, and the source (a chimney) already exists in the game's own art. |
| "Explode" view, part labels, orbit | **Dropped during play** | This game has no garage or inspection step — nothing to explode or orbit while a race is live. These belong to a browsing mode, not a braking run. |
| Floating 3D labels | **Replaced** with the existing DOM HUD | `index.html` already puts speed, the stop marker, and the result in HTML text outside the canvas — not in the 3D scene. That choice is right for a driving game and the prototype keeps it. |
| Side-on 2D view | **Replaced** with a 3D follow camera | The reference's single fixed viewing habit (orbit) doesn't fit a race; a chase camera behind the train does. |
| One static subject | **Replaced** with a track, a platform, a signal, and a rival train | The game's world, not a shelf. |

**Verdict on style**: the matte look and the steam effect are the parts of the
reference worth keeping. The interaction model (orbit, Explode, floating
labels) is a showroom pattern and does not fit a timed driving task. If the
team later wants a garage/inspect screen (choosing a locomotive before a
race), that is exactly where the full reference style belongs — as a
**separate mode**, not layered onto driving.

## 3. The real blockers: this game is a signed contract

`drivetrain`'s `index.html` is not a blank page — it is built against a
signed `factory/CONTRACT.md` (revision 6) and enforced by ~24 automated
checks in `test/contract.mjs`. Two of those checks directly conflict with a
literal "swap in Three.js" migration:

- **C8 — the page is self-contained.** No request may go to a host other
  than the page's own origin; no CDN, no `@import`. Three.js cannot be
  `<script src="https://cdn...">` in the real game. It must be **inlined**.
  This is solved and proven: `tools/make-proto.mjs` bundles Three.js,
  `GLTFLoader`, the physics, and the app into one inline script with esbuild,
  and the result opens from `file://` with zero external requests, at ~1.4 MB
  — far under the 16 MB cap. The same approach would work for `index.html`.

- **C24 — the scene is read as 2D canvas pixels.** This check calls
  `canvas.getContext("2d")` to prove the picture is not blank. A canvas
  already initialized as a WebGL context returns `null` from
  `getContext("2d")` — the two are mutually exclusive on one `<canvas>`
  element. A real migration would need to **revise C24** to read WebGL
  pixels instead (`renderer: { preserveDrawingBuffer: true }` plus
  `gl.readPixels`, or `canvas.toDataURL()`), keeping its actual intent (the
  scene is painted, not blank) without comparing against a golden image,
  which the contract already forbids. **This is a contract change and needs
  the user's signature** — it is not something to do quietly inside a
  refactor.

Given this, the prototype was deliberately kept **separate**: `proto/` copies
the physics into `proto/sim.js` and never touches `index.html`, so nothing
signed is put at risk to answer the feasibility question.

## 4. Performance

### What the prototype measured

The scene itself is small: a 2000 m track (rendered as one instanced mesh for
sleepers and two long rail meshes — three draw calls total, not thousands),
two low-poly trains, a platform box, a signal, and a capped particle system.
Hiding every object in the scene changed the frame rate by nothing, and the
JS side of the frame loop (physics step, HUD text updates, camera lerp,
particle update) cost well under 1 ms per frame. **The scene is not the risk.**

The one real cost the prototype found — `renderer.render()` — is a property
of the *build environment* the prototype was tested in, not the scene: this
particular container has no GPU device at all (`/dev/dri` does not exist), so
every WebGL call falls back to SwiftShader software rendering, and a
full-viewport canvas is capped near 20 fps here regardless of content. That
ceiling is specific to this sandbox; it says nothing about a real phone or
desktop, both of which have actual GPUs. It is reported here for honesty, not
as a projected result.

### What still needs care on real hardware (desktop + mobile web)

- **Device pixel ratio.** A phone's DPR (2–3+) multiplies every pixel the
  GPU must shade. Clamp it — the prototype uses 1.5 on the mobile tier, 2 on
  desktop.
- **Shadows.** Real-time shadow maps are one of the more expensive things a
  weak mobile GPU can be asked to do. The prototype's mobile tier turns
  `renderer.shadowMap.enabled` off and uses a cheap baked blob shadow under
  each train instead; desktop keeps a real shadow.
- **Materials.** Prefer `MeshLambertMaterial` over `MeshStandardMaterial` for
  large, flatly-lit surfaces (ground, track) — full PBR shading (roughness,
  metalness) costs more per pixel for a look that, per the reference's own
  matte aesthetic, does not need it. Reserve standard/physical materials for
  small hero objects if any.
- **Draw calls.** Use `InstancedMesh` for anything repeated (sleepers, poles,
  trees, cars). The prototype's entire 2000 m track — about 1,000 sleepers —
  is one draw call.
- **Particles.** Cap the steam count by tier (40 desktop / 14 mobile in the
  prototype) and update a fixed-size buffer in place — never allocate a new
  particle object per frame.
- **Postprocessing.** Skip bloom/AA passes on mobile; plain MSAA or no AA is
  cheaper than a full post pipeline.
- **The frame-delta clamp.** Keep `index.html`'s existing
  `MAX_FRAME_DELTA_MS` guard (C12) in any 3D version — it is what stops a
  returning backgrounded tab from jumping the train forward by 30 simulated
  seconds in one frame. The prototype copies this clamp unchanged.
- **HUD updates.** Keep results, speed, and time as DOM text outside the
  canvas (as `index.html` already does) rather than as 3D-anchored floating
  labels rendered every frame — cheaper, and it is what the reference itself
  does for anything that must stay legible while moving.
- **Quality tiers.** Auto-detect a coarse pointer / narrow viewport as
  "mobile" and pick a lighter tier, but give the player a manual override —
  device detection is a guess, not a certainty.

### A note specific to this game

Because the whole track is only 2000 m and the camera only ever needs the
area right around the train, **chunking and frustum culling of the track
were not needed** to hit a cheap draw-call count here. That would change if
the game ever grew an open, much longer, or branching world — worth
flagging now so it isn't assumed automatically necessary, and isn't forgotten
if the track ever grows.

## 5. Migration path, if the team wants one later

1. Revise C8's handling to describe the inlined-Three.js approach explicitly
   (already proven safe by `tools/make-proto.mjs`).
2. Revise C24 to read WebGL pixels instead of a 2D context, keeping its
   coverage-ratio intent and its ban on golden-image comparison.
3. Re-sign `factory/CONTRACT.md` with the user.
4. Refactor `index.html` to import a shared simulation module (what
   `proto/sim.js` is a stand-in copy of today) so the physics has one source
   of truth again, instead of the two-copy state this proof deliberately
   introduced.
5. Replace `drawScene()` with the 3D scene, camera, and HUD wiring proven in
   `proto/app.js`.

None of this is required to answer the feasibility question — the proof
already stands on its own, untouched by these steps.

## 6. Verdict

**Feasible**, with two changes and one caveat:

- Split the UI into two modes: keep the reference's full showroom style
  (orbit, Explode, floating labels) for a possible garage/inspect screen;
  use a lean follow-camera drive mode — matte look and steam kept, DOM HUD
  kept — for actual racing.
- Treat Three.js's self-contained bundling (C8) and its pixel-check
  incompatibility with a 2D canvas (C24) as real, signed-contract work, not
  incidental detail — they need the user's sign-off before any migration of
  the real game.
- The scene itself is cheap on any real GPU; the frame-rate ceiling this
  proof measured is a property of the sandbox it ran in, not of the design.
