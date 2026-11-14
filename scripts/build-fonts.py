# Builds the leaderboard fonts (D62) into public/fonts:
# - nunito-700/800: latin subset of the fontsource files (OFL).
# - checkervia-numerals: Fraunces Black digits made tabular (equal widths,
#   centred), renamed, so counts and ranks line up. OFL allows modification.
import sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# Inputs, not kept in the repository: the @fontsource/nunito 5.3.0 package
# unpacked into ./nunito, and Fraunces[SOFT,WONK,opsz,wght].ttf from
# github.com/google/fonts (ofl/fraunces) saved as ./fraunces-var.ttf.
# Needs fontTools and brotli (pip). Run from the folder with the inputs:
#   python build-fonts.py <path to public/fonts>
out = sys.argv[1]
TEXT_RANGE = list(range(0x20, 0x7F)) + [0xA0, 0xD7, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026]

def save_subset(font, unicodes, path, features=("kern", "liga", "calt", "ccmp", "locl")):
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = list(features)
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    opts.notdef_outline = True
    opts.hinting = False
    opts.desubroutinize = True
    s = subset.Subsetter(opts)
    s.populate(unicodes=unicodes)
    s.subset(font)
    font.flavor = "woff2"
    font.save(path)

for weight in (700, 800):
    f = TTFont(f"nunito/package/files/nunito-latin-{weight}-normal.woff2")
    save_subset(f, TEXT_RANGE, f"{out}/nunito-{weight}-latin.woff2")

# Numerals: Fraunces at weight 900, the other axes at their defaults.
var = TTFont("fraunces-var.ttf")
f = instancer.instantiateVariableFont(var, {"wght": 900, "opsz": 9, "SOFT": 0, "WONK": 0})
cmap = f.getBestCmap()
digits = [cmap[ord(c)] for c in "0123456789"]
hmtx = f["hmtx"]
glyf = f["glyf"]
width = max(hmtx[g][0] for g in digits)
for g in digits:
    adv, lsb = hmtx[g]
    shift = (width - adv) // 2
    glyph = glyf[g]
    if glyph.numberOfContours > 0:
        glyph.coordinates.translate((shift, 0))
        glyph.recalcBounds(glyf)
    hmtx[g] = (width, lsb + shift)
name = f["name"]
for rec in list(name.names):
    if rec.nameID in (1, 4, 16, 21):
        rec.string = "Checkervia Numerals"
    elif rec.nameID in (6, 20):
        rec.string = "CheckerviaNumerals-Black"
    elif rec.nameID == 3:
        rec.string = "CheckerviaNumerals-Black; modified from Fraunces"
save_subset(f, [0x20, 0x23, 0x25] + list(range(0x30, 0x3A)), f"{out}/checkervia-numerals.woff2", features=())
print("tabular width", width)
