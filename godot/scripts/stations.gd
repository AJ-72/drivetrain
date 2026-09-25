class_name Stations
extends RefCounted
## The campaign route and the free-race rules.
##
## Keep STATIONS in step with tools/campaign-check.mjs. That script sweeps
## every brake point for each station, proves the station can be won, and
## prints the par times written here. Run it after any change:
##
##     node tools/campaign-check.mjs
##
## Stars: one for a win, one for a win inside par, one for a stop within
## `window` metres of the stop board at the platform centre.

const LINE_NAME := "THE COASTLINE"

# theme: 0 dawn, 1 morning, 2 noon, 3 afternoon, 4 dusk, 5 night
const STATIONS := [
	{"name": "ASHFORD HALT", "rail": "DRY", "platform_start": 1300.0,
		"platform_width": 300.0, "rival": 26.0, "boost": 2.0, "window": 20.0,
		"par_ms": 49400, "theme": 0,
		"tip": "A HIGHER NUMBER ON THE BRAKE LEVER BRAKES HARDER."},
	{"name": "BRINDLE ROAD", "rail": "DRY", "platform_start": 1400.0,
		"platform_width": 260.0, "rival": 28.0, "boost": 3.0, "window": 18.0,
		"par_ms": 51400, "theme": 1,
		"tip": "FAST ON NOTCH 3 LOCKS THE WHEELS. START ON 2, THEN 3."},
	{"name": "COLE HARBOUR", "rail": "DAMP", "platform_start": 1350.0,
		"platform_width": 250.0, "rival": 29.0, "boost": 3.0, "window": 16.0,
		"par_ms": 54400, "theme": 2,
		"tip": "A DAMP RAIL. NOTCH 3 SLIDES UNTIL YOU ARE NEARLY STOPPED."},
	{"name": "DUNMORE", "rail": "DRY", "platform_start": 1500.0,
		"platform_width": 220.0, "rival": 31.0, "boost": 3.0, "window": 14.0,
		"par_ms": 53400, "theme": 3,
		"tip": "A FAST RIVAL. IT PUSHES HARDER WHEN YOU LEAD."},
	{"name": "ELM CROSS", "rail": "WET", "platform_start": 1320.0,
		"platform_width": 240.0, "rival": 29.0, "boost": 3.0, "window": 14.0,
		"par_ms": 55000, "theme": 4,
		"tip": "WET RAIL. NOTCH 3 SLIDES. NOTCH 2 SLIDES WHEN FAST."},
	{"name": "FENWICK", "rail": "DAMP", "platform_start": 1480.0,
		"platform_width": 210.0, "rival": 32.0, "boost": 3.0, "window": 12.0,
		"par_ms": 57100, "theme": 1,
		"tip": "A SHORT PLATFORM. WATCH FOR THE GREEN MARKER."},
	{"name": "GREYSTONE", "rail": "WET", "platform_start": 1450.0,
		"platform_width": 210.0, "rival": 32.0, "boost": 3.0, "window": 12.0,
		"par_ms": 57800, "theme": 5,
		"tip": "NIGHT AND RAIN. TRUST THE INSTRUMENTS."},
	{"name": "HARROW TERMINUS", "rail": "WET", "platform_start": 1520.0,
		"platform_width": 200.0, "rival": 33.0, "boost": 3.0, "window": 10.0,
		"par_ms": 59200, "theme": 4,
		"tip": "THE LAST STOP. THE BEST RIVAL ON THE LINE."},
]

# Free race: a fresh station, rail and rival for each race, as in the HTML
# game. The rival gains FREE_TIER_STEP of top speed for each win in the
# current streak, up to FREE_MAX_TIER. At the top tier the winning band on the
# hardest draw is still above 60 m (measured with tools/campaign-check.mjs).
const FREE_PLATFORM_WIDTH := 240.0
const FREE_MIN_START := 1300
const FREE_MAX_START := 1520
const FREE_RIVAL_MIN := 28.0
const FREE_RIVAL_MAX := 33.0
const FREE_TIER_STEP := 0.4
const FREE_MAX_TIER := 5
const FREE_WINDOW := 15.0

# Liveries. "points" unlocks by career points, "stars" by campaign stars.
const LIVERIES := [
	{"name": "GREEN LINE", "body": Color("2fb870"), "trim": Color("f3f6f3"),
		"dark": Color("157f4c"), "points": 0, "stars": 0},
	{"name": "MIDNIGHT MAIL", "body": Color("2b3a78"), "trim": Color("e8c547"),
		"dark": Color("1a2350"), "points": 100, "stars": 0},
	{"name": "SUNSET EXPRESS", "body": Color("ee7a32"), "trim": Color("6b2d6e"),
		"dark": Color("b04a1c"), "points": 250, "stars": 0},
	{"name": "CHROME ARROW", "body": Color("c9d2d8"), "trim": Color("2f7fd1"),
		"dark": Color("7f8b93"), "points": 500, "stars": 0},
	{"name": "HERITAGE", "body": Color("7a1f2b"), "trim": Color("efe2bd"),
		"dark": Color("4a1219"), "points": 0, "stars": 24},
]


static func count() -> int:
	return STATIONS.size()


static func config_for(index: int) -> Dictionary:
	return STATIONS[index]


static func free_config(rng: RandomNumberGenerator, streak: int) -> Dictionary:
	var tier := mini(streak, FREE_MAX_TIER)
	var rails := ["DRY", "DAMP", "WET"]
	return {
		"name": "FREE RACE",
		"rail": rails[rng.randi_range(0, 2)],
		"platform_start": float(rng.randi_range(FREE_MIN_START, FREE_MAX_START)),
		"platform_width": FREE_PLATFORM_WIDTH,
		"rival": rng.randf_range(FREE_RIVAL_MIN, FREE_RIVAL_MAX) + tier * FREE_TIER_STEP,
		"boost": 3.0,
		"window": FREE_WINDOW,
		"par_ms": 0,
		"theme": rng.randi_range(0, 5),
		"tip": "",
	}
