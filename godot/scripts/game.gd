extends Node2D
## Last Stop: the whole game on one node. The screen is 480x270 and every
## pixel is drawn in _draw() with rectangles, so the art and the text stay on
## the pixel grid when the window scales up.
##
## Screens: TITLE -> MAP (campaign) or FREE race -> RACE -> result overlay.
## GARAGE holds the liveries and the career stats. HELP explains the rules.
##
## Input has one path for touch and mouse (project settings turn mouse clicks
## into touches). Each race button tracks which touch indices hold it, so one
## finger's release never drops another finger's hold.
##
## Phones: a pause button, a prompt to turn a phone held upright, a full-screen
## item on the web title screen, touch-only labels and short vibrations.

enum Screen { TITLE, MAP, GARAGE, HELP, RACE }

const VW := 480
const VH := 270
const VIEW_M := 260.0
const PX_PER_M := VW / VIEW_M
const NOSE_X := 0.35
const RIVAL_RAIL_Y := 132
const PLAYER_RAIL_Y := 206
const COUNTDOWN_S := 3.0
const JOINT_M := 20.0

const INK := Color("e4ede7")
const MUTED := Color("8ca096")
const PANEL := Color(0.05, 0.08, 0.07, 0.86)
const EDGE := Color("2a3a33")
const GO := Color("2fb870")
const STOP := Color("e2564b")
const WARN := Color("e8a93b")
const LAMP := Color("fff3cc")
const SHADOW := Color(0, 0, 0, 0.6)
const RIVAL_BODY := Color("a7453a")
const RIVAL_TRIM := Color("efe2bd")
const RIVAL_DARK := Color("6a2620")

# sky top, sky bottom, far hills, near hills, ground, ballast, sun, night
const THEMES := [
	["2b2d5c", "f2a65a", "5a4a7a", "3e3a5e", "4a6b3a", "6b6560", "ffd27a", false],
	["5fb0e8", "cfeeff", "7fa6c9", "5b8a6a", "5f9e46", "8a8580", "fff4c2", false],
	["3f8fe0", "a8dcff", "89b0d6", "4f8f5a", "6aa84f", "8f8a84", "fffbe0", false],
	["4a90c8", "f4d49a", "a08aa8", "6b8a4a", "7a9e48", "8a8176", "ffe08a", false],
	["1f1d3d", "e0605a", "4a3558", "2e2440", "3a4a32", "55504c", "ff9a5a", true],
	["05070f", "1b2340", "1a2236", "121826", "1e2a22", "3a3a3e", "e8ecf5", true],
]

var sim := RaceSim.new()
var save := SaveGame.new()
var synth: Synth
var rng := RandomNumberGenerator.new()

var screen: Screen = Screen.TITLE
var sel := 0
var map_sel := 0
var mode := "campaign"
var station := 0
var config: Dictionary = {}
var countdown := 0.0
var paused := false
var acc_ms := 0.0
var t := 0.0
var last_joint := 0
var particles: Array = []
var touches := {}          # touch index -> "throttle", "lever", "menu" or "fullscreen"
var outcome := {}          # the result of the last race, for the overlay
var saved_ok := true
var _finish_time := 0.0
var touch_ui := false      # the last input was a finger: hide key hints, vibrate
var portrait := false      # a touch screen held upright: the game waits
var portrait_test := false # lets the headless test show the portrait prompt
var _mouse_frame := -1
var _pred_best := 0.0      # where the best stop ends, worked out once per frame
var _pred_now := 0.0       # where the stop on the current notch ends
var _exit_tried_t := -100.0 # when EXIT last asked the browser to close the page
var installed_app := false # started from the home screen: already full screen


func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	rng.randomize()
	_setup_input()
	save.load_file()
	synth = Synth.new()
	add_child(synth)
	synth.music_on = save.music_on
	synth.sfx_on = save.sfx_on
	map_sel = _first_open_station()
	touch_ui = DisplayServer.is_touchscreen_available()
	installed_app = _started_as_app()


func _setup_input() -> void:
	_bind("throttle", [KEY_UP, KEY_W], JOY_AXIS_TRIGGER_RIGHT)
	_bind("brake", [KEY_DOWN, KEY_S], JOY_AXIS_TRIGGER_LEFT)
	_bind("brake_less", [KEY_Q, KEY_SHIFT], -1, JOY_BUTTON_LEFT_SHOULDER)
	for n in RaceSim.MAX_NOTCH + 1:
		_bind("brake_%d" % n, [KEY_0 + n], -1)
	_bind("restart", [KEY_R], -1)
	_bind("pause", [KEY_ESCAPE, KEY_P], -1)


func _bind(action: String, keys: Array, axis: int, button: int = -1) -> void:
	if InputMap.has_action(action):
		return
	InputMap.add_action(action, 0.3)
	for k in keys:
		var ev := InputEventKey.new()
		ev.physical_keycode = k
		InputMap.action_add_event(action, ev)
	if axis >= 0:
		var jm := InputEventJoypadMotion.new()
		jm.axis = axis
		jm.axis_value = 1.0
		InputMap.action_add_event(action, jm)
	if button >= 0:
		var jb := InputEventJoypadButton.new()
		jb.button_index = button
		InputMap.action_add_event(action, jb)


func _notification(what: int) -> void:
	# A backgrounded tab or a lost window focus pauses a running race.
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		if screen == Screen.RACE and sim.state == RaceSim.State.RACING and not paused:
			_set_paused(true)


# ------------------------------------------------------------------ the loop

func _process(delta: float) -> void:
	t += delta
	var ws := DisplayServer.window_get_size()
	portrait = portrait_test or (DisplayServer.is_touchscreen_available() and ws.y > ws.x)
	if portrait and screen == Screen.RACE and not paused and sim.state != RaceSim.State.RESULT:
		_set_paused(true)
	if screen == Screen.RACE and not paused:
		_race_process(delta)
	_update_particles(delta)
	var running := screen == Screen.RACE and not paused and sim.state == RaceSim.State.RACING
	synth.set_train(sim.player_speed, sim.throttle, float(sim.brake_notch) / RaceSim.MAX_NOTCH,
		sim.sliding, running)
	synth.set_music_level(0.35 if screen == Screen.RACE else 1.0)
	queue_redraw()


func _race_process(delta: float) -> void:
	if countdown > 0.0:
		var before := ceili(countdown)
		countdown -= delta
		var after := ceili(countdown)
		if countdown <= 0.0:
			countdown = 0.0
			sim.state = RaceSim.State.RACING
			acc_ms = 0.0
			synth.play("go")
			synth.play("horn")
			_buzz(60)
		elif after < before:
			synth.play("beep")
		return
	if sim.state != RaceSim.State.RACING:
		return
	sim.throttle = sim.brake_notch == 0 and _held("throttle")
	# The clamp is the only guard against a long frame. Without it a stall
	# would teleport the train past the platform.
	acc_ms += minf(delta * 1000.0, RaceSim.MAX_FRAME_DELTA_MS)
	while acc_ms >= RaceSim.STEP_MS:
		acc_ms -= RaceSim.STEP_MS
		sim.step()
		_after_step()
		if sim.state != RaceSim.State.RACING:
			_on_finish()
			break


func _held(action: String) -> bool:
	if Input.is_action_pressed(action):
		return true
	for k in touches:
		if touches[k] == action:
			return true
	return false


func _after_step() -> void:
	var joint := floori(sim.player_pos / JOINT_M)
	if joint != last_joint:
		last_joint = joint
		synth.play("clack", rng.randf_range(0.9, 1.1), -6.0)
	var nose_px := _x(sim.player_pos)
	var spark_odds := 0.95 if sim.sliding else 0.2 * sim.brake_notch
	if sim.brake_notch > 0 and sim.player_speed > 3.0 and rng.randf() < spark_odds:
		for w in [-5, -12, -19]:
			particles.append({"x": sim.player_pos + (w / PX_PER_M), "y": float(PLAYER_RAIL_Y - 1),
				"vx": rng.randf_range(-12.0, 4.0), "vy": rng.randf_range(-40.0, -10.0),
				"life": rng.randf_range(0.15, 0.35), "c": WARN if rng.randf() < 0.5 else LAMP, "g": 160.0})
	if sim.throttle and rng.randf() < 0.18 and nose_px > -20 and nose_px < VW + 20:
		particles.append({"x": sim.player_pos - 8.0 / PX_PER_M, "y": float(PLAYER_RAIL_Y - 16),
			"vx": -sim.player_speed * 0.3, "vy": rng.randf_range(-14.0, -8.0),
			"life": rng.randf_range(0.5, 0.9), "c": Color(0.75, 0.75, 0.78, 0.7), "g": 0.0})


func _update_particles(delta: float) -> void:
	var keep: Array = []
	for p in particles:
		p["life"] -= delta
		if p["life"] <= 0.0:
			continue
		p["x"] += p["vx"] * delta
		p["vy"] += p["g"] * delta
		p["y"] += p["vy"] * delta
		keep.append(p)
	particles = keep


# ------------------------------------------------------------- race control

func _start_race(new_mode: String, index: int) -> void:
	mode = new_mode
	station = index
	if mode == "campaign":
		config = Stations.config_for(index)
	else:
		config = Stations.free_config(rng, save.streak)
	sim.start(config)
	sim.state = RaceSim.State.IDLE
	countdown = COUNTDOWN_S
	paused = false
	acc_ms = 0.0
	last_joint = 0
	particles.clear()
	outcome = {}
	screen = Screen.RACE
	sel = 0
	synth.play("beep")


func _set_paused(p: bool) -> void:
	paused = p
	sel = 0
	if p:
		synth.stop_train()


func _on_finish() -> void:
	var win := sim.result == "WIN"
	var o := {"win": win, "stars": 0, "new_best": false, "points": 0,
		"precise": false, "in_par": false, "line_done": false}
	var off_centre := absf(sim.player_pos - sim.platform_centre())
	if win:
		o["precise"] = off_centre <= float(config["window"])
	if mode == "campaign":
		if win:
			o["in_par"] = sim.elapsed_ms <= int(config["par_ms"])
			o["stars"] = 1 + (1 if o["in_par"] else 0) + (1 if o["precise"] else 0)
			var was_done := save.campaign_done()
			save.stars[station] = maxi(save.stars[station], o["stars"])
			if save.best_ms[station] == 0 or sim.elapsed_ms < save.best_ms[station]:
				save.best_ms[station] = sim.elapsed_ms
				o["new_best"] = true
			o["line_done"] = save.campaign_done() and not was_done
	else:
		save.free_races += 1
		if win:
			o["points"] = 10 + (10 if o["precise"] else 0) + 2 * save.streak
			save.points += o["points"]
			save.free_wins += 1
			save.streak += 1
			save.best_streak = maxi(save.best_streak, save.streak)
			if save.free_best_ms == 0 or sim.elapsed_ms < save.free_best_ms:
				save.free_best_ms = sim.elapsed_ms
				o["new_best"] = true
		else:
			save.streak = 0
	saved_ok = save.save()
	outcome = o
	_finish_time = t
	sel = 0
	synth.stop_train()
	synth.play("win" if win else "lose")
	_buzz(120 if win else 300)
	for i in int(o["stars"]):
		get_tree().create_timer(0.6 + 0.35 * i).timeout.connect(synth.play.bind("star", 1.0 + 0.12 * i))


func _first_open_station() -> int:
	for i in Stations.count():
		if save.stars[i] == 0:
			return i if save.station_unlocked(i) else maxi(0, i - 1)
	return 0


# ------------------------------------------------------------------- menus
# Each screen lists its items with a rect. _draw() and the input handlers read
# the same list, so what is drawn is what is clickable.

func _items() -> Array:
	var items: Array = []
	match screen:
		Screen.TITLE:
			var ids := ["campaign", "free", "garage", "help", "music", "sound"]
			var labels := ["CAMPAIGN", "FREE RACE", "GARAGE", "HOW TO PLAY",
				"MUSIC: " + ("ON" if save.music_on else "OFF"),
				"SOUND: " + ("ON" if save.sfx_on else "OFF")]
			if not save.campaign_done():
				labels[1] = "FREE RACE (FINISH THE LINE)"
			if _fullscreen_supported():
				ids.append("fullscreen")
				labels.append("FULL SCREEN: " + ("ON" if _is_fullscreen() else "OFF"))
			ids.append("quit")
			labels.append("EXIT")
			# Eight items (a browser tab: FULL SCREEN and EXIT) sit closer.
			var step := 19 if ids.size() <= 7 else 17
			for i in ids.size():
				items.append({"id": ids[i], "label": labels[i],
					"rect": Rect2(VW / 2.0 - 110, 120 + i * step, 220, step - 2),
					"enabled": ids[i] != "free" or save.campaign_done()})
		Screen.MAP:
			# Each station owns its whole slice of the line, so a finger that
			# lands near a small dot still selects it.
			var slice := _map_x(1) - _map_x(0)
			for i in Stations.count():
				items.append({"id": "st%d" % i, "label": "", "enabled": true, "hidden": true,
					"rect": Rect2(_map_x(i) - slice / 2.0, 36, slice, 50)})
			items.append({"id": "prev", "label": "<", "rect": Rect2(4, 134, 32, 44),
				"enabled": map_sel > 0, "button": true})
			items.append({"id": "next", "label": ">", "rect": Rect2(VW - 36, 134, 32, 44),
				"enabled": map_sel < Stations.count() - 1, "button": true})
			items.append({"id": "back", "label": "BACK", "rect": Rect2(12, 238, 120, 24), "enabled": true, "button": true})
			items.append({"id": "race", "label": "RACE", "rect": Rect2(VW - 132, 238, 120, 24),
				"enabled": save.station_unlocked(map_sel), "button": true})
		Screen.GARAGE:
			for i in Stations.LIVERIES.size():
				items.append({"id": "liv%d" % i, "label": Stations.LIVERIES[i]["name"],
					"rect": Rect2(16, 44 + i * 26, 200, 24), "enabled": save.livery_unlocked(i)})
			items.append({"id": "back", "label": "BACK", "rect": Rect2(12, 238, 120, 24), "enabled": true, "button": true})
		Screen.HELP:
			items.append({"id": "back", "label": "BACK", "rect": Rect2(12, 238, 120, 24), "enabled": true, "button": true})
		Screen.RACE:
			if paused:
				var ids := ["resume", "restart", "menu"]
				var labels := ["RESUME", "RESTART", "QUIT TO MENU"]
				for i in ids.size():
					items.append({"id": ids[i], "label": labels[i],
						"rect": Rect2(VW / 2.0 - 80, 118 + i * 26, 160, 22), "enabled": true, "button": true})
			elif sim.state == RaceSim.State.RESULT and not outcome.is_empty():
				var ids: Array = []
				var labels: Array = []
				if mode == "campaign":
					var has_next := station + 1 < Stations.count() and save.station_unlocked(station + 1)
					if outcome["win"] and has_next:
						ids = ["next", "retry", "menu"]
						labels = ["NEXT STATION", "RETRY", "ROUTE MAP"]
					else:
						ids = ["retry", "menu"]
						labels = ["RETRY", "ROUTE MAP"]
				else:
					ids = ["again", "menu"]
					labels = ["NEW RACE", "MENU"]
				var w := 128.0
				var gap := 10.0
				var x0 := VW / 2.0 - (ids.size() * w + (ids.size() - 1) * gap) / 2.0
				for i in ids.size():
					items.append({"id": ids[i], "label": labels[i],
						"rect": Rect2(x0 + i * (w + gap), 196, w, 22), "enabled": true, "button": true})
	return items


func _activate(id: String) -> void:
	synth.play("blip")
	match id:
		"campaign":
			map_sel = _first_open_station()
			_go(Screen.MAP)
		"free":
			if save.campaign_done():
				_start_race("free", 0)
		"garage":
			_go(Screen.GARAGE)
		"help":
			_go(Screen.HELP)
		"music":
			save.music_on = not save.music_on
			synth.music_on = save.music_on
			save.save()
		"sound":
			save.sfx_on = not save.sfx_on
			synth.sfx_on = save.sfx_on
			save.save()
		"fullscreen":
			_toggle_fullscreen()
		"quit":
			_exit_game()
		"back":
			_go(Screen.TITLE)
		"prev":
			map_sel = maxi(0, map_sel - 1)
		"next":
			map_sel = mini(Stations.count() - 1, map_sel + 1)
		"race":
			if save.station_unlocked(map_sel):
				_start_race("campaign", map_sel)
		"resume":
			_set_paused(false)
		"restart", "retry":
			_start_race(mode, station)
		"again":
			_start_race("free", 0)
		"next":
			map_sel = station + 1
			_start_race("campaign", station + 1)
		"menu":
			paused = false
			synth.stop_train()
			if mode == "campaign":
				map_sel = station
				_go(Screen.MAP)
			else:
				_go(Screen.TITLE)
		_:
			if id.begins_with("st"):
				map_sel = int(id.substr(2))
			elif id.begins_with("liv"):
				save.livery = int(id.substr(3))
				save.save()


func _go(s: Screen) -> void:
	screen = s
	sel = 0
	touches.clear()


# On the web a page may close itself only when it is the whole history of its
# window, as a home-screen app is. A browser tab says no, so a note tells the
# player to leave with the phone's Back or Home button.
func _exit_game() -> void:
	if not OS.has_feature("web"):
		get_tree().quit()
		return
	_exit_tried_t = t
	JavaScriptBridge.eval("window.close()", true)


func _fullscreen_supported() -> bool:
	return OS.has_feature("web") and not OS.has_feature("web_ios") and not installed_app


# The web export is also a home-screen app (export_presets.cfg: full screen,
# landscape). Some browsers keep a note on the screen in page full screen; the
# app has no browser bar and no note.
func _started_as_app() -> bool:
	if not OS.has_feature("web"):
		return false
	var q := "window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches"
	return JavaScriptBridge.eval(q, true) == true


func _is_fullscreen() -> bool:
	var m := DisplayServer.window_get_mode()
	return m == DisplayServer.WINDOW_MODE_FULLSCREEN or m == DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN


# Browsers allow full screen only just after a click, a key press or a finger
# lift (not a finger press), so touch activates this item on release.
func _toggle_fullscreen() -> void:
	if _is_fullscreen():
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	else:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)


# A short vibration on phones that support it (Android browsers; iOS ignores it).
func _buzz(ms: int) -> void:
	if touch_ui:
		Input.vibrate_handheld(ms)


# Tracks whether the player uses fingers or a keyboard and mouse. A mouse click
# also makes an emulated touch; the mouse event and the frame check keep that
# touch from counting as a finger.
func _input(event: InputEvent) -> void:
	if event is InputEventKey or event is InputEventJoypadButton:
		touch_ui = false
	elif event is InputEventMouseButton or event is InputEventMouseMotion:
		touch_ui = false
		_mouse_frame = Engine.get_process_frames()
	elif event is InputEventScreenTouch and event.pressed and Engine.get_process_frames() != _mouse_frame:
		touch_ui = true


func _unhandled_input(event: InputEvent) -> void:
	if portrait:
		touches.clear()
		return
	if event is InputEventScreenTouch:
		_on_touch(event)
		return
	if event is InputEventScreenDrag:
		_on_drag(event)
		return
	if screen == Screen.RACE and not paused and sim.state != RaceSim.State.RESULT:
		if event.is_action_pressed("pause"):
			_set_paused(true)
		elif event.is_action_pressed("restart"):
			_start_race(mode, station)
		elif event.is_action_pressed("brake"):
			_set_notch(sim.brake_notch + 1)
		elif event.is_action_pressed("brake_less"):
			_set_notch(sim.brake_notch - 1)
		else:
			for n in RaceSim.MAX_NOTCH + 1:
				if event.is_action_pressed("brake_%d" % n):
					_set_notch(n)
		return
	if screen == Screen.RACE and paused and event.is_action_pressed("pause"):
		_set_paused(false)
		return
	if screen == Screen.MAP:
		if event.is_action_pressed("ui_left"):
			map_sel = maxi(0, map_sel - 1)
			synth.play("blip")
		elif event.is_action_pressed("ui_right"):
			map_sel = mini(Stations.count() - 1, map_sel + 1)
			synth.play("blip")
		elif event.is_action_pressed("ui_accept"):
			_activate("race")
		elif event.is_action_pressed("ui_cancel"):
			_activate("back")
		return
	if screen == Screen.RACE and sim.state == RaceSim.State.RESULT and event.is_action_pressed("restart"):
		_activate("retry" if mode == "campaign" else "again")
		return
	var items := _selectable()
	if items.is_empty():
		return
	sel = clampi(sel, 0, items.size() - 1)
	if event.is_action_pressed("ui_down") or event.is_action_pressed("ui_right"):
		sel = (sel + 1) % items.size()
		synth.play("blip", 0.8)
	elif event.is_action_pressed("ui_up") or event.is_action_pressed("ui_left"):
		sel = (sel - 1 + items.size()) % items.size()
		synth.play("blip", 0.8)
	elif event.is_action_pressed("ui_accept"):
		_activate(items[sel]["id"])
	elif event.is_action_pressed("ui_cancel"):
		if screen in [Screen.GARAGE, Screen.HELP]:
			_activate("back")
		elif screen == Screen.RACE and paused:
			_set_paused(false)


func _selectable() -> Array:
	var out: Array = []
	for it in _items():
		if it["enabled"] and not it.get("hidden", false):
			out.append(it)
	return out


func _on_touch(e: InputEventScreenTouch) -> void:
	if not e.pressed:
		if touches.get(e.index, "") == "fullscreen" and _item_at(e.position) == "fullscreen":
			_toggle_fullscreen()
		touches.erase(e.index)
		return
	if _racing_controls_live():
		if _pause_rect().has_point(e.position):
			touches[e.index] = "menu"
			_set_paused(true)
			synth.play("blip")
			return
		var b := _race_button_at(e.position)
		if b == "brake":
			touches[e.index] = "lever"
			_set_notch(_lever_notch_at(e.position.x))
			return
		if b == "throttle":
			touches[e.index] = "throttle"
			return
	touches[e.index] = "menu"
	var id := _item_at(e.position)
	if id == "":
		return
	var selectable := _selectable()
	for j in selectable.size():
		if selectable[j]["id"] == id:
			sel = j
	if id == "fullscreen":
		touches[e.index] = "fullscreen"
		synth.play("blip")
		return
	_activate(id)


func _item_at(p: Vector2) -> String:
	for it in _items():
		if it["enabled"] and (it["rect"] as Rect2).has_point(p):
			return it["id"]
	return ""


func _on_drag(e: InputEventScreenDrag) -> void:
	# A finger that slides off the throttle cuts the power. A finger that
	# holds the lever drags its handle, even when it slides off the lever.
	var held: String = touches.get(e.index, "")
	if held == "throttle" and _race_button_at(e.position) != "throttle":
		touches.erase(e.index)
	elif held == "lever":
		_set_notch(_lever_notch_at(e.position.x))


## Puts the brake handle on a notch. Only while the train runs.
func _set_notch(target: int) -> void:
	if sim.state != RaceSim.State.RACING:
		return
	var n := clampi(target, 0, RaceSim.MAX_NOTCH)
	if n == sim.brake_notch:
		return
	sim.brake_notch = n
	synth.play("clack", 1.5 + 0.15 * n, -4.0)


func _racing_controls_live() -> bool:
	return screen == Screen.RACE and not paused and sim.state != RaceSim.State.RESULT


func _race_button_at(p: Vector2) -> String:
	if _brake_rect().has_point(p):
		return "brake"
	if _throttle_rect().has_point(p):
		return "throttle"
	return ""


func _pause_rect() -> Rect2:
	return Rect2(VW - 30, 35, 26, 22)


func _brake_rect() -> Rect2:
	return Rect2(6, 218, 204, 48)


func _throttle_rect() -> Rect2:
	return Rect2(VW - 150, 218, 144, 48)


## One position of the brake lever: 0 is OFF, then notches 1 to 3.
func _lever_cell(r: Rect2, n: int) -> Rect2:
	var w := (r.size.x - 8.0) / (RaceSim.MAX_NOTCH + 1)
	return Rect2(r.position.x + 4.0 + n * w, r.position.y + 13, w, 22)


func _lever_notch_at(x: float) -> int:
	var r := _brake_rect()
	var w := (r.size.x - 8.0) / (RaceSim.MAX_NOTCH + 1)
	return clampi(floori((x - r.position.x - 4.0) / w), 0, RaceSim.MAX_NOTCH)


# ------------------------------------------------------------------ drawing

func _draw() -> void:
	match screen:
		Screen.TITLE:
			_draw_title()
		Screen.MAP:
			_draw_map()
		Screen.GARAGE:
			_draw_garage()
		Screen.HELP:
			_draw_help()
		Screen.RACE:
			_draw_race()
	if portrait:
		_draw_rotate_prompt()


func _draw_rotate_prompt() -> void:
	draw_rect(Rect2(0, 0, VW, VH), Color("0c1210"))
	# an upright phone, an arrow, and the same phone on its side
	_box(Rect2(150, 70, 36, 64), PANEL, MUTED)
	draw_rect(Rect2(164, 126, 8, 2), MUTED)
	for i in 5:
		draw_rect(Rect2(212 + i * 8, 101, 5, 2), WARN)
	draw_rect(Rect2(254, 97, 2, 10), WARN)
	draw_rect(Rect2(256, 99, 2, 6), WARN)
	draw_rect(Rect2(258, 101, 2, 2), WARN)
	_box(Rect2(276, 84, 64, 36), PANEL, GO)
	draw_rect(Rect2(280, 98, 2, 8), GO)
	_txtc("TURN YOUR PHONE SIDEWAYS", VW / 2.0, 160, LAMP, 2)
	_txtc("LAST STOP PLAYS IN LANDSCAPE", VW / 2.0, 184, MUTED)


func _txt(text: String, x: float, y: float, c: Color, s: int = 1) -> void:
	PixelFont.draw(self, text, Vector2(x, y), c, s)


func _txtc(text: String, cx: float, y: float, c: Color, s: int = 1) -> void:
	PixelFont.draw_centered(self, text, cx, y, c, s)


func _txts(text: String, x: float, y: float, c: Color, s: int = 1) -> void:
	PixelFont.draw_shadowed(self, text, Vector2(x, y), c, SHADOW, s)


func _box(r: Rect2, fill: Color, border: Color) -> void:
	draw_rect(r, fill)
	draw_rect(Rect2(r.position.x, r.position.y, r.size.x, 1), border)
	draw_rect(Rect2(r.position.x, r.end.y - 1, r.size.x, 1), border)
	draw_rect(Rect2(r.position.x, r.position.y, 1, r.size.y), border)
	draw_rect(Rect2(r.end.x - 1, r.position.y, 1, r.size.y), border)


func _draw_items(items: Array) -> void:
	var selectable := _selectable()
	var sel_id: String = selectable[clampi(sel, 0, selectable.size() - 1)]["id"] if not selectable.is_empty() else ""
	for it in items:
		if it.get("hidden", false):
			continue
		var r: Rect2 = it["rect"]
		var on: bool = it["id"] == sel_id
		var c := INK if it["enabled"] else MUTED
		if it.get("button", false):
			_box(r, Color(GO, 0.35) if on else PANEL, GO if on else EDGE)
			_txtc(it["label"], r.get_center().x, r.position.y + (r.size.y - 7) / 2.0, c)
		else:
			if on:
				draw_rect(r, Color(GO, 0.3))
				_txt(">", r.position.x + 4, r.position.y + (r.size.y - 7) / 2.0, GO)
			_txtc(it["label"], r.get_center().x, r.position.y + (r.size.y - 7) / 2.0, c)


# --------------------------------------------------------------- the title

func _draw_title() -> void:
	var cam := t * 22.0
	_draw_backdrop(4, cam, false)
	_draw_ground(104, 4, cam)
	var lv: Dictionary = Stations.LIVERIES[save.livery]
	var train_m := fmod(t * 22.0, 520.0) - 80.0
	_draw_train(roundi((train_m - cam) * PX_PER_M + VW * 0.5), 104,
		lv["body"], lv["trim"], lv["dark"], true, train_m)
	_txtc("LAST STOP", VW / 2.0 + 2, 22, SHADOW, 6)
	_txtc("LAST STOP", VW / 2.0, 20, LAMP, 6)
	_txtc("A RACE TO STAND STILL", VW / 2.0, 70, WARN)
	var items := _items()
	var last: Rect2 = items[items.size() - 1]["rect"]
	draw_rect(Rect2(VW / 2.0 - 116, 114, 232, last.end.y - 114 + 4), PANEL)
	_draw_items(items)
	if t - _exit_tried_t < 5.0:
		var note := "THE BROWSER KEEPS THIS TAB OPEN. USE BACK OR HOME."
		draw_rect(Rect2(VW / 2.0 - 160, 84, 320, 14), Color(STOP, 0.9))
		_txtc(note, VW / 2.0, 88, Color("111111"))
	var foot := "STARS %d/%d" % [save.total_stars(), Stations.count() * 3]
	if save.points > 0:
		foot += "   POINTS %d" % save.points
	_txtc(foot, VW / 2.0, VH - 10, MUTED)


# ------------------------------------------------------------ the route map

func _map_x(i: int) -> float:
	return 40.0 + i * (400.0 / (Stations.count() - 1))


func _draw_map() -> void:
	_draw_backdrop(1, 0.0, false)
	draw_rect(Rect2(0, 0, VW, VH), Color(0, 0, 0, 0.45))
	_txtc(Stations.LINE_NAME, VW / 2.0, 8, LAMP, 2)
	_txtc("%d/%d STARS" % [save.total_stars(), Stations.count() * 3], VW / 2.0, 28, MUTED)
	draw_rect(Rect2(_map_x(0), 57, _map_x(Stations.count() - 1) - _map_x(0), 3), MUTED)
	for i in Stations.count():
		var x := roundi(_map_x(i))
		var open := save.station_unlocked(i)
		var done := save.stars[i] > 0
		if i == map_sel:
			var blink := 1.0 if fmod(t, 0.8) < 0.5 else 0.5
			_box(Rect2(x - 7, 51, 15, 15), Color(0, 0, 0, 0), Color(LAMP, blink))
		draw_rect(Rect2(x - 4, 54, 9, 9), GO if done else (INK if open else EDGE))
		if not open:
			draw_rect(Rect2(x - 2, 56, 5, 5), Color("0d1412"))
		for s in 3:
			_txt("*", x - 8 + s * 6, 68, WARN if s < save.stars[i] else EDGE)
	var st: Dictionary = Stations.config_for(map_sel)
	var p := Rect2(40, 88, 400, 142)
	_box(p, PANEL, EDGE)
	_txt("%d  %s" % [map_sel + 1, st["name"]], 52, 98, LAMP, 2)
	var open_sel := save.station_unlocked(map_sel)
	if not open_sel:
		_txt("LOCKED - WIN THE STATION BEFORE IT", 52, 122, STOP)
		_draw_items(_items())
		return
	var rail_c := INK if st["rail"] == "DRY" else WARN
	_txt("RAIL", 52, 122, MUTED)
	_txt(st["rail"], 130, 122, rail_c)
	_txt("PLATFORM", 52, 134, MUTED)
	_txt("%d M" % roundi(st["platform_width"]), 130, 134, INK)
	_txt("RIVAL TOP", 52, 146, MUTED)
	_txt("%d KM/H" % roundi(float(st["rival"]) * 3.6), 130, 146, INK)
	_txt("PAR", 52, 158, MUTED)
	_txt(_secs(st["par_ms"]), 130, 158, INK)
	_txt("BEST", 52, 170, MUTED)
	_txt(_secs(save.best_ms[map_sel]) if save.best_ms[map_sel] > 0 else "--", 130, 170, INK)
	_txt("* WIN THE RACE", 250, 122, WARN if save.stars[map_sel] >= 1 else MUTED)
	_txt("* WIN INSIDE PAR", 250, 134, WARN if save.stars[map_sel] >= 2 else MUTED)
	_txt("* STOP WITHIN %d M" % roundi(st["window"]), 250, 146, WARN if save.stars[map_sel] >= 3 else MUTED)
	_txt("  OF THE STOP BOARD", 250, 158, WARN if save.stars[map_sel] >= 3 else MUTED)
	_draw_wrapped(st["tip"], 52, 190, 376, INK)
	_draw_items(_items())


func _draw_wrapped(text: String, x: float, y: float, max_w: float, c: Color) -> void:
	var line := ""
	var yy := y
	for word in text.split(" "):
		var probe: String = word if line == "" else line + " " + word
		if PixelFont.width(probe) > max_w and line != "":
			_txt(line, x, yy, c)
			yy += 10
			line = word
		else:
			line = probe
	if line != "":
		_txt(line, x, yy, c)


# --------------------------------------------------------------- the garage

func _draw_garage() -> void:
	_draw_backdrop(3, t * 6.0, false)
	draw_rect(Rect2(0, 0, VW, VH), Color(0, 0, 0, 0.5))
	_txtc("GARAGE", VW / 2.0, 8, LAMP, 2)
	var items := _items()
	for i in Stations.LIVERIES.size():
		var lv: Dictionary = Stations.LIVERIES[i]
		var r: Rect2 = items[i]["rect"]
		var open := save.livery_unlocked(i)
		_box(r, Color(GO, 0.3) if i == save.livery else PANEL, GO if _is_sel("liv%d" % i) else EDGE)
		draw_rect(Rect2(r.position.x + 6, r.position.y + 6, 12, 12), lv["body"])
		draw_rect(Rect2(r.position.x + 6, r.position.y + 13, 12, 2), lv["trim"])
		_txt(lv["name"], r.position.x + 26, r.position.y + 4, INK if open else MUTED)
		var need := ""
		if not open:
			need = "%d POINTS" % lv["points"] if int(lv["points"]) > 0 else "%d STARS" % lv["stars"]
		elif i == save.livery:
			need = "IN SERVICE"
		_txt(need, r.position.x + 26, r.position.y + 14, WARN if i == save.livery else MUTED)
	var lv: Dictionary = Stations.LIVERIES[save.livery]
	draw_set_transform(Vector2(236, 60), 0.0, Vector2(3, 3))
	_draw_train(70, 26, lv["body"], lv["trim"], lv["dark"], true, t * 3.0)
	draw_set_transform(Vector2.ZERO)
	draw_rect(Rect2(236, 138, 228, 1), EDGE)
	_txt("FREE RACE CAREER", 240, 146, LAMP)
	_txt("POINTS", 240, 160, MUTED)
	_txt(str(save.points), 360, 160, INK)
	_txt("WINS", 240, 172, MUTED)
	_txt("%d / %d" % [save.free_wins, save.free_races], 360, 172, INK)
	_txt("STREAK", 240, 184, MUTED)
	_txt(str(save.streak), 360, 184, INK)
	_txt("BEST STREAK", 240, 196, MUTED)
	_txt(str(save.best_streak), 360, 196, INK)
	_txt("BEST TIME", 240, 208, MUTED)
	_txt(_secs(save.free_best_ms) if save.free_best_ms > 0 else "--", 360, 208, INK)
	_draw_items([items[items.size() - 1]])


func _is_sel(id: String) -> bool:
	var s := _selectable()
	return not s.is_empty() and s[clampi(sel, 0, s.size() - 1)]["id"] == id


# ----------------------------------------------------------------- the help

const HELP_STEPS := [
	"HOLD SPEED UP TO GO FASTER.",
	"WHEN STOP NEEDS AND PLATFORM IN ARE ABOUT EQUAL, SET THE BRAKE.",
	"STOP WITH THE DASHED MARKER GREEN, INSIDE THE PLATFORM.",
]


func _draw_help() -> void:
	_draw_backdrop(2, t * 6.0, false)
	draw_rect(Rect2(0, 0, VW, VH), Color(0, 0, 0, 0.6))
	_txtc("HOW TO PLAY", VW / 2.0, 8, LAMP, 2)
	_txtc("GOAL: STOP INSIDE THE PLATFORM BEFORE THE RIVAL STOPS.", VW / 2.0, 30, GO)
	_txtc("BEING FIRST DOES NOT WIN. STOPPING DOES.", VW / 2.0, 41, WARN)
	for i in HELP_STEPS.size():
		var y := 58 + i * 14
		_txt(str(i + 1), 24, y, LAMP)
		_txt(HELP_STEPS[i], 36, y, INK)
	var lever := Rect2(40, 108, 204, 48)
	var button := Rect2(296, 108, 144, 48)
	_draw_brake_lever(lever, 1, false, touch_ui)
	_draw_speed_button(button, false, false, touch_ui)
	_txtc("HANDLE STAYS WHERE YOU PUT IT.", lever.get_center().x, 164, MUTED)
	_txtc("HIGHER NUMBER BRAKES HARDER.", lever.get_center().x, 175, MUTED)
	_txtc("POWER ONLY WHILE YOU HOLD IT", button.get_center().x, 164, MUTED)
	_txtc("AND THE BRAKE IS OFF.", button.get_center().x, 175, MUTED)
	_txtc("TOO MUCH BRAKE WHEN FAST OR WET: THE WHEELS SLIDE.", VW / 2.0, 194, WARN)
	_txtc("ONE STOP ONLY. YOU CANNOT CREEP FORWARD AGAIN.", VW / 2.0, 206, STOP)
	_draw_items(_items())


# ----------------------------------------------------------------- the race

func _cam() -> float:
	var cam := sim.player_pos - VIEW_M * NOSE_X
	return clampf(cam, -30.0, RaceSim.TRACK_LENGTH_M + 60.0 - VIEW_M)


func _x(m: float) -> int:
	return roundi((m - _cam()) * PX_PER_M)


func _theme_index() -> int:
	return int(config.get("theme", 1))


func _draw_race() -> void:
	if sim.state == RaceSim.State.RACING:
		_pred_best = sim.predict_stop(0)
		_pred_now = sim.predict_stop(sim.brake_notch) if sim.brake_notch > 0 else _pred_best
	var cam := _cam()
	var theme := _theme_index()
	var th: Array = THEMES[theme]
	var night: bool = th[7]
	_draw_backdrop(theme, cam, sim.grip_name != "DRY")
	_draw_ground(RIVAL_RAIL_Y, theme, cam)
	_draw_station_building(theme)
	_draw_platform(RIVAL_RAIL_Y, false)
	var rival_lights := night or sim.rival_braking
	_draw_train(_x(sim.rival_pos), RIVAL_RAIL_Y, RIVAL_BODY, RIVAL_TRIM, RIVAL_DARK, rival_lights, sim.rival_pos)
	if sim.rival_braking and sim.state == RaceSim.State.RACING:
		# brake lamps on the rival's last coach
		var tail := _x(sim.rival_pos) - 58
		draw_rect(Rect2(tail, RIVAL_RAIL_Y - 9, 1, 2), STOP)
	_draw_ground(PLAYER_RAIL_Y, theme, cam)
	_draw_platform(PLAYER_RAIL_Y, true)
	_draw_km_posts()
	_draw_warning_board()
	_draw_home_signal()
	_draw_stop_marker()
	var lv: Dictionary = Stations.LIVERIES[save.livery]
	_draw_train(_x(sim.player_pos), PLAYER_RAIL_Y, lv["body"], lv["trim"], lv["dark"], night, sim.player_pos)
	_draw_particles()
	_draw_weather()
	if night:
		draw_rect(Rect2(0, 0, VW, VH), Color(0.02, 0.03, 0.1, 0.25))
	_draw_rival_edge()
	_txts("RIVAL", 4, RIVAL_RAIL_Y - 30, MUTED)
	_txts("YOU", 4, PLAYER_RAIL_Y - 30, GO)
	_draw_hud()
	_draw_callout()
	_draw_levers()
	if countdown > 0.0:
		_draw_countdown()
	if paused:
		_draw_pause()
	elif sim.state == RaceSim.State.RESULT and not outcome.is_empty():
		_draw_result()


func _draw_backdrop(theme: int, cam: float, overcast: bool) -> void:
	var th: Array = THEMES[theme]
	var top := Color(th[0])
	var bottom := Color(th[1])
	var grey := Color("8a9099") if not th[7] else Color("20242c")
	if overcast:
		var k := 0.5 if sim.grip_name == "WET" else 0.25
		top = top.lerp(grey, k)
		bottom = bottom.lerp(grey, k)
	var bands := 10
	var horizon := 118
	for i in bands:
		var y0 := i * horizon / bands
		var y1 := (i + 1) * horizon / bands
		draw_rect(Rect2(0, y0, VW, y1 - y0), top.lerp(bottom, float(i) / (bands - 1)))
	draw_rect(Rect2(0, horizon, VW, VH - horizon), bottom)
	if th[7]:
		for i in 40:
			var sx := (i * 97 + 13) % VW
			var sy := (i * 53 + 7) % 90
			var tw := 0.5 + 0.5 * sin(t * 2.0 + i)
			draw_rect(Rect2(sx, sy, 1, 1), Color(1, 1, 1, 0.4 + 0.5 * tw))
	if not overcast or th[7]:
		var sun := Color(th[6])
		var cx := 380 - int(cam * 0.02) % 40
		var cy := 40 if theme != 0 and theme != 4 else 86
		for dy in range(-8, 9):
			var half := int(sqrt(64.0 - dy * dy))
			draw_rect(Rect2(cx - half, cy + dy, half * 2, 1), sun)
	# far hills, then near hills: two parallax layers of column heights
	var far := Color(th[2])
	var near := Color(th[3])
	if overcast:
		far = far.lerp(grey, 0.3)
	for x in range(0, VW, 2):
		var wx := x + cam * PX_PER_M * 0.08
		var h := 22.0 + 10.0 * sin(wx * 0.013) + 6.0 * sin(wx * 0.031 + 1.7) + 3.0 * sin(wx * 0.07 + 0.3)
		draw_rect(Rect2(x, horizon - roundi(h), 2, roundi(h)), far)
	for x in range(0, VW, 2):
		var wx := x + cam * PX_PER_M * 0.25
		var h := 10.0 + 6.0 * sin(wx * 0.021 + 0.5) + 4.0 * sin(wx * 0.053 + 2.1)
		# a tree line: every so often a column pokes up
		if int(wx / 2.0) % 9 == 0:
			h += 5.0
		draw_rect(Rect2(x, horizon - roundi(h) + 6, 2, roundi(h)), near)


func _draw_ground(rail_y: int, theme: int, cam: float) -> void:
	var th: Array = THEMES[theme]
	var ground := Color(th[4])
	var ballast := Color(th[5])
	if rail_y == RIVAL_RAIL_Y:
		draw_rect(Rect2(0, 118, VW, rail_y - 118 + 1), ground)
	draw_rect(Rect2(0, rail_y + 1, VW, 74 if rail_y == RIVAL_RAIL_Y else VH - rail_y), ground)
	# grass tufts that scroll with the track, so speed reads even at the edges
	var off := int(cam * PX_PER_M)
	for i in range(-1, VW / 12 + 2):
		var wx := i * 12 - off % 12
		var h := absi((floori(float(off) / 12.0) + i) * 7919)
		if h % 3 == 0:
			draw_rect(Rect2(wx, rail_y + 10 + (h % 5), 2, 1), ground.darkened(0.2))
	# the ballast bed with its sleepers
	draw_rect(Rect2(0, rail_y - 1, VW, 5), ballast)
	draw_rect(Rect2(0, rail_y + 3, VW, 1), ballast.darkened(0.3))
	var first := floori(cam / 4.0) * 4.0
	var m := first
	while m < cam + VIEW_M + 8.0:
		var sx := roundi((m - cam) * PX_PER_M)
		draw_rect(Rect2(sx, rail_y, 4, 2), Color("4a3a2e"))
		m += 4.0
	draw_rect(Rect2(0, rail_y - 1, VW, 1), Color("c9ccd1"))
	draw_rect(Rect2(0, rail_y, VW, 1), Color("6d7075"))
	# the end of the line: a buffer stop
	var ex := _x(RaceSim.TRACK_LENGTH_M)
	if ex > -10 and ex < VW + 10 and screen == Screen.RACE:
		draw_rect(Rect2(ex, rail_y - 10, 3, 10), STOP)
		draw_rect(Rect2(ex - 2, rail_y - 8, 2, 3), Color("222222"))


func _draw_station_building(theme: int) -> void:
	var cx := _x(sim.platform_centre())
	if cx < -80 or cx > VW + 80:
		return
	var night: bool = THEMES[theme][7]
	var wall := Color("c9b99a")
	var roof := Color("6a3a2e")
	var y := RIVAL_RAIL_Y - 12
	draw_rect(Rect2(cx - 36, y - 26, 72, 26), wall)
	for i in 5:
		draw_rect(Rect2(cx - 40 + i, y - 30 - i, 80 - i * 2, 1), roof)
	draw_rect(Rect2(cx - 40, y - 30, 80, 4), roof)
	for i in 4:
		var wx := cx - 30 + i * 16
		draw_rect(Rect2(wx, y - 20, 8, 10), LAMP if night else Color("3d4f5c"))
	draw_rect(Rect2(cx - 4, y - 14, 8, 14), Color("4a2e22"))
	# the clock
	draw_rect(Rect2(cx - 3, y - 40, 7, 7), INK)
	draw_rect(Rect2(cx, y - 39, 1, 3), Color("222222"))
	draw_rect(Rect2(cx, y - 37, 2, 1), Color("222222"))
	var title: String = config.get("name", "")
	var w := PixelFont.width(title)
	draw_rect(Rect2(cx - w / 2.0 - 3, y - 52, w + 6, 11), Color("1c3a6b"))
	_txtc(title, cx, y - 50, INK)


func _draw_platform(rail_y: int, player: bool) -> void:
	var a := _x(sim.platform_start)
	var b := _x(sim.platform_end)
	if b < -10 or a > VW + 10:
		return
	var slab := Color("9aa0a6")
	draw_rect(Rect2(a, rail_y - 8, b - a, 7), slab)
	draw_rect(Rect2(a, rail_y - 2, b - a, 1), slab.darkened(0.35))
	# the painted edge, with hatching every four pixels
	draw_rect(Rect2(a, rail_y - 9, b - a, 2), WARN)
	var hx := a
	while hx < b:
		draw_rect(Rect2(hx, rail_y - 9, 1, 1), Color("1a1a1a"))
		hx += 4
	if not player:
		return
	# the precision window around the stop board, for the third star
	var win := float(config.get("window", 15.0))
	var w0 := _x(sim.platform_centre() - win)
	var w1 := _x(sim.platform_centre() + win)
	draw_rect(Rect2(w0, rail_y - 9, w1 - w0, 2), GO)
	# canopy posts and roof
	var roof_y := rail_y - 44
	draw_rect(Rect2(a, roof_y, b - a, 3), Color("3a4550"))
	var px := a + 10
	while px < b - 4:
		draw_rect(Rect2(px, roof_y + 3, 2, 35), Color("4a5560"))
		px += 40
	# the stop board: a white square with a black S, at the platform centre
	var sx := _x(sim.platform_centre())
	draw_rect(Rect2(sx, rail_y - 30, 1, 21), Color("dddddd"))
	draw_rect(Rect2(sx - 4, rail_y - 38, 9, 9), Color("f4f4f4"))
	_txt("S", sx - 2, rail_y - 37, Color("111111"))
	_txts("PLATFORM", a + 4, rail_y - 54, WARN)


func _draw_km_posts() -> void:
	var cam := _cam()
	var first := ceili(cam / 100.0) * 100
	var m := first
	while m <= cam + VIEW_M:
		if m >= 0 and m <= RaceSim.TRACK_LENGTH_M:
			var x := _x(m)
			draw_rect(Rect2(x, PLAYER_RAIL_Y + 5, 1, 4), INK)
			var label := str(m)
			if x + 3 + PixelFont.width(label) < VW - 2:
				_txts(label, x + 3, PLAYER_RAIL_Y + 5, MUTED)
		m += 100


func _draw_warning_board() -> void:
	var x := _x(sim.warn_at_m)
	if x < -20 or x > VW + 20:
		return
	var top := PLAYER_RAIL_Y - 34
	draw_rect(Rect2(x, top, 1, 34), Color("777777"))
	var lit := sim.player_pos >= sim.warn_at_m
	for dy in range(-5, 6):
		var half := 5 - absi(dy)
		draw_rect(Rect2(x - half, top + dy, half * 2 + 1, 1), WARN if lit else Color("dddddd"))
	_txts("400", x + 7, top - 3, WARN)


func _draw_home_signal() -> void:
	var x := _x(sim.platform_start) - 16
	if x < -20 or x > VW + 20:
		return
	var top := PLAYER_RAIL_Y - 50
	draw_rect(Rect2(x, top, 2, 50), Color("555555"))
	draw_rect(Rect2(x - 3, top - 12, 8, 12), Color("1a1a1a"))
	var lamp := GO
	if sim.player_pos > sim.platform_end:
		lamp = STOP
	elif sim.player_pos >= sim.warn_at_m:
		lamp = WARN
	draw_rect(Rect2(x - 1, top - 9, 4, 4), lamp)
	draw_rect(Rect2(x - 2, top - 8, 6, 2), Color(lamp, 0.4))


func _draw_stop_marker() -> void:
	if sim.state != RaceSim.State.RACING or sim.player_speed <= 0.0:
		return
	var stop_at := _pred_now
	var inside := stop_at >= sim.platform_start and stop_at <= sim.platform_end
	var c := GO if inside else (STOP if stop_at > sim.platform_end else MUTED)
	var x := _x(stop_at)
	var y := PLAYER_RAIL_Y
	if x > VW - 6:
		# off the right edge: an arrow and the metre where the train would rest
		for i in 6:
			draw_rect(Rect2(VW - 4 - i * 2, y - 26 - i, 2, 1 + i * 2), c)
		var label := "STOP %d M" % roundi(stop_at)
		_txts(label, VW - 18 - PixelFont.width(label), y - 29, c)
		return
	if x < -10:
		return
	var yy := y - 30
	while yy < y + 4:
		draw_rect(Rect2(x, yy, 1, 3), c)
		yy += 5
	for i in 4:
		draw_rect(Rect2(x - 3 + i, y - 33 + i, 7 - i * 2, 1), c)


func _draw_rival_edge() -> void:
	if sim.state == RaceSim.State.IDLE and countdown <= 0.0:
		return
	var x := _x(sim.rival_pos)
	if x >= -10 and x <= VW + 60:
		return
	var ahead := x > VW
	var gap := absi(roundi(sim.rival_pos - sim.player_pos))
	var c := STOP if ahead else GO
	var y := RIVAL_RAIL_Y - 12
	var label := "%d M" % gap
	var lw := PixelFont.width(label)
	for i in 6:
		var ax := VW - 4 - i * 2 if ahead else 3 + i * 2
		draw_rect(Rect2(ax, y - i, 2, 1 + i * 2), c)
	var lx := VW - 20 - lw if ahead else 20
	draw_rect(Rect2(lx - 2, y - 5, lw + 4, 11), PANEL)
	_txt(label, lx, y - 3, c)


func _draw_particles() -> void:
	var cam := _cam()
	for p in particles:
		var x := roundi((float(p["x"]) - cam) * PX_PER_M)
		draw_rect(Rect2(x, roundi(p["y"]), 1, 1), p["c"])


func _draw_weather() -> void:
	if sim.grip_name == "DRY":
		return
	var count := 90 if sim.grip_name == "WET" else 35
	var drop := Color(0.75, 0.82, 0.95, 0.55)
	var drift := sim.player_speed * 2.0
	for i in count:
		var speed := 180.0 + float((i * 37) % 60)
		var x := fposmod(i * 53.7 - t * (40.0 + drift), VW + 20) - 10
		var y := fposmod(i * 29.3 + t * speed, VH)
		draw_rect(Rect2(roundi(x), roundi(y), 1, 3), drop)
		draw_rect(Rect2(roundi(x) - 1, roundi(y) + 3, 1, 1), drop)


# A train is a locomotive and two coaches, drawn from the nose backwards.
# 60 pixels long, about 32 metres at this scale.
func _draw_train(nose: int, rail_y: int, body: Color, trim: Color, dark: Color, lights: bool, pos_m: float) -> void:
	if nose < -70 or nose - 60 > VW + 10:
		return
	var y := rail_y
	var glass := Color("1b2a38")
	var lit := LAMP
	var spoke := int(pos_m * PX_PER_M / 2.0) % 4
	# the coaches
	for c in 2:
		var right := nose - 24 - c * 19
		var left := right - 17
		draw_rect(Rect2(left, y - 14, 17, 11), body)
		draw_rect(Rect2(left + 1, y - 15, 15, 1), dark)
		for w in 4:
			draw_rect(Rect2(left + 2 + w * 4, y - 12, 2, 3), lit if lights else glass)
		draw_rect(Rect2(left, y - 7, 17, 1), trim)
		draw_rect(Rect2(left, y - 3, 17, 1), dark)
		_wheel(left + 2, y, spoke)
		_wheel(right - 5, y, spoke)
		draw_rect(Rect2(right, y - 6, 2, 1), dark)
	# the locomotive: a tall cab behind a long hood, then a sloped nose
	var l := nose - 22
	draw_rect(Rect2(l, y - 12, 21, 9), body)
	draw_rect(Rect2(l, y - 18, 9, 6), body)
	draw_rect(Rect2(l + 1, y - 19, 7, 1), dark)
	draw_rect(Rect2(l + 2, y - 17, 5, 3), lit if lights else glass)
	draw_rect(Rect2(nose - 1, y - 10, 1, 7), body)
	draw_rect(Rect2(l, y - 7, 22, 1), trim)
	draw_rect(Rect2(nose - 9, y - 14, 2, 2), dark)
	draw_rect(Rect2(l, y - 3, 22, 1), dark)
	draw_rect(Rect2(nose - 1, y - 6, 1, 1), LAMP)
	if lights:
		for i in 4:
			draw_rect(Rect2(nose + i * 3, y - 6 - i, 3, 1 + i * 2), Color(LAMP, 0.12))
	_wheel(l + 2, y, spoke)
	_wheel(l + 9, y, spoke)
	_wheel(l + 16, y, spoke)


func _wheel(x: int, rail_y: int, spoke: int) -> void:
	draw_rect(Rect2(x, rail_y - 3, 3, 3), Color("222222"))
	draw_rect(Rect2(x + (spoke % 3), rail_y - 2, 1, 1), Color("888888"))


# ------------------------------------------------------------------ the HUD

func _draw_hud() -> void:
	draw_rect(Rect2(0, 0, VW, 30), PANEL)
	draw_rect(Rect2(0, 30, VW, 1), EDGE)
	var stop_at := _pred_best if sim.state == RaceSim.State.RACING else sim.player_pos
	var needs := stop_at - sim.player_pos
	var needs_c := INK
	if sim.state == RaceSim.State.RACING:
		if stop_at > sim.platform_end:
			needs_c = STOP
		elif stop_at >= sim.platform_start:
			needs_c = GO
	var known := sim.passed_warn and sim.state != RaceSim.State.IDLE
	var to_platform := maxi(0, roundi(sim.platform_start - sim.player_pos))
	var par_label := "PAR" if mode == "campaign" else "BEST"
	var par_value := ""
	if mode == "campaign":
		par_value = _secs(config.get("par_ms", 0))
	else:
		par_value = _secs(save.free_best_ms) if save.free_best_ms > 0 else "--"
	var cells := [
		["KM/H", str(roundi(sim.player_speed * 3.6)), INK],
		["STOP NEEDS", "%d M" % roundi(needs), needs_c],
		["PLATFORM IN", ("%d M" % to_platform) if known else "-- M", INK if known else MUTED],
		["RAIL", sim.grip_name, INK if sim.grip_name == "DRY" else WARN],
		["TIME", _secs(sim.elapsed_ms), INK],
		[par_label, par_value, MUTED],
	]
	for i in cells.size():
		var x := i * 80
		if i > 0:
			draw_rect(Rect2(x, 0, 1, 30), EDGE)
		_txt(cells[i][0], x + 5, 3, MUTED)
		_txt(cells[i][1], x + 5, 13, cells[i][2], 2)


func _draw_callout() -> void:
	if sim.state != RaceSim.State.RACING or paused:
		return
	var text := ""
	var c := WARN
	if sim.player_pos <= 0.0 and not _held("throttle"):
		text = "HOLD SPEED UP TO START" if touch_ui else "HOLD W / UP TO START"
		c = GO
	elif sim.sliding:
		text = "WHEEL SLIDE - MOVE THE BRAKE TO A LOWER NUMBER" if touch_ui else "WHEEL SLIDE - EASE THE BRAKE (Q)"
		c = STOP
		if fmod(t, 0.3) > 0.2:
			return
	elif sim.rival_braking:
		text = "RIVAL IS STOPPING - BRING IT TO A STAND"
		c = STOP
		if fmod(t, 0.5) > 0.3:
			return
	elif sim.passed_warn and sim.player_pos < sim.platform_start:
		text = "DISTANT SIGNAL - PLATFORM %d M" % maxi(0, roundi(sim.platform_start - sim.player_pos))
	if text == "":
		return
	var w := PixelFont.width(text)
	draw_rect(Rect2(VW / 2.0 - w / 2.0 - 6, 34, w + 12, 13), Color(c, 0.9))
	_txtc(text, VW / 2.0, 37, Color("111111"))


func _draw_levers() -> void:
	if sim.state == RaceSim.State.RESULT or paused:
		return
	var held := sim.throttle or (sim.brake_notch == 0 and _held("throttle"))
	_draw_brake_lever(_brake_rect(), sim.brake_notch, sim.sliding, touch_ui)
	_draw_speed_button(_throttle_rect(), held, sim.brake_notch > 0, touch_ui)
	# Until the train first moves, the speed button pulses to show where to start.
	if sim.player_pos <= 0.0 and not held and fmod(t, 0.8) < 0.4:
		var th := _throttle_rect().grow(2)
		_box(th, Color(0, 0, 0, 0), LAMP)
	# the pause button
	var pr := _pause_rect()
	_box(pr, Color(0, 0, 0, 0.45), EDGE.lightened(0.3))
	draw_rect(Rect2(pr.position.x + 9, pr.position.y + 6, 3, 10), INK)
	draw_rect(Rect2(pr.position.x + 14, pr.position.y + 6, 3, 10), INK)


## The brake lever: OFF and notches 1 to 3. The handle stays where it is put.
func _draw_brake_lever(r: Rect2, notch: int, sliding: bool, touch: bool) -> void:
	_box(r, Color(STOP, 0.12 + 0.12 * notch) if notch > 0 else Color(0, 0, 0, 0.45), STOP)
	_txtc("BRAKE LEVER", r.get_center().x, r.position.y + 3, INK)
	for n in RaceSim.MAX_NOTCH + 1:
		var c := _lever_cell(r, n).grow_individual(-1, 0, -1, 0)
		var on := n == notch
		var lamp := (WARN if sliding and fmod(t, 0.3) < 0.15 else STOP) if n > 0 else GO
		if on:
			draw_rect(c, Color(lamp, 0.85))
		else:
			_box(c, Color(0, 0, 0, 0.5), EDGE.lightened(0.3))
		var label := "OFF" if n == 0 else str(n)
		_txtc(label, c.get_center().x, c.position.y + 4, Color("111111") if on else MUTED, 2)
	var hint := "TAP OR SLIDE" if touch else "DOWN/S: +1   Q: -1   KEYS 0-3"
	_txtc(hint, r.get_center().x, r.position.y + 38, MUTED)


## The speed button gives power only while it is held and the brake is OFF.
func _speed_button_text(held: bool, blocked: bool, touch: bool) -> Array:
	if blocked:
		return ["", "BRAKE IS ON", "SET BRAKE TO OFF"]
	if held:
		return ["", "SPEEDING UP", "LET GO: NO POWER"]
	return ["HOLD TO", "SPEED UP", "" if touch else "HOLD W / UP"]


func _draw_speed_button(r: Rect2, held: bool, blocked: bool, touch: bool) -> void:
	_box(r, Color(GO, 0.6) if held else Color(0, 0, 0, 0.45), MUTED if blocked else GO)
	var lines := _speed_button_text(held, blocked, touch)
	var cx := r.get_center().x
	_txtc(lines[0], cx, r.position.y + 5, INK)
	_txtc(lines[1], cx, r.position.y + 15, MUTED if blocked else INK, 2)
	_txtc(lines[2], cx, r.position.y + 36, MUTED)


func _draw_countdown() -> void:
	draw_rect(Rect2(0, 60, VW, 64), Color(0, 0, 0, 0.55))
	var title: String = config.get("name", "")
	if mode == "campaign":
		title = "%d  %s" % [station + 1, title]
	else:
		title = "FREE RACE  -  STREAK %d" % save.streak
	_txtc(title, VW / 2.0, 66, LAMP, 2)
	_txtc(str(ceili(countdown)), VW / 2.0, 86, INK, 3)
	var tip: String = config.get("tip", "")
	if tip != "":
		_txtc(tip, VW / 2.0, 112, WARN)


func _draw_pause() -> void:
	draw_rect(Rect2(0, 0, VW, VH), Color(0, 0, 0, 0.6))
	_txtc("PAUSED", VW / 2.0, 80, LAMP, 3)
	_draw_items(_items())


func _draw_result() -> void:
	draw_rect(Rect2(0, 0, VW, VH), Color(0, 0, 0, 0.35))
	var p := Rect2(60, 54, 360, 172)
	_box(p, PANEL, EDGE)
	var win: bool = outcome["win"]
	var c := GO if win else STOP
	_txtc(sim.result, VW / 2.0, 64, c, 3)
	_txtc(sim.reason_text(), VW / 2.0, 90, INK)
	_txtc("TIME " + _secs(sim.elapsed_ms), VW / 2.0, 104, MUTED)
	if mode == "campaign" and win:
		var shown := clampi(int((t - _finish_time - 0.6) / 0.35) + 1, 0, int(outcome["stars"]))
		for s in 3:
			_txt("*", VW / 2.0 - 34 + s * 24, 118, WARN if s < shown else EDGE, 3)
		var par_line := "INSIDE PAR" if outcome["in_par"] else "OVER PAR " + _secs(config["par_ms"])
		var board_line := "ON THE STOP BOARD"
		if not outcome["precise"]:
			board_line = "%d M FROM THE STOP BOARD" % roundi(absf(sim.player_pos - sim.platform_centre()))
		_txtc(par_line + " - " + board_line, VW / 2.0, 146, MUTED)
	elif mode == "free":
		if win:
			_txtc("+%d POINTS" % outcome["points"], VW / 2.0, 122, WARN, 2)
			_txtc("STREAK %d   TOTAL %d" % [save.streak, save.points], VW / 2.0, 146, MUTED)
		else:
			_txtc("STREAK LOST", VW / 2.0, 122, STOP, 2)
	var note := ""
	if outcome["line_done"]:
		note = "LINE COMPLETE! FREE RACE IS OPEN"
	elif outcome["new_best"]:
		note = "NEW BEST" if saved_ok else "NEW BEST (NOT SAVED)"
	elif not saved_ok:
		note = "PROGRESS NOT SAVED"
	if note != "":
		_txtc(note, VW / 2.0, 164, LAMP if saved_ok else STOP)
	var hint := "TAP A BUTTON" if touch_ui else "SPACE / ENTER TO CHOOSE - R TO RETRY"
	_txtc(hint, VW / 2.0, 180, EDGE.lightened(0.3))
	_draw_items(_items())


func _secs(ms: int) -> String:
	return "%.2f" % (ms / 1000.0)
