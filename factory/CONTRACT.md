# CONTRACT.md — Step 2, The Acceptance Contract

Project: drivetrain
Date: 2026-08-10
Revision: 3. Revision 2 was frozen and shipped. The Step 6 inspector found two
checks that could not fail, and the user then changed the game design: the
player loses the speed limit, and the rival draws a random top speed.
Status: DRAFT. The user must sign revision 3.

### What changed from revision 2, and why

| Change | Reason |
|---|---|
| C1, C3, C4, C11, C14 move to the new geometry | The platform is now 1620 m to 1900 m, because an uncapped player halves the win band. |
| C6 compares the brake against a coast baseline | The inspector unbound the BRAKE control entirely and revision 2 still printed 13/13. |
| C7 drives three step sizes | Three runs of one deterministic path carried no independent signal. |
| C9 pins the rival and expects 54.9 s | The rival time is now random, so the check pins it at the fastest cap. |
| C10 types into a focused text field | The page stole the space bar, `w`, and `s` from any field beside it. |
| C11 sweeps against the fastest rival | A random rival makes the band depend on the draw. The check uses the worst case. |
| C12 injects a 30 s frame gap | A dispatched `visibilitychange` never suspends the animation frames, so the old bound could not be breached. |
| C13 covers two input sources | One shared boolean let a key release drop a finger's hold. |
| C14 is new | No check touched `dist/artifact.html`, the file that actually ships. |
| C15 is new | The rival must really vary and must stay inside its limit. |
| C16 is new | A stop before 50 m must no longer end the race. |

## The freeze rule

This file is frozen after the user signs it.

- No later step edits this file.
- The builder must not change a check, delete a check, or weaken a check.
- If a check looks wrong, the builder stops and asks the user.
- A test that the builder can rewrite is not a test.

## How to run every check

One command runs all checks. The command is verbatim code:

```
node test/contract.mjs
```

Rules for the harness:

- The harness prints one line for each check. The line starts with `PASS` or
  `FAIL`.
- The harness exits with code 0 only when every check passes.
- The harness drives Chromium at a screen size of 390 by 844 pixels.
- The harness loads `index.html` through a `file://` path.
- The harness loads Playwright from the global path in the container. The
  harness installs no package.
- The harness reads game state through `window.__drivetrain`. The harness does
  not read pixels.
- The harness drives the simulation through `window.__drivetrain.test`, except
  in C6. Real time never decides a result.

## The checks

### C1 — A clean win

Steps: `test.start({rivalMax: 30})`, then `setInput({throttle:true})`, then step
until `playerPos >= 830`, then `setInput({brake:true})`, then step until
`state === 'RESULT'`.

Assertions:

- `result === 'WIN'`.
- `1620 <= playerPos <= 1900`.
- `playerSpeed === 0`.
- `elapsedMs < 70000`.
- The visible text contains `WIN`.
- The visible text does not contain `UNDERSHOT`, `OVERSHOT`, or `RIVAL WINS`.
- The visible time matches the pattern `^\d+\.\d{2}s$`.

Human check: open the page, tap START, hold THROTTLE, release near the station,
hold BRAKE, and stop on the platform. See `WIN` and a time.

### C2 — An overshoot

Steps: `test.start()`, then `setInput({throttle:true})`, then step until
`state === 'RESULT'` or 6000 steps pass.

Assertions:

- `result === 'OVERSHOT'`.
- `playerPos > 1900`.
- The visible text contains `OVERSHOT` and no other result string.

### C3 — A stop short

Steps: `test.start({rivalMax: 30})`, then `setInput({throttle:true})` until
`playerPos >= 600`, then `setInput({brake:true})`, then step until
`state === 'RESULT'`.

The brake point sits past the arming distance of 50 m. A stop before that does
not end the race. Check C16 covers the early stop.

Assertions:

- `result === 'UNDERSHOT'`.
- `playerPos < 1620`.
- `playerSpeed === 0` exactly.
- After the result, `setInput({throttle:true})` and 600 more steps leave
  `playerPos` unchanged.

### C4 — The best time behaves correctly

Sub-checks, all required:

- (a) First win with empty storage: the text contains `NEW BEST`, and `bestMs`
  equals the winning `elapsedMs`.
- (b) Reload with `page.reload()`: the start screen shows the same best time
  string, and `bestMs` is the same integer.
- (c) A new page in the same context through `context.newPage()`: the start
  screen shows the same best time string.
- (d) A slower win: the text does not contain `NEW BEST`, and `bestMs` does not
  change.

### C5 — Broken storage never breaks the game

Three sub-cases, all required. Each case uses a new page.

- (a) `addInitScript` replaces `window.localStorage` with `getItem` and
  `setItem` that throw a `SecurityError`.
- (b) The stored value is the text `not-a-number`.
- (c) The stored value is the text `-1`.

Assertions in each case:

- `state` reaches `IDLE` after load.
- A full race through `test` reaches `state === 'RESULT'`.
- The `pageerror` count is 0.
- No `dialog` event fires.

### C6 — Touch alone plays the whole game

This check uses real touch events. This check does not use `test`. This check
sends no key press.

Assertions:

- A touch on START moves `state` to `RACING`.
- A touch and hold on THROTTLE for 2000 ms raises `playerSpeed` above 1.
- The brake must beat coasting. The harness measures the speed lost over 500 ms
  with no input, then over 500 ms with BRAKE held. The brake must remove at
  least five times as much speed.
- A check that compares the brake against the earlier speed is forbidden.
  Releasing the throttle always lowers the speed, so such a check passes with
  the BRAKE control entirely unbound.
- `getBoundingClientRect()` on each control gives width >= 64 and height >= 64.
- Each measured element carries the input listener.
- `document.documentElement.scrollWidth <= 390`.

Human check: play one full race on the phone with your thumbs only.

### C7 — Full power always loses

The harness drives the same full power race at three step sizes: 1, 60, and
6000 steps per call.

- All three runs give `OVERSHOT`.
- All three runs give the same stop position.
- All three runs give the same `elapsedMs`.

Three runs of one deterministic path are forbidden. They carry no independent
signal.

### C8 — The page is self-contained

Assertions:

- The harness records every network request. Zero requests go to a host other
  than the local file.
- The text of `index.html` contains zero occurrences of `http://`, `https://`,
  `//cdn`, and `@import`.
- No `<script src>` and no `<link rel="stylesheet">` points outside the file.
- The repository holds no sibling `.js` file and no sibling `.css` file that
  `index.html` needs.
- The size of `index.html` is below 16 MB.

### C9 — The rival can win

Steps: `test.start({rivalMax: 39})`, then send no input, then step for 5200
steps. The check pins the rival at its fastest, because the rival speed is now
random.

Assertions:

- `result === 'RIVAL WINS'`.
- `rivalDone === true`.
- The rival finish time falls between 54000 ms and 56000 ms.
- The visible text contains `RIVAL WINS` and no other result string.

### C10 — Hostile input does not break the page

The harness registers `page.on('pageerror')` and `page.on('console')` before it
loads the page.

Actions, in order:

1. Tap START ten times, at 50 ms intervals.
2. Hold THROTTLE and BRAKE together for 60 steps.
3. Press each of these keys one time: `a b q z Escape Enter Tab Shift Control 1
   9 ArrowLeft ArrowRight`.
4. Resize the window to 320 by 480, then to 1280 by 900.
5. Focus a text input beside the game and type `go up ws`.

Assertions:

- The `pageerror` count is 0.
- The `console.error` count is 0 and the `console.warn` count is 0.
- `window.onerror === null`. The game installs no handler that hides errors.
- While the player holds both controls, `playerSpeed` does not rise.
- The focused text field receives every character, including the spaces, the
  `w`, and the `s`.
- Typing does not end the race and does not move the train.
- The game still reaches `state === 'RESULT'`.

### C11 — The win band has a usable width

The harness sweeps the brake point against the fastest rival the game can draw.
For each `x` from 0 to 2000 in steps of 10:

- Load a new page.
- `test.start({rivalMax: 39})`, hold throttle, step until `playerPos >= x`, then
  hold brake, then step until `state === 'RESULT'`.
- Record `result`.

Assertions:

- The set of `x` values that give `WIN` forms one contiguous band.
- The band measures at least 120 m.
- The band measures at most 600 m.
- The harness prints the measured band, for example `WIN band: 810..940`.

This check stops an unwinnable game and it stops a trivial game.

### C12 — A hidden tab does not lose the race

A dispatched `visibilitychange` event does not suspend the animation frames, so
a check built on it can never fail. The harness attacks the mechanism instead.

Steps: patch `requestAnimationFrame` before load so the timestamp can be
shifted. Start a race with the real loop and reach a speed above 10. Then add
30 s to the animation frame timestamp, exactly as a returning tab does, and wait
250 ms.

Assertions:

- `playerPos` advances by at most `speed * 0.5 + 2` metres.
- `state` is still `RACING`.
- The `pageerror` count is 0.

Without the frame delta clamp the train advances about `speed * 30` metres.

### C13 — Restart and lost touch behave correctly

Assertions:

- A restart during `RACING` gives `state === 'IDLE'`, `playerPos === 0`, and
  `playerSpeed === 0`.
- A START press during `RESULT` begins a new race.
- A `touchcancel` on THROTTLE clears the throttle. `playerSpeed` stops rising.
- A `pointerleave` on THROTTLE clears the throttle.
- A key press and release does not clear a finger that still holds a control.
- A second finger lifting does not clear the first finger's hold.
- A restart while a lever is still held drives the new race. `playerPos` grows.

### C14 — The published file works

Every other check reads `index.html`. The file that ships is
`dist/artifact.html`, built by a transform that no check exercised.

Steps: run `node tools/make-artifact.mjs`. Wrap `dist/artifact.html` in the host
skeleton. Load it and repeat the clean win from C1.

Assertions:

- The built file carries no `<!doctype`, `<html`, `<head`, or `<body` tag.
- The built file still contains `__drivetrain`.
- The built page reaches `result === 'WIN'` with `1620 <= playerPos <= 1900`.
- `#result` reads `WIN`.
- THROTTLE and BRAKE each measure at least 64 by 64 pixels.
- `document.documentElement.scrollWidth <= 390`.
- The `pageerror` count is 0.

### C15 — The rival varies, and stays inside its limit

The rival draws a top speed for each race. The player has no top speed.

Steps: run 25 races with no pin and no player input.

Assertions:

- At least 20 of the 25 races draw a different rival top speed.
- No rival top speed goes below 30 m/s.
- No rival top speed goes above 39 m/s.
- Every race ends in `RIVAL WINS`, because the player never moves.
- The rival always stops inside the platform zone.
- The slowest rival and the fastest rival differ by more than 5 s.

### C16 — An early stop does not end the race

Steps: `test.start({rivalMax: 30})`, hold throttle for 12 steps, release
everything, then step until the speed reaches 0.

Assertions:

- `state` is still `RACING`.
- `playerSpeed === 0`.
- The stop happened before 50 m.
- Holding throttle again for 600 steps moves the train more than 50 m further.
- `state` is still `RACING` after the recovery.
- A brake at 600 m still gives `UNDERSHOT`. The judge still works past the
  arming distance.

## Sign-off

Revision 2 was signed on 2026-08-10 and covered C1 to C13.

Revision 3 waits for a signature.

- [ ] The user accepts checks C1 to C16 as revision 3.
