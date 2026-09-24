extends SceneTree
## Headless checks for Last Stop. Run from the repository root:
##
##     godot --headless --path godot -s res://tests/test_sim.gd
##
## Part 1 pins the GDScript physics to the reference numbers. The reference
## comes from tools/campaign-check.mjs, which matches ../index.html step for
## step (same result, same step count, same position to the last digit).
## Part 2 loads the main scene and drives every screen, so a script error in
## any draw path shows up here. The CI job also fails on any "SCRIPT ERROR" in
## the log. Exit code 0 only if everything passes.

# label, rail, platform start, width, rival, boost, brake at, result, steps, pos
const CASES := [
	["html dry win", "DRY", 1300.0, 240.0, 30.0, 3.0, 900.0, "WIN", 2881, 1400.056949742541],
	["html wet win", "WET", 1520.0, 240.0, 33.0, 3.0, 870.0, "WIN", 3365, 1572.8360035993235],
	["html damp win", "DAMP", 1400.0, 240.0, 28.5, 3.0, 1000.0, "WIN", 3273, 1630.8688440410872],
	["html undershot", "DRY", 1450.0, 240.0, 31.0, 3.0, 700.0, "UNDERSHOT", 2586, 1142.0040041343207],
	["html rival wins", "WET", 1300.0, 240.0, 29.0, 3.0, 1200.0, "RIVAL WINS", 3635, 1990.136908918181],
	["full power overshoots", "DRY", 1300.0, 240.0, 30.0, 3.0, 1.0e9, "OVERSHOT", 2825, 2000.0],
	["station 1", "DRY", 1300.0, 300.0, 26.0, 2.0, 940.0, "WIN", 2936, 1450.0707371057938],
	["station 2", "DRY", 1400.0, 260.0, 28.0, 3.0, 1000.0, "WIN", 3016, 1524.0482783346788],
	["station 3", "DAMP", 1350.0, 250.0, 29.0, 3.0, 880.0, "WIN", 3104, 1476.884656255159],
	["station 4", "DRY", 1500.0, 220.0, 31.0, 3.0, 1070.0, "WIN", 3107, 1609.5254945458544],
	["station 5", "WET", 1320.0, 240.0, 29.0, 3.0, 775.0, "WIN", 3216, 1440.9135533309027],
	["station 6", "DAMP", 1480.0, 210.0, 32.0, 3.0, 965.0, "WIN", 3224, 1586.225255685162],
	["station 7", "WET", 1450.0, 210.0, 32.0, 3.0, 858.0, "WIN", 3346, 1555.7733900772735],
	["station 8", "WET", 1520.0, 200.0, 33.0, 3.0, 906.0, "WIN", 3419, 1621.5244137905052],
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
	_start_scene_test()


func check(ok: bool, label: String) -> void:
	if ok:
		print("PASS ", label)
	else:
		failures += 1
		printerr("FAIL ", label)


func run_case(config: Dictionary, brake_at: float) -> RaceSim:
	var sim := RaceSim.new()
	sim.start(config)
	var n := 0
	while sim.state == RaceSim.State.RACING and n < 60 * 600:
		var b := sim.player_pos >= brake_at
		sim.throttle = not b
		sim.brake = b
		sim.step()
		n += 1
	return sim


func _test_physics() -> void:
	for c in CASES:
		var config := {"rail": c[1], "platform_start": c[2], "platform_width": c[3],
			"rival": c[4], "boost": c[5]}
		var sim := run_case(config, c[6])
		var ok: bool = sim.result == c[7] and sim.steps == c[8] and absf(sim.player_pos - c[9]) < 1e-6
		check(ok, "physics %s: %s in %d steps at %.6f m (want %s, %d, %.6f)" % [
			c[0], sim.result, sim.steps, sim.player_pos, c[7], c[8], c[9]])


func _test_stations_match() -> void:
	check(Stations.count() == 8, "the campaign has 8 stations")
	for i in Stations.count():
		var s: Dictionary = Stations.config_for(i)
		var c: Array = CASES[6 + i]
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
	sim.brake = true
	for i in 60:
		sim.step()
	check(sim.state == RaceSim.State.RACING, "a stop before 50 m does not end the race")


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
	check(s.save(), "the save file writes")
	var r := SaveGame.new()
	r.load_file()
	check(r.stars[0] == 3 and r.stars[1] == 1 and r.best_ms[0] == 48000, "campaign progress reloads")
	check(r.points == 120 and r.livery == 1 and not r.music_on, "career and settings reload")
	check(r.station_unlocked(2) and not r.station_unlocked(3), "stations unlock in order")
	# a corrupt best time loads as no record
	var cfg := ConfigFile.new()
	cfg.load(SaveGame.PATH)
	cfg.set_value("campaign", "best_0", 12)
	cfg.set_value("campaign", "stars_0", "three")
	cfg.save(SaveGame.PATH)
	var bad := SaveGame.new()
	bad.load_file()
	check(bad.best_ms[0] == 0 and bad.stars[0] == 0, "a corrupt save value loads as empty")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveGame.PATH))


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
	script_steps.append(func(): game._start_race("campaign", 0))
	script_steps.append(func(): game.countdown = 0.001)
	script_steps.append(func(): Input.action_press("throttle"))
	for i in 10:
		script_steps.append(func(): pass)
	script_steps.append(func():
		check(game.sim.state == RaceSim.State.RACING, "a campaign race starts after the countdown")
		check(game.sim.player_pos > 0.0, "holding throttle moves the train in the scene"))
	script_steps.append(func(): game._set_paused(true))
	script_steps.append(func(): pass)
	script_steps.append(func():
		Input.action_release("throttle")
		game._set_paused(false))
	# Finish the race quickly through the sim, then show the result overlay.
	script_steps.append(func():
		while game.sim.state == RaceSim.State.RACING:
			var b: bool = game.sim.player_pos >= 940.0
			game.sim.throttle = not b
			game.sim.brake = b
			game.sim.step()
		game._on_finish()
		check(game.sim.result == "WIN", "the scene race at station 1 wins with a brake at 940 m")
		check(game.save.stars[0] >= 1, "a win earns a star"))
	for i in 3:
		script_steps.append(func(): pass)
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
