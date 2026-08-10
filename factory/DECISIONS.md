# DECISIONS.md

This log holds each choice, the rejected options, and the known cost.

---

## D1 — The Kill Gate finds no abandon condition

- Chosen: continue the project. Add a speed limit mechanic if the throttle feels
  dull.
- Rejected: stop the project. Change to a signal puzzle game.
- Cost: the gate does not test the idea. The user already decided to build it.
  We record this fact in `KILL.md` instead of pretending.
- Step: 0.

## D2 — The opponent is a computer train

- Chosen: one computer rival that runs a fixed pace script.
- Rejected: two humans on one keyboard. Two humans over a network.
- Cost: no human blocks the final test. The rival never surprises the player,
  so the race stays predictable after several runs.
- Step: 0.5.

## D3 — Delivery is a Claude Artifact

- Chosen: publish the page as a private Claude Artifact. Keep the same file in
  the repository.
- Rejected: GitHub Pages. Screenshots only.
- Cost: GitHub Pages on the free plan needs a public repository. That choice is
  hard to reverse, so we avoid it. The Artifact link needs a redeploy after each
  change.
- Step: 0.5.

## D4 — The user plays on a phone

- Found during Step 0.5. The user runs Claude Code from a mobile phone.
- Effect: touch input is mandatory. The layout must fit portrait mode.
- Cost: a keyboard-only build fails for this user. We add touch buttons and keep
  keys for a desktop.
- Class of gap: an absence. The plan did not name the play device.
- Step: 0.5.

## D5 — The stop rule uses one shot

- Chosen: the game arms a judge when the speed first goes above 0. The game
  judges the race the next time the speed returns to 0.
- Rejected: allow the train to move again after a stop. Judge only an overshoot.
- Cost: the player cannot creep forward to correct a short stop. This is strict,
  and the user asked for it. A weaker model must not invent a softer rule.
- Reason: the user added "a stop short must also lose" during Step 1.
- Step: 1.

## D6 — Full power must always overshoot

- Chosen: tune the track length, the power, and the friction so that full power
  always ends in OVERSHOT.
- Rejected: leave the tuning open.
- Cost: the numbers need care. Check C7 tests the rule three times.
- Reason: this protects the riskiest assumption in `KILL.md`.
- Step: 2.

## D7 — Zero dependencies

- Chosen: one HTML file with inline CSS and inline plain JavaScript. The test
  harness uses the Playwright package that the container already holds.
- Rejected: React with a bundler. A local npm install of Playwright.
- Cost: no framework help. The harness reads Playwright from a global path, so
  the path is a fixed detail of the container.
- Evidence: the container holds `playwright@1.56.1` at
  `/opt/node22/lib/node_modules`. A test launch of Chromium succeeded.
- Step: 2.
