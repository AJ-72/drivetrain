# Backlog

Ranked for one goal: more people find Last Stop, finish a race and come back.
None of these items is built yet. Each needs a short brief before work starts.

Reviewed against the Last Stop build on `main` (`godot/`), its itch.io draft
(`godot/release/itch-page.md`) and the live site on 2026-11-25.

## How to read this

- **Funnel step.** Where a player is lost or won:
  1. *find*: someone sees the game (a post, a store page, a friend's message);
  2. *open*: they start it;
  3. *first race*: they finish one race and understand why they won or lost;
  4. *return*: they play again on another day;
  5. *share*: they send it to someone, which feeds *find*.
- **Score.** Impact, confidence and ease, each from 1 to 5, multiplied. A
  higher score goes first. Every score is a judgement until M1 gives numbers.
- **Pass test.** A result from players or a channel, not from us, that shows
  the item worked. An item that fails its test is removed, not tuned forever.

## Where adoption stands

- **Players measured: none.** The game sends no data (BRIEF §13), and it is
  not yet on a store that counts for us. Every step of the funnel is unknown.
- **The game is public** at `https://aj-72.github.io/drivetrain/` since
  2026-11-25, and plays on an Android phone.
- **The README still links to the old claude.ai artifact.** Anyone who finds
  the repo is sent to the wrong game.
- **The itch.io page text is written** (`godot/release/itch-page.md`), with an
  upload checklist. Check whether it was ever uploaded.
- **Download size.** The web build sends 9.8 MB compressed (43.7 MB raw, almost
  all of it the Godot engine in `index.wasm`). Measured on 2026-11-25 with
  `curl` against the live site. This decides which portals will take it.

So the first job is not a feature. It is getting the game in front of a few
hundred people in a place that counts them.

## What Last Stop already has

The earlier backlog was written for the classic `index.html`. Last Stop
already covers several of its items:

| Earlier item | In Last Stop | Status here |
|---|---|---|
| F2 stop mark | A stop board at the platform centre, and a star for stopping near it. | Done. |
| B3 several routes | An 8-station campaign, *The Coastline*, each with its own rail, platform and rival. | Done. |
| B4 smooth stop | Brake notches 0–3 and wheel slide make the stop a skill already. | Cut. Revisit only if players ask. |
| B8 perfect stop stamp | The board star exists. A full-screen stamp does not. | Folded into A1. |
| B9 friend's ghost | A ghost of your own best run exists (`ghost.gd`), marked as a paid feature. Not shareable. | Becomes A5. |
| F1 seeded race | Campaign stations are fixed, so a station link needs no seed. Free race is still random. | Needed only for A4. |

What Last Stop does not have: any share or copy button, any link that opens a
given station, and a free race for new players (it opens only after all 8
stations are won).

## Do first: measure

Without these, nothing below can be ranked by real data.

| # | Item | Funnel step | Score | Pass test |
|---|------|-------------|-------|-----------|
| M1 | **Put Last Stop on itch.io** using the page already written. itch.io counts impressions, page views, browser plays and referrers for each project, so it gives the first numbers with no code and no change to §13. Point the README's "Play it" link at the itch.io page or GitHub Pages. | Find, open | 5×5×5 = 125 | The itch.io analytics page shows views and browser plays within a week. |
| M2 | **Watch 5 strangers play their first race.** No hints from us. Count wins in their first three races and note where each gets stuck. Phone first. | First race | 5×4×4 = 80 | A written count. If fewer than 3 of 5 win within three races, A2 moves above everything except M1. |
| M3 | **Decide §13 for a count-only counter.** One request each for page open, race finished and share tapped: no IDs, no cookies, no personal data. It is the only way to see return visits outside itch.io. It is a decision, not a build. | All | 4×3×3 = 36 | A written yes or no in `factory/DECISIONS.md`. |

## Channels

Ranked by how cheap they are to try and how much they teach. Try one at a
time, and wait for its numbers before the next.

| Order | Channel | Why | What it needs | Pass bar | Check before posting |
|---|---|---|---|---|---|
| 1 | **itch.io** (M1) | Free, takes Godot web builds, has built-in analytics, and players there expect small indie games. | The written page, a 630×500 cover, 3–5 screenshots, a short GIF of a close finish. | Browser plays at least 25% of page views in the first month. Forum posts report about this ratio; it is a rough guide, not a standard. | Upload checklist in `itch-page.md`. |
| 2 | **Reddit**: r/WebGames for players, r/godot for other developers, a train subreddit for the theme. | A good post can bring hundreds of plays in a day, and the comments are free playtesting. | A 10–15 s clip of a photo finish, one line of hook ("Arriving first does not win"), a link to the itch.io page. | A post that sends 100+ views to itch.io (its referrer list shows the source). | Each subreddit's sidebar rules. r/WebGames reportedly wants posters who have been members a while; this was not confirmed. |
| 3 | **Short video** (YouTube Shorts, TikTok, Instagram Reels). | The game shows its hook in seconds: two trains, one stops on the line, the other overshoots. | The same 10–15 s clip in portrait, a caption, the link in the profile. | One clip passes 1,000 views and itch.io shows the referrer. | Nothing to submit; post from the user's own accounts. |
| 4 | **Web game portals**: CrazyGames first, Poki later. | Portals bring the largest audiences for browser games, but each has a review and wants a game with proven numbers. | Portal SDK, cover video, metadata, a build within the size limit, gameplay that starts at once. | Accepted by the portal's review. | See the notes below. |
| — | **App stores** (Google Play, App Store) | Not yet. Fees, store review and payments (`paid.gd` is not wired) cost more than they teach at zero players. | — | — | Revisit after M1 shows retention. |

**Portal notes (checked 2026-11-25).**

- *CrazyGames* lists Godot as supported. Its technical requirements cap the
  initial download at 50 MB, and at 20 MB to appear on the mobile homepage.
  The docs also say new players must land in gameplay immediately. Last Stop
  opens on a title screen and a route map, so that may need a short-cut. Not
  checked: whether the cap is counted compressed (9.8 MB here) or raw (43.7 MB).
- *Poki* reviews each game by hand, runs a "Web Fit Test" after acceptance,
  and prefers web exclusives. Being on itch.io and GitHub Pages may conflict
  with that. A third-party guide (not Poki's own) names an 8 MB initial
  download, which would need a smaller engine build (A7).
- Not checked: YouTube Playables and Google GameSnacks. Both have their own
  certification rules.

## Features

Grouped by idea. The build order by score is under the table.

| # | Idea | Funnel step | Score (I×C×E) | Depends on | Pass test |
|---|------|-------------|---------------|------------|-----------|
| A1 | **Share the result.** The result screen gets SHARE and COPY. Share sends one line and a link, such as "Last Stop · ASHFORD HALT · WIN 41.2 s · 0.8 m from the board ★★★". Copy is the fallback when share is refused. A stop on the board shows a full-screen stamp worth screenshotting. Calls go through Godot's `JavaScriptBridge`. | Share | 5×4×4 = 80 | M1 for the link target | Shares or referrers from shared links show up in itch.io within two weeks. |
| A2 | **Fix the first race** if M2 says so. Possible fixes: an easier first station, a one-line hint after a loss that names what went wrong ("braked 120 m late"), or a replay of the stop. Chosen from what M2 shows, not before. | First race | 5×3×4 = 60 | M2 | In a second group of 5, at least 4 win within three races. |
| A3 | **Station challenge link.** A link such as `#ashford-t41200` opens straight into that station's race with "Beat 41.2 s". The friend skips the title and map, which also suits portals that want instant gameplay. Campaign stations are fixed, so no seed is needed. | Find, open | 5×3×4 = 60 | A1 | Of 10 people sent a link, at least 3 finish the race. |
| A4 | **Daily race, open from day one.** One date-seeded race for everyone, with a share line. Today free race opens only after the whole campaign, so a new player has no reason to come back tomorrow. | Return | 4×3×3 = 36 | F1, A1 | At least 3 testers play on 3 days of one week without a reminder. |
| A5 | **Send your ghost.** A challenge link that also carries your run, so the friend races your ghost. The ghost already exists. The link must hold the run in a short form; test a full-length link on a phone first. The ghost is a paid feature, so decide whether a received ghost is free. | Share, return | 4×3×2 = 24 | A3 | Players sent a ghost link play more races than players sent a plain link. |
| A6 | **Clip and cover kit.** A repeatable way to record a 10–15 s photo finish in landscape and portrait, plus the itch.io cover. Channels 1–3 all need it. | Find | 4×4×4 = 64 | — | Used in every channel post. |
| A7 | **Smaller web build.** Trim the Godot engine (disable unused modules, size-optimised export templates) to get the download under Poki's reported limit. Only worth it if a portal asks. | Open | 3×3×2 = 18 | Channel 4 | The compressed download falls below the portal's limit. |
| A8 | **Pass the phone.** Two to four names take turns at one station. A table at the end ranks wins first, then the gap to the board. | Share | 3×3×4 = 36 | — | One group plays 3 or more rounds in a row. |
| A9 | **Gradients and speed boards** for new stations. | Return | 3×3×3 = 27 | — | Players lose more races to judgement than to the rival. |
| A10 | **Leaderboard** for the daily race, on a server. Needs M3 and a host, and checks each entry by replaying its presses. | Return | 4×2×2 = 16 | A4, M3 | Entries come from people the user does not know. |

Ranked by score, the build order is M1, M2, A1, A6, A2, A3, M3, A4, A8, A9,
A5, A7, A10. A6 sits beside M1 because the itch.io page needs its cover and
GIF.

## Probe results (S1)

The game page at `https://aj-72.github.io/drivetrain/probe/` was opened on an
Android phone, in a browser tab, on 2026-11-25.

| Check | Result | What it means |
|-------|--------|---------------|
| Page context | Top level, HTTPS, not in a frame. | Artifact-frame limits do not apply. |
| `navigator.share`, text and link, from a tap | The share sheet opened. | A1 can use a real Share button. |
| `navigator.clipboard.writeText`, from a tap | Copied. | COPY works as the fallback. |
| `#seed=20261125&t=41200` | Arrived intact. | `=` and `&` are safe in a link. |
| `localStorage` | Works. | Streaks and bests stay on the phone. |
| `permissionsPolicy.allowsFeature('web-share')` | `false`, but sharing worked. | Test sharing with a real call, not this API. |

Not checked: iPhone Safari, a 200-character link, the installed app, desktop
browsers, itch.io's embed frame (A1 and A3 must work there too), and share from
inside the Godot export through `JavaScriptBridge`.

An earlier run inside a claude.ai artifact frame found share and long links
blocked. Those limits belong to that frame, not to the game.

## Rules to update

- **BRIEF §13 and §14 were written for the classic game.** Last Stop already
  has sound, music, progression and eight stations, which §14 lists as out of
  scope. Write a short Last Stop section, or a decision entry, before the next
  brief, so the next brief is checked against rules that match the game.
- `factory/log.md` line 484: a loss must never count as a record. Every share
  line and ranking above shows wins first.

## Gaps

- **No numbers yet.** Until M1, every score is a guess.
- **Not checked:** CrazyGames' compressed-versus-raw size rule, Poki's own size
  limit, each subreddit's current rules, YouTube Playables and GameSnacks.

## Sources (checked 2026-11-25)

- CrazyGames technical requirements: https://docs.crazygames.com/requirements/technical/
- CrazyGames gameplay requirements: https://docs.crazygames.com/requirements/gameplay/
- Poki requirements: https://sdk.poki.com/requirements
- Poki Web Fit Test: https://sdk.poki.com/web-fit-test
- itch.io analytics update (impressions and CTR): https://itch.io/updates/updates-to-project-analytics-filtering-collections-impressions-and-more
- itch.io forum, view-to-play ratios: https://itch.io/t/2033799/can-you-share-your-stats-and-analytics-here
- Third-party Poki guide (8 MB figure, unofficial): https://app.cinevva.com/guides/publish-game-poki
- Third-party note on r/WebGames membership (unconfirmed): https://dinogame.gg/blog/best-browser-game-subreddits/
