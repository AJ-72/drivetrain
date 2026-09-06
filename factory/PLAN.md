# PLAN.md — Step 3, The Blueprint

Project: drivetrain
Date: 2026-08-10
Contract: `factory/CONTRACT.md`, revision 2, FROZEN.

## Standing instruction for the builder

Read this first. Follow it in every task.

1. Where this plan gives exact code, use that code without change.
2. Where a decision looks missing, stop and ask. Do not invent a value.
3. Never edit `factory/CONTRACT.md`.
4. Run `node test/contract.mjs` after every task. All earlier checks must stay
   green.
5. Stop at every `[STRUCTURAL]` task and wait for a human.

## Invariants

The rest of the code must respect these rules. The review checks each one.

- `index.html` is one file. It loads no other file.
- Only `stepTrain()` changes a train speed. No other code writes `speed`.
- Only `judge()` writes `state.result`. No other code writes it.
- The render code never changes the simulation state. Render reads only.
- The touch path and the key path both call `setInput()`. They share one path.
- `window.__drivetrain` exposes the live state object, not a copy.

## Task list

| ID | Blast radius | Name |
|---|---|---|
| T0 | `[STRUCTURAL]` | Environment gate |
| T1 | `[STRUCTURAL]` | The engine, with literal code |
| T2 | `[STRUCTURAL]` | The full test harness, all 13 checks |
| T3 | `[LEAF]` | Turn C1, C2, C3, C7, C9 green |
| T4 | `[STRUCTURAL]` | The win band sweep, C11 |
| T5 | `[LEAF]` | The canvas render and the portrait layout |
| T6 | `[LEAF]` | Touch and key input, C6 and C13 |
| T7 | `[LEAF]` | The best time store, C4 and C5 |
| T8 | `[LEAF]` | Robustness, C8, C10, C12 |
| T9 | `[LEAF]` | The artifact build script |
| T10 | `[STRUCTURAL]` | Publish and hand the link to the user |

---

## T0 `[STRUCTURAL]` — Environment gate

T0 blocks every other task.

Done-condition. Run these commands. All must return:

```
node -v
git --version
ls /opt/pw-browsers/chromium
git rev-parse --abbrev-ref HEAD
node -e "const{createRequire}=require('module');createRequire('/opt/node22/lib/node_modules/')('playwright');console.log('playwright ok')"
```

The last command must print `playwright ok`.

---

## T1 `[STRUCTURAL]` — The engine, with literal code

Create `index.html`. Use this code without change for the engine part. Add only
the render code and the input code in later tasks.

The file starts as a complete standalone HTML document. That form works from a
`file://` path and from the repository.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Drivetrain</title>
<style>/* T5 fills this */</style>
</head>
<body>
<canvas id="scene"></canvas>
<script>
"use strict";

const K = {
  TRACK_LENGTH_M:     2000,
  PLATFORM_START_M:   1740,
  PLATFORM_END_M:     1900,
  THROTTLE_ACCEL:     2.5,
  BRAKE_DECEL:        2.5,
  COAST_DECEL:        0.15,
  MAX_SPEED:          40,
  STOP_EPSILON:       0.05,
  RIVAL_BRAKE_M:      1568,
  FIXED_DT:           1 / 60,
  MAX_FRAME_DELTA_MS: 50,
  STEP_MS:            1000 / 60
};

const S = {
  state: "IDLE",
  result: null,
  playerPos: 0, playerSpeed: 0, playerArmed: false,
  rivalPos: 0,  rivalSpeed: 0,  rivalArmed: false, rivalDone: false,
  steps: 0, elapsedMs: 0,
  bestMs: null, newBest: false,
  input: { throttle: false, brake: false }
};

function stepTrain(train, throttle, brake) {
  let a;
  if (brake)         a = -K.BRAKE_DECEL;
  else if (throttle) a =  K.THROTTLE_ACCEL;
  else               a = -K.COAST_DECEL;

  train.speed += a * K.FIXED_DT;
  if (train.speed > K.MAX_SPEED) train.speed = K.MAX_SPEED;
  if (a < 0 && train.speed < K.STOP_EPSILON) train.speed = 0;
  if (train.speed < 0) train.speed = 0;
  train.pos += train.speed * K.FIXED_DT;
}

function finish(result) {
  S.result = result;
  S.state = "RESULT";
  if (result === "WIN") recordBest(S.elapsedMs);
}

function judge() {
  if (S.playerPos >= K.TRACK_LENGTH_M) {
    S.playerPos = K.TRACK_LENGTH_M;
    S.playerSpeed = 0;
    finish("OVERSHOT");
    return true;
  }
  if (S.playerArmed && S.playerSpeed === 0) {
    if (S.playerPos < K.PLATFORM_START_M)      finish("UNDERSHOT");
    else if (S.playerPos > K.PLATFORM_END_M)   finish("OVERSHOT");
    else                                        finish("WIN");
    return true;
  }
  return false;
}

function step() {
  if (S.state !== "RACING") return;

  S.steps += 1;
  S.elapsedMs = Math.round(S.steps * K.STEP_MS);

  const p = { pos: S.playerPos, speed: S.playerSpeed };
  stepTrain(p, S.input.throttle && !S.input.brake, S.input.brake);
  S.playerPos = p.pos; S.playerSpeed = p.speed;
  if (S.playerSpeed > 0) S.playerArmed = true;

  if (!S.rivalDone) {
    const r = { pos: S.rivalPos, speed: S.rivalSpeed };
    const braking = r.pos >= K.RIVAL_BRAKE_M;
    stepTrain(r, !braking, braking);
    S.rivalPos = r.pos; S.rivalSpeed = r.speed;
    if (S.rivalSpeed > 0) S.rivalArmed = true;
    if (S.rivalArmed && S.rivalSpeed === 0) S.rivalDone = true;
  }

  // The player is judged first. A stop on the same step wins.
  if (judge()) return;
  if (S.rivalDone) finish("RIVAL WINS");
}

function startRace() {
  S.state = "RACING";
  S.result = null;
  S.playerPos = 0; S.playerSpeed = 0; S.playerArmed = false;
  S.rivalPos = 0;  S.rivalSpeed = 0;  S.rivalArmed = false; S.rivalDone = false;
  S.steps = 0; S.elapsedMs = 0; S.newBest = false;
  S.input.throttle = false; S.input.brake = false;
}

function resetRace() {
  startRace();
  S.state = "IDLE";
}

function setInput(next) {
  if (typeof next.throttle === "boolean") S.input.throttle = next.throttle;
  if (typeof next.brake === "boolean")    S.input.brake = next.brake;
}

function recordBest(ms) { /* T7 fills this */ }
function render() { /* T5 fills this */ }

let manual = false;
let lastFrameMs = 0;
let accMs = 0;

function frame(nowMs) {
  if (!manual) {
    let delta = lastFrameMs === 0 ? 0 : nowMs - lastFrameMs;
    lastFrameMs = nowMs;
    if (delta > K.MAX_FRAME_DELTA_MS) delta = K.MAX_FRAME_DELTA_MS;
    if (delta < 0) delta = 0;
    accMs += delta;
    while (accMs >= K.STEP_MS) { step(); accMs -= K.STEP_MS; }
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__drivetrain = {
  get state()       { return S.state; },
  get result()      { return S.result; },
  get playerPos()   { return S.playerPos; },
  get playerSpeed() { return S.playerSpeed; },
  get rivalPos()    { return S.rivalPos; },
  get rivalDone()   { return S.rivalDone; },
  get elapsedMs()   { return S.elapsedMs; },
  get bestMs()      { return S.bestMs; },
  track: {
    length:        K.TRACK_LENGTH_M,
    platformStart: K.PLATFORM_START_M,
    platformEnd:   K.PLATFORM_END_M
  },
  test: {
    start() { manual = true; startRace(); },
    setInput(next) { setInput(next); },
    step(n) { manual = true; for (let i = 0; i < n; i += 1) step(); },
    reset() { manual = true; resetRace(); }
  }
};
</script>
</body>
</html>
```

### Load-bearing details, and what breaks without them

- `if (a < 0 && train.speed < K.STOP_EPSILON)` — the guard `a < 0` matters. The
  first throttle step gives a speed of 0.0417. Without the guard, the code snaps
  that speed to 0 and the train never starts.
- `S.input.throttle && !S.input.brake` — the brake wins over the throttle. Check
  C10 tests this.
- `judge()` runs before the rival test. A stop on the same step gives the player
  the win. The brief states this rule.
- `S.elapsedMs = Math.round(S.steps * K.STEP_MS)` — the time comes from the step
  count, not from the wall clock. Without this, C1 and C9 give different results
  on a loaded machine.
- `lastFrameMs === 0 ? 0 : ...` — the first frame must add no time.
- The clamp `MAX_FRAME_DELTA_MS` makes check C12 pass. Without it, a hidden tab
  teleports the train past the platform.
- `manual` stops the real-time loop during a test. Without it, wall-clock jitter
  makes every check flaky.

### Done-condition — attack it, do not confirm it

Run this. It must print the four lines shown:

```
node -e "
const {createRequire}=require('module');
const {chromium}=createRequire('/opt/node22/lib/node_modules/')('playwright');
(async()=>{
 const b=await chromium.launch();const p=await b.newPage();
 await p.goto('file:///home/user/drivetrain/index.html');
 console.log('idle:', await p.evaluate(()=>__drivetrain.state));
 await p.evaluate(()=>{__drivetrain.test.start();__drivetrain.test.setInput({throttle:true});__drivetrain.test.step(960);});
 console.log('pos960:', Math.round(await p.evaluate(()=>__drivetrain.playerPos)));
 console.log('speed960:', Math.round(await p.evaluate(()=>__drivetrain.playerSpeed)));
 await p.evaluate(()=>__drivetrain.test.step(4000));
 console.log('result:', await p.evaluate(()=>__drivetrain.result));
 await b.close();
})();"
```

Expected output:

```
idle: IDLE
pos960: 320
speed960: 40
result: OVERSHOT
```

`pos960` proves the acceleration curve. `result: OVERSHOT` proves the tuning
rule from the brief.

---

## T2 `[STRUCTURAL]` — The full test harness, all 13 checks

Write `test/contract.mjs`. Write every check C1 to C13 before any game feature
exists. The harness comes first, so the code cannot shape the exam.

Rules for the harness:

- Load Playwright with `createRequire("/opt/node22/lib/node_modules/")`.
- Install no package.
- Use a viewport of 390 by 844 and `hasTouch: true`.
- Load the page from `file://` plus the absolute path of `index.html`.
- Print `PASS <id> <note>` or `FAIL <id> <reason>` on one line for each check.
- Exit with code 0 only when every check passes.
- Read state only through `window.__drivetrain`.
- Use `__drivetrain.test` for every check except C6, C12, and C13.

Helper that every check uses:

```js
async function driveToBrake(page, brakeAtM) {
  return page.evaluate((x) => {
    const d = window.__drivetrain;
    d.test.start();
    d.test.setInput({ throttle: true, brake: false });
    let guard = 0;
    while (d.playerPos < x && d.state === "RACING" && guard < 20000) {
      d.test.step(1); guard += 1;
    }
    d.test.setInput({ throttle: false, brake: true });
    guard = 0;
    while (d.state === "RACING" && guard < 20000) { d.test.step(1); guard += 1; }
    return { result: d.result, pos: d.playerPos, ms: d.elapsedMs };
  }, brakeAtM);
}
```

Write each check exactly as `CONTRACT.md` states it. Change no threshold.

### Done-condition

Run `node test/contract.mjs`. The command must print 13 lines. Many lines show
`FAIL`, because the game is not complete. That is correct at this task.

The command must not crash. The command must exit with a code other than 0.

---

## T3 `[LEAF]` — Turn C1, C2, C3, C7, C9 green

Fix the engine until these five checks pass. Do not touch the harness unless it
disagrees with `CONTRACT.md`. If it disagrees, stop and ask.

Done-condition: `node test/contract.mjs` prints `PASS C1`, `PASS C2`,
`PASS C3`, `PASS C7`, and `PASS C9`.

---

## T4 `[STRUCTURAL]` — The win band sweep, C11

Run check C11. It sweeps the brake point in 10 m steps.

Expected band, from the arithmetic in `DECISIONS.md` D9: `1420..1560`. The width
is 140 m. The floor is 120 m.

If the band is below 120 m, stop. Do not change `CONTRACT.md`. Ask the user, and
propose a lower `PLATFORM_START_M`. Record the change in `DECISIONS.md`.

Done-condition: `node test/contract.mjs` prints `PASS C11` and the measured
band. A human reads the band and confirms it.

---

## T5 `[LEAF]` — The canvas render and the portrait layout

Draw the scene on the canvas. Fill the `render()` function and the `<style>`
block.

Requirements:

- A portrait layout. The canvas fills the width at 390 CSS pixels.
- Two horizontal tracks. The rival runs on the upper track. The player runs on
  the lower track.
- Both trains use simple shapes. All art is code. No image file.
- A marked platform band from 1740 m to 1900 m on the player track.
- A camera that follows the player train and shows the platform on approach.
- A HUD with the speed, the distance to the platform, the race time, and the
  best time.
- One result string on the result screen. The other three strings do not appear.
- A light theme and a dark theme, through `prefers-color-scheme`.
- `render()` reads state. `render()` never writes state.

Done-condition:

- `node test/contract.mjs` still prints `PASS` for C1, C2, C3, C7, C9, C11.
- A screenshot at 390 by 844 shows the track, both trains, the platform band,
  and the HUD.

---

## T6 `[LEAF]` — Touch and key input, C6 and C13

Add the controls.

- A THROTTLE button and a BRAKE button, each at least 64 by 64 CSS pixels.
- A START button.
- `pointerdown` sets an input. `pointerup`, `pointercancel`, `pointerleave`, and
  `touchcancel` clear that input.
- `keydown` and `keyup` on `ArrowUp`, `w`, `ArrowDown`, `s`, and the space bar.
- Every path calls `setInput()`. No path writes `S.input` on its own.
- `touch-action: none` on the controls, to stop the browser scroll.

Done-condition: `node test/contract.mjs` prints `PASS C6` and `PASS C13`.

---

## T7 `[LEAF]` — The best time store, C4 and C5

Fill `recordBest()`.

```js
const BEST_KEY = "drivetrain.bestMs";

function readBest() {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
  } catch (e) { return null; }
}

function writeBest(ms) {
  try { window.localStorage.setItem(BEST_KEY, String(ms)); } catch (e) { }
}

function recordBest(ms) {
  if (S.bestMs === null || ms < S.bestMs) {
    S.bestMs = ms;
    S.newBest = true;
    writeBest(ms);
  }
}
```

Call `S.bestMs = readBest();` one time at load.

Show the time as seconds with exactly two decimals. Use
`(ms / 1000).toFixed(2) + "s"`.

Show `NEW BEST` only when `S.newBest` is true.

Done-condition: `node test/contract.mjs` prints `PASS C4` and `PASS C5`.

---

## T8 `[LEAF]` — Robustness, C8, C10, C12

- Remove every external reference from the file.
- Install no `window.onerror` handler.
- Emit no `console.error` and no `console.warn`.
- Handle a resize. Redraw the canvas at the new size.
- Confirm the frame delta clamp works after a hidden tab.

Done-condition: `node test/contract.mjs` prints `PASS C8`, `PASS C10`, and
`PASS C12`. The exit code is 0 and all 13 checks pass.

---

## T9 `[LEAF]` — The artifact build script

The Claude Artifact host adds the `<!doctype>`, `<head>`, and `<body>` tags. The
repository file holds them already. One source file must serve both targets.

Write `tools/make-artifact.mjs`. It reads `index.html`. It writes
`dist/artifact.html` with the outer tags removed. It keeps the `<style>` block,
the `<canvas>` element, and the `<script>` block.

Done-condition:

- `node tools/make-artifact.mjs` writes `dist/artifact.html`.
- `dist/artifact.html` contains no `<!doctype`, no `<html`, no `<head`, and no
  `<body` tag.
- `dist/artifact.html` contains `__drivetrain`.

---

## T10 `[STRUCTURAL]` — Publish and hand the link to the user

- Publish `dist/artifact.html` as a Claude Artifact.
- Give the user the link.
- The user opens the link on the phone and taps a control.

Done-condition: the user confirms that the page loads and that a tap moves the
train.

---

## Order and reason

Structural work lands early and in few places:

1. T0 proves the ground.
2. T1 fixes the engine and the debug interface. Every later task depends on it.
3. T2 fixes the exam before the answers exist.
4. T4 tests the one claim that makes the game worth playing.
5. T10 is the only other checkpoint, because it reaches the user.

T3, T5, T6, T7, T8, and T9 are leaf tasks. Each one has one done-condition and
no open decision.
