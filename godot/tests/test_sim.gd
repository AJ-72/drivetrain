extends SceneTree
## Headless checks for Last Stop. Run from the repository root:
##
##     godot --headless --path godot -s res://tests/test_sim.gd
##
## Part 1 pins the GDScript physics to the reference numbers printed by
## tools/campaign-check.mjs (same result, same step count, same position to the
## last digit). That script is index.html's physics plus the brake notches.
## Part 2 loads the main scene and drives every screen, so a script error in
## any draw path shows up here. The CI job also fails on any "SCRIPT ERROR" in
## the log. Exit code 0 only if everything passes.

# label, rail, platform start, width, rival, boost, brake at, notch (0 = the
# best stop: the strongest notch that does not slide), result, steps, pos.
# Printed by: node tools/campaign-check.mjs --cases
const CASES := [
	["dry expert", "DRY", 1300.0, 240.0, 30.0, 3.0, 900.0, 0, "WIN", 3032, 1511.1020087149468],
	["wet expert", "WET", 1520.0, 240.0, 33.0, 3.0, 870.0, 0, "WIN", 3596, 1736.661989206873],
	["damp late brake", "DAMP", 1400.0, 240.0, 28.5, 3.0, 1000.0, 0, "OVERSHOT", 3530, 1752.9409206144696],
	["undershot", "DRY", 1450.0, 240.0, 31.0, 3.0, 700.0, 0, "UNDERSHOT", 2712, 1231.3428628581091],
	["wet late brake", "WET", 1300.0, 240.0, 29.0, 3.0, 1200.0, 0, "OVERSHOT", 3171, 2000],
	["full power overshoots", "DRY", 1300.0, 240.0, 30.0, 3.0, 1.0e9, 0, "OVERSHOT", 2825, 2000],
	["wet notch 3 slides, rival wins", "WET", 1320.0, 240.0, 29.0, 3.0, 700.0, 3, "RIVAL WINS", 3681, 1718.3527342208547],
	["dry notch 1 is gentle", "DRY", 1300.0, 300.0, 26.0, 2.0, 500.0, 1, "WIN", 3653, 1338.5989377777291],
	["station 1", "DRY", 1300.0, 300.0, 26.0, 2.0, 858.0, 0, "WIN", 2968, 1453.6776862613478],
	["station 2", "DRY", 1400.0, 260.0, 28.0, 3.0, 916.0, 0, "WIN", 3056, 1533.0117700375283],
	["station 3", "DAMP", 1350.0, 250.0, 29.0, 3.0, 796.0, 0, "WIN", 3225, 1477.248379261787],
	["station 4", "DRY", 1500.0, 220.0, 31.0, 3.0, 975.0, 0, "WIN", 3141, 1610.8886877523028],
	["station 5", "WET", 1320.0, 240.0, 29.0, 3.0, 685.0, 0, "WIN", 3258, 1443.898724014196],
	["station 6", "DAMP", 1480.0, 210.0, 32.0, 3.0, 875.0, 0, "WIN", 3348, 1586.1934365534566],
	["station 7", "WET", 1450.0, 210.0, 32.0, 3.0, 754.0, 0, "WIN", 3391, 1556.4566137849786],
	["station 8", "WET", 1520.0, 200.0, 33.0, 3.0, 795.0, 0, "WIN", 3465, 1621.199405629336],
]

var failures := 0
var frame := 0
var game: Node2D
var script_steps: Array[Callable] = []


func _initialize() -> void:
	_test_physics()
	_test_stations_match()
	_test_throttle_starts()
	_test_font()
	_test_save_roundtrip()
	_test_ghost()
	_test_paid()
	_start_scene_test()


func check(ok: bool, label: String) -> void:
	if ok:
		print("PASS ", label)
	else:
		failures += 1
		printerr("FAIL ", label)


# Full power until brake_at, then the given notch (0: the best stop).
func run_case(config: Dictionary, brake_at: float, notch: int = 0) -> RaceSim:
	var sim := RaceSim.new()
	sim.start(config)
	var n := 0
	while sim.state == RaceSim.State.RACING and n < 60 * 600:
		var b := sim.player_pos >= brake_at
		sim.throttle = not b
		sim.brake_notch = 0
		if b:
			sim.brake_notch = notch if notch > 0 else sim.safe_notch(sim.player_speed)
		sim.step()
		n += 1
	return sim


func _test_physics() -> void:
	for c in CASES:
		var config := {"rail": c[1], "platform_start": c[2], "platform_width": c[3],
			"rival": c[4], "boost": c[5]}
		var sim := run_case(config, c[6], c[7])
		var ok: bool = sim.result == c[8] and sim.steps == c[9] and absf(sim.player_pos - c[10]) < 1e-6
		check(ok, "physics %s: %s in %d steps at %.6f m (want %s, %d, %.6f)" % [
			c[0], sim.result, sim.steps, sim.player_pos, c[8], c[9], c[10]])


func _test_stations_match() -> void:
	check(Stations.count() == 8, "the campaign has 8 stations")
	for i in Stations.count():
		var s: Dictionary = Stations.config_for(i)
		var c: Array = CASES[8 + i]
		var ok: bool = s["rail"] == c[1] and s["platform_start"] == c[2] \
			and s["platform_width"] == c[3] and s["rival"] == c[4] and s["boost"] == c[5]
		check(ok, "stations.gd station %d matches tools/campaign-check.mjs" % (i + 1))
		var sim := run_case(s, 1.0e9)
		check(sim.result == "OVERSHOT", "full power overshoots at station %d" % (i + 1))


func _test_throttle_starts() -> void:
	# The a < 0 guard on STOP_EPSILON: without it the first throttle step
	# snaps to zero and the train never moves.
	var sim := RaceSim.new()
	sim.start({"rail": "DRY", "platform_start": 1300.0, "platform_width": 240.0, "rival": 30.0})
	sim.throttle = true
	sim.step()
	check(sim.player_speed > 0.0, "the first throttle step moves the train")
	# A stop before ARM_AFTER_M does not end the race.
	sim.throttle = false
	sim.brake_notch = 3
	for i in 60:
		sim.step()
	check(sim.state == RaceSim.State.RACING, "a stop before 50 m does not end the race")
	_test_notches()


func _test_notches() -> void:
	var sim := RaceSim.new()
	sim.start({"rail": "WET", "platform_start": 1300.0, "platform_width": 240.0, "rival": 30.0})
	check(sim.slides(3, 5.0), "notch 3 slides on a wet rail even when slow")
	check(sim.slides(2, 40.0) and not sim.slides(2, 30.0), "notch 2 slides on a wet rail only when fast")
	check(not sim.slides(1, 60.0), "notch 1 never slides")
	check(sim.safe_notch(30.0) == 2 and sim.safe_notch(45.0) == 1, "the best wet notch falls with speed")
	sim.start({"rail": "DRY", "platform_start": 1300.0, "platform_width": 240.0, "rival": 30.0})
	check(not sim.slides(3, 30.0) and sim.slides(3, 40.0), "notch 3 slides on a dry rail only when fast")
	# a slide is flagged during the step and brakes less than a notch that holds
	sim.player_speed = 45.0
	sim.player_pos = 800.0
	sim.player_armed = true
	sim.brake_notch = 3
	sim.step()
	var slid := 45.0 - sim.player_speed
	check(sim.sliding, "a step on a sliding notch sets sliding")
	sim.player_speed = 45.0
	sim.brake_notch = 2
	sim.step()
	check(not sim.sliding and 45.0 - sim.player_speed > slid, "a notch that holds brakes harder than a slide")
	# the prediction agrees with the race to within a few metres
	for rail in ["DRY", "DAMP", "WET"]:
		sim.start({"rail": rail, "platform_start": 1300.0, "platform_width": 240.0, "rival": 1.0})
		sim.player_pos = 500.0
		sim.player_speed = 35.0
		sim.player_armed = true
		var predicted := sim.predict_stop(0)
		while sim.state == RaceSim.State.RACING:
			sim.brake_notch = sim.safe_notch(sim.player_speed)
			sim.step()
		check(absf(sim.player_pos - predicted) < 5.0,
			"the %s stop prediction %.1f m is within 5 m of the race %.1f m" % [rail, predicted, sim.player_pos])


func _test_font() -> void:
	var missing := []
	var needed := "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:-/!?'+()%><*"
	for ch in needed:
		if not PixelFont.GLYPHS.has(ch):
			missing.append(ch)
	check(missing.is_empty(), "the pixel font has every glyph the game uses %s" % str(missing))
	for ch in PixelFont.GLYPHS:
		var rows: Array = PixelFont.GLYPHS[ch]
		var ok := rows.size() == PixelFont.H
		for r in rows:
			ok = ok and int(r) >= 0 and int(r) < 32
		check(ok, "glyph '%s' is 5x7" % ch)


func _test_save_roundtrip() -> void:
	var s := SaveGame.new()
	s.stars[0] = 3
	s.stars[1] = 1
	s.best_ms[0] = 48000
	s.points = 120
	s.livery = 1
	s.music_on = false
	s.ghost_on = false
	s.ghosts[0] = PackedFloat32Array([0.0, 1.5, 4.0, 900.0])
	s.ghost_ms[0] = 48000
	check(s.save(), "the save file writes")
	var r := SaveGame.new()
	r.load_file()
	check(r.stars[0] == 3 and r.stars[1] == 1 and r.best_ms[0] == 48000, "campaign progress reloads")
	check(r.points == 120 and r.livery == 1 and not r.music_on, "career and settings reload")
	check(r.station_unlocked(2) and not r.station_unlocked(3), "stations unlock in order")
	check(not r.ghost_on and r.ghost_ms[0] == 48000 and r.ghosts[0].size() == 4
		and is_equal_approx(r.ghosts[0][3], 900.0), "the ghost run and its setting reload")
	check(r.ghosts[1].is_empty() and r.ghost_ms[1] == 0, "a station with no ghost loads with none")
	# a corrupt best time loads as no record
	var cfg := ConfigFile.new()
	cfg.load(SaveGame.PATH)
	cfg.set_value("campaign", "best_0", 12)
	cfg.set_value("campaign", "stars_0", "three")
	cfg.set_value("ghost", "run_0", PackedFloat32Array([0.0, 50.0, 20.0]))
	cfg.save(SaveGame.PATH)
	var bad := SaveGame.new()
	bad.load_file()
	check(bad.best_ms[0] == 0 and bad.stars[0] == 0, "a corrupt save value loads as empty")
	check(bad.ghosts[0].is_empty() and bad.ghost_ms[0] == 0, "a ghost that runs backwards loads as none")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveGame.PATH))


func _test_ghost() -> void:
	var run := PackedFloat32Array([0.0, 2.0, 6.0, 10.0])
	check(is_equal_approx(Ghost.pos_at(run, 0), 0.0), "the ghost starts at 0 m")
	check(is_equal_approx(Ghost.pos_at(run, Ghost.EVERY), 2.0), "the ghost is on its sample at a sample step")
	check(is_equal_approx(Ghost.pos_at(run, Ghost.EVERY + Ghost.EVERY / 2), 4.0),
		"the ghost is between two samples between their steps")
	check(is_equal_approx(Ghost.pos_at(run, 100000), 10.0), "the ghost stays where its run stopped")
	check(Ghost.pos_at(PackedFloat32Array(), 50) == 0.0, "no run puts the ghost at 0 m")
	check(Ghost.valid(run), "a forward run on the track is valid")
	check(not Ghost.valid(PackedFloat32Array([0.0])), "a run with one sample is not valid")
	check(not Ghost.valid(PackedFloat32Array([0.0, 5.0, 4.0])), "a run that goes backwards is not valid")
	check(not Ghost.valid(PackedFloat32Array([0.0, RaceSim.TRACK_LENGTH_M + 1.0])),
		"a run past the end of the track is not valid")


func _test_paid() -> void:
	Paid.override = 0
	check(not Paid.has("ghost"), "a free player does not have the ghost")
	Paid.override = 1
	check(Paid.has("ghost"), "a paid player has the ghost")
	check(not Paid.has("no such feature"), "a feature not in the paid list is never on")
	check(Paid.name_of("ghost") != "", "each paid feature has a name for its teaser")
	Paid.override = -1
	check(Paid.unlocked() == Paid.EVERYONE_PAID, "without an override, EVERYONE_PAID decides")


# --------------------------------------------------------- the scene test
# Each entry runs on its own frame, so _draw() runs for each screen.

func _start_scene_test() -> void:
	var packed: PackedScene = load("res://scenes/main.tscn")
	check(packed != null, "the main scene loads")
	if packed == null:
		return
	game = packed.instantiate()
	root.add_child(game)
	var screens := [0, 1, 2, 3]
	for s in screens:
		script_steps.append(func(): game.screen = s)
		script_steps.append(func(): pass)
	script_steps.append(func():
		game._go(0)  # Screen.TITLE
		var ids: Array = game._items().map(func(it): return it["id"])
		check(ids.has("quit"), "the title screen has an EXIT item")
		var last: Rect2 = game._items()[ids.size() - 1]["rect"]
		check(last.end.y <= 256.0, "the title items end above the footer"))
	script_steps.append(func(): pass)
	# The route map: a tap near (not on) a station dot selects it, and the
	# < and > buttons step through the stations.
	script_steps.append(func():
		game._go(1)  # Screen.MAP
		game.map_sel = 0
		game._unhandled_input(_touch(Vector2(game._map_x(2) + 20.0, 82.0), true))
		game._unhandled_input(_touch(Vector2(game._map_x(2) + 20.0, 82.0), false))
		check(game.map_sel == 2, "a tap near station 3 on the map selects it")
		game._unhandled_input(_touch(Vector2(460.0, 156.0), true))
		game._unhandled_input(_touch(Vector2(460.0, 156.0), false))
		check(game.map_sel == 3, "the > button selects the next station")
		game._unhandled_input(_touch(Vector2(20.0, 156.0), true))
		game._unhandled_input(_touch(Vector2(20.0, 156.0), false))
		check(game.map_sel == 2, "the < button selects the previous station"))
	script_steps.append(func(): pass)
	script_steps.append(func(): game._start_race("campaign", 0))
	script_steps.append(func(): game.countdown = 0.001)
	script_steps.append(func(): Input.action_press("throttle"))
	for i in 10:
		script_steps.append(func(): pass)
	script_steps.append(func():
		check(game.sim.state == RaceSim.State.RACING, "a campaign race starts after the countdown")
		check(game.sim.player_pos > 0.0, "holding throttle moves the train in the scene"))
	# The brake lever: a tap on a position sets that notch, a slide moves the
	# handle, and the speed button never changes the notch.
	script_steps.append(func():
		var lever: Rect2 = game._brake_rect()
		game._unhandled_input(_touch(game._lever_cell(lever, 2).get_center(), true))
		game._unhandled_input(_touch(game._lever_cell(lever, 2).get_center(), false))
		check(game.sim.brake_notch == 2, "a tap on lever position 2 sets notch 2")
		game._unhandled_input(_touch(game._lever_cell(lever, 1).get_center(), true))
		game._unhandled_input(_drag(game._lever_cell(lever, 3).get_center()))
		check(game.sim.brake_notch == 3, "a slide on the lever moves the handle to 3")
		game._unhandled_input(_drag(Vector2(0, 150)))
		check(game.sim.brake_notch == 0, "a slide past the left end moves the handle to OFF")
		game._unhandled_input(_touch(Vector2(0, 150), false))
		game._unhandled_input(_touch(game._lever_cell(lever, 1).get_center(), true))
		game._unhandled_input(_touch(game._lever_cell(lever, 1).get_center(), false))
		var th: Vector2 = game._throttle_rect().get_center()
		game._unhandled_input(_touch(th, true))
		check(game.sim.brake_notch == 1, "a tap on SPEED UP does not change the brake")
		check(game.touches.get(0, "") == "throttle", "a finger on SPEED UP holds the power")
		game._unhandled_input(_touch(th, false))
		game._unhandled_input(_key(KEY_DOWN, true))
		game._unhandled_input(_key(KEY_DOWN, false))
		game._unhandled_input(_key(KEY_DOWN, true))
		game._unhandled_input(_key(KEY_DOWN, false))
		game._unhandled_input(_key(KEY_DOWN, true))
		check(game.sim.brake_notch == 3, "the Down key adds notches up to 3")
		game._unhandled_input(_key(KEY_DOWN, false))
		game._unhandled_input(_key(KEY_Q, true))
		game._unhandled_input(_key(KEY_Q, false))
		check(game.sim.brake_notch == 2, "the Q key takes a notch off")
		game._unhandled_input(_key(KEY_UP, true))
		check(game.sim.brake_notch == 2, "the Up key does not change the brake")
		game._unhandled_input(_key(KEY_UP, false))
		game._unhandled_input(_key(KEY_0, true))
		game._unhandled_input(_key(KEY_0, false))
		check(game.sim.brake_notch == 0, "the 0 key puts the brake to OFF"))
	script_steps.append(func(): pass)
	script_steps.append(func():
		check(game.sim.throttle, "at notch 0 a held throttle gives power again"))
	# The pause button: a finger on it pauses, and the touch labels draw.
	script_steps.append(func():
		game.touch_ui = true
		game._unhandled_input(_touch(game._pause_rect().get_center(), true))
		game._unhandled_input(_touch(game._pause_rect().get_center(), false))
		check(game.paused, "a tap on the pause button pauses the race"))
	script_steps.append(func(): pass)
	script_steps.append(func():
		game._activate("resume")
		check(not game.paused, "resume ends the pause"))
	script_steps.append(func(): pass)
	# A phone held upright pauses the race and shows the rotate prompt.
	script_steps.append(func(): game.portrait_test = true)
	script_steps.append(func(): pass)
	script_steps.append(func():
		check(game.paused, "a phone held upright pauses the race")
		game._unhandled_input(_touch(Vector2(240, 150), true))
		check(game.paused and game.touches.is_empty(), "taps do nothing while the phone is upright")
		game.portrait_test = false)
	script_steps.append(func(): pass)
	script_steps.append(func():
		Input.action_release("throttle")
		game.touch_ui = false
		game._set_paused(false))
	# Finish the race quickly through the sim, then show the result overlay.
	script_steps.append(func():
		while game.sim.state == RaceSim.State.RACING:
			var b: bool = game.sim.player_pos >= 858.0
			game.sim.throttle = not b
			game.sim.brake_notch = game.sim.safe_notch(game.sim.player_speed) if b else 0
			game.sim.step()
			game._after_step()
		game._on_finish()
		check(game.sim.result == "WIN", "the scene race at station 1 wins with a brake at 858 m")
		check(game.save.stars[0] >= 1, "a win earns a star")
		check(Ghost.valid(game.save.ghosts[0]) and game.save.ghost_ms[0] == game.sim.elapsed_ms,
			"the first win at a station records its ghost")
		check(is_equal_approx(Ghost.pos_at(game.save.ghosts[0], game.sim.steps), game.sim.player_pos),
			"the ghost comes to rest where the train stopped"))
	for i in 3:
		script_steps.append(func(): pass)
	# Race station 1 again with its ghost, then beat it.
	script_steps.append(func():
		Paid.override = 1
		game.save.ghost_on = true
		game._start_race("campaign", 0)
		check(game._ghost_live(), "a paid player races the ghost of the station")
		game.countdown = 0.0
		game.sim.state = RaceSim.State.RACING
		for i in 600:
			game.sim.throttle = true
			game.sim.step()
			game._after_step()
		check(is_equal_approx(game._ghost_pos(), Ghost.pos_at(game.save.ghosts[0], 600)),
			"the ghost is where the best run was at the same step"))
	script_steps.append(func(): pass)
	script_steps.append(func():
		game.sim.player_pos = game.sim.platform_centre()
		game.sim.steps = 60
		game.sim.elapsed_ms = 1000
		game.sim._finish("WIN")
		game._on_finish()
		check(game.outcome.has("ghost_ms") and game.outcome["new_best"], "a faster win beats the ghost")
		check(game.save.ghost_ms[0] == 1000, "a new best becomes the new ghost"))
	script_steps.append(func(): pass)
	script_steps.append(func():
		Paid.override = 0
		game._start_race("campaign", 0)
		check(not game._ghost_live(), "a free player races without the ghost"))
	script_steps.append(func(): pass)
	script_steps.append(func(): game._activate("menu"))
	# The route map: GHOST is a locked teaser for a free player.
	script_steps.append(func():
		game._unhandled_input(_key(KEY_G, true))
		game._unhandled_input(_key(KEY_G, false))
		check(game.save.ghost_on and game._locked_feature == "ghost",
			"a free player's G key shows the full version note, not a toggle"))
	script_steps.append(func(): pass)
	script_steps.append(func():
		Paid.override = 1
		game._unhandled_input(_key(KEY_G, true))
		game._unhandled_input(_key(KEY_G, false))
		check(not game.save.ghost_on, "a paid player's G key turns the ghost off")
		var gid := ""
		for it in game._items():
			if it["id"] == "ghost":
				gid = it["label"]
		check(gid.begins_with("GHOST: OFF"), "the ghost button says OFF")
		game._activate("ghost")
		Paid.override = -1)
	script_steps.append(func(): pass)
	script_steps.append(func(): game._activate("race"))
	script_steps.append(func(): game._activate("next"))
	script_steps.append(func(): pass)
	script_steps.append(func(): game._activate("menu"))
	script_steps.append(func(): pass)
	# a free race, with rain and night drawn
	script_steps.append(func():
		for i in Stations.count():
			game.save.stars[i] = 1
		game._start_race("free", 0)
		game.config = game.config.duplicate()
		game.config["theme"] = 5
		game.sim.grip_name = "WET"
		game.countdown = 0.0
		game.sim.state = RaceSim.State.RACING)
	script_steps.append(func(): pass)
	script_steps.append(func():
		game.sim.player_pos = 1500.0
		game.sim.player_speed = 30.0
		game.sim.passed_warn = true
		game.sim.rival_braking = true)
	script_steps.append(func(): pass)
	script_steps.append(func():
		game.sim._finish("RIVAL WINS")
		game._on_finish()
		check(game.save.streak == 0, "a free race loss resets the streak"))
	script_steps.append(func(): pass)
	script_steps.append(func(): game._activate("menu"))
	script_steps.append(func(): pass)


func _key(code: Key, pressed: bool) -> InputEventKey:
	var e := InputEventKey.new()
	e.physical_keycode = code
	e.keycode = code
	e.pressed = pressed
	return e


func _touch(pos: Vector2, pressed: bool) -> InputEventScreenTouch:
	var e := InputEventScreenTouch.new()
	e.index = 0
	e.position = pos
	e.pressed = pressed
	return e


func _drag(pos: Vector2) -> InputEventScreenDrag:
	var e := InputEventScreenDrag.new()
	e.index = 0
	e.position = pos
	return e


func _process(_delta: float) -> bool:
	if game == null:
		return _done()
	if frame < script_steps.size():
		script_steps[frame].call()
		frame += 1
		return false
	return _done()


func _done() -> bool:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveGame.PATH))
	if failures == 0:
		print("ALL CHECKS PASSED")
	else:
		printerr("%d CHECK(S) FAILED" % failures)
	quit(1 if failures > 0 else 0)
	return true
