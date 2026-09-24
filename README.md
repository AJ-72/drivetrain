# drivetrain

A browser game about stopping a train on a platform, faster than a rival can.

One HTML file. No server, no build step, no dependencies. Open `index.html` in a
browser and it runs.

**Play it:** https://claude.ai/code/artifact/17059745-690c-4ab0-af19-5f568e4e56b6

**Indie version:** `godot/` holds *Last Stop*, a Godot 4 remake of this game with
pixel art, synthesized sound and music, an 8-station campaign, a free-race
career, and export presets for web and desktop. See [`godot/README.md`](godot/README.md).
Both games are published to GitHub Pages from `main` (Last Stop at the root, this
game at `/classic/`).

---

## For a player

You drive the lower train. A computer rival drives the upper one. Both start at
the same moment and race to the same station.

**Winning is not arriving first.** You must bring your train to a complete stand
with its nose inside the platform zone, *before* the rival completes its own
stop. You can be metres ahead of the rival on the track and still lose, because
position never decides this race — stopping does.

### Controls

| | Touch | Keyboard |
|---|---|---|
| Power | Hold **THROTTLE** | `↑` or `W` |
| Brake | Hold **BRAKE** | `↓` or `S` |
| Start / restart | Tap **START** | `Space` |

Hold both and the brake wins.

### The four results

| Result | What happened |
|---|---|
| `WIN` | You stopped inside the platform before the rival stopped. |
| `UNDERSHOT` | You stopped short of the platform. |
| `OVERSHOT` | You stopped past it, or ran off the end of the track. |
| `RIVAL WINS` | The rival finished its stop while you were still moving. |

Every result also tells you *why* — the distance you were short by, the speed you
still carried, and so on.

### What makes it hard

**The station moves every race**, between 1300 m and 1520 m. There is no brake
point to memorise. You have to judge it live.

**The rail changes.** Each race draws `DRY`, `DAMP`, or `WET`. A wet rail carries
you roughly 35% further under the same brake. It also shifts where you must start
braking by about 150 m — that shift is the read.

**The pull fades.** Tractive effort is flat off the line, then falls away as you
gain speed, while air resistance climbs. Each ten seconds at full power buys less
than the last. There is no speed cap; the machine simply runs out of breath
around 240 km/h.

**The rival fights back.** It accelerates harder than you and leads early. It
draws a fresh top speed each race, and pushes harder when you pull clear.

### Reading the instruments

Six gauges, all about *your* train. There is deliberately no rival speedometer —
you read the rival by watching it, the way a driver would.

- **STOP NEEDS** — how far you need to come to a stand, right now, on this rail.
- **PLATFORM IN** — how far the platform is. Blank until you pass the distant
  signal.
- **RAIL** — the grip for this race.

The two that matter are `STOP NEEDS` and `PLATFORM IN`. **Brake when they're
about equal.**

On the track itself:

- A **dashed marker** shows where you'd come to rest if you braked this instant.
  It turns green inside the platform. This is the instrument to drive on — the
  braking maths is not something you can do in your head.
- An **amber diamond** 400 m out is the distant signal. Passing it starts the
  callout and reveals the platform distance.
- A **red banner** reads `RIVAL IS STOPPING` when the rival begins its final
  brake. That's your deadline made visible.
- An **arrow at the screen edge** shows the rival's distance when it's off
  camera — green when it trails, red when it leads.

### One tip

On a wet rail, don't shed speed early. An early brake costs far more time than
the stopping distance it saves, and creeping the last few hundred metres is the
most common way to lose a race you were winning.

---

## For an agent or developer

### Layout

```
index.html                 the entire game: markup, style, and script
test/contract.mjs          23 acceptance checks, driving real Chromium
tools/make-artifact.mjs    strips the outer tags for the Artifact host
dist/artifact.html         the published copy, built by the script above
factory/                   the design record — see below
```

### Run the checks

```
node test/contract.mjs
```

Prints one line per check; exits `0` only if all 23 pass. It installs nothing —
it loads Playwright from the container path `/opt/node22/lib/node_modules` and
drives Chromium at 390×844 with touch enabled.

**Read state through `window.__drivetrain`, never through pixels.** Drive the
simulation through `window.__drivetrain.test`:

```js
test.start({ rivalMax, platformStart, grip })  // pins the three random draws
test.setInput({ throttle, brake })
test.step(nFrames)                             // suspends the rAF loop
test.reset()
```

Three things are random per race — station position, rail grip, rival top speed —
so **every deterministic check must pin all three**, or it will flake.

### Publish an update

```
node tools/make-artifact.mjs
```

Then publish `dist/artifact.html` to the **same** artifact URL. The host supplies
`<!doctype>`, `<head>`, and `<body>`; the repo file has them, so publishing
`index.html` directly renders a blank page.

### Where to change behaviour

Everything tunable is in the `K` object at the top of the script in
`index.html`.

| You want | Change |
|---|---|
| A harder or easier stop | `PLATFORM_WIDTH_M` — the win band is roughly the width ÷ 1.33 |
| Where the station can sit | `PLATFORM_MIN_START_M`, `PLATFORM_MAX_START_M` |
| A stronger engine | `PLAYER_FMAX` (off the line), `PLAYER_POWER` (at speed) |
| A higher natural ceiling | `RES_R2` (lower = faster) |
| How slippery wet rail is | `GRIPS` |
| A harder rival | `RIVAL_MAX_SPEED`, `RIVAL_POWER`, `RIVAL_BOOST` |
| Earlier warning | `WARN_BEFORE_M` |
| A kinder early game | `ARM_AFTER_M` |

After **any** change to `K`, run the checks and look at **C11** first. It sweeps
every brake point against the hardest race the game can draw and reports the
width of the winning band. That band must stay between 120 m and 600 m — below
120 m the game is unfair, above 600 m it is trivial.

### Invariants — violate these and something breaks silently

1. **Only `stepTrain()` writes a train's speed.** Only `judge()` writes
   `state.result`. `render()` reads state and never writes it.
2. **The integration order in `stepTrain` is load-bearing.** The train moves
   first, *then* the speed changes. Reversing it shortens every brake and the
   canonical win stops short of the platform.
3. **The `a < 0` guard on the stop epsilon.** Without it the first throttle step
   is snapped to zero and the train never starts.
4. **`MAX_FRAME_DELTA_MS` is the only protection against a backgrounded tab.**
   Remove it and a phone call teleports the train past the platform. C12 injects
   a 30-second frame gap to prove the clamp still works.
5. **Each control tracks *which sources* hold it, in a `Set`.** A single shared
   boolean lets one finger's release drop another finger's hold. Do not
   "simplify" `held` back into a boolean.
6. **`window.__drivetrain` is not a debug extra** — every check reads it. Rename
   a field and the suite fails.
7. **No external references, ever.** The artifact host blocks every other origin.
   One CDN link breaks the published page in a way local testing won't show. C8
   guards this.

### A warning about the checks themselves

Two checks in this suite once passed against a deliberately broken build: the
brake was unbound entirely, and the frame clamp was deleted, and the suite still
printed all-green. Both are now written so they can fail.

If you add a check, **prove it can fail** — break the thing on purpose in a copy
and watch it go red. A check that cannot fail is worse than no check, because it
buys false confidence.

### The design record

`factory/` holds the full history of how this was built and why — it is not
scaffolding, and it is the fastest way to get context:

| File | What it's for |
|---|---|
| `CONTRACT.md` | The 23 acceptance checks. **Frozen** — changing it needs the owner's sign-off, not a commit. |
| `BRIEF.md` | Every constant and rule, stated exactly. |
| `DECISIONS.md` | D1–D13: what was chosen, what was rejected, what it cost. Read this before changing a design decision. |
| `REVIEW.md` | An adversarial review that returned DO NOT SHIP, and what it found. |
| `GUIDE.md` | Owner's manual: how the pieces fit. |
| `log.md` | The build diary, including every surprise. |

**If a check looks wrong, stop and ask the owner.** Do not edit `CONTRACT.md` to
make a failure go away — a test the builder can rewrite is not a test.
