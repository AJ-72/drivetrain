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
test/contract.mjs          16 checks that drive a real browser
tools/make-artifact.mjs    strips the outer tags for the Artifact host
dist/artifact.html         the published copy, built by the script above
factory/                   the pipeline record: how and why it was built
```

The game needs no server, no build step, and no package. Open `index.html` in a
browser and it runs.

## 3. The four parts of index.html

Read the file in this order.

1. **`K`** — every constant. Track length, platform bounds, the player's
   acceleration and brake, the rival's acceleration and speed range, the arming
   distance, and the fixed time step.
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
| A faster train | `K.THROTTLE_ACCEL`. The player has no top speed. |
| A stronger brake | `K.BRAKE_DECEL` |
| A harder rival | Raise `K.RIVAL_MAX_SPEED` or `K.RIVAL_ACCEL` |
| A more or less random rival | The gap between `K.RIVAL_MIN_SPEED` and `K.RIVAL_MAX_SPEED` |
| A kinder early game | `K.ARM_AFTER_M` |
| A different look | The `:root` tokens in the `<style>` block |
| The scene drawing | `drawScene` and the functions under it |

After any change to `K`, run `node test/contract.mjs`. Check C11 in particular.
C11 measures the band of brake points that win. The band must measure between
120 m and 600 m. A band below 120 m makes the game unfair.

## 6. How the numbers fit together

The rival and the player share one physics function, `stepTrain`. It takes the
acceleration, the brake force, and the speed cap as arguments, so the two trains
differ only in the numbers passed to it. The player passes `Infinity` as the
cap. The rival brakes at a point solved from its drawn top speed, so it always
stops at `K.RIVAL_TARGET_M`.

The player has no top speed. The brake uses the same force as the throttle, so
the brake distance equals the distance already run. The nose stops at exactly
twice the brake point. That one fact explains the whole feel of the game.

With the shipped values:

- A brake at 830 m stops the nose at 1660 m after 51.55 s. That is the fastest
  safe run.
- A brake below 810 m undershoots. A brake above 950 m overshoots.
- The rival draws a top speed between 30 and 39 m/s for each race, and finishes
  between about 54.9 s and 66.2 s.
- Against the fastest rival, a brake between 810 m and 940 m wins.
- The rival leads for the first 25 s, because it accelerates harder. The player
  overtakes near 790 m.

Widening or narrowing the platform changes the win band by half that amount,
because the stop is twice the brake point. That is why the platform is 280 m
wide for a 130 m band.

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
5. **The random rival.** Every deterministic check must pin it with
   `test.start({rivalMax: n})`. An unpinned check is a flaky check.
6. **The debug object.** `window.__drivetrain` is not a debug extra. Every
   check reads it. Rename a field and the whole suite fails.
7. **The Artifact build.** `tools/make-artifact.mjs` removes the outer tags. The
   Artifact host supplies them. Publish `index.html` directly and the page shows
   nothing.
8. **External references.** The Artifact host blocks every other host. One CDN
   link and the page breaks in a way that a local test does not show. Check C8
   guards this.

## 8. How to test

```
node test/contract.mjs
```

The command prints one line per check and exits 0 only when all 16 pass. It
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
