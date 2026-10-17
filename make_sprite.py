# Make the grayscale sprite: the shared basemap sprite (road shields, airport and city icons) with every
# pixel set to the gray of the same luminance, alpha kept. Raster icons can't be recolored from the style.
#
#   python3 make_sprite.py
#
# Writes sprites/sprite{,@2x}.{json,png}; commit them. Rerun only if the shared sprite changes.
import io
import urllib.request

from PIL import Image

SRC = "https://lightfield-earth.github.io/basemap-assets/sprites/"

for name in ["sprite", "sprite@2x"]:
    for ext, convert in [("json", None), ("png", True)]:
        data = urllib.request.urlopen(f"{SRC}{name}.{ext}").read()
        if convert:
            im = Image.open(io.BytesIO(data)).convert("RGBA")
            gray = im.convert("L")   # ITU-R 601 luma; close enough for icons
            out = Image.merge("RGBA", (gray, gray, gray, im.getchannel("A")))
            out.save(f"sprites/{name}.png", optimize=True)
        else:
            open(f"sprites/{name}.json", "wb").write(data)
        print(f"sprites/{name}.{ext}")
