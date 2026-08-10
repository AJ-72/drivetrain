# BRIEF.md — Step 1

Project: drivetrain
Date: 2026-08-10
Branch: `claude/train-racing-game-1omoqu`

## 1. Who uses it

One person. The user. The user plays on a mobile phone in portrait mode.

The user is also the market. No other player is required at any step.

## 2. The one job

The game gives the player one job:

> Drive a train to the station. Arrive before the rival train. Stop the train
> inside the platform zone.

Speed control is the whole game. The player wins by choosing the correct moment
to brake.

## 3. The rules of a race

1. Two trains start together. The player drives the lower train. The computer
   drives the upper train.
2. The player holds THROTTLE to add power. The player holds BRAKE to remove
   speed.
3. A train keeps its speed when the player touches nothing. Friction removes
   speed slowly.
4. The station sits at a fixed distance from the start.
5. The platform zone is a marked band of track at the station.
6. The player must bring the train to a full stop inside the platform zone.
7. The rival train always stops correctly. The rival runs a fixed pace script.
8. A race lasts about 60 seconds.

## 4. The stop rule, in exact terms

The player resolved this rule during the interview. The rule is exact, because a
weaker model must not invent it.

- The train starts at speed 0.
- The game arms the judge when the speed first goes above 0.
- After the judge is armed, the game judges the race the next time the speed
  returns to 0.
- The game reads the position of the train nose at that moment.
- Nose inside the platform zone: the stop is valid.
- Nose before the platform zone: the result is UNDERSHOT. The player loses.
- Nose after the platform zone: the result is OVERSHOT. The player loses.
- The player cannot start again after the judge fires. One stop ends the race.
- If the train reaches the end of the track at any speed, the result is
  OVERSHOT.

## 5. Winning and losing

The player wins when both conditions are true:

- The stop is valid.
- The player stops before the rival completes its own stop.

The player loses when any of these is true:

- The stop is UNDERSHOT.
- The stop is OVERSHOT.
- The rival stops first.

## 6. Tuning rule

Full power from start to station must always end in OVERSHOT.

This rule protects the riskiest assumption from KILL.md. It makes the brake
point the real decision.

## 7. Platform and frontend

- Platform: a mobile web browser in portrait mode. A desktop browser also works.
- Frontend: one HTML file. Inline CSS. Inline plain JavaScript. A `<canvas>`
  element draws the scene.
- No framework. No bundler. No package install. No build step.
- No external host. No CDN, no font file, no image file, no network call.

## 8. Where it runs

- Primary: a private Claude Artifact page. The user opens the link on the phone.
- Secondary: the same file lives in the repository at `index.html`.
- The user can open the repository file in any browser.

## 9. Controls

The game accepts touch and keyboard together. Both inputs drive the same code.

| Action | Touch | Keyboard |
|---|---|---|
| Throttle | Hold the THROTTLE button | Hold the Up arrow key or `W` |
| Brake | Hold the BRAKE button | Hold the Down arrow key or `S` |
| Start or restart | Tap the START button | Press the space bar |

The buttons must be large. A thumb must reach both buttons in portrait mode.

## 10. Data that persists

The game saves one value: the best winning time in seconds.

- The game writes the value to `localStorage`.
- If `localStorage` throws an error, the game holds the value in memory.
- A storage error must never stop the game.

The game saves nothing else. The game sends no data to any server.

## 11. Privacy and access

- The game collects no personal data.
- The game makes no network call.
- The Artifact page is private. Only the user decides to share the link.

## 12. Out of scope

The game does not include these items. I refuse them if a later step asks:

- Network multiplayer, rooms, or a second device.
- Junctions, signals, points, or route choice.
- Cargo, money, upgrades, or progression.
- Sound and music.
- Accounts, login, or a server.
- A level editor or several tracks.

## 13. What "done" looks like

A human sees these results:

1. The user opens the Artifact link on a phone and sees a start screen.
2. The user taps START and drives a train with two large buttons.
3. The user stops inside the platform zone before the rival and sees WIN.
4. The user holds throttle to the end and sees OVERSHOT.
5. The user brakes early, stops short, and sees UNDERSHOT.
6. The user closes the page, opens it again, and still sees the best time.

## 14. The scenarios in the user's words

S1 — A clean win. "I tap START. I hold THROTTLE. My train speeds up. The rival
train moves too. I release THROTTLE and I tap BRAKE before the station. My train
stops inside the platform zone. I finish before the rival. The screen shows WIN
and my time in seconds."

S2 — An overshoot. "I hold THROTTLE to the end. My train passes the platform
zone. The screen shows OVERSHOT and I lose, even though I passed the rival."

S3 — A saved best time. "I win faster than my saved best. The screen shows NEW
BEST. I close the page. I open the same link again. The best time is still on
the screen."

S4 — A stop short. "I brake too early. My train stops before the platform zone.
I lose."
