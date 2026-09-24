class_name RaceSim
extends RefCounted
## The race physics: stepTrain(), judge() and step() from ../index.html, plus
## Last Stop's brake notches and wheel slide. tools/campaign-check.mjs holds the
## same arithmetic, and tests/test_sim.gd pins this port to its numbers.
##
## Brake notches: the player's brake is a handle with notches 0 to 3. Each notch
## asks for a deceleration. The rail holds at most adhesion(speed), which falls
## with speed and with a wet rail. A notch that asks for more locks the wheels,
## and a sliding wheel brakes at only SLIDE_FACTOR of the limit. The rival's
## brake has no notches and never slides.
##
## Invariants carried over from the HTML game:
## - Only step_train() writes a train's speed. Only _judge() writes result.
## - In step_train() the train moves first, then the speed changes.
## - The a < 0 guard on STOP_EPSILON keeps the first throttle step alive.

const TRACK_LENGTH_M := 2000.0
const PLAYER_FMAX := 2.5
const PLAYER_POWER := 95.0
const BRAKE_DECEL := 2.5
const RES_R0 := 0.06
const RES_R2 := 0.00028
const RIVAL_FMAX := 4.0
const RIVAL_POWER := 120.0
const RIVAL_BRAKE := 4.0
const RIVAL_BOOST_RANGE_M := 300.0
const RIVAL_HARD_CAP := 36.0
const WARN_BEFORE_M := 400.0
const ARM_AFTER_M := 50.0
const STOP_EPSILON := 0.05
const FIXED_DT := 1.0 / 60.0
const STEP_MS := 1000.0 / 60.0
const MAX_FRAME_DELTA_MS := 50.0

const GRIPS := {"DRY": 1.0, "DAMP": 0.8, "WET": 0.65}

const NOTCH_DECEL := [0.0, 0.9, 1.6, 2.5]
const MAX_NOTCH := 3
const ADHESION_BASE := 3.2
const ADHESION_FALL := 0.02
const SLIDE_FACTOR := 0.5
const PREDICT_DT := 1.0 / 30.0

enum State { IDLE, RACING, RESULT }

var state: State = State.IDLE
var result := ""
var player_pos := 0.0
var player_speed := 0.0
var player_armed := false
var rival_pos := 0.0
var rival_speed := 0.0
var rival_armed := false
var rival_done := false
var rival_base := 30.0
var rival_boost := 3.0
var rival_max := 30.0
var rival_target_m := 0.0
var rival_braking := false
var end_speed := 0.0
var platform_start := 1300.0
var platform_width := 240.0
var platform_end := 1540.0
var warn_at_m := 900.0
var passed_warn := false
var grip_name := "DRY"
var grip := 1.0
var steps := 0
var elapsed_ms := 0
var throttle := false
var brake_notch := 0
var sliding := false


## config keys: platform_start, platform_width, rail, rival, boost.
func start(config: Dictionary) -> void:
	state = State.RACING
	result = ""
	player_pos = 0.0
	player_speed = 0.0
	player_armed = false
	rival_pos = 0.0
	rival_speed = 0.0
	rival_armed = false
	rival_done = false
	platform_start = float(config.get("platform_start", 1300.0))
	platform_width = float(config.get("platform_width", 240.0))
	platform_end = platform_start + platform_width
	rival_target_m = platform_start + platform_width / 2.0
	warn_at_m = platform_start - WARN_BEFORE_M
	passed_warn = false
	rival_braking = false
	end_speed = 0.0
	grip_name = String(config.get("rail", "DRY"))
	grip = GRIPS.get(grip_name, 1.0)
	rival_base = float(config.get("rival", 30.0))
	rival_boost = float(config.get("boost", 3.0))
	rival_max = rival_base
	steps = 0
	elapsed_ms = 0
	throttle = false
	brake_notch = 0
	sliding = false


static func resistance(v: float) -> float:
	return RES_R0 + RES_R2 * v * v


## The exact distance to a standstill under a constant brake plus a resistance
## that grows with the square of the speed.
static func stop_distance(v: float, decel: float) -> float:
	if v <= 0.0:
		return 0.0
	var b := decel + RES_R0
	return log(1.0 + (RES_R2 * v * v) / b) / (2.0 * RES_R2)


func brake_distance(speed: float, decel: float) -> float:
	return stop_distance(speed, decel * grip)


## The most the rail can hold at this speed.
func adhesion(speed: float) -> float:
	return grip * maxf(0.0, ADHESION_BASE - ADHESION_FALL * speed)


func slides(notch: int, speed: float) -> bool:
	return notch > 0 and NOTCH_DECEL[notch] > adhesion(speed)


## The strongest notch that does not slide at this speed.
func safe_notch(speed: float) -> int:
	for n in range(MAX_NOTCH, 0, -1):
		if not slides(n, speed):
			return n
	return 1


## Where the train comes to rest from here. notch 0 means the best stop: the
## strongest notch that does not slide, changed as the speed falls. Integrated
## with a coarser step than the race, so it can be off by a metre or two.
func predict_stop(notch: int) -> float:
	var pos := player_pos
	var v := player_speed
	var n := 0
	while v > 0.0 and n < 6000:
		var k := notch if notch > 0 else safe_notch(v)
		var want: float = NOTCH_DECEL[k]
		var limit := adhesion(v)
		var a := -(limit * SLIDE_FACTOR if want > limit else want) - resistance(v)
		pos += v * PREDICT_DT
		v += a * PREDICT_DT
		n += 1
	return pos


## Returns [pos, speed] after one fixed step. notch > 0 is a player brake
## notch; the rival passes brk instead.
func step_train(
	pos: float, speed: float, thr: bool, brk: bool,
	fmax: float, power: float, brake_decel: float, cap: float, notch: int = 0
) -> Array:
	var v := speed
	var res := resistance(v)
	var a: float
	if notch > 0:
		var want: float = NOTCH_DECEL[notch]
		var limit := adhesion(v)
		a = -(limit * SLIDE_FACTOR if want > limit else want) - res
	elif brk:
		a = -(brake_decel * grip) - res
	elif thr:
		a = minf(fmax, power / maxf(v, 1.0)) - res
	else:
		a = -res
	# The train moves first, then the speed changes.
	pos += speed * FIXED_DT
	speed += a * FIXED_DT
	if speed > cap:
		speed = cap
	if a < 0.0 and speed < STOP_EPSILON:
		speed = 0.0
	if speed < 0.0:
		speed = 0.0
	return [pos, speed]


func step() -> void:
	if state != State.RACING:
		return
	steps += 1
	elapsed_ms = roundi(steps * STEP_MS)

	brake_notch = clampi(brake_notch, 0, MAX_NOTCH)
	sliding = slides(brake_notch, player_speed) and player_speed > 0.0
	var p := step_train(player_pos, player_speed, throttle and brake_notch == 0, false,
		PLAYER_FMAX, PLAYER_POWER, BRAKE_DECEL, INF, brake_notch)
	player_pos = p[0]
	player_speed = p[1]
	if player_pos > ARM_AFTER_M:
		player_armed = true
	if player_pos >= warn_at_m:
		passed_warn = true

	if not rival_done:
		# The rival pushes when the player pulls clear, up to a hard limit.
		var lead := player_pos - rival_pos
		var push := clampf(lead / RIVAL_BOOST_RANGE_M, 0.0, 1.0) * rival_boost
		# A driver eases off on a wet rail.
		var rail_factor := 0.68 + 0.32 * grip
		rival_max = minf(rival_base + push, RIVAL_HARD_CAP) * rail_factor
		# It brakes at the last moment its own stopping distance allows.
		var braking := (rival_target_m - rival_pos) <= brake_distance(rival_speed, RIVAL_BRAKE)
		if braking:
			rival_braking = true
		var r := step_train(rival_pos, rival_speed, not braking, braking,
			RIVAL_FMAX, RIVAL_POWER, RIVAL_BRAKE, rival_max)
		rival_pos = r[0]
		rival_speed = r[1]
		if rival_speed > 0.0:
			rival_armed = true
		if rival_armed and rival_speed == 0.0:
			rival_done = true

	# The player is judged first. A stop on the same step wins.
	if _judge():
		return
	if rival_done:
		_finish("RIVAL WINS")


func _judge() -> bool:
	if player_pos >= TRACK_LENGTH_M:
		player_pos = TRACK_LENGTH_M
		player_speed = 0.0
		_finish("OVERSHOT")
		return true
	if player_armed and player_speed == 0.0:
		if player_pos < platform_start:
			_finish("UNDERSHOT")
		elif player_pos > platform_end:
			_finish("OVERSHOT")
		else:
			_finish("WIN")
		return true
	return false


func _finish(r: String) -> void:
	end_speed = player_speed
	result = r
	state = State.RESULT


## Where the train stops on the notch it has now (the best stop if none).
func stop_at() -> float:
	return predict_stop(brake_notch)


func platform_centre() -> float:
	return platform_start + platform_width / 2.0


## A result names the winner. It must also name the cause.
func reason_text() -> String:
	if state != State.RESULT:
		return ""
	if result == "WIN":
		return "STOPPED %d M INTO THE PLATFORM" % roundi(player_pos - platform_start)
	if result == "UNDERSHOT":
		return "STOPPED %d M SHORT OF THE PLATFORM" % roundi(platform_start - player_pos)
	if result == "OVERSHOT":
		if player_pos >= TRACK_LENGTH_M:
			return "RAN OUT OF TRACK"
		return "RAN %d M PAST THE PLATFORM" % roundi(player_pos - platform_end)
	if end_speed < 1.0:
		return "THE RIVAL STOPPED WHILE YOU STOOD STILL"
	return "YOU WERE STILL MOVING AT %d KM/H" % roundi(end_speed * 3.6)
