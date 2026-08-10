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
