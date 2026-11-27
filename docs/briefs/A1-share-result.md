# A1 — Share the result

Backlog item A1 in [BACKLOG.md](../BACKLOG.md). Game: **Last Stop** (the Godot
build at `/`). Written 2026-11-26 against `main` at `b7ec6b0`.

## 1. Why

Last Stop has no way to tell anyone about a race. Every new player today comes
from the user sending the link by hand. A1 lets a player send one line and a
link straight from the result screen, so each race can bring in the next
player.

It moves the **Share** step of the funnel: race finished → result shared →
friend opens the link. Its number today is zero, because the action does not
exist. The bar it must clear is in §9.

## 2. What the player sees

1. A race ends. The result panel opens as today.
2. A fourth button, **SHARE**, sits at the right end of the button row.
3. The player taps SHARE.
   - **Share sheet works:** the phone's own share sheet opens with the line and
     the link. The player picks WhatsApp or another app. The button reads
     `SHARED` for 2 s.
   - **No share sheet, copy works:** the line and link go to the clipboard.
     The button reads `COPIED` for 2 s.
   - **Neither works:** a box opens over the game with the line already
     selected, and the note `COPY THIS, THEN TAP CLOSE`. A CLOSE button ends
     it.
   - **The player closes the share sheet without sending:** nothing changes.
     No error.
4. If the stop was within the station's star window of the stop board (the
   third star), a stamp fills the screen before the panel. See §5.

## 3. The share line

One line, then the link on its own line. Mixed case, because it is read in a
chat, not on the pixel screen. The numbers match what the result panel shows:
the same time to two decimals, the same station name.

| Result | Line |
|---|---|
| Campaign win | `Last Stop · Ashford Halt · WIN in 41.27 s ★★★ · 0.8 m from the board` |
| Campaign win, over par | `Last Stop · Cole Harbour · WIN in 56.10 s ★☆☆ · 18 m from the board` |
| Campaign loss, short | `Last Stop · Dunmore · stopped 12 m short. Can you stop it?` |
| Campaign loss, past | `Last Stop · Fenwick · ran 31 m past the platform. Can you stop it?` |
| Campaign loss, rival | `Last Stop · Elm Cross · the rival got there first. Can you beat it?` |
| Free race win | `Last Stop · Free race on a WET rail · WIN in 38.40 s · streak 4` |
| Free race loss | `Last Stop · Free race on a DAMP rail · lost a streak of 6. Can you beat it?` |

Rules:

- Station names come from `Stations.STATIONS[i].name`, shown in title case.
- Distance from the board: one decimal under 10 m, whole metres from 10 m.
  This is `absf(sim.player_pos - sim.platform_centre())`, the same value the
  panel rounds today.
- Stars: `★` earned, `☆` not earned, as a count (`★★☆` is two stars).
  Campaign wins only.
- The free-race loss line needs the streak from before the loss.
  `_on_finish()` sets `save.streak = 0`, so keep the old value in `outcome`
  first.
- A new best adds ` · new best` before the board distance.
- The line, without the link, stays under 100 characters, so a chat
  notification shows it whole.
- A loss is shareable. Most first races are losses, and "can you stop it?"
  is itself a challenge.

The link is the game's address (§6). After A3 lands, the link opens the same
station with "Beat 41.27 s". A1 does not wait for A3.

## 4. Where SHARE goes

Today the row holds up to three buttons, 128 px wide
([game.gd](../../godot/scripts/game.gd) `_items()`, `Screen.RACE` result
branch). The pixel font is 6 px a letter, so the longest label,
`NEXT STATION`, is 72 px wide.

The row becomes up to four buttons, **100 px wide with 8 px gaps** (424 px in
all, on a 480 px screen). SHARE is always **last**:

```
 campaign win:   [NEXT STATION] [  RETRY  ] [ROUTE MAP] [  SHARE  ]
 campaign loss:  [   RETRY    ] [ROUTE MAP] [  SHARE  ]
 free race:      [  NEW RACE  ] [  MENU   ] [  SHARE  ]
```

SHARE is last so that ENTER, which picks the first button, still means "go
on" and never shares by accident. The keyboard reaches SHARE with the arrow
keys, as any other button.

The hint line under the panel stays as it is.

## 5. The board stamp

When the third star is earned (`outcome["precise"]`), a stamp shows **before**
the panel:

- `ON THE BOARD` in the 3× font, and the distance below it, such as `0.8 M`.
- A slight tilt is not possible on the pixel grid. The stamp is a bordered
  box in `LAMP` on a dark screen instead.
- It holds for 1.2 s, then the panel opens. A tap skips it.
- The star sounds play as today, under the stamp.

The stamp is there to be screenshotted. Many players share a screenshot, not
a button.

## 6. The link, and counting shares

**Link target:** one constant, `SHARE_URL`, in one place in the code.
- Until M1 (itch.io) is live: `https://aj-72.github.io/drivetrain/`.
- After M1: the itch.io page, because itch.io counts views and where they came
  from. GitHub Pages counts nothing.

**Link preview:** the web export's page has no title or image tags, so a chat
app shows a bare address. A1 adds, through `html/head_include` in
`export_presets.cfg`:
- `og:title` "Last Stop", `og:description` (the itch.io page's one-line hook),
  and `og:image` (the A6 cover, once it exists).

**Counting:** BRIEF §13 says the game makes no network call, so the game
cannot report a share. A1 counts shares in the save file
(`save.shares`, one number) and nowhere else. If M3 later allows a counter,
that number is ready to send. Until then, success is judged from itch.io's
referrers and from asking testers (§9).

## 7. How it works in the browser

All calls go through one small JavaScript helper added in the export's
`html/head_include`, called with `JavaScriptBridge`. The game already uses
`JavaScriptBridge` for EXIT and the installed-app check.

The helper:
1. **Share:** if `navigator.share` exists and `navigator.canShare({text})` is
   true, call `navigator.share({text, url})`.
   - Resolves → result `shared`.
   - `AbortError` (player closed the sheet) → result `cancelled`.
   - Any other error, such as `NotAllowedError` → go to step 2.
2. **Copy:** `navigator.clipboard.writeText(text + "\n" + url)`.
   - Resolves → result `copied`.
   - Fails → go to step 3.
3. **By hand:** put a `<textarea>` over the canvas with the text selected, and
   a CLOSE button. Result `manual`.

The helper writes its result to a value the game reads each frame
(`JavaScriptBridge.create_callback` is the other option; pick whichever the
headless test can drive).

**Things the builder must check, not assume:**
- **The tap must still count.** Browsers open the share sheet and allow copy
  only right after a tap. Godot handles input one frame later, which the phone
  probe did not test. Call the helper from the touch-release handler, not from
  a later frame. If iPhone Safari refuses, fall through to copy, as above.
- **Do not trust the permission check.** On Android, the probe reported
  `web-share allowed: false` and the sheet opened anyway. Try the call; do not
  ask first.
- **The itch.io embed** puts the game in a frame. If the frame refuses share,
  the fallback must still work there.
- **Desktop builds** (Windows, macOS, Linux) have no `JavaScriptBridge`. There,
  SHARE copies with `DisplayServer.clipboard_set()` and shows `COPIED`.

## 8. Out of scope

- The challenge link that opens a station (A3).
- Sending a ghost (A5).
- Any network call, counter or leaderboard (M3, A10).
- Sharing a picture of the result. The stamp is for the player's own
  screenshot.

## 9. Done means

**Headless tests** (added to `godot/tests/test_sim.gd`):
- The share line for each of the seven cases in §3, checked word for word.
- The line stays under 100 characters for every station, at 0 m and 99 m from
  the board, with a new best.
- The result row has SHARE last in all three layouts, and no two buttons
  overlap.
- ENTER on a fresh result picks the first button, not SHARE.
- The stamp shows only when `precise` is true, and a tap skips it.
- `save.shares` goes up by one per share or copy, and survives a save and
  load.

**Phone checks** on the live build, with a screenshot of each:

| Where | Share sheet opens | Copy works | Fallback box shows |
|---|---|---|---|
| Android Chrome, GitHub Pages | required | required | — |
| iPhone Safari, GitHub Pages | required | required | — |
| itch.io embed, Android | record result | required | if copy fails |
| Windows desktop browser | record result | required | — |

Plus: a friend receives the line in WhatsApp, sees the title in the link
preview, and the link opens the game.

**The real bar, two weeks after release:** at least 1 race in 20 ends with a
share, measured as `save.shares` against races on 5 testers' phones, and
itch.io shows visits whose referrer is a chat app or "direct". If that is not
met, the next step is the share line's wording and the button's place, not
new features.

## 10. Open questions for the user

1. **Paid:** is SHARE free? This brief assumes yes: it brings players in.
2. **Losses:** should a loss be shareable? This brief assumes yes.
3. **Link target before M1:** share the GitHub Pages address now, or hold A1
   until the itch.io page is live so shares are counted?
4. **Stamp bar:** the third star at Ashford Halt is a 20 m window, which may
   be too easy for a stamp called "on the board". Keep the third star as the
   bar, or use a tighter one, such as 2 m?
