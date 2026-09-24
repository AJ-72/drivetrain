class_name Synth
extends Node
## Every sound in the game is synthesized here at start-up into AudioStreamWAV
## buffers: the engine, the brake squeal, the rail clack, the horn, the UI
## blips, the jingles and the music loop. There are no audio files.
##
## Pre-rendered buffers (rather than an AudioStreamGenerator filled each frame)
## work the same in every export. The web build mixes them in Godot ("Stream"
## playback, set in project.godot), because in the browser "Sample" mode these
## runtime buffers and buses played nothing.

const RATE := 22050
const MUSIC_RATE := 16000
const SFX_VOICES := 6

var music_on := true:
	set(v):
		music_on = v
		_apply_mute()
var sfx_on := true:
	set(v):
		sfx_on = v
		_apply_mute()

var _streams := {}
var _engine: AudioStreamPlayer
var _squeal: AudioStreamPlayer
var _music: AudioStreamPlayer
var _voices: Array[AudioStreamPlayer] = []
var _next_voice := 0
var _music_level := 1.0
var _squeal_level := 0.0
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.seed = 7
	_ensure_bus("Music")
	_ensure_bus("SFX")
	_streams["engine"] = _to_wav(_make_engine(), RATE, true)
	_streams["squeal"] = _to_wav(_make_squeal(), RATE, true)
	_streams["clack"] = _to_wav(_make_clack(), RATE, false)
	_streams["horn"] = _to_wav(_make_horn(), RATE, false)
	_streams["beep"] = _to_wav(_make_tone(880.0, 0.14, 0.5), RATE, false)
	_streams["go"] = _to_wav(_make_tone(1320.0, 0.40, 0.5), RATE, false)
	_streams["blip"] = _to_wav(_make_blip(), RATE, false)
	_streams["star"] = _to_wav(_make_star(), RATE, false)
	_streams["win"] = _to_wav(_make_jingle([72, 76, 79, 84], 0.11, 0.45, true), RATE, false)
	_streams["lose"] = _to_wav(_make_jingle([67, 64, 60, 55], 0.16, 0.40, false), RATE, false)

	_engine = _player("SFX", _streams["engine"])
	_squeal = _player("SFX", _streams["squeal"])
	_music = _player("Music", null)
	for i in SFX_VOICES:
		_voices.append(_player("SFX", null))
	_engine.volume_db = -80.0
	_squeal.volume_db = -80.0
	# The music loop is the slowest buffer to build. Build it after the first
	# frame so the title screen appears at once.
	_build_music.call_deferred()
	_apply_mute()


func play(sound: String, pitch: float = 1.0, volume_db: float = 0.0) -> void:
	if not _streams.has(sound):
		return
	var v := _voices[_next_voice]
	_next_voice = (_next_voice + 1) % _voices.size()
	v.stream = _streams[sound]
	v.pitch_scale = pitch
	v.volume_db = volume_db
	v.play()


## Called every frame during a race. speed is in metres per second.
## brake is the notch as a fraction of the top notch (0 to 1). A sliding wheel
## squeals louder and higher.
func set_train(speed: float, throttle: bool, brake: float, sliding: bool, running: bool) -> void:
	if not running:
		_engine.volume_db = move_toward(_engine.volume_db, -80.0, 4.0)
		_squeal.volume_db = -80.0
		_squeal_level = 0.0
		return
	if not _engine.playing:
		_engine.play()
	if not _squeal.playing:
		_squeal.play()
	_engine.pitch_scale = 0.55 + clampf(speed / 45.0, 0.0, 1.5) * 1.1
	var engine_level := 0.22 + (0.30 if throttle else 0.0) + clampf(speed / 60.0, 0.0, 0.2)
	_engine.volume_db = linear_to_db(engine_level)
	var target := 0.0
	if brake > 0.0 and speed > 0.5:
		target = clampf(speed / 22.0, 0.15, 0.55) * (0.4 + 0.6 * brake)
		if sliding:
			target = 0.85
	_squeal_level = move_toward(_squeal_level, target, 0.06)
	_squeal.volume_db = linear_to_db(maxf(_squeal_level, 0.0001))
	_squeal.pitch_scale = 0.85 + clampf(speed / 40.0, 0.0, 0.4) + (0.35 if sliding else 0.0)


func stop_train() -> void:
	_engine.stop()
	_squeal.stop()
	_squeal_level = 0.0


## level 1.0 for menus, lower during a race so the engine carries.
func set_music_level(level: float) -> void:
	_music_level = level
	if _music:
		_music.volume_db = linear_to_db(maxf(level, 0.0001)) - 6.0


func _build_music() -> void:
	_streams["music"] = _to_wav(_make_music(), MUSIC_RATE, true)
	_music.stream = _streams["music"]
	set_music_level(_music_level)
	_music.play()


func _apply_mute() -> void:
	var m := AudioServer.get_bus_index("Music")
	var s := AudioServer.get_bus_index("SFX")
	if m >= 0:
		AudioServer.set_bus_mute(m, not music_on)
	if s >= 0:
		AudioServer.set_bus_mute(s, not sfx_on)


func _ensure_bus(bus_name: String) -> void:
	if AudioServer.get_bus_index(bus_name) != -1:
		return
	AudioServer.add_bus()
	var i := AudioServer.bus_count - 1
	AudioServer.set_bus_name(i, bus_name)
	AudioServer.set_bus_send(i, "Master")


func _player(bus: String, stream: AudioStream) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.bus = bus
	p.stream = stream
	add_child(p)
	return p


# ------------------------------------------------------------ sound recipes

func _make_engine() -> PackedFloat32Array:
	# 0.5 s holds a whole number of cycles of every part, so the loop is clean.
	var n := RATE / 2
	var out := PackedFloat32Array()
	out.resize(n)
	var lp := 0.0
	for i in n:
		var t := float(i) / RATE
		var pulse := 1.0 if fmod(t * 60.0, 1.0) < 0.3 else -1.0
		var saw := fmod(t * 120.0, 1.0) * 2.0 - 1.0
		var chug := 0.65 + 0.35 * sin(TAU * 8.0 * t)
		var raw := (pulse * 0.6 + saw * 0.4) * chug + _rng.randf_range(-0.15, 0.15)
		lp += (raw - lp) * 0.18
		out[i] = lp * 0.8
	return out


func _make_squeal() -> PackedFloat32Array:
	var n := RATE / 2
	var out := PackedFloat32Array()
	out.resize(n)
	for i in n:
		var t := float(i) / RATE
		var wobble := sin(TAU * 6.0 * t) * 0.004
		var tone := sin(TAU * 2000.0 * t * (1.0 + wobble)) * 0.5
		tone += sin(TAU * 3000.0 * t) * 0.15
		out[i] = tone + _rng.randf_range(-0.25, 0.25)
	return out


func _make_clack() -> PackedFloat32Array:
	var n := int(RATE * 0.07)
	var out := PackedFloat32Array()
	out.resize(n)
	var lp := 0.0
	for i in n:
		var t := float(i) / RATE
		var env := exp(-t * 60.0)
		lp += (_rng.randf_range(-1.0, 1.0) - lp) * 0.35
		out[i] = (lp * 0.7 + sin(TAU * 160.0 * t) * 0.6) * env
	return out


func _make_horn() -> PackedFloat32Array:
	var n := int(RATE * 1.1)
	var out := PackedFloat32Array()
	out.resize(n)
	var lp := 0.0
	for i in n:
		var t := float(i) / RATE
		var env := minf(1.0, t / 0.03) * minf(1.0, (1.1 - t) / 0.18)
		var a := 1.0 if fmod(t * 311.1, 1.0) < 0.5 else -1.0
		var b := 1.0 if fmod(t * 370.0, 1.0) < 0.5 else -1.0
		lp += ((a + b) * 0.5 - lp) * 0.25
		out[i] = lp * env * 0.6
	return out


func _make_tone(freq: float, length: float, level: float) -> PackedFloat32Array:
	var n := int(RATE * length)
	var out := PackedFloat32Array()
	out.resize(n)
	for i in n:
		var t := float(i) / RATE
		var env := minf(1.0, (length - t) / 0.03)
		out[i] = (1.0 if fmod(t * freq, 1.0) < 0.5 else -1.0) * env * level
	return out


func _make_blip() -> PackedFloat32Array:
	var length := 0.06
	var n := int(RATE * length)
	var out := PackedFloat32Array()
	out.resize(n)
	var phase := 0.0
	for i in n:
		var t := float(i) / RATE
		phase += (1100.0 + 900.0 * t / length) / RATE
		out[i] = (1.0 if fmod(phase, 1.0) < 0.5 else -1.0) * (1.0 - t / length) * 0.35
	return out


func _make_star() -> PackedFloat32Array:
	var n := int(RATE * 0.35)
	var out := PackedFloat32Array()
	out.resize(n)
	for i in n:
		var t := float(i) / RATE
		var env := exp(-t * 9.0)
		out[i] = (sin(TAU * 1568.0 * t) + 0.5 * sin(TAU * 2349.0 * t)) * env * 0.4
	return out


func _make_jingle(notes: Array, step: float, tail: float, bright: bool) -> PackedFloat32Array:
	var total := step * (notes.size() - 1) + tail
	var n := int(RATE * total)
	var out := PackedFloat32Array()
	out.resize(n)
	for k in notes.size():
		var f := _midi(notes[k])
		var begin := int(RATE * step * k)
		var length := tail if k == notes.size() - 1 else step
		var count := mini(int(RATE * length), n - begin)
		for i in count:
			var t := float(i) / RATE
			var env := exp(-t * (4.0 if k == notes.size() - 1 else 10.0))
			var v: float
			if bright:
				v = 1.0 if fmod(t * f, 1.0) < 0.25 else -1.0
			else:
				v = absf(fmod(t * f, 1.0) * 4.0 - 2.0) - 1.0
			out[begin + i] += v * env * 0.35
	return out


# An eight-bar chiptune loop: a pulse lead on sixteenth-note arpeggios, a
# triangle bass, and a noise hat. C G Am F, then C G F G.
func _make_music() -> PackedFloat32Array:
	var bpm := 128.0
	var step_len := 60.0 / bpm / 4.0
	var chords := [
		[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60],
		[60, 64, 67], [55, 59, 62], [53, 57, 60], [55, 59, 62],
	]
	var roots := [36, 43, 45, 41, 36, 43, 41, 43]
	var pattern_a := [0, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 0]
	var pattern_b := [3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3, -1, 3, -1]
	var steps := 16 * chords.size()
	var samples_per_step := int(MUSIC_RATE * step_len)
	var n := samples_per_step * steps
	var out := PackedFloat32Array()
	out.resize(n)
	var bass_phase := 0.0
	var lead_phase := 0.0
	var noise := RandomNumberGenerator.new()
	noise.seed = 11
	for s in steps:
		var bar := s / 16
		var pos := s % 16
		var chord: Array = chords[bar]
		var pattern: Array = pattern_a if bar % 2 == 0 else pattern_b
		var idx: int = pattern[pos]
		var lead_f := 0.0
		if idx >= 0:
			var note: int = chord[0] + 12 if idx == 3 else chord[idx]
			lead_f = _midi(note + 12)
		var bass_note: int = roots[bar] + (12 if pos % 4 == 2 else 0)
		var bass_f := _midi(bass_note)
		var hat := pos % 4 == 2
		var kick := pos % 8 == 0
		var begin := s * samples_per_step
		for i in samples_per_step:
			var t := float(i) / MUSIC_RATE
			var v := 0.0
			if lead_f > 0.0:
				lead_phase += lead_f / MUSIC_RATE
				v += (1.0 if fmod(lead_phase, 1.0) < 0.25 else -1.0) * exp(-t * 7.0) * 0.16
			bass_phase += bass_f / MUSIC_RATE
			v += (absf(fmod(bass_phase, 1.0) * 4.0 - 2.0) - 1.0) * 0.30
			if hat and t < 0.04:
				v += noise.randf_range(-1.0, 1.0) * (1.0 - t / 0.04) * 0.10
			if kick and t < 0.09:
				v += sin(TAU * (90.0 - 500.0 * t) * t) * (1.0 - t / 0.09) * 0.45
			out[begin + i] = v
	return out


static func _midi(note: int) -> float:
	return 440.0 * pow(2.0, (note - 69) / 12.0)


static func _to_wav(samples: PackedFloat32Array, rate: int, loop: bool) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		bytes.encode_s16(i * 2, int(clampf(samples[i], -1.0, 1.0) * 32767.0))
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = rate
	wav.stereo = false
	wav.data = bytes
	if loop:
		wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
		wav.loop_begin = 0
		wav.loop_end = samples.size()
	return wav
