class_name Paid
extends RefCounted
## The paid version. FEATURES lists every paid feature with the name its locked
## teaser shows. Game code asks Paid.has(id) and never checks payment itself.
##
## unlocked() is the one place that decides whether this player has paid.
## Connect a store purchase, an unlock code or a paid build there. Until then
## EVERYONE_PAID gives every player the paid features.

const FEATURES := {
	"ghost": "GHOST TRAIN",
}

const EVERYONE_PAID := true

## -1 gives the real answer. The headless test sets 0 or 1 to force it.
static var override := -1


static func unlocked() -> bool:
	if override >= 0:
		return override == 1
	return EVERYONE_PAID


static func has(feature: String) -> bool:
	return FEATURES.has(feature) and unlocked()


static func name_of(feature: String) -> String:
	return FEATURES.get(feature, "")
