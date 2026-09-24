class_name PixelFont
extends RefCounted
## A 5x7 bitmap font drawn with rectangles, so the game ships no font file and
## every letter lands on the pixel grid. Each glyph is seven rows of five bits.
## "*" draws a star.

const W := 5
const H := 7
const ADVANCE := 6

const GLYPHS := {
	"A": [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
	"B": [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
	"C": [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
	"D": [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
	"E": [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
	"F": [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
	"G": [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
	"H": [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
	"I": [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
	"J": [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
	"K": [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
	"L": [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
	"M": [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
	"N": [0b10001, 0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001],
	"O": [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
	"P": [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
	"Q": [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
	"R": [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
	"S": [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
	"T": [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
	"U": [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
	"V": [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
	"W": [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
	"X": [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
	"Y": [0b10001, 0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100],
	"Z": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
	"0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
	"1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
	"2": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
	"3": [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
	"4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
	"5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
	"6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
	"7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
	"8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
	"9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
	".": [0, 0, 0, 0, 0, 0b01100, 0b01100],
	",": [0, 0, 0, 0, 0b01100, 0b00100, 0b01000],
	":": [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
	"-": [0, 0, 0, 0b11111, 0, 0, 0],
	"/": [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
	"!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
	"?": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0, 0b00100],
	"'": [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
	"+": [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
	"(": [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
	")": [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
	"%": [0b11000, 0b11001, 0b00010, 0b00100, 0b01000, 0b10011, 0b00011],
	">": [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
	"<": [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
	"*": [0b00100, 0b00100, 0b11111, 0b01110, 0b01110, 0b11011, 0b10001],
}


static func width(text: String, scale: int = 1) -> int:
	if text.is_empty():
		return 0
	return (text.length() * ADVANCE - 1) * scale


## Draws text with its top-left corner at pos. Lowercase draws as uppercase.
static func draw(ci: CanvasItem, text: String, pos: Vector2, color: Color, scale: int = 1) -> void:
	var x := floori(pos.x)
	var y := floori(pos.y)
	for ch in text.to_upper():
		var rows = GLYPHS.get(ch)
		if rows != null:
			for r in H:
				var bits: int = rows[r]
				if bits == 0:
					continue
				for c in W:
					if bits & (1 << (W - 1 - c)):
						ci.draw_rect(Rect2(x + c * scale, y + r * scale, scale, scale), color)
		x += ADVANCE * scale


static func draw_centered(ci: CanvasItem, text: String, cx: float, y: float, color: Color, scale: int = 1) -> void:
	draw(ci, text, Vector2(cx - width(text, scale) / 2.0, y), color, scale)


## Draws text with a one-pixel drop shadow, for text over busy scenery.
static func draw_shadowed(ci: CanvasItem, text: String, pos: Vector2, color: Color, shadow: Color, scale: int = 1) -> void:
	draw(ci, text, pos + Vector2(scale, scale), shadow, scale)
	draw(ci, text, pos, color, scale)
