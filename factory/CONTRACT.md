# CONTRACT.md — Step 2, The Acceptance Contract

Project: drivetrain
Date: 2026-08-10
Revision: 2. A fresh-context reviewer returned NOT SIGNABLE on revision 1. This
revision applies every blocker fix and every major fix.
Status: FROZEN. The user signed this file on 2026-08-10.

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

Steps: `test.start()`, then `setInput({throttle:true})`, then step until
`playerPos >= 1420`, then `setInput({brake:true})`, then step until
`state === 'RESULT'`.

Assertions:

- `result === 'WIN'`.
- `1740 <= playerPos <= 1900`.
- `playerSpeed === 0`.
- `elapsedMs < 63200`.
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

Steps: `test.start()`, then `setInput({throttle:true})` for 60 steps, then
`setInput({brake:true})`, then step until `state === 'RESULT'`.

Assertions:

- `result === 'UNDERSHOT'`.
- `playerPos < 1740`.
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
- A touch and hold on THROTTLE for 500 ms raises `playerSpeed` above 0.
- A touch and hold on BRAKE for 500 ms lowers `playerSpeed`.
- `getBoundingClientRect()` on each control gives width >= 64 and height >= 64.
- Each measured element carries the input listener.
- `document.documentElement.scrollWidth <= 390`.

Human check: play one full race on the phone with your thumbs only.

### C7 — Full power always loses

The harness runs C2 three times with a new page each time. All three runs give
`OVERSHOT`.

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

Steps: `test.start()`, then send no input, then step for 4200 steps.

Assertions:

- `result === 'RIVAL WINS'`.
- `rivalDone === true`.
- The rival finish time is 63200 ms, with a tolerance of 200 ms.
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

Assertions:

- The `pageerror` count is 0.
- The `console.error` count is 0 and the `console.warn` count is 0.
- `window.onerror === null`. The game installs no handler that hides errors.
- While the player holds both controls, `playerSpeed` does not rise.
- The game still reaches `state === 'RESULT'`.

### C11 — The win band has a usable width

The harness sweeps the brake point. For each `x` from 0 to 2000 in steps of 10:

- Load a new page.
- `test.start()`, hold throttle, step until `playerPos >= x`, then hold brake,
  then step until `state === 'RESULT'`.
- Record `result`.

Assertions:

- The set of `x` values that give `WIN` forms one contiguous band.
- The band measures at least 120 m.
- The band measures at most 600 m.
- The harness prints the measured band, for example `WIN band: 1420..1560`.

This check stops an unwinnable game and it stops a trivial game.

### C12 — A hidden tab does not lose the race

Steps: start a race with the real animation loop, reach a speed above 10, then
dispatch `visibilitychange` to hidden, wait 2 s, then return to visible.

Assertions:

- `playerPos` advances by less than `speed * 2` metres plus 5 m.
- `state` is still `RACING`.
- The `pageerror` count is 0.

### C13 — Restart and lost touch behave correctly

Assertions:

- A restart during `RACING` gives `state === 'IDLE'`, `playerPos === 0`, and
  `playerSpeed === 0`.
- A START press during `RESULT` begins a new race.
- A `touchcancel` on THROTTLE clears the throttle. `playerSpeed` stops rising.
- A `pointerleave` on THROTTLE clears the throttle.

## Sign-off

The user signed on 2026-08-10.

- [x] The user accepts checks C1 to C13.

This file is now frozen. No later step edits it.
