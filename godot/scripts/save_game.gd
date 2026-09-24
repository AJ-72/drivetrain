class_name SaveGame
extends RefCounted
## Progress and settings, kept in one ConfigFile. On the web build user://
## lives in the browser's IndexedDB. A read or write error never stops the game:
## a bad or missing file loads as a fresh save, and save() reports failure so
## the screen does not claim a save that did not happen.

const PATH := "user://last_stop.cfg"
const BEST_MIN_MS := 1000
const BEST_MAX_MS := 3600000

var stars: Array[int] = []
var best_ms: Array[int] = []
var points := 0
var streak := 0
var best_streak := 0
var free_races := 0
var free_wins := 0
var free_best_ms := 0
var livery := 0
var music_on := true
var sfx_on := true


func _init() -> void:
	stars.resize(Stations.count())
	stars.fill(0)
	best_ms.resize(Stations.count())
	best_ms.fill(0)


func load_file() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(PATH) != OK:
		return
	for i in Stations.count():
		stars[i] = clampi(_int(cfg, "campaign", "stars_%d" % i, 0), 0, 3)
		best_ms[i] = _best(_int(cfg, "campaign", "best_%d" % i, 0))
	points = maxi(0, _int(cfg, "career", "points", 0))
	streak = maxi(0, _int(cfg, "career", "streak", 0))
	best_streak = maxi(0, _int(cfg, "career", "best_streak", 0))
	free_races = maxi(0, _int(cfg, "career", "races", 0))
	free_wins = maxi(0, _int(cfg, "career", "wins", 0))
	free_best_ms = _best(_int(cfg, "career", "best_ms", 0))
	livery = clampi(_int(cfg, "garage", "livery", 0), 0, Stations.LIVERIES.size() - 1)
	music_on = _bool(cfg, "settings", "music", true)
	sfx_on = _bool(cfg, "settings", "sfx", true)
	if not livery_unlocked(livery):
		livery = 0


func save() -> bool:
	var cfg := ConfigFile.new()
	for i in Stations.count():
		cfg.set_value("campaign", "stars_%d" % i, stars[i])
		cfg.set_value("campaign", "best_%d" % i, best_ms[i])
	cfg.set_value("career", "points", points)
	cfg.set_value("career", "streak", streak)
	cfg.set_value("career", "best_streak", best_streak)
	cfg.set_value("career", "races", free_races)
	cfg.set_value("career", "wins", free_wins)
	cfg.set_value("career", "best_ms", free_best_ms)
	cfg.set_value("garage", "livery", livery)
	cfg.set_value("settings", "music", music_on)
	cfg.set_value("settings", "sfx", sfx_on)
	return cfg.save(PATH) == OK


func total_stars() -> int:
	var n := 0
	for s in stars:
		n += s
	return n


func station_unlocked(i: int) -> bool:
	return i == 0 or stars[i - 1] > 0


func campaign_done() -> bool:
	return stars[Stations.count() - 1] > 0


func livery_unlocked(i: int) -> bool:
	var l: Dictionary = Stations.LIVERIES[i]
	return points >= int(l["points"]) and total_stars() >= int(l["stars"])


func _int(cfg: ConfigFile, section: String, key: String, fallback: int) -> int:
	var v = cfg.get_value(section, key, fallback)
	if typeof(v) != TYPE_INT:
		return fallback
	return v


func _bool(cfg: ConfigFile, section: String, key: String, fallback: bool) -> bool:
	var v = cfg.get_value(section, key, fallback)
	if typeof(v) != TYPE_BOOL:
		return fallback
	return v


# A stored best outside the believable range is a corrupt file, not a record.
func _best(ms: int) -> int:
	if ms < BEST_MIN_MS or ms > BEST_MAX_MS:
		return 0
	return ms
