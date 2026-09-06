# GUIDE.md — Owner's Manual

Project: drivetrain
For: a person who was not here when this was built.

## 1. What the thing is

`drivetrain` is a browser game. One HTML file holds all of it.

You drive a train to a station. A rival train races you. You must stop your
train with the nose inside the platform zone. You must stop before the rival
completes its own stop.

The game gives four results:

| Result | Cause |
|---|---|
| `WIN` | You stop inside the zone, before the rival stops. |
| `UNDERSHOT` | You stop before the zone. |
| `OVERSHOT` | You stop after the zone, or you reach the end of the rail. |
| `RIVAL WINS` | The rival completes its stop while you are still moving. |

Every result also states its cause in a line beneath it, so a loss explains
itself.

## 2. The shape of it

```
index.html                 the whole game: markup, style, and script
test/contract.mjs          24 checks that drive a real browser
tools/make-artifact.mjs    strips the outer tags for the Artifact host
dist/artifact.html         the published copy, built by the script above
factory/                   the pipeline record: how and why it was built
```

The game needs no server, no build step, and no package. Open `index.html` in a
browser and it runs.

## 3. The four parts of index.html

Read the file in this order.

1. **`K`** — every constant. Track length, the range the station is drawn from,
   the player's tractive effort and brake, the resistance terms, the rail grips,
   the rival's power and speed range, the warning distance, the arming distance,
   and the fixed time step.
2. **`S`** — the whole game state, in one object.
3. **The simulation** — `stepTrain`, `judge`, `step`, `startRace`, `resetRace`.
4. **The screen** — `render`, `reasonText`, `fitText`, `drawScene`, `drawTrain`,
   `drawStation`, `drawSignal`, `drawWarningBoard`, `drawStopMarker`,
   `drawRivalEdge`, and the input handlers.

## 4. Where the state lives

All game state sits in the object `S` in `index.html`.

One value survives a page close: the best time. The game writes it to
`localStorage` under the key `drivetrain.bestMs`, as an integer count of
milliseconds.

Nothing else persists. The game sends nothing to any server.

## 5. What to touch to change behaviour

| You want | Change this |
|---|---|
| A longer or shorter race | `K.TRACK_LENGTH_M` |
| An easier or harder stop | `K.PLATFORM_WIDTH_M`. The win band is about three quarters of the width. |
| Where the station can sit | `K.PLATFORM_MIN_START_M` and `K.PLATFORM_MAX_START_M` |
| How slippery a wet rail is | `K.GRIPS` |
| How early the warning comes | `K.WARN_BEFORE_M` |
| How hard the rival answers a lead | `K.RIVAL_BOOST` and `K.RIVAL_BOOST_RANGE_M` |
| A stronger shove off the line | `K.PLAYER_FMAX` |
| More pull at speed | `K.PLAYER_POWER` |
| A higher natural ceiling | Lower `K.RES_R2` |
| A stronger brake | `K.BRAKE_DECEL` |
| A harder rival | Raise `K.RIVAL_MAX_SPEED`, `K.RIVAL_POWER`, or `K.RIVAL_FMAX` |
| A more or less random rival | The gap between `K.RIVAL_MIN_SPEED` and `K.RIVAL_MAX_SPEED` |
| A kinder early game | `K.ARM_AFTER_M` |
| A different look | The `:root` tokens in the `<style>` block |
| The scene drawing | `drawScene` and the functions under it |

After any change to `K`, run `node test/contract.mjs`. Check C11 in particular.
C11 measures the band of brake points that win. The band must measure between
120 m and 600 m. A band below 120 m makes the game unfair.

## 6. How the numbers fit together

The rival and the player share one physics function, `stepTrain`. It takes a
spec of `{fmax, power, brake}` and a speed cap, so the two trains differ only in
the numbers passed to it. The player passes `Infinity` as the cap. The rival
brakes at the last moment its own stopping distance allows, so it stops in the
middle of the platform whatever speed it holds.

The player has no written top speed. Tractive effort holds at `PLAYER_FMAX`
until about 38 m/s, then falls as `PLAYER_POWER / speed`. Resistance rises as
`RES_R0 + RES_R2 * speed^2`. The two balance near 67 m/s, about 241 km/h. That
ceiling is the machine, not a cap.

Because resistance helps the brake, the stopping distance is **not** the speed
squared over twice the brake. The exact form is:

```
stopDistance(v) = ln(1 + RES_R2 * v^2 / (brake + RES_R0)) / (2 * RES_R2)
```

The stop marker reads exactly this. C19 holds it to within 5 m of the true stop
across nine runs, and measured 1.09 m at worst. If you change the physics, this
formula must change with it or the marker starts lying.

Measured win bands against the hardest rival, at every station position:
180 m to 190 m dry, 170 m to 180 m damp, 160 m to 170 m wet. The floor is 120 m.

A wet rail hurts the player much more than the rival, because the rival spends
most of its race cruising. Without a correction the wet race is unwinnable, and
the measured band was 0 m. The factor `0.68 + 0.32 * grip` eases the rival on a
wet rail, which is what a real driver does.

Widening the platform widens the band by roughly three quarters of the change.

Change one number and all of these move. The checks tell you where they land.

## 7. The parts most likely to break

1. **The integration order in `stepTrain`.** The train moves first, then the
   speed changes. The reverse order shortens every brake and the canonical win
   stops short of the platform. A comment in the code says this. Do not reorder
   those lines.
2. **The `a < 0` guard on the stop epsilon.** Without it, the first throttle
   step gets snapped to zero speed and the train never starts.
3. **The frame delta clamp.** `K.MAX_FRAME_DELTA_MS` stops a hidden tab from
   teleporting the train. Remove it and a phone call loses your race. Check C12
   injects a 30 s frame gap to prove the clamp still works.
4. **The held input sets.** Each control tracks which sources hold it. A single
   shared boolean lets one finger's release drop another finger's hold. Do not
   simplify `held` back into a boolean.
5. **Three random draws.** The station, the rail, and the rival top speed are
   drawn per race. Every deterministic check must pin all three with
   `test.start({rivalMax, platformStart, grip})`. An unpinned check is a flaky
   check.
6. **The stopping-distance formula.** `stopDistance()` is the exact integral of
   the brake against a resistance that grows with the square of the speed. The
   stop marker is the instrument the player drives on. Change the physics and
   this must change with it, or the marker lies.
7. **The debug object.** `window.__drivetrain` is not a debug extra. Every
   check reads it. Rename a field and the whole suite fails.
8. **The Artifact build.** `tools/make-artifact.mjs` removes the outer tags. The
   Artifact host supplies them. Publish `index.html` directly and the page shows
   nothing.
9. **External references.** The Artifact host blocks every other host. One CDN
   link and the page breaks in a way that a local test does not show. Check C8
   guards this.
10. **Canvas labels.** Every label goes through `fitText`, which clamps it inside
    the canvas. A clipped label is invisible to every state-based check. A
    screenshot from the owner is what found the last one.

## 8. How to test

```
node test/contract.mjs
```

The command prints one line per check and exits 0 only when all 24 pass. It
needs no install. It reads Playwright from the container path
`/opt/node22/lib/node_modules`.

## 9. How to publish an update

```
node tools/make-artifact.mjs
```

Then publish `dist/artifact.html` to the same Artifact URL. Publishing a new
file path creates a new link.

## 10. What the game does not do

No network play. No junctions or signals that change the route. No cargo, money,
or upgrades. No sound. No accounts. One track only.

These are refusals, not gaps. `factory/BRIEF.md` section 14 records them.
