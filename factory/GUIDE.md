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
| `RIVAL WINS` | The rival stops first. |

## 2. The shape of it

```
index.html                 the whole game: markup, style, and script
test/contract.mjs          13 checks that drive a real browser
tools/make-artifact.mjs    strips the outer tags for the Artifact host
dist/artifact.html         the published copy, built by the script above
factory/                   the pipeline record: how and why it was built
```

The game needs no server, no build step, and no package. Open `index.html` in a
browser and it runs.

## 3. The four parts of index.html

Read the file in this order.

1. **`K`** — every constant. Track length, platform bounds, acceleration, brake
   force, top speed, the rival brake point, and the fixed time step.
2. **`S`** — the whole game state, in one object.
3. **The simulation** — `stepTrain`, `judge`, `step`, `startRace`, `resetRace`.
4. **The screen** — `render`, `drawScene`, `drawTrain`, `drawStation`,
   `drawSignal`, and the input handlers.

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
| An easier or harder stop | `K.PLATFORM_START_M` and `K.PLATFORM_END_M` |
| A faster train | `K.MAX_SPEED` or `K.THROTTLE_ACCEL` |
| A stronger brake | `K.BRAKE_DECEL` |
| A harder rival | Lower `K.RIVAL_BRAKE_M` |
| A different look | The `:root` tokens in the `<style>` block |
| The scene drawing | `drawScene` and the functions under it |

After any change to `K`, run `node test/contract.mjs`. Check C11 in particular.
C11 measures the band of brake points that win. The band must measure between
120 m and 600 m. A band below 120 m makes the game unfair.

## 6. How the numbers fit together

The rival and the player share one physics function. The rival holds full power
until `K.RIVAL_BRAKE_M`, then brakes.

With the shipped values:

- The train reaches 40 m/s after 16.0 s and after 320 m.
- A brake from 40 m/s to a stop needs 16.0 s and 320 m.
- The best possible time is 59.50 s. That needs a brake at 1420 m.
- The rival stops at 63.20 s.
- A brake between 1420 m and 1560 m wins.

Change one number and all of these move. The checks tell you where they land.

## 7. The parts most likely to break

1. **The integration order in `stepTrain`.** The train moves first, then the
   speed changes. The reverse order shortens every brake by about 0.34 m, and a
   brake at 1420 m then stops short of the platform. A comment in the code says
   this. Do not reorder those lines.
2. **The `a < 0` guard on the stop epsilon.** Without it, the first throttle
   step gets snapped to zero speed and the train never starts.
3. **The frame delta clamp.** `K.MAX_FRAME_DELTA_MS` stops a hidden tab from
   teleporting the train. Remove it and a phone call loses your race.
4. **The debug object.** `window.__drivetrain` is not a debug extra. Every
   check reads it. Rename a field and the whole suite fails.
5. **The Artifact build.** `tools/make-artifact.mjs` removes the outer tags. The
   Artifact host supplies them. Publish `index.html` directly and the page shows
   nothing.
6. **External references.** The Artifact host blocks every other host. One CDN
   link and the page breaks in a way that a local test does not show. Check C8
   guards this.

## 8. How to test

```
node test/contract.mjs
```

The command prints one line per check and exits 0 only when all 13 pass. It
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
