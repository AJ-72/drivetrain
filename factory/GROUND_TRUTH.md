# GROUND_TRUTH.md — Step 0.5

Date: 2026-08-10

I assume the user starts with nothing. I list every external item that the plan
touches. The user confirms each item.

## 1. Accounts

| Account | Needed | Payment card | Status |
|---|---|---|---|
| GitHub | Yes | No | Exists. Repository `AJ-72/drivetrain` is present. |
| Claude | Yes | No | Exists. The user runs Claude Code now. |
| Any other service | No | — | The plan uses no other service. |

The plan needs no new signup.

## 2. Tools in this container

I ran these commands. They return:

- `node -v` returns `v22.22.2`
- `npm -v` returns `10.9.7`
- `python3 -V` returns `Python 3.11.15`
- `git --version` returns `git version 2.43.0`
- Chromium is present at `/opt/pw-browsers/chromium`

## 3. The user's own device

The user runs Claude Code from a mobile phone.

This is the most important fact in this step. It has three effects:

1. A phone has no keyboard. Touch input is mandatory, not optional.
2. A local HTML file is hard to open on a phone. The game needs a URL.
3. A small screen limits the layout. The game must use a portrait layout.

The user also owns a computer with `git`, `node`, and a browser. The user does
not use it for this session.

## 4. One-way choices

| Choice | Decision | Cost |
|---|---|---|
| GitHub Pages | Rejected | Pages on the free plan needs a public repository. That makes the code public and it is hard to reverse. |
| Claude Artifact | Accepted | The page is private by default. Only the user decides to share it. No repository change. |
| Repository visibility | No change | The repository stays as it is. |

No `[STRUCTURAL]` account choice is open. This step closes them all.

## 5. Platform limits that become tasks

A Claude Artifact runs under a strict content policy. These limits are rules for
the build, not footnotes:

- The page must load no external host. No CDN script. No external font. No
  remote image. No network call.
- All CSS and all JavaScript stay inline in one file.
- All art is code. The build uses canvas drawing or inline SVG.
- The rendered page must be 16 MB or smaller.
- The page must read well in a light theme and in a dark theme.

Each limit becomes a check in the plan.

## 6. Human dependencies

None.

The user chose a computer opponent. One person completes every test. No second
person and no second device block the final verification.

## 7. Task T0 — done-conditions

T0 blocks every other task. T0 passes when all these commands return:

```
node -v                                  # prints v22.x or later
git --version                            # prints a version
ls /opt/pw-browsers/chromium             # lists the browser
git rev-parse --abbrev-ref HEAD          # prints claude/train-racing-game-1omoqu
test -f factory/KILL.md && echo OK       # prints OK
```

T0 also passes only when the user confirms:

- The user opens a Claude Artifact link on the phone.
- The user taps a button in that page and sees a response.

## 8. Confirmed answers

- Opponent: a computer opponent.
- Delivery: a Claude Artifact, plus the same file in the repository.
- Controls: touch buttons and keyboard keys together.
- Second person needed: no.
