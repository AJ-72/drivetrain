class_name Ghost
extends RefCounted
## A recorded run: the player's position every EVERY race steps, from step 0.
## The last sample is where the train came to rest. The race draws a
## see-through train at the recorded position for the same step, so the player
## races their own best run. A paid feature: see paid.gd.

const EVERY := 4
const MAX_SAMPLES := 6000   # 400 seconds of race


## The recorded position at this race step. After the recorded run ends, the
## ghost stays where it stopped.
static func pos_at(track: PackedFloat32Array, steps: int) -> float:
	if track.is_empty():
		return 0.0
	var f := float(steps) / EVERY
	var i := floori(f)
	if i >= track.size() - 1:
		return track[track.size() - 1]
	return lerpf(track[i], track[i + 1], f - i)


## A run from a save file: on the track, and never backwards.
static func valid(track: PackedFloat32Array) -> bool:
	if track.size() < 2 or track.size() > MAX_SAMPLES:
		return false
	var last := 0.0
	for p in track:
		if p < last or p > RaceSim.TRACK_LENGTH_M:
			return false
		last = p
	return true
