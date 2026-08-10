# HANDOFF.md — Step 4, The Work Order

Project: drivetrain
Date: 2026-08-10
Branch: `claude/train-racing-game-1omoqu`
Contract: `factory/CONTRACT.md`, revision 2, FROZEN.
Plan: `factory/PLAN.md`, tasks T0 to T10.

The night crew asks its questions before the user goes to bed. This file holds
every question.

## 1. The task list and the checkpoints

| ID | Blast radius | Name | Halt |
|---|---|---|---|
| T0 | `[STRUCTURAL]` | Environment gate | Yes |
| T1 | `[STRUCTURAL]` | The engine, with literal code | Yes |
| T2 | `[STRUCTURAL]` | The full test harness, all 13 checks | Yes |
| T3 | `[LEAF]` | Turn C1, C2, C3, C7, C9 green | No |
| T4 | `[STRUCTURAL]` | The win band sweep, C11 | Yes |
| T5 | `[LEAF]` | The canvas render and the portrait layout | No |
| T6 | `[LEAF]` | Touch and key input, C6 and C13 | No |
| T7 | `[LEAF]` | The best time store, C4 and C5 | No |
| T8 | `[LEAF]` | Robustness, C8, C10, C12 | No |
| T9 | `[LEAF]` | The artifact build script | No |
| T10 | `[STRUCTURAL]` | Publish and hand the link to the user | Yes |

Five checkpoints. Six leaf tasks.

## 2. Every ambiguity the builder can see, with a proposed default

The user accepts a default by signing. The user changes a default by writing a
new value next to it.

| ID | Question | Proposed default |
|---|---|---|
| A1 | How much track does the canvas show? | 260 m across the canvas width. |
| A2 | Where does the player nose sit on the screen? | At 35% from the left edge. The camera follows the nose. |
| A3 | How long is a train, in metres? | 30 m. The nose is the forward point. |
| A4 | What does the start screen show? | The title, the best time, one START button, and one line of instructions. |
| A5 | Does the result screen restart on its own? | No. A RESTART button appears. A space bar press also restarts. |
| A6 | C10 asks for zero console warnings. A browser can emit its own warnings. | Count only messages whose source location is the page file. |
| A7 | C12 needs the real animation loop. Other checks suspend it. | C12 uses its own fresh page. It never calls `test.step`. |
| A8 | Does the repository hold `dist/artifact.html`? | Yes. The published source stays reviewable in git. |
| A9 | What does the HUD show during a race? | Speed in km/h, metres to the platform start, the race time, and the best time. |
| A10 | Does the game show the rival position? | Yes. The rival train draws on the upper track with the same camera. |
| A11 | What colour scheme? | A neutral scheme with a light theme and a dark theme. The platform band uses one accent colour. |
| A12 | What happens on a very wide desktop screen? | The play area holds a maximum width of 480 px and centres itself. |

## 3. The stop conditions

These lines are verbatim from the Factory skill. I do not change them. This is a
stated exception to the STE rules.

> 1. Two consecutive failures on the same task. Not three attempts at a fix —
>    the second failure means the model of the problem is wrong, and further
>    attempts dig the hole deeper.
> 2. The next task is `[STRUCTURAL]`.
> 3. Any contract check that was passing now fails.
> 4. The fix requires editing CONTRACT.md, deleting a check, or adding a
>    dependency not in the plan.
> 5. Five leaf tasks completed since the last human contact.

On a halt: stop cleanly, commit, and write the blocker in `factory/STATE.md`. Do
not try a workaround.

## 4. The diary

Write one entry for each cycle to `factory/log.md`:

- The task ID.
- What changed.
- The task proof result.
- The full contract result, all 13 checks.
- Anything surprising, on its own line.

## 5. What the morning review looks at first

In this order:

1. `factory/log.md`, the surprising lines only.
2. The C11 win band value. This number decides if the game is worth playing.
3. Every check that changed from `PASS` to `FAIL` at any cycle.
4. The `index.html` size and the C8 result. A hidden external reference breaks
   the Artifact delivery.
5. The five checkpoint halts. Each halt must show a human decision.

## 6. Known risks

- The win band measures 140 m against a 120 m floor. The margin is small. Task
  T4 can fail. The plan gives the exact response: ask the user, and propose a
  lower `PLATFORM_START_M`.
- The Artifact host strips the outer tags. Task T9 handles this. If T9 is wrong,
  the page shows nothing and the user sees a blank link.
- The user plays on a phone. No check proves that the game feels good. Only the
  Step 7 run with a fresh scenario proves that.

## 7. Sign-off

- [x] The user accepts the task list, the twelve defaults, and the stop
      conditions. Signed on 2026-08-10.

The user keeps every halt: T0, T1, T2, T4, and T10.
