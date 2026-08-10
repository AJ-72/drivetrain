# REVIEW.md — Step 6, The Inspector

Date: 2026-08-10
Method: a fresh context read only `CONTRACT.md`, `index.html`,
`test/contract.mjs`, and `tools/make-artifact.mjs`. It did not read `PLAN.md`,
`BRIEF.md`, or `log.md`. It ran the app in a real browser and it broke copies of
the build to test the checks.

Verdict from the inspector: **DO NOT SHIP**.

## 1. The two blockers — checks that could not fail

Both blockers are contract gaps, not code defects. The code did the right thing.
The checks could not tell.

### B1 — C6 passed with the brake completely unbound

Proof: the inspector deleted `bindControl(el.brake, "brake")` and removed the
brake keys. No human input could brake the train. The suite printed 13/13 and
exit 0.

Cause: C6 compared the speed after a brake touch against the speed after a
throttle touch. Releasing the throttle always lowers the speed, because
`COAST_DECEL` is 0.15. The check was true by arithmetic.

Fix: C6 now measures the coast decay and the brake decay over the same 500 ms,
and demands that the brake beat coasting by five times. The real margin is
about sixteen times.

Proof of the fix: the same broken build now prints
`FAIL C6 the brake must beat coasting: brake dropped 0.078, coasting dropped 0.073`.

### B2 — C12 passed with the frame clamp removed

Proof: the inspector set `MAX_FRAME_DELTA_MS` to `1e9`, which removes the only
guard against a returning tab. The suite printed 13/13 and exit 0.

Cause: the check dispatched a `visibilitychange` event. That event does not stop
the animation frames. The simulation clock kept running, so the train advanced
exactly `speed * 2` over two seconds, and the bound was `speed * 2 + 5`. No
build could breach it.

Fix: C12 now hands the page one animation frame whose timestamp jumped 30
seconds, which is what a returning tab does. The clamp must absorb it.

Proof of the fix: the same broken build now prints
`FAIL C12 advance across a 30 s frame gap: got 382.6 m, want <= 9.5 m`.

## 2. Fixed code defects

| ID | Severity | Defect | Fix |
|---|---|---|---|
| D1 | MAJOR | One shared boolean per control. A second finger lifting dropped the first finger's hold. A key release dropped a touch hold. A restart with a thumb on the lever left the train dead at 0 m. | Each control now tracks which sources hold it, in a set. A release removes one token. `startRace` recomputes the input from the live sets instead of blanking it. |
| D2 | MAJOR | The page took the space bar, `w`, and `s` from any focused text field. A space wiped a race in progress. | The key handler now ignores an event whose target is an input, a textarea, a select, or an editable element. |
| D3 | MAJOR | `readBest` accepted `" 12 "`, `1e5`, `0x10`, and a 21 digit number. A stored best of 1 ms could never be beaten and showed `0.00s` forever. | The value must match `^\d{1,12}$` after a trim, and must fall between 1000 ms and 3600000 ms. |
| D4 | MAJOR | `writeBest` swallowed a storage failure. The screen claimed `NEW BEST` and the record vanished on reload. | `writeBest` returns a result. The screen shows `NEW BEST (NOT SAVED)` when the write failed. |
| D5 | MINOR | `test.setInput(null)` threw a TypeError. | `setInput` rejects a value that is not an object. |
| D6 | MINOR | `readPalette` returned empty strings if a host scoped the custom properties differently. A canvas ignores an empty fill colour, so the scene would render black on black with nothing logged. | Every token now carries a hex fallback. |
| D7 | MINOR | `sizeCanvas` cached a zero size. | A zero size clears the cache instead. |
| D8 | MINOR | `make-artifact.mjs` did not detect a missing `<body>` tag, and it silently kept only the first `<style>` block. | Both cases now throw. |

Proof for D1: a build that blanks the input on a new race now prints
`FAIL C13 a held lever must drive the new race: playerPos 0`.

## 3. New and strengthened checks

- **C6** compares the brake against a coast baseline.
- **C7** now drives one race at three step sizes, 1, 60, and 6000, and demands
  the same stop position and the same time. Three runs of one path proved
  nothing.
- **C10** now types `go up ws` into a focused text field and demands that every
  character arrives and that the race does not move.
- **C12** attacks the frame delta clamp directly.
- **C13** now covers two input sources and a restart with a lever held.
- **C14** is new. It builds `dist/artifact.html`, wraps it the way the Artifact
  host wraps it, loads it, and repeats a clean win plus the control sizes. No
  check touched the file that actually ships.

The suite is now 14 checks. All 14 pass.

## 4. OPEN — a contract gap I cannot close alone

### The judge fires the moment the train first stops, anywhere on the track

Reproduction, on the shipped build:

```
throttle for 12 steps, then release everything
-> {"state":"RESULT","result":"UNDERSHOT","pos":0.87,"sec":3.2}
```

A player taps THROTTLE to learn what it does, hesitates, and the game ends with
`UNDERSHOT` at 0.87 metres, 3.2 seconds in. The player cannot drive again.

The cause is in `BRIEF.md` section 5 and it is deliberate: the judge arms on the
first step where the speed rises above 0.

The obvious fix arms the judge on distance instead, for example
`if (S.playerPos > 50)`. That fix works:

```
CANDIDATE: throttle 12 steps, release, coast to a stop
-> {"state":"RACING","pos":0.87}   then throttle again -> {"state":"RACING","pos":125.67}
```

**But the fix breaks frozen check C3.** Measured:

```
FAIL C3 result: got "RIVAL WINS", want "UNDERSHOT"
```

C3 brakes at about 2.5 metres and demands `UNDERSHOT`. Under distance arming
that stop is not judged at all, so the rival wins instead.

This is stop condition 4: the fix requires an edit to `CONTRACT.md`. I stop and
ask. I do not edit the contract and I do not work around it.

## 5. Accepted, not fixed

- **C1 sits 0.67 m inside the platform edge.** The canonical win stops at
  1740.67 m against a 1740 m line. The win band clears its 120 m floor by 28 m.
  No player sees a failure today. Any future physics change lands inside those
  margins and will look like a flaky test rather than a moved design. Recorded
  as a known cost.
- **The rival is not an entity.** It is four fields in `S` and three lines in
  `step()`. A second rival needs an array, which changes the `rivalPos` and
  `rivalDone` fields that the frozen contract reads.
- **`K` fuses track geometry with vehicle physics.** A second track means
  touching nine call sites and the public `track` object.

## 6. The lesson, by class of gap

Every finding in section 1 was an **absence**: a check that existed but
asserted nothing that could fail. This is the third time in this project that
the gap class was an absence, after the missing play device at Step 0.5 and the
missing numbers at Step 2.

A reread does not reveal an absence. Breaking the build on purpose does. The
inspector found both blockers by damaging the code and watching the suite stay
green. That technique belongs in every future review of this project.
