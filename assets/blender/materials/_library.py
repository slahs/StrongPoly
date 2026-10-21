"""Bibliotheksuebersicht: library.json (Laufzeit) + library.jpg (Uebersichtstafel der Vorschauen).

Liest alle packages/client/public/assets/textures/M_*/material.json. Laeuft ohne bpy
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


def gpu_bytes(res, fmt):
    """Geschaetzter GPU-Speicher inkl. Mipmaps: KTX2 -> BC7/ASTC 4x4 (1 B/px), sonst RGBA8 (4 B/px)."""
    bpp = 1.0 if fmt == "ktx2" else 4.0
    return int(res * res * bpp * 4 / 3)


def main():
    mats = []
    tot = {}
    gpu = {}
    for nm in NAMES:
        p = os.path.join(TEX, nm, "material.json")
        if not os.path.exists(p):
            print("[lib] fehlt:", nm)
            continue
        with open(p, encoding="utf-8") as f:
            m = json.load(f)
        tiers = {}
        for t, files in m["bytes"].items():
            s = sum(files.values())
            tiers[t] = s
            tot[t] = tot.get(t, 0) + s
            fmt = "ktx2" if any(k.endswith(".ktx2") for k in files) else "webp"
            g = 3 * gpu_bytes(m["resolutions"][t], fmt)
            gpu[t] = gpu.get(t, 0) + g
        mats.append({"name": nm, "path": f"{nm}/material.json", "description": m["description"],
                     "tileSize": m["tileSize"], "tiers": m["tiers"], "resolutions": m["resolutions"],
                     "alphaMode": m["alphaMode"], "bytes": tiers})
    lib = {
        "schema": 1,
        "description": "StrongPoly PBR-Materialbibliothek (Phase 5A), prozedural in Blender erzeugt",
        "convention": {
            "maps": "albedo (sRGB), normal (OpenGL +Y, Tangentenraum), orm (R=AO, G=Roughness, B=Metallic, A=Hoehe)",
            "fileName": "{albedo,normal,orm}_{2k,1k,512}.ktx2",
            "tileSize": "Spiel-Einheiten je Texturwiederholung (1 Einheit ~ 1,85 m)",
            "qualityTiers": {"high": "2k falls vorhanden, sonst 1k", "medium": "1k", "low": "512"},
            "ktx2": "Albedo/ORM: Basis ETC1S, Normal: UASTC (+RDO, Zstandard); Mipmaps enthalten",
        },
        "materials": mats,
        "totals": {"bytesPerTier": tot, "bytesAll": sum(tot.values()),
                   "gpuBytesPerTierEstimate": gpu},
        "license": "Eigenerstellung StrongPoly, siehe assets/LICENSES.md",
    }
    with open(os.path.join(TEX, "library.json"), "w", encoding="utf-8") as f:
        json.dump(lib, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("[lib] library.json:", len(mats), "Materialien, Summe", round(sum(tot.values()) / 1e6, 2), "MB", tot)
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
