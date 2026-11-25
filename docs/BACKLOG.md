# Backlog

Ideas for after the frozen contract. None of these items is in the current
build. Each item needs a new brief before work starts.

Reviewed against `index.html`, `factory/BRIEF.md` and `factory/DECISIONS.md`
on 2026-11-25.

## How to read this

- **Funnel step.** The step the item moves: *reach* (new people open the link),
  *first race* (a new player finishes and understands one race), *return*
  (a player comes back another day).
- **Score.** Impact, confidence and ease, each from 1 to 5, multiplied. A
  higher score goes first. The scores are a judgement, not data (see Gaps).
- **Pass test.** A result from real people, not from us, that shows the item
  worked. An item that fails its test is removed, not tuned forever.
- **Conflict.** A line in BRIEF §13 or §14 that the new brief must remove first.

## What the code already gives

These facts change the size of several items:

- Each race draws three values with `Math.random()`: the station start
  (1300–1520 m), the rail grip (DRY, DAMP, WET) and the rival top speed
  (28–33 m/s). The debug interface can already force all three
  (`forcedPlatformStart`, `forcedGrip`, `forcedRivalMax`).
- The simulation runs in fixed steps of 1/60 s. The same draws and the same
  presses give the same race, step for step.
- The controls are two held buttons, throttle and brake. There are no notches.
- A `WIN` is any stop inside a 240 m platform. There is no stop mark, so the
  game cannot measure how close a stop was.
- Only a `WIN` records a best time (`drivetrain.bestMs` in localStorage).

## Foundations

These items are small and invisible on their own, but most features below
depend on them. Build them first.

| # | Item | What it unlocks | Size |
|---|------|-----------------|------|
| F1 | **Seeded race.** One number sets all three draws. The same seed gives the same station, rail and rival on every phone. | B1, B6, B9, B10, B5 | Small. Three `Math.random()` calls become one seeded generator. |
| F2 | **Stop mark.** A car-stop board near the platform end. The result screen shows the gap to it in metres. A `WIN` stays any stop inside the platform. | B1, B4, B8, B5 | Small. The contract test must still pass. |
| F3 | **Press log.** The game records the step number of each throttle and brake press and release. | B9, B5 | Small. A race has a few dozen events. |
| S1 | **Share probe (spike).** Done on 2026-11-25. Results below. | Decides how B1, B6, B7 and B9 share. | Done. |

## Probe results (S1)

The game is served from GitHub Pages: Last Stop at
`https://aj-72.github.io/drivetrain/`, the classic game at `/classic/`. The
probe page is `probe/index.html`, published at `/probe/`. It was opened on an
Android phone, in a browser tab, on 2026-11-25.

| Check | Result | What it means |
|-------|--------|---------------|
| Page context | Top level, secure (HTTPS), not in a frame. | The limits of a claude.ai artifact frame do not apply. |
| `navigator.share` with text, from a tap | The share sheet opened. | A Share button works for the daily line (B1). |
| `navigator.share` with a link, from a tap | The share sheet opened. | A Share button works for the challenge link (B6). |
| `navigator.clipboard.writeText`, from a tap | Copied. | A Copy button works too. |
| `#seed=20261125&t=41200` | Arrives intact. | `=` and `&` are safe in a game link. |
| `localStorage` | Works. | Best times and streaks can stay on the phone. |
| `permissionsPolicy.allowsFeature('web-share')` | `false`, but sharing worked. | This check is wrong on this browser. Test sharing with a real call, not the policy API. |

Not checked: a 200-character link, iPhone Safari, the installed (home screen)
app, and desktop browsers. Last Stop is a Godot build, so its share and copy
buttons go through `JavaScriptBridge`; check them in the real export, not only
in the probe.

**Earlier run, wrong host.** A first probe ran inside a claude.ai artifact frame
(desktop and Android). There, `navigator.share` was missing or refused,
fragments over 128 characters or with `=`/`&` arrived empty, and copy failed on
desktop. Those limits belong to the artifact frame, not to the game.

## Features, in priority order

| # | Idea | Funnel step | Score (I×C×E) | Depends on | Pass test | Conflict |
|---|------|-------------|---------------|------------|-----------|----------|
| B6 | **Challenge link.** The result screen shows a link with the seed and the time in a plain fragment, such as `#c-k3x9-t41200`: "Beat my 41.2 s, WET rail." The friend races the same rival on the same rail. The link shows as selectable text with a copy button, because copy can fail. | Reach | 5×4×5 = 100 | F1 | Of 10 people sent a link, at least 3 finish a race. | None. The link holds no personal data. |
| B1 | **Daily challenge.** Today's date is the seed, so everyone gets the same race. The share text is one line, shown as selectable text with a copy button: "Drivetrain 25 Nov · WIN 41.2 s · 0.8 m from the mark · DAMP". | Return, reach | 5×3×5 = 75 | F1, F2 | At least 3 testers play on 3 days of one week without a reminder. | None. |
| B7 | **Screenshot-ready result.** The result screen is built to be shared as a picture: the player can take a screenshot, and a Share button can send the image where the browser allows it. It shows the date, the train, the mark, the gap in metres and the time in one phone-sized frame. The player shares it with the phone's own screenshot. | Reach | 4×3×5 = 60 | F2 | Testers post a screenshot of the result without being asked. | None. |
| B8 | **Perfect stop stamp.** A stop within 0.5 m of the mark shows a rare full-screen stamp. The daily share line gets a mark for it. | Reach | 3×3×5 = 45 | F2 | Players screenshot or share a stamp without being asked. | None. |
| B4 | **Smooth stop score.** A second score for a stop with few brake presses and releases in the last 400 m. One long, well-judged brake beats many short taps. | Return | 3×3×4 = 36 | F2, F3 | Good players say they now try for both scores. | None. Reworded: the game has no notches. |
| B10 | **Pass the phone.** Two to four names take turns on one seed. A table at the end ranks wins first, then the gap to the mark. | Reach | 3×3×4 = 36 | F1, F2 | One group plays 3 or more rounds in a row. | Probably none. §14 rules out a second device, and this mode uses one. |
| B2a | **Gradients and speed boards.** A slope changes the pull and the braking. A board sets a limit, with a time penalty for overspeed. | Return | 3×3×3 = 27 | None | Players lose more races to judgement than to the rival. | D11 removed the player's top speed on purpose. Speed boards need a new decision entry. |
| B9 | **Friend's ghost.** The challenge link also holds the friend's press log. Their train runs as a faint ghost beside yours. The probe confirmed links up to 21 characters with `=` and `&`; longer links were not tested. Test a full-length ghost link before the brief. | Reach, return | 4×3×2 = 24 | B6, F3 | Players who get a ghost link play more races than players who get a plain link. | None. Only presses go into the link. |
| B3 | **Several routes.** Each route is a data record: length, station range, gradients, speed boards, a name. The player picks a route before the race. The challenge link and the daily seed name the route. | Return | 3×3×2 = 18 | B2a, F1 | Players play more than one route in a week. | "A level editor or several tracks." |
| B2b | **A caution signal.** A signal that changes to caution during the race. | Return | 3×3×2 = 18 | B2a | Same as B2a. | "Junctions, signals, points, or route choice." |
| B5 | **Leaderboard.** One board for each daily seed, kept on a server. GitHub Pages serves static files only, so the board needs a host of its own. Each entry stores the seed and the press log. A viewer's page replays a run before showing it, so a faked time fails. | Return | 4×2×2 = 16 | F1, F2, F3, B1 | Entries come from people the user does not know. | "Accounts, login, or a server." Also §13: "The game makes no network call." |
| R2 | **Route choice in the race.** A junction where the player picks the left or the right track. | Return | 2×2×1 = 4 | B3 | None set. It changes the core skill, from stopping to choosing. | "Junctions, signals, points, or route choice." |

## Changes from the earlier list

- B1 and B6 share one foundation (F1). B1 is a challenge link whose seed is the
  date.
- B1, B8 and B5 needed a stop mark that the game does not have. F2 adds it.
- B4 asked for "few notch changes". The game has two held buttons and no
  notches, so B4 now counts brake presses.
- B2 is split. The signal part conflicts with §14 and the gradient part does
  not.
- B3 now covers several routes and the route data format. Choosing a route
  during the race is a separate item, R2, ranked last.
- The first probe ran in a claude.ai artifact frame and ruled out the share
  sheet and long links. The game is on GitHub Pages, where a second probe
  showed both share and copy work. B7 and B9 keep their ranks for now; re-rank
  them with the next brief.
- B5 assumed an Artifact's shared database. The game is on GitHub Pages,
  which has none, so B5 needs a server again. It still breaks §13.

## Gaps

- **No numbers.** The game makes no network call, so nobody can see how many
  people open the link, finish a race or come back. Every score above is a
  judgement. Until §13 changes, each pass test is counted by hand with a few
  testers. If §13 changes for B5, a counter for opens, races and shares should
  ship in the same change.
- **The first race is unmeasured.** No item covers a new player's first race.
  If most new players lose their first race to the rival, sharing only sends
  people to a loss. Check this before B6: watch 5 new players and count the
  wins in their first three races.
- **The link is open.** The game is public on GitHub Pages
  (`https://aj-72.github.io/drivetrain/`) since 2026-11-25. The README still
  links to the old artifact; point it at Pages before any reach item ships.
- `factory/log.md` line 484: a loss must never count as a record. Every ranking
  above (B1, B5, B10) ranks wins first.
