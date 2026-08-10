# BRIEF.md — Step 1

Project: drivetrain
Date: 2026-08-10
Branch: `claude/train-racing-game-1omoqu`
Revision: 4. The user found that every race followed one pattern. The station
now moves, the rail condition varies, the rival reacts, and a distant signal
warns the driver in time to plan.

## 1. Who uses it

One person. The user. The user plays on a mobile phone in portrait mode.

The user is also the market. No other player is required at any step.

## 2. The one job

The game gives the player one job:

> Drive a train to the station. Stop the train inside the platform zone. Do this
> before the rival train completes its own stop.

Speed control is the whole game. The player wins by choosing the correct moment
to brake.

## 3. The world, in exact numbers

A weaker model must not invent any of these values. Every value is fixed.

```
TRACK_LENGTH_M       = 2000     // metres, from start to the end of the rail

// the station moves for every race
PLATFORM_WIDTH_M      = 360
PLATFORM_MIN_START_M  = 1300
PLATFORM_MAX_START_M  = 1520

THROTTLE_ACCEL       = 2.5      // metres per second squared, the player
BRAKE_DECEL          = 2.5      // scaled by the rail grip
COAST_DECEL          = 0.15     // metres per second squared, no input
                                // the player has NO top speed

// the rail draws one of these for every race, and it scales every brake
GRIPS = DRY 1.00, DAMP 0.80, WET 0.65

RIVAL_ACCEL          = 4.0      // the rival pulls away first
RIVAL_BRAKE          = 4.0      // also scaled by the rail grip
RIVAL_MIN_SPEED      = 28       // the draw, in metres per second
RIVAL_MAX_SPEED      = 33
RIVAL_BOOST          = 3        // extra speed when the player leads
RIVAL_BOOST_RANGE_M  = 300      // the lead at which the boost is full
RIVAL_HARD_CAP       = 36       // the absolute upper limit on the rival
RIVAL_RAIL_FACTOR    = 0.68 + 0.32 * grip   // a driver eases on a wet rail

WARN_BEFORE_M        = 400      // the distant signal stands this far out
ARM_AFTER_M          = 50       // a stop before this does not end the race
STOP_EPSILON        = 0.05      // metres per second
FIXED_DT            = 1/60      // seconds, one simulation step
MAX_FRAME_DELTA_MS  = 50        // clamp for one animation frame
```

Position means the position of the train nose, in metres from the start.
`playerPos` is the nose position. The game uses no other position value for the
judge.

These numbers give this behaviour:

- The player has no top speed. On a dry rail the brake distance equals the
  distance already run, so the nose stops at twice the brake point. A damp rail
  gives 2.25 times. A wet rail gives 2.54 times.
- The station moves, so no single brake point is ever correct twice.
- Full power with no brake reaches 2000 m. That is always an overshoot.
- Measured win bands against the hardest rival, at every station position:
  170 m on a dry rail, 150 m on a damp rail, 130 m on a wet rail. The floor is
  120 m.
- The rival leads early, because it accelerates at 4.0 against the player's 2.5.
- The rival pushes harder when the player pulls a lead, and never passes 36 m/s.
- A distant signal stands 400 m before the platform and calls out the distance.
- A live stop marker on the rail shows where the train would stop if the driver
  braked now. Check C19 holds it to within 5 m of the truth.
- The screen never states the rival speed. A driver reads a rival by eye, not
  from its instruments. When the rival leaves the camera, an arrow at that edge
  of its own rail states the distance instead.
- The distance to the platform stays hidden until the train passes the distant
  signal. The signal is the moment the driver starts to plan.

## 4. The rules of a race

1. Two trains start together. The player drives the lower train. The computer
   drives the upper train.
2. The player holds THROTTLE to add power. The player holds BRAKE to remove
   speed.
3. If the player holds THROTTLE and BRAKE together, the game applies the brake
   only.
4. If the player holds nothing, `COAST_DECEL` removes speed.
5. The player speed has no upper limit. The rival speed stops at its draw.
   Speed never goes below 0.
6. The rival draws a top speed between `RIVAL_MIN_SPEED` and `RIVAL_MAX_SPEED`
   for each race, then eases it by `RIVAL_RAIL_FACTOR` for the rail.
7. The rival answers the player. When the player leads, the rival adds up to
   `RIVAL_BOOST` to its top speed, in proportion to the lead over
   `RIVAL_BOOST_RANGE_M`. Its speed never passes `RIVAL_HARD_CAP`.
8. The rival brakes at the last moment its own stopping distance allows, so it
   stops in the middle of the platform whatever speed it holds.
9. The station is drawn for each race. The platform runs from a start between
   `PLATFORM_MIN_START_M` and `PLATFORM_MAX_START_M`, and measures
   `PLATFORM_WIDTH_M`.
10. A distant signal stands `WARN_BEFORE_M` before the platform. The screen
    calls out when the train passes it.
11. The simulation uses a fixed step of `FIXED_DT` with an accumulator. The
    result must not change with the frame rate.
12. The game clamps one animation frame delta to `MAX_FRAME_DELTA_MS`.

## 5. The stop rule, in exact terms

- The train starts at speed 0.
- The game treats speed below `STOP_EPSILON` as 0. The game then sets the speed
  to exactly 0.
- The game arms the judge on the first step where `playerPos` passes
  `ARM_AFTER_M`. A stop before that leaves the race running, so a player who
  taps the throttle and hesitates does not lose at one metre.
- After the judge is armed, the game judges the race on the first step where
  speed returns to exactly 0.
- The game reads `playerPos` on that same step.
- The platform bounds are the ones drawn for this race.
- `platformStart <= playerPos <= platformEnd`: the stop is valid. Both bounds
  count as valid.
- `playerPos < platformStart`: the result is `UNDERSHOT`.
- `playerPos > platformEnd`: the result is `OVERSHOT`.
- If `playerPos` reaches `TRACK_LENGTH_M` at any speed, the result is
  `OVERSHOT`.
- The judge fires one time. The player cannot drive again after the judge fires.

## 6. Winning and losing

The result is exactly one of four strings:

| Result | Meaning |
|---|---|
| `WIN` | The stop is valid, and the player stops before the rival completes its stop. |
| `UNDERSHOT` | The nose stops before the platform zone. |
| `OVERSHOT` | The nose stops after the platform zone, or the train reaches the track end. |
| `RIVAL WINS` | The rival completes its stop, and the player holds no result yet. |

Extra rules:

- The rival stop and the player stop on the same simulation step: the player
  wins.
- The player never starts to move: the rival completes its stop and the result
  is `RIVAL WINS`.
- The player stops before `ARM_AFTER_M`: the race continues. The player can
  drive on.
- Exactly one result string appears on the screen. The other three do not
  appear.

## 7. Tuning rule

Full power from the start to the track end always ends in `OVERSHOT`.

The set of brake points that end in `WIN` must form one band, measured against
the fastest rival the game can draw. The band must measure at least 120 m. The
band must measure at most 600 m.

This rule protects the riskiest assumption in `KILL.md`. It stops an unwinnable
game and it stops a trivial game.

## 8. Platform and frontend

- Platform: a mobile web browser in portrait mode. A desktop browser also works.
- Frontend: one HTML file named `index.html`. Inline CSS. Inline plain
  JavaScript. A `<canvas>` element draws the scene.
- No framework. No bundler. No package install. No build step.
- No external host. No CDN, no font file, no image file, no network call.
- The deliverable is one file. No sibling `.js` file and no sibling `.css` file.

## 9. Where it runs

- Primary: a private Claude Artifact page. The user opens the link on the phone.
- Secondary: the same file lives in the repository at `index.html`.

## 10. Controls

The game accepts touch and keyboard together. Both inputs drive the same code.

| Action | Touch | Keyboard |
|---|---|---|
| Throttle | Hold the THROTTLE button | Hold `ArrowUp` or `w` |
| Brake | Hold the BRAKE button | Hold `ArrowDown` or `s` |
| Start or restart | Tap the START button | Press the space bar |

Rules for the controls:

- Each control measures at least 64 CSS pixels in width and in height.
- The element that the harness measures is the element that holds the listener.
- A `touchcancel` event clears that input. A `pointerleave` event clears that
  input. A `pointercancel` event clears that input.
- A control must never stay held after the finger leaves it.

## 11. The debug interface

The page exposes a read-only object for tests. The object is part of the
contract, not an extra.

```js
window.__drivetrain = {
  state,        // 'IDLE' | 'RACING' | 'RESULT'
  result,       // null | 'WIN' | 'UNDERSHOT' | 'OVERSHOT' | 'RIVAL WINS'
  playerPos,    // metres, the nose
  stopInM,      // metres the train needs to stop from this speed, on this rail
  rivalGapM,    // metres the rival leads by; negative when the player leads
  grip,         // 'DRY' | 'DAMP' | 'WET'
  passedWarn,   // true once the train passes the distant signal
  playerSpeed,  // metres per second
  rivalPos,     // metres
  rivalDone,    // boolean
  rivalMax,     // metres per second, the top speed drawn for this race
  elapsedMs,    // integer milliseconds of race time
  bestMs,       // integer milliseconds, or null
  track: { length, platformStart, platformEnd, warnAt },
  test: {
    start(opts),                          // {rivalMax, platformStart, grip} pins the draws
    setInput({ throttle, brake }),        // set the held inputs
    step(nFrames),                        // advance n fixed steps
    reset()                               // return to IDLE
  }
};
```

Rules:

- `test.step()` suspends the animation loop. The test then owns the clock.
- The touch path and the key path must call the same input code as
  `test.setInput`.

## 12. Data that persists

The game saves one value: the best winning time.

- The key is `drivetrain.bestMs`. The value is an integer count of milliseconds.
- The game writes the value only after a `WIN` that beats the stored value.
- The game shows `NEW BEST` only when the new time beats the stored value.
- A first `WIN` with no stored value shows `NEW BEST`.
- A `WIN` slower than the stored value does not show `NEW BEST`, and does not
  change the stored value.
- The game shows a time as seconds with exactly two decimals, for example
  `21.47s`.
- If `localStorage` throws, the game holds the value in memory.
- If the stored text is not a valid positive integer, the game treats it as
  absent.
- A storage error must never stop the game.

## 13. Privacy and access

- The game collects no personal data.
- The game makes no network call.
- The game installs no global error handler that hides errors.
- The Artifact page is private. Only the user decides to share the link.

## 14. Out of scope

The game does not include these items. I refuse them if a later step asks:

- Network multiplayer, rooms, or a second device.
- Junctions, signals, points, or route choice.
- Cargo, money, upgrades, or progression.
- Sound and music.
- Accounts, login, or a server.
- A level editor or several tracks.

## 15. What "done" looks like

A human sees these results:

1. The user opens the Artifact link on a phone and sees a start screen.
2. The user taps START and drives a train with two large buttons.
3. The user stops inside the platform zone before the rival's own stop is
   complete, and sees `WIN`.
4. The user holds throttle to the end and sees `OVERSHOT`.
5. The user brakes early, stops short, and sees `UNDERSHOT`.
6. The user closes the page, opens it again, and still sees the best time.

## 16. The scenarios in the user's words

S1 — A clean win. "I tap START. I hold THROTTLE. My train speeds up. The rival
train moves too. I release THROTTLE and I tap BRAKE before the station. My train
stops inside the platform zone. I finish before the rival. The screen shows WIN
and my time in seconds."

S2 — An overshoot. "I hold THROTTLE to the end. My train passes the platform
zone. The screen shows OVERSHOT and I lose."

S3 — A saved best time. "I win faster than my saved best. The screen shows NEW
BEST. I close the page. I open the same link again. The best time is still on
the screen."

S4 — A stop short. "I brake too early. My train stops before the platform zone.
I lose."
