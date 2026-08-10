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

## D8 — A fresh-context reviewer rejected contract revision 1

- Action: the user asked for a check by a higher model. `claude-opus-5` is the
  highest model here, so I ran a fresh-context Opus reviewer instead.
- Input to the reviewer: `BRIEF.md` and `CONTRACT.md` only.
- Verdict: NOT SIGNABLE. Four blockers and eight further findings.
- The four blockers:
  1. The platform zone had no coordinates and no length.
  2. No check bounded the win band, so an unwinnable game passed every check.
  3. No check said how a script drives a real-time simulation.
  4. Checks asserted on strings that the builder itself chooses.
- Class of gap: absences again, as in D4. A reread does not show a missing
  number. A fresh context does.
- Cost: revision 2 adds a debug interface to the shipped page. The game carries
  test hooks in production. This is acceptable for a game.
- Step: 2.

## D9 — Fixed physics constants

- Chosen: track 2000 m, platform 1740 m to 1900 m, accel 2.5, brake 2.5, coast
  0.15, max speed 40, rival finish 63.2 s, fixed step 1/60 s.
- Rejected: leave the tuning to the builder.
- Derived behaviour: the best time is 59.5 s. A valid stop needs a brake between
  1420 m and 1580 m. A win needs a brake below about 1568 m.
- Cost: the win band measures about 140 m on the 10 m test grid. That is above
  the 120 m floor, but the margin is small. If check C11 fails, move
  `PLATFORM_START_M` down and record the change here.
- Reason: a weaker builder model invents numbers when the plan omits them.
- Step: 2.

## D10 — The Step 6 inspector rejected the shipped build

- Verdict: DO NOT SHIP. Two blockers, five majors, five minors.
- Both blockers were checks that could not fail. The inspector proved each one
  by breaking the build and watching the suite print 13/13.
- Cost: the suite grew from 13 checks to 16, and three checks were rewritten.
- Class of gap: an absence again, as in D4 and D8. A check that exists but
  asserts nothing looks exactly like a check that works.
- Technique to keep: break the build on purpose and watch the suite. It is the
  only way to find a check that cannot fail.
- Step: 6.

## D11 — The player loses the speed limit, the rival gains a random one

- Chosen: the player has no top speed. The rival draws a top speed between
  30 and 39 m/s for each race, and accelerates at 4.0 against the player's 2.5.
- Rejected: the rival as a plain countdown. A cap on the player set above the
  rival's.
- Reason: the user asked for a random rival speed with an upper limit, and for
  no limit on the player.
- Measured consequence that changed the design: with equal acceleration, an
  uncapped player always beats a capped rival. The rival's best possible time
  is 54.0 s and the player's is 52.8 s. The rival could never win. The user then
  chose to give the rival stronger acceleration, which restores a real race.
- Second measured consequence: with no cap the stop lands at exactly twice the
  brake point, so the win band is half the platform width. The old 160 m
  platform gave a 70 m band, below the 120 m floor. The platform is now 280 m
  wide, from 1620 m to 1900 m, and the measured band is 130 m.
- Cost: the contract needed revision 3. C1, C3, C4, C9, C11, and C14 all moved.
- Step: after 6.

## D12 — The judge arms on distance

- Chosen: the judge arms once the nose passes 50 m. A stop before that leaves
  the race running.
- Rejected: keep the strict rule from revision 2.
- Reason: the inspector proved that a 12 frame tap on the throttle, followed by
  hesitation, ended the game with UNDERSHOT at 0.87 m after 3.2 s.
- Cost: frozen check C3 had to move its brake point from 2.5 m to 600 m. That
  is why revision 3 was needed. Check C16 now guards the new rule.
- Step: after 6.
