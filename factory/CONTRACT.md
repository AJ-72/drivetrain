# CONTRACT.md — Step 2, The Acceptance Contract

Project: drivetrain
Date: 2026-08-10
Status: DRAFT. The user must sign this file.

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

The command prints one line for each check. The command exits with code 0 only
when every check passes.

The harness drives a real Chromium browser at a phone screen size of 390 by 844
pixels. The harness loads `index.html` from a local file path. The harness uses
the Playwright package that the container already holds. The harness installs
nothing.

## The checks

### C1 — A clean win

The player drives the train, brakes at the correct point, and stops inside the
platform zone before the rival.

- Result text shows `WIN`.
- The screen shows a time in seconds.

Human check: open the page, tap START, hold THROTTLE, release it near the
station, hold BRAKE, and stop on the platform. See WIN and a time.

### C2 — An overshoot

The player holds THROTTLE from the start to the end of the track.

- Result text shows `OVERSHOT`.
- The player loses, even when the train passes the rival.

Human check: open the page, tap START, and hold THROTTLE without stopping. See
OVERSHOT.

### C3 — A stop short

The player brakes early and the train stops before the platform zone.

- Result text shows `UNDERSHOT`.
- The player loses.
- The player cannot drive again after the stop. Only a restart begins a new
  race.

Human check: open the page, tap START, add a little power, then hold BRAKE at
once. See UNDERSHOT.

### C4 — The best time survives a reload

The player wins a race. The screen shows `NEW BEST` and the time.

The player closes the page and opens the same page again.

- The start screen still shows the same best time.

Human check: win a race, note the time, reload the link, and read the best time.

### C5 — Broken storage never breaks the game

The browser storage is blocked, or the stored value is damaged text.

- The page still loads.
- The start screen still appears.
- The player can still start and finish a race.
- No error dialog appears.

Human check: not required. The harness blocks the storage and damages the value.

### C6 — Touch alone plays the whole game

The harness uses touch events only. The harness sends no key press.

- A touch on THROTTLE adds speed.
- A touch on BRAKE removes speed.
- A touch on START begins a race.
- Both buttons measure at least 64 pixels in height and in width.
- The page does not scroll sideways at 390 pixels wide.

Human check: play one full race on the phone with your thumbs only.

### C7 — Full power always loses

Full power from the start to the station always ends in OVERSHOT.

The harness runs this check three times. All three runs show OVERSHOT.

This check protects the reason the game exists. The brake point must be the real
decision.

### C8 — The page is self-contained

The page loads no external host.

- The harness records every network request.
- The only allowed request is the local page file itself.
- Zero requests go to any other host.

### C9 — The rival can win

The player starts a race and then touches nothing.

- The rival completes its stop first.
- Result text shows a loss for the player.
- The result names the rival as the winner.

### C10 — Hostile input does not break the page

The harness performs these actions in order:

- It taps START ten times fast.
- It holds THROTTLE and BRAKE at the same time.
- It presses many keys that the game does not use.
- It resizes the window to 320 by 480 pixels and to 1280 by 900 pixels.

Results:

- The page throws no uncaught error at any point.
- The console shows no error message.
- The game still reaches a result.

## Sign-off

The user signs here. I do not start Step 3 before the signature.

- [ ] The user accepts checks C1 to C10.
