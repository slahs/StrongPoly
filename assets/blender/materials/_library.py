"""Bibliotheksuebersicht: Groessen der Laufzeittexturen + library.jpg (Uebersichtstafel der Vorschauen).

Liest assets/materials.json und packages/client/public/assets/textures/M_*/*.webp. Laeuft ohne bpy
(nur numpy/Pillow), wird von scripts/assets/build-materials.sh am Ende aufgerufen.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
TEX = os.path.join(REPO, "packages", "client", "public", "assets", "textures")
DOC = os.path.join(REPO, "docs", "phase5a", "materials")

# feste Liste aus assets/PIPELINE.md (Reihenfolge = Tafel)
NAMES = ["M_Stone_Ashlar", "M_Stone_Rubble", "M_Stone_Cobble", "M_Plaster_Lime", "M_Timber_Oak", "M_Wood_Planks",
         "M_Roof_ClayTile", "M_Roof_Thatch", "M_Roof_Shingle", "M_Iron_Wrought", "M_Cloth_Linen", "M_Cloth_Wool",
         "M_Leather", "M_Ground_Grass", "M_Ground_Dirt", "M_Ground_Path", "M_Rock", "M_Bark", "M_Foliage"]


def main():
    """Uebersicht der Laufzeitgroessen (WebP je Stufe) aus public/assets/textures + Tafel library.jpg."""
    with open(os.path.join(REPO, "assets", "materials.json"), encoding="utf-8") as f:
        lib = json.load(f)["materials"]
    rows = []
    tot = {}
    for nm in NAMES:
        d = os.path.join(TEX, nm)
        if not os.path.isdir(d):
            print("[lib] fehlt:", nm)
            continue
        per = {}
        for fn in os.listdir(d):
            if fn.endswith(".webp"):
                stem = fn[:-5]
                tier = stem.split("_")[1] if "_" in stem else "voll"
                per[tier] = per.get(tier, 0) + os.path.getsize(os.path.join(d, fn))
        for k, v in per.items():
            tot[k] = tot.get(k, 0) + v
        info = lib.get(nm, {}).get("info", {})
        rows.append((nm, lib.get(nm, {}).get("tile"), info.get("srcPx"), per))
    for nm, tile, src, per in rows:
        print(f"[lib] {nm:16s} tile={tile} src={src} " + " ".join(f"{k}={v / 1e6:.2f}MB" for k, v in sorted(per.items())))
    print("[lib] Summe", " ".join(f"{k}={v / 1e6:.2f}MB" for k, v in sorted(tot.items())),
          f"gesamt={sum(tot.values()) / 1e6:.2f}MB")
    sheet()


def sheet():
    from PIL import Image, ImageDraw, ImageFont
    cols, w, h = 4, 480, 270
    names = [n for n in NAMES if os.path.exists(os.path.join(DOC, n + ".jpg"))]
    rows = (len(names) + cols - 1) // cols
    pad, lab = 8, 30
    W = cols * (w + pad) + pad
    H = rows * (h + lab + pad) + pad + 50
    img = Image.new("RGB", (W, H), (24, 24, 26))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
        big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
    except OSError:
        font = big = ImageFont.load_default()
    d.text((pad, 12), "StrongPoly - PBR-Materialbibliothek (Phase 5A), Cycles-Vorschau, 2x2 gekachelt", fill=(230, 230, 230),
           font=big)
    for i, nm in enumerate(names):
        r, c = divmod(i, cols)
        x = pad + c * (w + pad)
        y = 50 + pad + r * (h + lab + pad)
        im = Image.open(os.path.join(DOC, nm + ".jpg")).convert("RGB")
        # Bildmitte (Material) bevorzugen
        iw, ih = im.size
        crop = im.crop((int(iw * 0.18), int(ih * 0.05), int(iw * 0.86), int(ih * 0.05) + int(iw * 0.68 * h / w)))
        img.paste(crop.resize((w, h), Image.LANCZOS), (x, y))
        d.text((x + 4, y + h + 4), nm, fill=(235, 235, 235), font=font)
    img.save(os.path.join(DOC, "library.jpg"), quality=88)
    print("[lib] library.jpg", img.size)


if __name__ == "__main__":
    main()
