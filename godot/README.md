# Last Stop

A pixel-art train game made with Godot 4.4+. Stop your train on the platform
before the rival stops. Arriving first does not win. Stopping does.

This is the indie version of the browser game in `../index.html`. It uses the
same physics, step for step, plus a brake handle with notches.

## The brake handle

The brake is a lever with four positions: OFF, 1, 2 and 3. On a touch screen,
tap a position or slide the handle. On a keyboard, `S` / `Down` adds a notch,
`Q` / `Shift` takes one off, and `0` to `3` set the notch. The handle stays
where you put it.

Power is a separate button, SPEED UP. The train gets power only while you hold
it (`W` / `Up`) and only while the brake lever is at OFF.

More notches brake harder, but the rail holds only so much. The grip falls
with speed and with a damp or wet rail. A notch that asks for more than the
rail holds locks the wheels: the train slides, sparks fly, and it brakes at
half of what the rail could hold. Take a notch off to stop the slide.

| Rail | Notch 3 | Notch 2 | Notch 1 |
|---|---|---|---|
| DRY | slides above 126 km/h | never slides | never slides |
| DAMP | slides above 13 km/h | slides above 216 km/h | never slides |
| WET | always slides | slides above 133 km/h | never slides |

The best stop starts on a lower notch and adds notches as the train slows.
STOP NEEDS shows that best stop. The dashed marker shows where the notch you
have now stops you.

## Open and run

1. Install Godot 4.4 or later (the standard build, not .NET).
2. Open Godot, click **Import**, and select `godot/project.godot`.
3. Press **F5** to play.

## What is in the game

| Part | Where |
|---|---|
| Physics (`index.html` plus brake notches) | `scripts/race_sim.gd` |
| The campaign route, free-race rules, liveries | `scripts/stations.gd` |
| Screens, pixel-art scene, HUD, input | `scripts/game.gd` |
| 5x7 bitmap font drawn with rectangles | `scripts/pixel_font.gd` |
| Engine, brake, horn, rail clack, jingles, music | `scripts/synth.gd` |
| Save file (`user://last_stop.cfg`) | `scripts/save_game.gd` |
| Headless checks | `tests/test_sim.gd` |

There are no image, font or audio files. Everything is drawn or synthesized
in code at 480x270 and scaled up by whole numbers.

### Modes

- **Campaign**: 8 stations on *The Coastline*. Each has a fixed rail, platform
  length and rival. Win a station to open the next. Stars: one for a win, one
  for a win inside par, one for a stop near the stop board.
- **Free race**: opens when the campaign is complete. A random station, rail
  and rival each race. Wins give points and build a streak. The rival gets
  faster as the streak grows.
- **Garage**: five liveries. Points unlock four of them. All 24 campaign stars
  unlock the last one.

### Controls

| | Keyboard | Touch / mouse | Gamepad |
|---|---|---|---|
| Speed up (brake at OFF) | hold `W` / `Up` | hold SPEED UP, right | RT |
| Brake notch +1 | `S` / `Down` | tap or slide the lever, left | LT |
| Brake notch -1 | `Q` / `Shift` | tap or slide the lever, left | LB |
| Brake OFF, 1, 2, 3 | `0`, `1`, `2`, `3` | tap the position | |
| Pause | `Esc` / `P` | the II button, top right | |
| Restart | `R` | pause menu | |
| Menus | arrows, `Enter`, `Esc` | tap | D-pad, A, B |

On phones the controls show touch hints in place of the key names, the start, a win and
a loss give a short vibration (Android browsers), and a phone held upright
pauses the race and asks to be turned sideways. The web title screen has a
FULL SCREEN item (not on iPhone and iPad, where Safari has no full-screen API
for pages).

The web build is also an installable app (browser menu > **Add to Home
screen** or **Install app**). The app opens full screen and locked to
landscape, with no browser bar. Use it on phones whose browser keeps a
full-screen note over the game. The FULL SCREEN item hides in the app.

The title screen has an EXIT item. It closes the home-screen app and the
desktop builds. A normal browser tab does not let a page close itself, so there
EXIT shows a note to use the phone's Back or Home button.

## Checks

```
node tools/campaign-check.mjs                          # from the repo root
godot --headless --path godot -s res://tests/test_sim.gd
```

`campaign-check.mjs` sweeps every brake point at each station, with the best
stop after the brake point. It fails if a station cannot be won or its winning
band is under 60 m. It prints the par times that `stations.gd` uses. Run it
after any change to a station or to the brake model.

`test_sim.gd` pins the GDScript physics to reference numbers printed by
`node tools/campaign-check.mjs --cases`, then drives every screen of the
game. The GitHub Actions workflow `.github/workflows/godot.yml` runs both on
each push that touches `godot/`.

## Export

`export_presets.cfg` has presets for **Web**, **Windows**, **Linux** and
**macOS**. Install the export templates first (Editor > Manage Export
Templates), then use Project > Export. Builds go to `godot/export/`, which git
ignores.

For itch.io, upload the Web build as a zip of `export/web/` and set the
embed size to 960x540 or 1440x810. See `release/itch-page.md` for the page
text.

## Play in the browser

`.github/workflows/pages.yml` exports the Web preset on every push to `main`
and publishes it to GitHub Pages: *Last Stop* at the site root, the original
HTML game at `/classic/`. Pull requests run the same export without
publishing. Each build also runs `tools/web-audio-check.mjs` (the game makes
sound) and `tools/web-touch-check.mjs` (a finger tap reaches the menus) in
headless Chromium, and `tools/web-app-check.mjs` checks that it installs as an
app. One-time setup: Settings > Pages > Source: **GitHub Actions**.
