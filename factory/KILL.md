# KILL.md — Step 0, The Kill Gate

Date: 2026-08-10
Project: drivetrain — a game to drive trains. The first train to arrive wins.

## 1. The riskiest assumption

A player enjoys the control of speed, brakes, and momentum on a track.

If the act of driving a train feels slow and dull, the game fails. A race between
two trains does not repair a dull core action. The race only multiplies it.

## 2. The cheapest test

Build a small prototype first:

- One train.
- One straight track.
- A throttle key and a brake key.
- A stopwatch.

Drive the train for two minutes. Judge the momentum and the braking point.

Cost: one task. The test runs before any race code exists.

## 3. The pre-committed stop condition

The user does not give an abandon condition. The user gives a mitigation
condition.

Stop condition, verbatim from the user's choice:

> If plain throttle control feels dull, we do not abandon the game. We add one
> mechanic: speed limits per track section, with a penalty for overspeed.

## 4. Honest note on this gate

The user names no condition that ends the project. This shows that the user
already decided to build the game. The gate does not kill the idea here.

We record this fact and we continue. We do not pretend that a kill test happened.

The mitigation condition is still a real gate. It has a trigger and a fixed
response. The pipeline must apply it at task T1 in the plan.

## 5. Effect on the plan

- Task T1 builds the prototype and tests the assumption.
- Task T1 is a checkpoint. A human judges the result.
- If the result is "dull", the plan adds the speed limit mechanic.
- If the result is "good", the plan continues without the extra mechanic.
