# EVIDENCE.md — Step 7, The Evidence

Project: drivetrain
Contract: revision 5, checks C1 to C23, DRAFT.

Step 7 asks for three things. Two are ready. One needs the user.

| Part | State |
|---|---|
| 1. A run against a fresh scenario the user writes | **DONE.** Section 1. |
| 2. The failures found in review, with their fixes | Ready. Section 2. |
| 3. An honest list of what still does not work | Ready. Section 3. |

---

## 1. The fresh scenario — RUN

### The scenario, in the user's words

> 5 races, 2 per rail. change the brake point randomly
>
> Win slower, loose, validate the best time doesn't change.

Nothing here is in the contract. C4 covers a slower win, but no check covers a
**loss** after a best time, no check runs a sequence across the three rails, and
no check uses a random brake point.

### Part 1 — five races, a random brake point each time

The station and the rival were left unpinned, so both were drawn fresh. The rail
was pinned only to guarantee the coverage the user asked for. The brake point
came from `Math.random()` in the range 400 m to 1400 m, and was not adjusted.

```
race 1  DRY   brake@ 862  platform 1446-1686  ->  UNDERSHOT  (stopped 94 m short of the platform)
race 2  DRY   brake@ 470  platform 1428-1668  ->  UNDERSHOT  (stopped 610 m short of the platform)
race 3  DAMP  brake@1105  platform 1507-1747  ->  OVERSHOT   (ran 15 m past the platform)
race 4  DAMP  brake@1299  platform 1352-1592  ->  RIVAL WINS (you were still moving at 11 km/h)
race 5  WET   brake@ 766  platform 1371-1611  ->  WIN        (stopped 58 m into the platform)

pageerrors: 0   console errors and warnings: 0
```

Five random brake points produced all four results. One win in five, by luck
alone, which is the shape a game of judgement should have.

Race 3 missed by 15 m. Race 4 is the trap from the user's own screenshot: a late
brake on a damp rail left the train crawling at 11 km/h when the rival stopped.

### Part 2 — win, win slower, lose

The station and the rail were pinned to 1400 m and DRY, so the two winning times
are comparable. Storage was cleared first.

The aiming used the stop marker, not knowledge of the answer: hold power until
`playerPos + stopInM` reaches the aim point, then brake. This is what a player
does with the instrument the game provides.

```
1 win         WIN       48.47s  stop 1425 m  best=48.47s  stored="48467"  banner="NEW BEST"
2 win slower  WIN       51.93s  stop 1618 m  best=48.47s  stored="48467"  banner=""
3 lose        OVERSHOT  47.08s  stop 2000 m  best=48.47s  stored="48467"  banner=""
```

| The user's requirement | Result |
|---|---|
| The second win is slower | yes, 48.47 s to 51.93 s |
| The best time does not change after the slower win | yes, 48.47 s |
| No `NEW BEST` banner on the slower win | yes |
| The best time does not change after the loss | yes, 48.47 s |
| The stored value is never rewritten | yes, `48467` throughout |
| Page errors | 0 |

### One thing the scenario found by accident

**The losing run was faster than the winning run.** `OVERSHOT` at 47.08 s beat
the win at 48.47 s, because a train that never brakes reaches the end of the
track quickly.

The code handles it correctly: only a `WIN` touches the best time. But it shows
that elapsed time alone does not rank runs, and a future feature that sorts by
time without filtering on the result would record a loss as a record.

### What this run does not prove

- It drove through the test hooks, not through a finger on real glass over real
  time. The touch path itself is covered only by C6.
- Part 2 pinned the station and the rail. Without pinning, the two winning times
  are not comparable, so this was a deliberate deviation.
- It still reads no pixels. Section 3 covers that.

---

## 2. The failures found in review, and their fixes

A fresh-context inspector reviewed the running build at Step 6 and returned
**DO NOT SHIP**. It proved two of its findings by breaking the build on purpose
and watching the suite stay green.

### Blockers — checks that could not fail

| Finding | Proof | Fix | Proof of the fix |
|---|---|---|---|
| C6 passed with the BRAKE control entirely unbound | Deleted the brake binding. Suite printed 13/13, exit 0. | C6 now measures the brake against a coast baseline and demands a five times difference. | The same broken build prints `FAIL C6 the brake must beat coasting: brake dropped 0.078, coasting dropped 0.073`. |
| C12 passed with the frame clamp removed | Set `MAX_FRAME_DELTA_MS` to `1e9`. Suite printed 13/13, exit 0. | C12 now injects a 30 second animation frame gap and requires the clamp to absorb it. | The same broken build prints `FAIL C12 advance across a 30 s frame gap: got 382.6 m, want <= 9.5 m`. |

### Code defects, all fixed

| Defect | Effect on a player | Fix |
|---|---|---|
| One shared boolean per control | A second finger lifting dropped the first finger's hold. A restart with a thumb on the lever left the train dead at 0 m. | Each control tracks which sources hold it, in a set. `startRace` recomputes from the live sets. |
| The page took the space bar, `w`, and `s` from any focused text field | A space wiped a race in progress, and typed characters vanished. | The key handler ignores events aimed at an input, textarea, select, or editable element. |
| `readBest` accepted `" 12 "`, `1e5`, `0x10`, and a 21 digit number | One bad stored value locked the best time at `0.00s` forever, unbeatable. | The value must match a digit pattern and fall between 1000 ms and 3600000 ms. |
| `writeBest` swallowed a storage failure | The screen claimed `NEW BEST` and the record vanished on reload. | A failed write now shows `NEW BEST (NOT SAVED)`. |
| `test.setInput(null)` threw | An uncaught error in the console. | `setInput` rejects a non-object. |
| `readPalette` could return empty strings | The scene would render black on black with nothing logged. | Every colour token carries a hex fallback. |
| `sizeCanvas` cached a zero size | A stale canvas buffer after a collapse. | A zero size clears the cache instead. |
| `make-artifact.mjs` did not detect a missing `<body>` | A silently broken published page. | Both that and a second `<style>` block now throw. |

### Two later findings from the user, also fixed

| Finding | Fix |
|---|---|
| Every race followed one pattern | The station moves, the rail draws a condition, the rival reacts, a distant signal warns 400 m out, and a live stop marker replaces mental arithmetic. |
| A loss inside the platform gave no reason | Every result now states its cause. The rival's final brake is announced. |

### The suite grew as a result

13 checks at the review. **23 checks now.** C14 to C23 are all new, and each one
exists because something got through.

---

## 3. What still does not work

This list is evidence, not reassurance. Each item was checked.

### The checks cannot see the game

**Not one check reads a pixel.** All 23 read `window.__drivetrain` or DOM text.
The entire canvas is unverified by machine.

This is not a theory. At cycle 4 the suite printed 13/13 while `drawScene()` was
empty and the canvas was blank.

Unverified by any check:

- The stop marker's drawn position. C19 proves the *number* is within 1.09 m of
  the truth. Nothing proves the dashed line is drawn where that number says.
- The screen-edge arrow for an off-camera rival.
- The amber diamond at the distant signal. C20 proves the state and the banner.
- The platform hatching, the trains, the station roof, the distance markers.

Only a human looking at the screen closes this gap.

### A reason branch no check covers

C22 drives full power, which always ends in `ran out of track`. The other
`OVERSHOT` branch is never exercised by the suite.

Measured by hand just now, and it is correct:

```
{"res":"OVERSHOT","pos":1823,"why":"ran 183 m past the platform"}
```

Correct behaviour, missing check.

### One browser, one kind of touch

- Every check runs in **Chromium only**. No Safari, no iOS, no Firefox.
  `color-mix()`, `text-wrap: balance`, `touch-action`, and `viewport-fit` all
  vary between engines.
- C6 uses **synthetic pointer events** in a desktop browser. Real multi-touch,
  palm contact, and pointer capture on real hardware are untested.
- **No performance measurement.** Nothing records the frame rate on a real
  phone. The simulation is frame-rate independent, so a slow device stays
  correct, but it may not feel correct.

### Behaviours that may surprise

- **The best time is per origin.** The artifact link and a local file keep
  separate records. Playing both gives two different best times.
- **The debug interface ships.** `window.__drivetrain` is live in the published
  page. Anyone with a console can inspect the race or drive it directly.
- **The rival's reaction may be invisible in play.** The boost is at most
  3 m/s and needs a 300 m lead. C15 forces the condition to prove the mechanism
  works. Whether a player ever notices it is unproven.

### Cleared, not a problem

**Landscape.** Suspected cramped or broken. Measured at 844 by 390: the page
fits with no vertical overflow, the stage holds its 180 px minimum, and the
controls measure 225 by 120. Tight, but it works.

### No check can answer these

- Whether the game is fun.
- Whether a 160 m to 190 m band is fair against human reaction time. A machine
  brakes on the exact frame. A person does not.
- Whether three rail conditions read as three distinct races, or as noise.
- Whether the distant signal comes early enough on a wet rail at high speed.

Only playing answers these. That is Step 7.

### Out of scope by decision, not defects

No sound. No network play. No junctions or route choice. No progression. One
track. `BRIEF.md` section 14 records each refusal.
