# log.md — Step 5, The Night Shift

## Cycle 1 — T0, Environment gate

- Task: T0 `[STRUCTURAL]`.
- Changed: nothing in the code. I ran the five gate commands.
- Proof: `node -v` gives v22.22.2. `git --version` gives 2.43.0. Chromium is
  present. The branch is `claude/train-racing-game-1omoqu`. Playwright loads.
- Contract: not run. `test/contract.mjs` does not exist at this task.
- Result: PASS.

## Cycle 2 — T1, The engine

- Task: T1 `[STRUCTURAL]`.
- Changed: added `index.html` with the literal engine code from `PLAN.md`.
- Proof: the attack command gives `idle: IDLE`, `pos960: 320`, `speed960: 40`,
  and `result: OVERSHOT`. Page errors: 0.
- Contract: not run. `test/contract.mjs` does not exist at this task.
- Result: PASS on the stated done-condition.

### SURPRISING — the win band starts one grid step too late

I probed the brake sweep before the halt. The plan predicted a win at a brake
point of 1420 m. The code gave `UNDERSHOT` at 1420 m and a stop at 1739.99 m.

Cause: the order of the two lines inside `stepTrain`. The code changes the speed
first and moves the train second. During a brake, the train moves at the speed
it does not hold yet. The train loses about 0.34 m over a full brake. The stop
lands 0.005 m short of the platform edge.

Effect on the frozen contract: check C1 brakes at 1420 m and asserts
`1740 <= playerPos`. C1 fails with the current code.

### SURPRISING — a late brake never reports OVERSHOT

A brake at 1590 m gives `RIVAL WINS`, not `OVERSHOT`. The rival completes its
stop at 63.2 s while the player still brakes. The race ends first.

This does not break any check. C2 uses full power, which reaches the track end
at 58.0 s, before the rival stops. C11 needs one contiguous win band, and the
band is contiguous. I record this as a behaviour, not a fault.

### The candidate fix

Move the train first, then change the speed:

```js
train.pos += train.speed * K.FIXED_DT;
train.speed += a * K.FIXED_DT;
if (train.speed > K.MAX_SPEED) train.speed = K.MAX_SPEED;
if (a < 0 && train.speed < K.STOP_EPSILON) train.speed = 0;
if (train.speed < 0) train.speed = 0;
```

Measured result of the candidate:

| Item | Before | After | Brief predicts |
|---|---|---|---|
| Win band | 1430..1560 | 1420..1560 | 1420..1568 |
| Band width | 130 m | 140 m | at least 120 m |
| Band contiguous | yes | yes | yes |
| Best time | 59.483 s | 59.500 s | 59.5 s |
| Rival finish | 63.183 s | 63.200 s | 63.2 s |
| Full power | OVERSHOT at 58.0 s | OVERSHOT at 58.0 s | OVERSHOT |

The candidate matches every number in the brief.

- Halt reason: stop condition 2. The next task T2 is `[STRUCTURAL]`. The fix
  also changes signed code.
- State: BLOCKED. I wait for the user.

## Cycle 3 — T1 fix and T2, The full test harness

- Task: T1 fix, then T2 `[STRUCTURAL]`.
- Changed:
  - `index.html`: `stepTrain` now moves the train first and changes the speed
    second. A comment states why.
  - Added `test/contract.mjs` with all 13 checks.
- Proof for the T1 fix: a brake at 1420 m now stops at 1740.67 m and gives
  `WIN`. The best time is 59.500 s. The rival stops at 63.200 s. Every number
  matches `BRIEF.md` section 3.
- Proof for T2: the command prints 13 lines. The command does not crash. The
  exit code is 1.
- Contract: 4 of 13 checks pass.

```
FAIL C1  no #result element
FAIL C2  no #result element
FAIL C3  no #result element
FAIL C4  no #best element, bestMs stays null
PASS C5  blocked, not-a-number, and -1
FAIL C6  harness error, no #start element
PASS C7  OVERSHOT, OVERSHOT, OVERSHOT
PASS C8  1 request, 4704 bytes
FAIL C9  no #result element
FAIL C10 harness error, no #start element
PASS C11 WIN band: 1420..1560 (140 m)
FAIL C12 harness error, no #start element
FAIL C13 harness error, no #start element
```

### SURPRISING — C11 passes before the game has a screen

The win band measures 140 m against a 120 m floor. Task T4 asks for this number
and the number is already correct. The core claim of the game holds.

### SURPRISING — the plan orders two tasks wrongly

`PLAN.md` puts T3 before T5. T3 must turn C1, C2, C3, and C9 green. Those checks
read text from `#result` and `#time`. Those elements arrive at T5.

T3 cannot pass before the page has a DOM. The plan has a defect, not the code.

Proposed repair, for a human to accept:

- T3 grows to include the DOM skeleton: `#start`, `#throttle`, `#brake`,
  `#result`, `#time`, `#best`, `#newbest`.
- T5 keeps only the canvas art, the camera, and the themes.
- T6 keeps the input handling.
- No check changes. `CONTRACT.md` stays frozen.

- Halt reason: the user keeps the halt at T2.
- State: BLOCKED. I wait for the user.

## Cycle 4 — T3, T6, T7

- Tasks: T3 `[LEAF]` DOM skeleton, T6 `[LEAF]` input, T7 `[LEAF]` best time.
- Changed:
  - `index.html`: added the DOM, the CSS, the light theme and the dark theme,
    the `render()` function, the touch and key handlers, and the best time
    store.
  - `test/contract.mjs`: raised the C12 throttle hold from 4500 ms to 6000 ms.
    The check needs a speed above 10 m/s. This changes the harness, not the
    contract. The check stays as strict as before.
- Proof T3: C1, C2, C3, and C9 turn green.
- Proof T6: C6, C12, and C13 turn green.
- Proof T7: C4 turns green.
- Contract after each task: 9/13, then 12/13, then 13/13.

```
PASS C1  stop 1740.67 m at 59.50 s
PASS C2  stop 2000.0 m
PASS C3  stop 2.50 m
PASS C4  best 59.50 s
PASS C5  blocked, not-a-number, and -1
PASS C6  speed 1.20 then 0.00
PASS C7  OVERSHOT, OVERSHOT, OVERSHOT
PASS C8  1 request, 10785 bytes
PASS C9  rival stops at 63.200 s
PASS C10 10 taps, both controls, 13 keys, 2 resizes
PASS C11 WIN band: 1420..1560 (140 m)
PASS C12 advance 30.8 m
PASS C13 restart, result restart, touchcancel, pointerleave
```

### SURPRISING — the contract goes green while the screen stays blank

`drawScene()` is still empty. The canvas shows nothing. A player sees a blank
box, two buttons, and a number.

All 13 checks pass. The contract does not test one pixel of the game world.

This is the exact failure that the Factory warns about: work that is correct
inside itself and wrong outside itself. The Step 7 run with a fresh scenario is
the only test that catches it. I record this before I write any art.

### T4 checkpoint — the win band

C11 reports `WIN band: 1420..1560 (140 m)`.

- The floor is 120 m. The measured band is 140 m.
- The ceiling is 600 m. The band is far below it.
- `DECISIONS.md` D9 predicted this band.
- No change to `PLATFORM_START_M` is needed.

- Halt reason: T4 is `[STRUCTURAL]` and the user keeps this halt.
- State: BLOCKED. I wait for the user.

## Cycle 5 — T5, T8, T9

- Tasks: T5 `[LEAF]` the scene, T8 `[LEAF]` robustness, T9 `[LEAF]` the build
  script.
- Changed:
  - `index.html`: added the canvas scene. The scene draws two rails, sleepers,
    the platform band, a station roof, distance markers, and two trains. Each
    train has a locomotive, a chimney, and two coaches. All art is code.
  - `index.html`: added SPEED and PLATFORM to the HUD.
  - `index.html`: the stage now holds 44vh. The controls take the rest of the
    screen. A thumb reaches both controls.
  - `tools/make-artifact.mjs`: builds `dist/artifact.html` from `index.html`.
- Proof T5: screenshots at 390x844 and at 320x480, in the light theme and in
  the dark theme. Each screenshot shows the two rails, both trains, the platform
  band, the station, and the HUD.
- Proof T8: C8, C10, and C12 stay green. The page loads one file. The page emits
  no console error and no console warning.
- Proof T9: `node tools/make-artifact.mjs` writes 17620 bytes. The output holds
  no outer tag and still holds `__drivetrain`.
- Contract: 13/13 after every task. Exit code 0.

### Three defects that only a screenshot showed

The contract stayed green through all three. No check saw any of them.

1. The trains looked like road vans. I redrew them as a locomotive with a
   chimney and two coaches.
2. A large empty area sat below the START button. The stage now takes 44vh and
   the controls take the rest.
3. The distance label at the screen edge was cut. The code now skips a label
   that does not fit.

This is the evidence for the earlier note: a green contract says nothing about
the picture.

### Extra proof — the published copy runs

I wrapped `dist/artifact.html` the way the Artifact host wraps it. The wrapped
copy loads, shows the title `Drivetrain`, runs a full race to `WIN` at 59.500 s,
applies the CSS, and throws no error.

- Next: T10 `[STRUCTURAL]`, publish and hand the link to the user.

## Cycle 6 — the design pass and T10

- Changed: a new visual identity, grounded in railway signalling. Steel
  neutrals with a green bias. Three signal colours that state a rule: green go
  on the throttle, red stop on the brake, amber caution at the platform. A lamp
  on each lever. A trackside signal at the platform. A hatched platform edge.
  Two type roles.
- Proof: screenshots in the light theme and in the dark theme, at 390x844.
  Page errors: 0 in both themes.
- Contract: 13/13. Exit code 0.
- T10: published `dist/artifact.html`.
  Link: https://claude.ai/code/artifact/17059745-690c-4ab0-af19-5f568e4e56b6
- T10 done-condition is open. The user must open the link on the phone and tap
  a control.

- Next: Step 6, the Inspector. The artifact is `factory/REVIEW.md`.

## Cycle 7 — Step 6, the Inspector

- A fresh context reviewed the running artifact. Verdict: DO NOT SHIP.
- Two blockers. Both were checks that could not fail. The inspector proved each
  one by breaking the build and watching the suite stay green.
- Seven code defects, four of them MAJOR.
- Fixed: the input source sets, the key scoping, the stored value validation,
  the honest save label, the setInput guard, the palette fallbacks, the canvas
  zero size, and the build script guards.
- Strengthened: C6, C7, C10, C12, C13. Added C14 for the published file.
- Contract: 14/14 pass.
- Proof that the checks now bite:
  - Brake unbound      -> FAIL C6
  - Frame clamp removed -> FAIL C12
  - Input blanked on a new race -> FAIL C13
  Each broken build fails only the check that targets it.

### SURPRISING — the published file had no check at all

Every check read `index.html`. The file that ships is `dist/artifact.html`,
built by a transform that nothing exercised. C14 now covers it.

### OPEN — one finding needs a contract edit

The judge fires the first time the train stops, anywhere. A player who taps
THROTTLE and hesitates gets UNDERSHOT at 0.87 m after 3.2 s.

The fix arms the judge on distance. I measured that the fix works and that it
breaks frozen check C3, which expects UNDERSHOT from a stop at 2.5 m.

- Halt reason: stop condition 4. The fix requires an edit to `CONTRACT.md`.
- State: BLOCKED. I wait for the user.

## Cycle 8 — contract revision 3

The user changed the design after the review: a random rival speed with an upper
limit, and no limit for the player.

- Measured before building, because the change breaks frozen checks:
  - With no player cap the stop lands at exactly twice the brake point, so the
    win band is half the platform width. The old platform gave a 70 m band,
    below the 120 m floor.
  - With equal acceleration an uncapped player always beats a capped rival. The
    rival's best possible time is 54.0 s. The player's is 52.8 s. The rival
    could never win.
- The user then chose to give the rival stronger acceleration. That restores a
  real race.
- The user also chose to fold in the early stop fix.
- Changed:
  - The player has no top speed. `stepTrain` now takes the acceleration, the
    brake, and the cap as arguments.
  - The rival draws a top speed between 30 and 39 m/s for each race, and
    accelerates at 4.0. Its brake point follows from its draw.
  - The platform widened to 1620 m to 1900 m, to hold the 120 m fairness floor.
  - The judge arms after 50 m.
  - `test.start({rivalMax})` pins the rival so a check stays deterministic.
- Contract: revision 3, checks C1 to C16. All 16 pass.

```
PASS C1  stop 1661.95 m at 51.55 s
PASS C2  stop 2000.0 m
PASS C3  stop 1202.68 m
PASS C4  best 51.55 s
PASS C5  blocked, not-a-number, and -1
PASS C6  brake 1.250 vs coast 0.078 m/s per 500 ms
PASS C7  OVERSHOT at 2000.0 m for step sizes 1, 60, 6000
PASS C8  1 request, 25583 bytes
PASS C9  rival stops at 54.900 s
PASS C10 10 taps, both controls, 13 keys, 2 resizes
PASS C11 WIN band: 810..940 (130 m)
PASS C12 advance 4.5 m across a 30 s frame gap
PASS C13 restart, result restart, touchcancel, pointerleave, two sources, held restart
PASS C14 built page wins at 51.55 s
PASS C15 caps 30.4..37.4 m/s, finishes 56.4..65.5 s
PASS C16 stalled at 0.87 m, drove on to 126 m
```

### The race now reads as a race

Traced with the rival pinned at its fastest:

```
t=10s  you 151 m, rival 239 m
lead changes to YOU at t=25s, pos 844 m
t=25s  you 844 m, rival 824 m
```

The rival leads for 25 seconds. The player overtakes just before the brake
point. The overtake and the brake decision land at the same moment.

- State: the contract is DRAFT at revision 3. It waits for a signature.

## Cycle 9 — contract revision 4, the fixed pattern

The user reported that every race ran the same way, and asked to see the rival
speed.

- Diagnosis: the player made one decision per race, the station never moved, and
  the screen showed the exact answer. One decision with a fixed correct answer
  gives one pattern. The random rival from cycle 8 moved the deadline, not the
  decision.
- Built: a moving station, a rail condition that scales every brake, a rival
  that answers a lead, a distant signal 400 m out, and a live stop marker.
- The HUD now shows the rail, the gap, the rival speed, and the braking
  distance.

### SURPRISING — the wet race was unwinnable

The first build gave these bands against the fastest rival:

```
DRY   130 m
DAMP   70 m
WET     0 m
```

Cause: a wet rail lengthens the player's brake a great deal, but the rival
spends most of its race cruising, so its time barely moves. The rival now eases
its top speed on a wet rail, by `0.68 + 0.32 * grip`. A real driver does the
same. Measured after the fix, at every station position:

```
DRY   170 m
DAMP  150 m
WET   130 m
```

### SURPRISING — two of my own new checks were wrong, not the game

- C19 compared a predicted stop of 2286 m against a track that ends at 2000 m.
  The marker was right. The check asked an impossible question.
- C20 read the signal banner before any animation frame had painted it.
- C15 could not see the rival react at all, because an idle player never leads.

All three are now fixed, and C15 drives ahead to prove the reaction: the rival
rises from 28.0 to 31.0 m/s and never passes 36.

- Contract: revision 4, checks C1 to C20. All 20 pass.
- State: revision 4 is DRAFT. It waits for a signature.

## Cycle 10 — revision 5, and a loss the player could not explain

The user sent a screenshot: `RIVAL WINS` on a wet rail at 68.65 s, with the
train inside the platform, still rolling at 42 km/h, and the rival sitting
behind it on the track.

I reproduced the case rather than reading the picture:

```
result      : RIVAL WINS at 71.28s
platform    : 1505 .. 1745
your nose   : 1552 m  (inside platform: true)
your speed  : 47 km/h   stop needs 49 m
rival nose  : 1625 m
```

The rule worked correctly. The player must come to a stand inside the platform
before the rival completes its own stop. Being inside is not the win. Position
never decides the race.

### SURPRISING — the game gave no way to know the deadline existed

The HUD held six numbers about the player's own train and nothing about time.
The rival completing its stop had no marker, no banner, and no sound. A player
could be ahead on the track, inside the platform, and lose without any warning.

That is a defect in the screen, not in the rule.

- Added: a cause line under every result. A loss now says why.
- Added: a banner when the rival begins its final brake.
- Added: C22 and C23 to hold both in place.

### Also this cycle — the linear pull

The user reported that the acceleration was linear. It was: a flat 2.5 m/s²
with nothing pushing back. Replaced with tractive effort that falls as power
over speed, and resistance that rises with the square of speed.

Measured: the gain per five seconds falls from 12.13 m/s to 4.69 m/s. Coasting
from 40 m/s loses 2.41 m/s in five seconds. The ceiling near 241 km/h is now the
machine, not a written cap.

The platform narrowed from 360 m to 240 m, because the new curve widened the win
band to 290 m. Bands are now 160 m to 190 m.

- Contract: revision 5, checks C1 to C23. All 23 pass.
- State: revision 5 is DRAFT. It waits for a signature.

## Cycle 11 — the local checkout rolled back

The container was restored from a snapshot taken at cycle 4. The local `HEAD`
sat at `6cbff69`, and the reflog held no record of any later commit.

Nothing was lost. Every commit had already reached GitHub before the rollback.

```
origin/claude/train-racing-game-1omoqu = 0264414  (README, revision 5, all of it)
local HEAD                             = 6cbff69  (cycle 4)
```

I confirmed the local head was an ancestor of the remote head, then
fast-forwarded. 12 files changed, 3569 insertions. The restored tree passes
23/23.

Lesson: pushing after every cycle is what saved this. A local-only session would
have lost eight cycles of work.

## Cycle 12 — Step 7 evidence assembled

Wrote `factory/EVIDENCE.md`. Two of the three parts are ready. The third needs
the user, and that is the point of the step.

### Two probes for the honest list

- The `OVERSHOT` reason branch `ran N m past the platform` is reachable and
  correct: `{"res":"OVERSHOT","pos":1823,"why":"ran 183 m past the platform"}`.
  C22 never exercises it, because full power always ends in `ran out of track`.
  Correct behaviour, missing check.
- Landscape was suspected broken. Measured at 844 by 390: the page fits, no
  vertical overflow, controls 225 by 120. Cleared.

### The largest gap, stated plainly

Not one of the 23 checks reads a pixel. The canvas is unverified by machine.
Cycle 4 proved what that costs: 13/13 green with a blank screen.

- State: BLOCKED on a fresh scenario from the user.

## Cycle 13 — Step 7, the fresh scenario ran

The user wrote the scenario: five races, two per rail, with a random brake
point; then a win, a slower win, and a loss, checking the best time holds.

Part 1 gave all four results from five random brake points, with one win. No
page errors. Race 4 reproduced the user's own screenshot by chance: a late brake
on a damp rail left the train crawling at 11 km/h when the rival stopped.

Part 2 passed every requirement. The best time held at 48.47 s through a slower
win and through a loss, and the stored value was never rewritten.

### SURPRISING — the losing run was faster than the winning run

`OVERSHOT` at 47.08 s against a win at 48.47 s. A train that never brakes reaches
the end of the track quickly.

The code is right, because only a `WIN` records a best time. The lesson is for
later: elapsed time alone does not rank runs. A leaderboard that sorts by time
without filtering on the result would record a loss as a record.

- Step 7 is complete.
- The only gate left is the signature on contract revision 5.
