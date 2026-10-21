"""Gemeinsame Hilfen der StrongPoly-Materialbibliothek.

Verfahren (siehe assets/PIPELINE.md, Abschnitt "Materialbibliothek"):
  1. Jedes Material baut in Blender eine hochaufgeloeste, *periodische* Quell-Oberflaeche
     aus echter Geometrie (Steine, Bretter, Ziegel, Halme, Fasern ...) plus Shader-
     Mikrostruktur (Bump). Periodizitaet: alle Objekte liegen in der Sammlung "TILE",
     die zusaetzlich 8-mal um +-T versetzt instanziert wird; Shader-Rauschen laeuft ueber
     eine Torus-Abbildung (4D-Rauschen) bzw. ueber Objekt-lokale Koordinaten.
  2. Eine orthografische Kamera blickt senkrecht auf genau eine Kachel. Cycles rendert
     Normal- und AO-Pass sowie AOVs (albedo, rough, metal, height). Das ist ein "Bake"
     per Draufsicht: Nachbarkacheln werfen AO in die Raender -> nahtlos.
  3. numpy-Nachbearbeitung -> Albedo (sRGB), Normal (OpenGL, +Y), ORM (R AO, G Rauheit, B Metall), Hoehe.
  4. Downscale mit Normalen-Renormierung (+ Toksvig-Roughness) auf 2048/1024 -> verlustfreie Quellen
     assets/src/textures/<M>/*.png, Eintrag in assets/materials.json (tile, Rueckfallwerte, info),
     WebP + Stufen per assets/blender/tools/textures.py, Nahtpruefung (2x2), Cycles-Vorschau.

Aufruf: build-materials.sh oder  bpyenv/bin/python M_Name.py [--stage all|render|post|preview]
"""
import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time

import numpy as np

import bpy
import mathutils

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
TEX_OUT = os.path.join(REPO, "packages", "client", "public", "assets", "textures")
SRC_OUT = os.path.join(REPO, "assets", "src", "materials")
DOC_OUT = os.path.join(REPO, "docs", "phase5a", "materials")
WORK = os.environ.get("STRONGPOLY_MAT_WORK") or os.path.join(tempfile.gettempdir(), "strongpoly-materials")
GAME_UNIT_M = 1.85  # 1 Spiel-Einheit ~ 1,85 m (Figur 0,95 Einheiten ~ 1,75 m)
THREADS = int(os.environ.get("STRONGPOLY_MAT_THREADS", "2"))
BLEND_MAX_BYTES = 5 * 1024 * 1024
TIER_RES = {"2k": 2048, "1k": 1024, "512": 512}
TAU = 2.0 * math.pi


def log(*a):
    print("[mat]", *a, flush=True)


# --------------------------------------------------------------------------------------
# numpy: periodisches Rauschen, Voronoi, 3D-Gradientenrauschen
# --------------------------------------------------------------------------------------

def spectral(n, seed, beta=2.0, fmin=1.0, fmax=None, aniso=(1.0, 1.0)):
    """Periodisches (kachelbares) fraktales Rauschen per Spektralsynthese, mean 0 / std 1.
    beta: Steigung des Leistungsspektrums (2 = 'Wolken', 1 = rauer). aniso=(ax, ay): ax>1
    streckt Strukturen entlang x (z. B. Holzmaserung)."""
    rng = np.random.default_rng(seed)
    w = rng.standard_normal((n, n))
    F = np.fft.rfft2(w)
    fy = np.fft.fftfreq(n)[:, None] * n * aniso[1]
    fx = np.fft.rfftfreq(n)[None, :] * n * aniso[0]
    f = np.sqrt(fx * fx + fy * fy)
    amp = np.zeros_like(f)
    m = f >= fmin
    if fmax:
        m &= f <= fmax
    amp[m] = f[m] ** (-beta / 2.0)
    out = np.fft.irfft2(F * amp, s=(n, n))
    out -= out.mean()
    out /= out.std() + 1e-12
    return out.astype(np.float32)


def spectral_rect(ny, nx, seed, beta=2.0, fmin=1.0):
    """Periodisches Rauschen auf einem Rechteckgitter (ny x nx), mean 0 / std 1."""
    rng = np.random.default_rng(seed)
    w = rng.standard_normal((ny, nx))
    F = np.fft.rfft2(w)
    fy = np.fft.fftfreq(ny)[:, None] * ny
    fx = np.fft.rfftfreq(nx)[None, :] * nx
    f = np.sqrt(fx * fx + fy * fy)
    amp = np.zeros_like(f)
    m = f >= fmin
    amp[m] = f[m] ** (-beta / 2.0)
    out = np.fft.irfft2(F * amp, s=(ny, nx))
    out -= out.mean()
    out /= out.std() + 1e-12
    return out.astype(np.float32)


def streaks(u, v, seed, n_across, n_along, beta=1.6, fmin=1.0):
    """Faserartige Streifen entlang u: Rauschen mit n_across Stuetzstellen quer (v) und nur
    n_along entlang (u), bilinear periodisch abgetastet."""
    g = spectral_rect(n_across, n_along, seed, beta=beta, fmin=fmin)
    return sample(g, u, v)


def sample(grid, u, v):
    """Bilineare, periodische Abtastung eines Gitters an Kachelkoordinaten (u, v) in [0,1)."""
    h, w = grid.shape[:2]
    x = (np.asarray(u, np.float64) % 1.0) * w - 0.5
    y = (np.asarray(v, np.float64) % 1.0) * h - 0.5
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx = (x - x0).astype(np.float32)
    fy = (y - y0).astype(np.float32)
    x0 %= w
    y0 %= h
    x1 = (x0 + 1) % w
    y1 = (y0 + 1) % h
    a = grid[y0, x0] * (1 - fx) + grid[y0, x1] * fx
    b = grid[y1, x0] * (1 - fx) + grid[y1, x1] * fx
    return a * (1 - fy) + b * fy


def worley(n, k, seed, jitter=0.9, aspect=(1.0, 1.0), return_vec=False):
    """Periodisches Worley-Rauschen auf n x n Pixeln mit k x k Zellen.
    Liefert F1, F2 (in Zellen-Einheiten) und Zellen-ID."""
    rng = np.random.default_rng(seed)
    pts = rng.random((k, k, 2)) * jitter + (1.0 - jitter) * 0.5
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = (xs + 0.5) / n * k
    cy = (ys + 0.5) / n * k
    ix = np.floor(cx).astype(np.int64)
    iy = np.floor(cy).astype(np.int64)
    F1 = np.full((n, n), 1e9, np.float32)
    F2 = np.full((n, n), 1e9, np.float32)
    ID = np.zeros((n, n), np.int64)
    DX = np.zeros((n, n), np.float32)
    DY = np.zeros((n, n), np.float32)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            nx = ix + ox
            ny = iy + oy
            p = pts[ny % k, nx % k]
            dx = (nx + p[..., 0] - cx) * aspect[0]
            dy = (ny + p[..., 1] - cy) * aspect[1]
            d = np.sqrt(dx * dx + dy * dy)
            cid = (ny % k) * k + (nx % k)
            closer = d < F1
            F2 = np.where(closer, F1, np.minimum(F2, d))
            ID = np.where(closer, cid, ID)
            if return_vec:
                DX = np.where(closer, -dx, DX)
                DY = np.where(closer, -dy, DY)
            F1 = np.where(closer, d, F1)
    if return_vec:
        return F1, F2, ID, DX, DY  # DX/DY: Pixel relativ zum Zellpunkt (Zellen-Einheiten)
    return F1, F2, ID


def blur(a, sigma):
    from scipy import ndimage
    if a.ndim == 3:
        return np.stack([ndimage.gaussian_filter(a[..., i], sigma, mode="wrap") for i in range(a.shape[2])], -1)
    return ndimage.gaussian_filter(a, sigma, mode="wrap")


_G3 = np.array([[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
                [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1], [1, 1, 0], [-1, 1, 0], [0, -1, 1], [0, -1, -1]],
               np.float64)


def _hash(ix, iy, iz, seed):
    with np.errstate(over="ignore"):
        h = (ix.astype(np.uint32) * np.uint32(0x8DA6B343)) ^ (iy.astype(np.uint32) * np.uint32(0xD8163841)) \
            ^ (iz.astype(np.uint32) * np.uint32(0xCB1AB31F)) ^ np.uint32((seed * 0x9E3779B1) & 0xFFFFFFFF)
        h ^= h >> np.uint32(15)
        h *= np.uint32(0x2C1B3C6D)
        h ^= h >> np.uint32(12)
        h *= np.uint32(0x297A2D39)
        h ^= h >> np.uint32(15)
    return h


def noise3(p, seed=0):
    """Vektorisiertes 3D-Gradientenrauschen (Perlin), Werte etwa in [-1, 1]. p: (N,3)."""
    p = np.asarray(p, np.float64)
    pi = np.floor(p)
    pf = p - pi
    pi = pi.astype(np.int64)
    u = pf * pf * pf * (pf * (pf * 6 - 15) + 10)
    res = np.zeros(len(p))
    for dx in (0, 1):
        wx = u[:, 0] if dx else 1 - u[:, 0]
        for dy in (0, 1):
            wy = u[:, 1] if dy else 1 - u[:, 1]
            for dz in (0, 1):
                wz = u[:, 2] if dz else 1 - u[:, 2]
                g = _G3[_hash(pi[:, 0] + dx, pi[:, 1] + dy, pi[:, 2] + dz, seed) & np.uint32(15)]
                d = pf - np.array([dx, dy, dz], np.float64)
                res += wx * wy * wz * np.einsum("ij,ij->i", g, d)
    return res


def fbm3(p, seed=0, octaves=4, lac=2.0, gain=0.5):
    p = np.asarray(p, np.float64)
    tot = np.zeros(len(p))
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        tot += amp * noise3(p * (lac ** o), seed + 101 * o)
        norm += amp
        amp *= gain
    return tot / norm


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# --------------------------------------------------------------------------------------
# Geometrie aus numpy
# --------------------------------------------------------------------------------------

def mesh_from_arrays(name, verts, faces, point_attrs=None, face_attrs=None, smooth=True, uv=None,
                     material=None, collection=None):
    """verts (N,3); faces: (F,k)-Array (k=3/4) oder Liste von (F,k)-Arrays gemischter Groesse.
    point_attrs: {name: (N,) float | (N,3) vector}; face_attrs analog je Flaeche.
    uv: (L,2) je Loop in Flaechen-Reihenfolge. Gibt das Objekt zurueck."""
    verts = np.asarray(verts, np.float32)
    if isinstance(faces, (list, tuple)):
        flist = [np.asarray(f, np.int64) for f in faces if len(f)]
    else:
        flist = [np.asarray(faces, np.int64)]
    sizes = np.concatenate([np.full(len(f), f.shape[1], np.int64) for f in flist])
    loops = np.concatenate([f.ravel() for f in flist]).astype(np.int32)
    starts = np.concatenate([[0], np.cumsum(sizes)[:-1]]).astype(np.int32)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts))
    me.vertices.foreach_set("co", verts.ravel())
    me.loops.add(len(loops))
    me.loops.foreach_set("vertex_index", loops)
    me.polygons.add(len(sizes))
    me.polygons.foreach_set("loop_start", starts)
    me.update(calc_edges=True)
    me.validate(clean_customdata=False)
    if smooth:
        me.polygons.foreach_set("use_smooth", np.ones(len(sizes), bool))
    for dom, attrs in (("POINT", point_attrs or {}), ("FACE", face_attrs or {})):
        for an, arr in attrs.items():
            arr = np.asarray(arr, np.float32)
            if arr.ndim == 2:
                a = me.attributes.new(an, "FLOAT_VECTOR", dom)
                a.data.foreach_set("vector", arr.ravel())
            else:
                a = me.attributes.new(an, "FLOAT", dom)
                a.data.foreach_set("value", arr.ravel())
    if uv is not None:
        uvl = me.uv_layers.new(name="UVMap")
        uvl.data.foreach_set("uv", np.asarray(uv, np.float32).ravel())
    me.update()
    ob = bpy.data.objects.new(name, me)
    if material is not None:
        me.materials.append(material)
    (collection or bpy.context.scene.collection).objects.link(ob)
    return ob


def grid(nx, ny, x0, y0, w, h):
    """Rechteckgitter (nx x ny Quads). Gibt verts (N,3) mit z=0 und quads (F,4)."""
    xs = np.linspace(x0, x0 + w, nx + 1)
    ys = np.linspace(y0, y0 + h, ny + 1)
    X, Y = np.meshgrid(xs, ys)
    v = np.stack([X.ravel(), Y.ravel(), np.zeros(X.size)], -1)
    i = np.arange((nx + 1) * (ny + 1)).reshape(ny + 1, nx + 1)
    q = np.stack([i[:-1, :-1].ravel(), i[:-1, 1:].ravel(), i[1:, 1:].ravel(), i[1:, :-1].ravel()], -1)
    return v, q


def cube_sphere(n, edge_bias=0.0):
    """Wuerfeloberflaeche [-1,1]^3 mit n x n Quads je Seite, verschweisst. edge_bias>0
    verdichtet die Punkte zu den Kanten (fuer Fasen). Gibt verts, quads."""
    t = np.linspace(-1, 1, n + 1)
    if edge_bias > 0:
        t = np.sign(t) * (1 - (1 - np.abs(t)) ** (1 + edge_bias))
    A, B = np.meshgrid(t, t)
    a, b = A.ravel(), B.ravel()
    one = np.ones_like(a)
    idx = np.arange((n + 1) ** 2).reshape(n + 1, n + 1)
    q = np.stack([idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()], -1)
    faces = [
        (np.stack([a, b, one], -1), False), (np.stack([a, b, -one], -1), True),
        (np.stack([a, one, b], -1), True), (np.stack([a, -one, b], -1), False),
        (np.stack([one, a, b], -1), False), (np.stack([-one, a, b], -1), True),
    ]
    V, Q = [], []
    off = 0
    for v, flip in faces:
        V.append(v)
        qq = q[:, ::-1] if flip else q
        Q.append(qq + off)
        off += len(v)
    V = np.concatenate(V)
    Q = np.concatenate(Q)
    key = np.round(V * 1e5).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.ravel()
    return V[first], inv[Q]


def rounded_box(unit_verts, half, radius):
    """Bildet Wuerfelpunkte in [-1,1]^3 auf eine Box mit Halbachsen 'half' und Kantenradius
    'radius' ab (gerundete Kanten/Ecken). Gibt Positionen und Normalen."""
    half = np.asarray(half, np.float64)
    r = np.minimum(radius, half.min() * 0.95)
    p = unit_verts * half
    inner = np.clip(p, -(half - r), half - r)
    d = p - inner
    ln = np.linalg.norm(d, axis=1, keepdims=True)
    nrm = d / np.maximum(ln, 1e-9)
    return inner + nrm * r, nrm


def vertex_normals(verts, faces):
    """Flaechengewichtete Vertex-Normalen fuer Quads/Tris (numpy)."""
    f = np.asarray(faces)
    if f.shape[1] == 4:
        tri = np.concatenate([f[:, [0, 1, 2]], f[:, [0, 2, 3]]])
    else:
        tri = f
    v = verts
    fn = np.cross(v[tri[:, 1]] - v[tri[:, 0]], v[tri[:, 2]] - v[tri[:, 0]])
    vn = np.zeros_like(v)
    for k in range(3):
        np.add.at(vn, tri[:, k], fn)
    return vn / np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)


def slab_from_grid(top, thickness):
    """Geschlossener Koerper aus einem Oberseiten-Gitter top[(ny+1),(nx+1),3] (i quer = x, j laengs = y,
    Normale +z) und Dicke (nach -z). Gibt verts (N,3), quads (F,4)."""
    ny1, nx1 = top.shape[:2]
    bot = top.copy()
    bot[..., 2] -= thickness
    V = np.concatenate([top.reshape(-1, 3), bot.reshape(-1, 3)])
    nt = ny1 * nx1
    idx = np.arange(nt).reshape(ny1, nx1)
    qt = np.stack([idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()], -1)
    qb = qt[:, ::-1] + nt
    loop = np.concatenate([idx[0, :], idx[1:, -1], idx[-1, -2::-1], idx[-2:0:-1, 0]])
    a = loop
    b = np.roll(loop, -1)
    qr = np.stack([a, a + nt, b + nt, b], -1)
    return V, np.concatenate([qt, qb, qr])


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def rot_axis(axis, ang):
    return np.array(mathutils.Matrix.Rotation(ang, 3, mathutils.Vector(axis)))


def new_hair(name, sizes, positions, radius, curve_attrs=None, point_attrs=None, material=None, collection=None):
    """Haar-/Faser-Kurven (Cycles rendert sie als echte 3D-Kurven). sizes: Punkte je Kurve."""
    cv = bpy.data.hair_curves.new(name)
    cv.add_curves([int(s) for s in sizes])
    cv.position_data.foreach_set("vector", np.asarray(positions, np.float32).ravel())
    ra = cv.attributes.get("radius") or cv.attributes.new("radius", "FLOAT", "POINT")
    ra.data.foreach_set("value", np.asarray(radius, np.float32).ravel())
    for dom, attrs in (("CURVE", curve_attrs or {}), ("POINT", point_attrs or {})):
        for an, arr in attrs.items():
            arr = np.asarray(arr, np.float32)
            if arr.ndim == 2:
                a = cv.attributes.new(an, "FLOAT_VECTOR", dom)
                a.data.foreach_set("vector", arr.ravel())
            else:
                a = cv.attributes.new(an, "FLOAT", dom)
                a.data.foreach_set("value", arr.ravel())
    if material is not None:
        cv.materials.append(material)
    ob = bpy.data.objects.new(name, cv)
    (collection or bpy.context.scene.collection).objects.link(ob)
    return ob


# --------------------------------------------------------------------------------------
# Shader-Baukasten
# --------------------------------------------------------------------------------------

class Shader:
    """Kleiner Node-Baukasten. Alle Muster sind kachelbar: pnoise/pvoronoi nutzen eine
    Torus-Abbildung der Objekt-Koordinaten (x/T, y/T) in 4D."""

    def __init__(self, name, T):
        self.mat = bpy.data.materials.new(name)
        self.mat.use_nodes = True
        self.nt = self.mat.node_tree
        self.nt.nodes.clear()
        self.T = T if isinstance(T, (tuple, list)) else (T, T)
        self.out = self.nt.nodes.new("ShaderNodeOutputMaterial")
        self._tc = None
        self._pc = {}

    # -- Grundlagen
    def _in(self, sock, v):
        if v is None:
            return
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, sock)
        else:
            if isinstance(v, (tuple, list)) and len(v) == 3 and sock.type == "RGBA":
                v = (v[0], v[1], v[2], 1.0)
            sock.default_value = v

    def node(self, typ, inputs=None, **props):
        n = self.nt.nodes.new(typ)
        for k, v in props.items():
            setattr(n, k, v)
        for k, v in (inputs or {}).items():
            self._in(n.inputs[k], v)
        return n

    def tc(self):
        if self._tc is None:
            self._tc = self.nt.nodes.new("ShaderNodeTexCoord")
        return self._tc

    def obj(self):
        return self.tc().outputs["Object"]

    def sep(self, vec):
        n = self.node("ShaderNodeSeparateXYZ")
        self._in(n.inputs[0], vec)
        return n.outputs[0], n.outputs[1], n.outputs[2]

    def comb(self, x, y, z):
        n = self.node("ShaderNodeCombineXYZ")
        self._in(n.inputs[0], x)
        self._in(n.inputs[1], y)
        self._in(n.inputs[2], z)
        return n.outputs[0]

    def math(self, op, a, b=None, c=None, clamp=False):
        n = self.nt.nodes.new("ShaderNodeMath")
        n.operation = op
        n.use_clamp = clamp
        self._in(n.inputs[0], a)
        if b is not None:
            self._in(n.inputs[1], b)
        if c is not None:
            self._in(n.inputs[2], c)
        return n.outputs[0]

    def add(self, a, b): return self.math("ADD", a, b)
    def sub(self, a, b): return self.math("SUBTRACT", a, b)
    def mul(self, a, b): return self.math("MULTIPLY", a, b)
    def mad(self, a, b, c): return self.math("MULTIPLY_ADD", a, b, c)
    def maxi(self, a, b): return self.math("MAXIMUM", a, b)
    def mini(self, a, b): return self.math("MINIMUM", a, b)
    def pow(self, a, b): return self.math("POWER", a, b)
    def clamp01(self, a): return self.math("ADD", a, 0.0, clamp=True)

    def vmath(self, op, a, b=None, scale=None):
        n = self.nt.nodes.new("ShaderNodeVectorMath")
        n.operation = op
        self._in(n.inputs[0], a)
        if b is not None:
            self._in(n.inputs[1], b)
        if scale is not None:
            self._in(n.inputs[3], scale)
        return n.outputs[1] if op in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else n.outputs[0]

    def smooth(self, x, e0, e1):
        """smoothstep(e0, e1, x) -> 0..1 (e0 > e1 erlaubt: invertiert)."""
        n = self.node("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
        self._in(n.inputs["Value"], x)
        if e0 > e1:
            n.inputs["From Min"].default_value = e1
            n.inputs["From Max"].default_value = e0
            n.inputs["To Min"].default_value = 1.0
            n.inputs["To Max"].default_value = 0.0
        else:
            n.inputs["From Min"].default_value = e0
            n.inputs["From Max"].default_value = e1
        return n.outputs["Result"]

    def remap(self, x, a0, a1, b0=0.0, b1=1.0, clamp=True):
        n = self.node("ShaderNodeMapRange", clamp=clamp)
        self._in(n.inputs["Value"], x)
        for k, v in (("From Min", a0), ("From Max", a1), ("To Min", b0), ("To Max", b1)):
            self._in(n.inputs[k], v)
        return n.outputs["Result"]

    def _mixnode(self, dt, f, a, b, blend="MIX", clamp_res=False):
        n = self.node("ShaderNodeMix", data_type=dt)
        if dt == "RGBA":
            n.blend_type = blend
            n.clamp_result = clamp_res
        sfx = {"RGBA": "Color", "FLOAT": "Float", "VECTOR": "Vector"}[dt]
        ins = {s.identifier: s for s in n.inputs}
        outs = {s.identifier: s for s in n.outputs}
        self._in(ins["Factor_Float"], f)
        self._in(ins["A_" + sfx], a)
        self._in(ins["B_" + sfx], b)
        return outs["Result_" + sfx]

    def mixc(self, a, b, f, blend="MIX"):
        return self._mixnode("RGBA", f, a, b, blend)

    def mixf(self, a, b, f):
        return self._mixnode("FLOAT", f, a, b)

    def ramp(self, fac, stops, interp="LINEAR"):
        n = self.node("ShaderNodeValToRGB")
        cr = n.color_ramp
        cr.interpolation = interp
        while len(cr.elements) < len(stops):
            cr.elements.new(0.5)
        for el, (pos, col) in zip(cr.elements, stops):
            el.position = pos
            el.color = (col[0], col[1], col[2], 1.0) if len(col) == 3 else col
        self._in(n.inputs[0], fac)
        return n.outputs["Color"]

    def hsv(self, col, h=0.5, s=1.0, v=1.0):
        n = self.node("ShaderNodeHueSaturation")
        self._in(n.inputs["Hue"], h)
        self._in(n.inputs["Saturation"], s)
        self._in(n.inputs["Value"], v)
        self._in(n.inputs["Color"], col)
        return n.outputs[0]

    def attr(self, name, kind="GEOMETRY", out="Fac"):
        n = self.node("ShaderNodeAttribute", attribute_name=name, attribute_type=kind)
        return n.outputs[out]

    def geo(self, out):
        return self.node("ShaderNodeNewGeometry").outputs[out]

    # -- periodische Muster (Torus-Abbildung)
    def pcoords(self, seed=0):
        if seed in self._pc:
            return self._pc[seed]
        x, y, _z = self.sep(self.obj())
        a = self.mul(x, TAU / self.T[0])
        b = self.mul(y, TAU / self.T[1])
        rng = np.random.default_rng(1000 + seed)
        o = rng.uniform(-50, 50, 4)
        vec = self.comb(self.add(self.math("COSINE", a), float(o[0])), self.add(self.math("SINE", a), float(o[1])),
                        self.add(self.math("COSINE", b), float(o[2])))
        w = self.add(self.math("SINE", b), float(o[3]))
        self._pc[seed] = (vec, w)
        return vec, w

    def pnoise(self, k, detail=4.0, rough=0.5, lac=2.0, distortion=0.0, seed=0, out="Fac"):
        """Kachelbares Rauschen mit ~k Strukturen je Kachel."""
        vec, w = self.pcoords(seed)
        n = self.node("ShaderNodeTexNoise", noise_dimensions="4D")
        self._in(n.inputs["Vector"], vec)
        self._in(n.inputs["W"], w)
        n.inputs["Scale"].default_value = k / TAU
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        n.inputs["Lacunarity"].default_value = lac
        n.inputs["Distortion"].default_value = distortion
        return n.outputs[out]

    def pvoronoi(self, k, feature="F1", seed=0, rand=1.0, metric="EUCLIDEAN", out="Distance"):
        vec, w = self.pcoords(seed)
        n = self.node("ShaderNodeTexVoronoi", voronoi_dimensions="4D", feature=feature, distance=metric)
        self._in(n.inputs["Vector"], vec)
        self._in(n.inputs["W"], w)
        n.inputs["Scale"].default_value = k / TAU
        n.inputs["Randomness"].default_value = rand
        return n.outputs[out]

    def noise(self, vec, scale, detail=4.0, rough=0.5, distortion=0.0, w=None, out="Fac", lac=2.0):
        """Nicht periodisches 3D/4D-Rauschen auf beliebigem Vektor (z. B. Objekt-lokal)."""
        n = self.node("ShaderNodeTexNoise", noise_dimensions="4D" if w is not None else "3D")
        self._in(n.inputs["Vector"], vec)
        if w is not None:
            self._in(n.inputs["W"], w)
        for k, v in (("Scale", scale), ("Detail", detail), ("Roughness", rough), ("Distortion", distortion),
                     ("Lacunarity", lac)):
            self._in(n.inputs[k], v)
        return n.outputs[out]

    def voronoi(self, vec, scale, feature="F1", rand=1.0, w=None, out="Distance"):
        n = self.node("ShaderNodeTexVoronoi", voronoi_dimensions="4D" if w is not None else "3D", feature=feature)
        self._in(n.inputs["Vector"], vec)
        if w is not None:
            self._in(n.inputs["W"], w)
        self._in(n.inputs["Scale"], scale)
        self._in(n.inputs["Randomness"], rand)
        return n.outputs[out]

    # -- Bilder aus numpy (Gitter-Orientierung: Zeile 0 = y=0 unten), kachelnd ueber Objekt-Koord./T
    def img(self, image, interp="Cubic", out="Color", scale=(1.0, 1.0)):
        n = self.node("ShaderNodeTexImage", image=image, interpolation=interp, extension="REPEAT")
        v = self.vmath("MULTIPLY", self.obj(), (scale[0] / self.T[0], scale[1] / self.T[1], 1.0))
        self._in(n.inputs["Vector"], v)
        return n.outputs[out]

    def imgf(self, image, interp="Cubic"):
        """Einkanal-Bild (in R abgelegt) als Wert."""
        r, _g, _b = self.sep(self.img(image, interp))
        return r

    # -- Abschluss: Principled + Bump + AOVs
    def finish(self, albedo, rough, metal=0.0, micro=None, alpha=None, bump_strength=1.0, translucent=None):
        bs = self.node("ShaderNodeBsdfPrincipled")
        self._in(bs.inputs["Base Color"], albedo)
        self._in(bs.inputs["Roughness"], rough)
        self._in(bs.inputs["Metallic"], metal)
        if alpha is not None:
            self._in(bs.inputs["Alpha"], alpha)
        if micro is not None:
            b = self.node("ShaderNodeBump")
            b.inputs["Distance"].default_value = 1.0
            b.inputs["Strength"].default_value = bump_strength
            self._in(b.inputs["Height"], micro)
            self.nt.links.new(b.outputs["Normal"], bs.inputs["Normal"])
        self.nt.links.new(bs.outputs[0], self.out.inputs["Surface"])
        for nm, val, col in (("albedo", albedo, True), ("rough", rough, False), ("metal", metal, False)):
            a = self.node("ShaderNodeOutputAOV", aov_name=nm)
            self._in(a.inputs["Color" if col else "Value"], val)
        _x, _y, z = self.sep(self.obj())
        h = self.add(z, micro) if micro is not None else z
        a = self.node("ShaderNodeOutputAOV", aov_name="height")
        self._in(a.inputs["Value"], h)
        return self.mat


# --------------------------------------------------------------------------------------
# Hoehenfeld-Materialien: numpy-Karten -> verschobene Ebene (echte Geometrie) + Bump-Rest
# --------------------------------------------------------------------------------------

def image_from_array(name, arr):
    """numpy (h,w) / (h,w,3) / (h,w,4) float (Gitter-Orientierung, Zeile 0 = unten) -> bpy-Bild."""
    a = np.asarray(arr, np.float32)
    if a.ndim == 2:
        a = np.stack([a, a, a], -1)
    if a.shape[2] == 3:
        a = np.concatenate([a, np.ones(a.shape[:2] + (1,), np.float32)], -1)
    h, w = a.shape[:2]
    im = bpy.data.images.new(name, w, h, alpha=True, float_buffer=True)
    im.colorspace_settings.name = "Non-Color"
    im.pixels.foreach_set(a.ravel())
    im.update()
    return im


def pix_coords(n, T):
    """Pixelmitten-Koordinaten (Meter) in Gitter-Orientierung: X[iy, ix], Y[iy, ix]."""
    T = T if isinstance(T, (tuple, list)) else (T, T)
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32)
    return (xs + 0.5) / n * T[0], (ys + 0.5) / n * T[1]


def poisson_torus(rng, T, radius_fn, n_try, gap=0.0, existing=None):
    """Dart-Throwing mit variablen Radien auf dem Torus [0,Tx)x[0,Ty).
    radius_fn(rng) -> Radius des Kandidaten. Gibt (N,2) Punkte, (N,) Radien."""
    T = np.asarray(T if isinstance(T, (tuple, list)) else (T, T), np.float64)
    P = np.zeros((0, 2)) if existing is None else existing[0]
    R = np.zeros(0) if existing is None else existing[1]
    for _ in range(n_try):
        r = radius_fn(rng)
        c = rng.random(2) * T
        if len(P):
            d = np.abs(P - c)
            d = np.minimum(d, T - d)
            dist = np.sqrt((d ** 2).sum(1))
            if (dist < R + r + gap).any():
                continue
        P = np.vstack([P, c])
        R = np.append(R, r)
    return P, R


def cells_weighted(points, weights, n, T, k=10, aniso=(1.0, 1.0)):
    """Periodische, additiv gewichtete Voronoi-Zellen auf n x n Pixel.
    d_i = |p - c_i| - w_i. Liefert d1, d2 (gewichtet), ID und Abstand zum Zentrum."""
    from scipy.spatial import cKDTree
    T = (T, T) if not isinstance(T, (tuple, list)) else T
    a = np.asarray(aniso, np.float64)
    pts = np.asarray(points, np.float64) * a
    box = np.asarray(T, np.float64) * a
    tree = cKDTree(pts % box, boxsize=box)
    X, Y = pix_coords(n, T)
    q = np.stack([X.ravel() * a[0], Y.ravel() * a[1]], -1)
    dist, idx = tree.query(q, k=min(k, len(pts)))
    wd = dist - np.asarray(weights)[idx]
    o = np.argsort(wd, axis=1)
    d1 = np.take_along_axis(wd, o[:, :1], 1)[:, 0]
    d2 = np.take_along_axis(wd, o[:, 1:2], 1)[:, 0]
    i1 = np.take_along_axis(idx, o[:, :1], 1)[:, 0]
    r1 = np.take_along_axis(dist, o[:, :1], 1)[:, 0]
    sh = (n, n)
    return d1.reshape(sh).astype(np.float32), d2.reshape(sh).astype(np.float32), i1.reshape(sh), \
        r1.reshape(sh).astype(np.float32)


def cell_stones(rng, n, T, P, R, aniso=(1.0, 1.0), gap=0.012, round_frac=0.45, dome=0.25, height=None,
                surf_amp=0.08, seed=0, gap_noise=0.5, weight_frac=0.35):
    """Dicht gepackte, gerundete Steine als Hoehenfeld (Meter) aus gewichteten Voronoi-Zellen.
    P,R: Zentren/Radien (z. B. aus poisson_torus). Liefert dict mit H (nur Steine, -inf in Fugen
    nicht: Fugen = 0-Profil), stone-Maske, ID, e (Abstand zur Fuge), rel (Abstand Zentrum/Radius)."""
    T2 = T if isinstance(T, (tuple, list)) else (T, T)
    d1, d2, ID, r1 = cells_weighted(P, R * weight_frac, n, T2, aniso=aniso)
    px = T2[0] / n
    e = (d2 - d1) * 0.5  # ~ Abstand zur Zellgrenze (Meter, im aniso-Mass)
    gn = sample(spectral(256, seed + 1, beta=2.2, fmin=3), *[a / t for a, t in zip(pix_coords(n, T2), T2)])
    g = gap * (1.0 + gap_noise * gn)
    ee = e - g * 0.5
    Ri = R[ID]
    band = np.maximum(Ri * round_frac, 2 * px)
    t = np.clip(ee / band, 0.0, 1.0)
    prof = np.sqrt(np.clip(1.0 - (1.0 - t) ** 2, 0.0, 1.0))  # Viertelkreis-Fase
    X, Y = pix_coords(n, T2)
    c = P[ID]
    dx = (X - c[..., 0] + T2[0] / 2) % T2[0] - T2[0] / 2
    dy = (Y - c[..., 1] + T2[1] / 2) % T2[1] - T2[1] / 2
    rel = np.sqrt((dx * aniso[0]) ** 2 + (dy * aniso[1]) ** 2) / np.maximum(Ri, 1e-4)
    hgt = height if height is not None else Ri * 0.6
    hi = np.asarray(hgt)[ID] if np.ndim(hgt) else hgt
    # unregelmaessige Oberflaeche: je Stein versetztes Rauschen, leichte Schraeglage
    nz = spectral(n, seed + 2, beta=2.6, fmin=2)
    nz2 = spectral(n, seed + 3, beta=1.8, fmin=12)
    offs = rng.random((len(P), 2))
    o = offs[ID]
    surf = sample(nz, X / T2[0] + o[..., 0], Y / T2[1] + o[..., 1])
    surf_hf = sample(nz2, X / T2[0] + o[..., 1], Y / T2[1] + o[..., 0])
    tilt = rng.normal(0, 0.12, (len(P), 2))
    tl = tilt[ID]
    H = hi * (prof * (1.0 - dome + dome * np.clip(1.0 - rel ** 2, 0, 1))) \
        + prof * (surf * surf_amp * Ri + surf_hf * surf_amp * 0.012 + (tl[..., 0] * dx + tl[..., 1] * dy))
    stone = (ee > 0).astype(np.float32)
    return {"H": H.astype(np.float32), "stone": stone, "ID": ID, "e": ee.astype(np.float32),
            "rel": rel.astype(np.float32), "prof": prof.astype(np.float32), "X": X, "Y": Y}


def weave_curves(rng, T, n, up, amp, radius, ppc=8, jitter=0.08, slub=0.18, seed=0):
    """Gewebe aus echten Faden-Kurven (Kette entlang V, Schuss entlang U), periodisch.
    n Faeden je Richtung auf T; up(i, j) -> True, wenn Kettfaden i ueber Schussfaden j liegt.
    Liefert sizes, positions, radius (je Punkt), Kurven-Attribute (rnd, dir), Punkt-Attribut (t)."""
    p = T / n
    sizes, pos, rad, rnd, dirs, tt = [], [], [], [], [], []
    m = n * ppc
    s = np.arange(m + 1) / ppc  # Kreuzungs-Index entlang des Fadens (0..n)
    wob_g = spectral(256, seed + 1, beta=2.5, fmin=2)
    thick_g = spectral(512, seed + 2, beta=1.4, fmin=4)
    for d in (0, 1):  # 0 = Kette (entlang y), 1 = Schuss (entlang x)
        for i in range(n):
            # Hoehenprofil: an Kreuzung j ist der Faden oben (+amp) oder unten (-amp), Kosinus-Interp.
            hj = np.array([(1 if up(i, j) else -1) if d == 0 else (-1 if up(j, i) else 1) for j in range(n)], float)
            # Kreuzungen liegen bei Index j + 0.5
            jj = np.floor(s - 0.5).astype(int)
            ff = (s - 0.5) - jj
            ww = 0.5 - 0.5 * np.cos(np.pi * ff)
            z = (hj[jj % n] * (1 - ww) + hj[(jj + 1) % n] * ww) * amp
            along = s * p
            off = (i + 0.5) * p + (sample(wob_g, along / T, i / n + 0.37 * d) * jitter * p)
            r = radius * (1 + slub * sample(thick_g, along / T, i / n + 0.5 * d))
            if d == 0:
                P = np.stack([np.full_like(along, off) if np.ndim(off) == 0 else off, along, z], -1)
            else:
                P = np.stack([along, off, z], -1)
            sizes.append(len(along))
            pos.append(P)
            rad.append(r)
            rnd.append(rng.random())
            dirs.append(float(d))
            tt.append(along / T)
    return sizes, np.concatenate(pos), np.concatenate(rad), {"rnd": np.array(rnd), "dir": np.array(dirs)}, \
        {"tt": np.concatenate(tt)}


def leaf_grid(L, wfun, nx=8, ny=20, fold=0.15, curl=0.1, notch=0.0):
    """Blattflaeche als Gitter: Mittelrippe entlang +y (0..L), Halbbreite wfun(t)*L, Faltung
    entlang der Mittelrippe (fold: Anstieg je Breite), Kruemmung (curl: z ~ t^2).
    notch>0 kerbt die Spitze ein (Klee). Gibt verts (N,3), quads, lokale (s,t) je Vertex."""
    s = np.linspace(-1, 1, nx + 1)
    t = np.linspace(0, 1, ny + 1)
    Sg, Tg = np.meshgrid(s, t)
    w = wfun(Tg) * L
    y = Tg * L
    if notch > 0:
        y = y - notch * L * np.exp(-(Sg / 0.35) ** 2) * Tg ** 6
    x = Sg * w
    z = fold * np.abs(x) + curl * L * Tg ** 2
    V = np.stack([x, y, z], -1).reshape(-1, 3)
    idx = np.arange((ny + 1) * (nx + 1)).reshape(ny + 1, nx + 1)
    Q = np.stack([idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()], -1)
    st = np.stack([Sg.ravel(), Tg.ravel(), np.zeros(Sg.size)], -1)
    return V, Q, st


def blades(rng, P, L, W, azim, incl, bend, segs=5):
    """Grashalme als flache Streifen (vektorisiert). P (B,2) Fusspunkte; L, W, azim, incl (rad
    von der Senkrechten), bend (rad Zusatzneigung bis zur Spitze) je Halm.
    Gibt verts, quads, t je Vertex, Halm-Index je Vertex."""
    B = len(P)
    t = np.linspace(0, 1, segs + 1)
    th = incl[:, None] + bend[:, None] * t[None, :] ** 1.5
    ca, sa = np.cos(azim)[:, None], np.sin(azim)[:, None]
    ds = (L / segs)[:, None]
    dxy = np.sin(th) * ds
    dz = np.cos(th) * ds
    cx = np.concatenate([np.zeros((B, 1)), np.cumsum(dxy[:, :-1] * ca, 1)], 1) + P[:, :1]
    cy = np.concatenate([np.zeros((B, 1)), np.cumsum(dxy[:, :-1] * sa, 1)], 1) + P[:, 1:2]
    cz = np.concatenate([np.zeros((B, 1)), np.cumsum(dz[:, :-1], 1)], 1)
    w = W[:, None] * (1 - t[None, :] ** 2.2) * 0.5 + 1e-5
    px, py = -sa, ca
    left = np.stack([cx - px * w, cy - py * w, cz], -1)
    right = np.stack([cx + px * w, cy + py * w, cz], -1)
    V = np.stack([left, right], 2).reshape(-1, 3)  # (B, segs+1, 2)
    base = (np.arange(B) * (segs + 1) * 2)[:, None]
    k = np.arange(segs)[None, :] * 2
    q = np.stack([base + k, base + k + 2, base + k + 3, base + k + 1], -1).reshape(-1, 4)
    tv = np.repeat(np.tile(t, B), 2)
    bid = np.repeat(np.arange(B), (segs + 1) * 2)
    return V, q, tv, bid


def palette_pick(rng, n, cols, weights=None, jitter=0.06):
    """n zufaellige Farben aus einer Palette (linear), mit Helligkeits-/Farbstreuung."""
    cols = np.asarray(cols, np.float32)
    idx = rng.choice(len(cols), n, p=None if weights is None else np.asarray(weights) / np.sum(weights))
    c = cols[idx] * rng.uniform(1 - 2 * jitter, 1 + 2 * jitter, (n, 1)) * rng.uniform(1 - jitter, 1 + jitter, (n, 3))
    return np.clip(c, 0, 1)


def hf_plane(name, H, T, geo_res, material, collection, z_offset=0.0):
    """Verschobene Ebene geo_res x geo_res (Quads) aus Hoehenfeld H (Meter, periodisch)."""
    T = T if isinstance(T, (tuple, list)) else (T, T)
    v, q = grid(geo_res, geo_res, 0, 0, T[0], T[1])
    v[:, 2] = sample(H, v[:, 0] / T[0], v[:, 1] / T[1]) + z_offset
    ob = mesh_from_arrays(name, v, q, material=material, collection=collection)
    return ob


def hf_build(spec, tile, H, albedo, rough, metal=None, geo_res=1024, split_sigma=1.5, extra_micro=None,
             bump_strength=1.0, name="Surface"):
    """Standard-Aufbau fuer Hoehenfeld-Materialien. H/albedo/rough als numpy (Quellaufloesung).
    Geometrie traegt die tiefpassgefilterte Hoehe, der Bump den hochfrequenten Rest (bildgenau)."""
    T = spec.tile_m
    for nm, arr in (("H", H), ("albedo", albedo), ("rough", rough)):
        if not np.isfinite(arr).all():
            raise ValueError(f"{nm} enthaelt NaN/Inf")
    log(f"Hoehe {H.min() * 1000:.1f}..{H.max() * 1000:.1f} mm, Albedo-Mittel {albedo.reshape(-1, 3).mean(0).round(3)}")
    Hl = blur(H, split_sigma * H.shape[0] / geo_res)
    Hh = H - Hl
    S = Shader(name, T)
    alb = S.img(image_from_array(name + "_alb", albedo), interp="Linear")
    rgh = S.imgf(image_from_array(name + "_rough", rough), interp="Linear")
    met = S.imgf(image_from_array(name + "_metal", metal), interp="Linear") if metal is not None else 0.0
    micro = S.imgf(image_from_array(name + "_hhigh", Hh), interp="Cubic")
    if extra_micro is not None:
        micro = S.add(micro, extra_micro(S))
    mat = S.finish(alb, rgh, met, micro, bump_strength=bump_strength)
    return hf_plane(name, Hl, T, geo_res, mat, tile)


# --------------------------------------------------------------------------------------
# Material-Spezifikation und Ablauf
# --------------------------------------------------------------------------------------

class Spec:
    def __init__(self, name, seed, tile_m, tiers=("1k", "512"), kind="wall", ao_distance=0.05,
                 ao_strength=1.0, albedo_ao=0.0, samples=32, res=2048, description="", orientation="",
                 tint=None, roughness_factor=1.0, metalness_factor=1.0, normal_scale=1.0, alpha=False,
                 alpha_cutoff=0.5, translucency=None, atlas=None, notes="", tiled=True, cam_height=20.0,
                 height_scale_note=None, curve_shape="THICK", preview_uv_scale=1.0, game_tile=None):
        self.name = name
        self.seed = seed
        self.tile_m = tile_m if isinstance(tile_m, (tuple, list)) else (tile_m, tile_m)
        self.tiers = tiers
        self.kind = kind
        self.ao_distance = ao_distance
        self.ao_strength = ao_strength
        self.albedo_ao = albedo_ao
        self.res = int(os.environ.get("STRONGPOLY_MAT_RES", res))
        self.samples = int(os.environ.get("STRONGPOLY_MAT_SAMPLES", samples))
        self.description = description
        self.orientation = orientation
        self.tint = tint or {"hue": [-0.015, 0.015], "saturation": [0.9, 1.1], "value": [0.88, 1.08]}
        self.roughness_factor = roughness_factor
        self.metalness_factor = metalness_factor
        self.normal_scale = normal_scale
        self.alpha = alpha
        self.alpha_cutoff = alpha_cutoff
        self.translucency = translucency
        self.atlas = atlas
        self.notes = notes
        self.tiled = tiled
        self.cam_height = cam_height
        self.curve_shape = curve_shape
        self.preview_uv_scale = preview_uv_scale
        # Kachelgroesse im Spiel (Einheiten); Standard = physikalisches Mass / 1,85 m
        gt = game_tile if game_tile is not None else (self.tile_m[0] / GAME_UNIT_M)
        self.game_tile = (gt, gt * self.tile_m[1] / self.tile_m[0])

    @property
    def work(self):
        d = os.path.join(WORK, self.name)
        os.makedirs(d, exist_ok=True)
        return d


def new_scene(spec):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.render.threads_mode = "FIXED"
    s.render.threads = THREADS
    s.cycles.seed = spec.seed % 100000
    s.cycles.use_adaptive_sampling = False
    s.cycles.use_denoising = False
    s.cycles.max_bounces = 0
    s.cycles.transparent_max_bounces = 16
    s.cycles_curves.shape = spec.curve_shape
    s.render.film_transparent = True
    s.render.resolution_x = spec.res
    s.render.resolution_y = int(round(spec.res * spec.tile_m[1] / spec.tile_m[0]))
    s.render.resolution_percentage = 100
    w = bpy.data.worlds.new("World")
    w.use_nodes = True
    s.world = w
    w.light_settings.distance = spec.ao_distance
    vl = s.view_layers[0]
    vl.use_pass_normal = True
    vl.use_pass_ambient_occlusion = True
    for nm, t in (("albedo", "COLOR"), ("rough", "VALUE"), ("metal", "VALUE"), ("height", "VALUE")):
        a = vl.aovs.add()
        a.name = nm
        a.type = t
    tile = bpy.data.collections.new("TILE")
    s.collection.children.link(tile)
    cd = bpy.data.cameras.new("BakeCam")
    cd.type = "ORTHO"
    cd.ortho_scale = max(spec.tile_m)
    cd.clip_start = 0.01
    cd.clip_end = spec.cam_height * 2 + 10
    cam = bpy.data.objects.new("BakeCam", cd)
    cam.location = (spec.tile_m[0] / 2, spec.tile_m[1] / 2, spec.cam_height)
    s.collection.objects.link(cam)
    s.camera = cam
    return s, tile


def tile_instances(tile, T):
    """8 Nachbar-Instanzen der Kachel-Sammlung -> nahtlose AO/Ueberhaenge an den Raendern."""
    s = bpy.context.scene
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            if ox == 0 and oy == 0:
                continue
            e = bpy.data.objects.new(f"TILE_{ox}_{oy}", None)
            e.instance_type = "COLLECTION"
            e.instance_collection = tile
            e.location = (ox * T[0], oy * T[1], 0)
            s.collection.objects.link(e)


def render_exr(path):
    s = bpy.context.scene
    s.render.image_settings.media_type = "MULTI_LAYER_IMAGE"
    s.render.image_settings.file_format = "OPEN_EXR_MULTILAYER"
    s.render.image_settings.color_depth = "32"
    s.render.image_settings.exr_codec = "ZIP"
    s.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    log(f"render {os.path.basename(path)} {s.render.resolution_x}x{s.render.resolution_y} "
        f"spp={s.cycles.samples} {time.time() - t:.1f}s")


def load_exr(path):
    import OpenEXR
    f = OpenEXR.File(path, separate_channels=True)
    ch = {}
    for p in f.parts:
        for k, v in p.channels.items():
            ch[k.replace("ViewLayer.", "")] = np.asarray(v.pixels, np.float32)
    P = {
        "alpha": ch["Combined.A"],
        "normal": np.stack([ch["Normal.X"], ch["Normal.Y"], ch["Normal.Z"]], -1),
        "ao": ch["Ambient Occlusion.R"],
        "albedo": np.stack([ch["albedo.R"], ch["albedo.G"], ch["albedo.B"]], -1),
        "rough": ch["rough.X"],
        "metal": ch["metal.X"],
        "height": ch["height.X"],
    }
    return P


# --------------------------------------------------------------------------------------
# Nachbearbeitung, Downscale, Kodierung
# --------------------------------------------------------------------------------------

def lin2srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def srgb2lin(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.04045, x / 12.92, np.power((x + 0.055) / 1.055, 2.4))


def dilate_fill(img, mask, iters=12):
    """Push-pull-artiges Auffuellen leerer (mask==0) Pixel mit Nachbarfarben (Alpha-Raender)."""
    from scipy import ndimage
    out = img.copy()
    m = mask.astype(bool)
    if m.all():
        return out
    idx = ndimage.distance_transform_edt(~m, return_distances=False, return_indices=True)
    return out[idx[0], idx[1]]


def postprocess(spec, P, extra=None):
    """Pass-Daten -> Master-Karten (float, Quellaufloesung)."""
    a = P["alpha"]
    cov = a > 1e-3
    inv = np.where(cov, 1.0 / np.maximum(a, 1e-3), 0.0)
    alb = P["albedo"] * inv[..., None] if spec.alpha else P["albedo"].copy()
    rough = P["rough"] * inv if spec.alpha else P["rough"].copy()
    metal = P["metal"] * inv if spec.alpha else P["metal"].copy()
    h = P["height"] * inv if spec.alpha else P["height"].copy()
    n = P["normal"].copy()
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    n[..., 2] = np.maximum(n[..., 2], 0.08)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    ao = P["ao"] * inv if spec.alpha else P["ao"].copy()
    ao = np.clip(ao, 0, 1)
    ao = blur(ao, 0.8) if spec.tiled else ao
    ao = 1.0 - (1.0 - ao) * spec.ao_strength
    if spec.albedo_ao > 0:
        alb = alb * np.power(np.clip(ao, 0.05, 1), spec.albedo_ao)[..., None]
    if spec.alpha:
        m = a > 0.5
        alb = dilate_fill(alb, m)
        n = dilate_fill(n, m)
        rough = dilate_fill(rough, m)
        metal = dilate_fill(metal, m)
        ao = dilate_fill(ao, m)
        h = dilate_fill(h, m)
        hv = h[m]
    else:
        hv = h
    lo, hi = np.percentile(hv, 0.05), np.percentile(hv, 99.95)
    hn = np.clip((h - lo) / max(hi - lo, 1e-6), 0, 1)
    M = {
        "albedo": np.clip(alb, 0, 1).astype(np.float32),
        "normal": n.astype(np.float32),
        "rough": np.clip(rough, 0.02, 1).astype(np.float32),
        "metal": np.clip(metal, 0, 1).astype(np.float32),
        "ao": np.clip(ao, 0, 1).astype(np.float32),
        "height": hn.astype(np.float32),
        "alpha": np.clip(a, 0, 1).astype(np.float32),
        "height_range_m": [float(lo), float(hi)],
    }
    if extra:
        extra(M)
    return M


def _down2(x, periodic):
    if x.shape[0] % 2 or x.shape[1] % 2:
        raise ValueError("ungerade Groesse")
    return 0.25 * (x[0::2, 0::2] + x[1::2, 0::2] + x[0::2, 1::2] + x[1::2, 1::2])


def downscale(M, res, periodic=True):
    """Box-Downscale bis zur Zielaufloesung; Albedo linear gemittelt, Normalen renormiert,
    Roughness per Toksvig an die verlorene Normalen-Varianz angepasst."""
    R = {k: v for k, v in M.items() if isinstance(v, np.ndarray)}
    while R["albedo"].shape[1] > res:
        n_avg = _down2(R["normal"], periodic)
        ln = np.linalg.norm(n_avg, axis=-1)
        var = np.clip((1 - ln) / np.maximum(ln, 1e-4), 0, 1)
        r = _down2(R["rough"], periodic)
        r = np.sqrt(np.clip(r * r + 0.5 * var, 0, 1))
        R = {k: _down2(v, periodic) for k, v in R.items() if k not in ("normal", "rough")} | {
            "normal": n_avg / np.maximum(ln[..., None], 1e-6), "rough": r}
    return R


def to8(x):
    return np.clip(np.round(x * 255.0), 0, 255).astype(np.uint8)


def pack_maps(R, spec):
    alb = to8(lin2srgb(R["albedo"]))
    if spec.alpha:
        alb = np.concatenate([alb, to8(R["alpha"])[..., None]], -1)
    nrm = to8(R["normal"] * 0.5 + 0.5)
    orm = np.stack([to8(R["ao"]), to8(R["rough"]), to8(R["metal"]), to8(R["height"])], -1)
    return {"albedo": alb, "normal": nrm, "orm": orm}


def save_png(arr, path):
    from PIL import Image
    Image.fromarray(arr).save(path, optimize=False, compress_level=6)


def basisu_path():
    p = os.environ.get("BASISU")
    if p and os.path.exists(p):
        return p
    cand = os.path.join(WORK, "_tools", "node_modules", "basis_universal", "bin", "basisu")
    if os.path.exists(cand):
        return cand
    return shutil.which("basisu")


# Kodier-Profile (Ergebnis der Formatpruefung, siehe PIPELINE.md)
KTX2_ARGS = {
    # Albedo/ORM: ETC1S (klein, transkodiert zu BC7/ASTC/ETC); Normal: UASTC + RDO + Zstandard
    "albedo": ["-q", "255", "-comp_level", "2"],
    "normal": ["-uastc", "-uastc_level", "2", "-uastc_rdo_l", "2.0", "-ktx2_zstandard_level", "19", "-linear",
               "-normal_map", "-mip_renorm"],
    "orm": ["-q", "255", "-comp_level", "2", "-linear"],
}


def encode_ktx2(png, out, kind, extra=None):
    bu = basisu_path()
    if not bu:
        raise RuntimeError("basisu nicht gefunden (build-materials.sh installiert es)")
    args = [bu, "-ktx2", "-mipmap", "-max_threads", str(THREADS)] + KTX2_ARGS[kind] + (extra or []) + ["-file", png, "-output_file", out]
    r = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if r.returncode != 0 or not os.path.exists(out):
        raise RuntimeError("basisu fehlgeschlagen: " + r.stdout[-2000:])


def encode_webp(arr, out, kind):
    from PIL import Image
    im = Image.fromarray(arr)
    if kind == "normal":
        im.save(out, "WEBP", lossless=True, quality=100, method=6)
    else:
        im.save(out, "WEBP", quality=90, method=6, alpha_quality=100)


# --------------------------------------------------------------------------------------
# Nahtpruefung
# --------------------------------------------------------------------------------------

def seam_metric(img):
    """Verhaeltnis Randsprung / mittlerer Nachbarsprung (horizontal, vertikal). ~1 = nahtlos."""
    x = img.astype(np.float32)
    inner_h = np.abs(np.diff(x, axis=1)).mean()
    inner_v = np.abs(np.diff(x, axis=0)).mean()
    edge_h = np.abs(x[:, 0] - x[:, -1]).mean()
    edge_v = np.abs(x[0] - x[-1]).mean()
    return float(edge_h / max(inner_h, 1e-6)), float(edge_v / max(inner_v, 1e-6))


def save_seam_sheet(maps, path):
    """2x2-Kachelung von Albedo | Normal | ORM nebeneinander (je 2x 512)."""
    from PIL import Image
    tiles = []
    for k in ("albedo", "normal", "orm"):
        a = maps[k]
        if a.shape[-1] == 4:
            a = a[..., :3]
        a = np.tile(a, (2, 2, 1))
        tiles.append(a)
    sheet = np.concatenate(tiles, 1)
    Image.fromarray(sheet).save(path, quality=88)


# --------------------------------------------------------------------------------------
# Vorschau (Cycles): Wandstueck mit Kante + Kugel, 2x2 gekachelt, Streiflicht
# --------------------------------------------------------------------------------------

def _box_uv_mesh(name, sx, sy, sz, T, mat):
    """Achsparallele Box [0,sx]x[0,sy]x[0,sz] mit UV = Flaechenkoordinaten / T (U rechts, V oben)."""
    V, F, UV = [], [], []
    Tu, Tv = T

    def quad(p0, du, dv, lu, lv):
        base = len(V)
        p0 = np.array(p0, float)
        du = np.array(du, float)
        dv = np.array(dv, float)
        for (a, b) in ((0, 0), (1, 0), (1, 1), (0, 1)):
            V.append(p0 + du * a * lu + dv * b * lv)
            UV.append((a * lu / Tu, b * lv / Tv))
        F.append([base, base + 1, base + 2, base + 3])

    quad((0, 0, 0), (1, 0, 0), (0, 0, 1), sx, sz)            # vorne (-Y)
    quad((sx, 0, 0), (0, 1, 0), (0, 0, 1), sy, sz)           # rechts (+X)
    quad((sx, sy, 0), (-1, 0, 0), (0, 0, 1), sx, sz)         # hinten (+Y)
    quad((0, sy, 0), (0, -1, 0), (0, 0, 1), sy, sz)          # links (-X)
    quad((0, 0, sz), (1, 0, 0), (0, 1, 0), sx, sy)           # oben
    quad((0, sy, 0), (1, 0, 0), (0, -1, 0), sx, sy)          # unten
    ob = mesh_from_arrays(name, np.array(V), np.array(F), smooth=False, uv=np.array(UV), material=mat)
    return ob


def _preview_material(spec, tdir):
    def from_png(k):  # ausgelieferte WebP-Datei der Stufe Mittel (1024)
        p = os.path.join(tdir, f"{k}_1024.webp")
        return p if os.path.exists(p) else os.path.join(tdir, f"{k}.webp")
    m = bpy.data.materials.new(spec.name + "_preview")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "UVMap"

    def img(k, noncolor):
        im = bpy.data.images.load(from_png(k))
        im.colorspace_settings.name = "Non-Color" if noncolor else "sRGB"
        if k == "albedo" and spec.alpha:
            im.alpha_mode = "STRAIGHT"
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = im
        n.interpolation = "Linear"
        nt.links.new(uvn.outputs[0], n.inputs[0])
        return n

    a = img("albedo", False)
    nm = img("normal", True)
    o = img("orm", True)
    nt.links.new(a.outputs["Color"], bs.inputs["Base Color"])
    if spec.alpha:
        nt.links.new(a.outputs["Alpha"], bs.inputs["Alpha"])
        if spec.translucency:
            bs.inputs["Subsurface Weight"].default_value = 0.0
            bs.inputs["Transmission Weight"].default_value = 0.0
            # dünne Blätter: Translucent-Anteil per Mix
    sp = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(o.outputs["Color"], sp.inputs[0])
    rmul = nt.nodes.new("ShaderNodeMath")
    rmul.operation = "MULTIPLY"
    rmul.inputs[1].default_value = spec.roughness_factor
    nt.links.new(sp.outputs[1], rmul.inputs[0])
    nt.links.new(rmul.outputs[0], bs.inputs["Roughness"])
    nt.links.new(sp.outputs[2], bs.inputs["Metallic"])
    nmn = nt.nodes.new("ShaderNodeNormalMap")
    nmn.uv_map = "UVMap"
    nmn.inputs["Strength"].default_value = spec.normal_scale
    nt.links.new(nm.outputs["Color"], nmn.inputs["Color"])
    nt.links.new(nmn.outputs[0], bs.inputs["Normal"])
    surf = bs.outputs[0]
    if spec.alpha and spec.translucency:
        tr = nt.nodes.new("ShaderNodeBsdfTranslucent")
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        ins = {s.identifier: s for s in mul.inputs}
        ins["Factor_Float"].default_value = 1.0
        nt.links.new(a.outputs["Color"], ins["A_Color"])
        c = spec.translucency.get("color", (0.9, 1.0, 0.5))
        ins["B_Color"].default_value = (c[0], c[1], c[2], 1)
        nt.links.new([s for s in mul.outputs if s.identifier == "Result_Color"][0], tr.inputs["Color"])
        tr_n = nt.nodes.new("ShaderNodeMixShader")
        tr_n.inputs[0].default_value = spec.translucency.get("weight", 0.3)
        nt.links.new(bs.outputs[0], tr_n.inputs[1])
        nt.links.new(tr.outputs[0], tr_n.inputs[2])
        tp = nt.nodes.new("ShaderNodeBsdfTransparent")
        am = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(a.outputs["Alpha"], am.inputs[0])
        nt.links.new(tp.outputs[0], am.inputs[1])
        nt.links.new(tr_n.outputs[0], am.inputs[2])
        surf = am.outputs[0]
    nt.links.new(surf, out.inputs["Surface"])
    return m


def _look_at(ob, target):
    d = mathutils.Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def render_preview(spec, tdir, out_jpg, samples=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.render.threads_mode = "FIXED"
    s.render.threads = THREADS
    s.cycles.samples = samples or int(os.environ.get("STRONGPOLY_PREVIEW_SAMPLES", 64))
    s.cycles.use_adaptive_sampling = True
    s.cycles.use_denoising = True
    try:
        s.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    s.cycles.max_bounces = 4
    s.cycles.transparent_max_bounces = 64
    s.render.resolution_x = 1280
    s.render.resolution_y = 720
    s.view_settings.view_transform = "AgX"
    s.view_settings.look = "None"
    w = bpy.data.worlds.new("W")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.42, 0.52, 0.68, 1)
    bg.inputs["Strength"].default_value = 0.45
    s.world = w
    # Vorschau im Spielmassstab: eine Wiederholung = tile (Spiel-Einheiten) * 1,85 m
    T = (spec.game_tile[0] * GAME_UNIT_M, spec.game_tile[1] * GAME_UNIT_M)
    Tm = max(T)
    mat = _preview_material(spec, tdir)
    gm = bpy.data.materials.new("ground")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.16, 0.15, 0.14, 1)
    gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    sun_d = mathutils.Vector((-0.75, 0.35, -0.55)).normalized()
    if spec.kind == "wall":
        sx, sy, sz = 2 * T[0], 0.6 * Tm, 2 * T[1]
        box = _box_uv_mesh("Wall", sx, sy, sz, T, mat)
        box.location = (-sx, 0, 0)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=0.5 * Tm,
                                             location=(0.75 * Tm, -0.55 * Tm, 0.5 * Tm))
        sph = bpy.context.active_object
        gv, gq = grid(1, 1, -12 * Tm, -12 * Tm, 24 * Tm, 24 * Tm)
        mesh_from_arrays("Ground", gv, gq, smooth=False, material=gm)
        target = (-0.45 * Tm, 0.0, 0.95 * Tm)
        cam_dir = mathutils.Vector((0.42, -1.0, 0.30)).normalized()
        dist = 7.6 * Tm
    elif spec.kind == "ground":
        gv, gq = grid(1, 1, -1.5 * T[0], -1.0 * T[1], 2 * T[0], 2 * T[1])
        uv = np.array([(0, 0), (2, 0), (2, 2), (0, 2)], float)
        mesh_from_arrays("Patch", gv, gq, smooth=False, uv=uv, material=mat)
        gv2, gq2 = grid(1, 1, -12 * Tm, -12 * Tm, 24 * Tm, 24 * Tm)
        g2 = mesh_from_arrays("Ground", gv2, gq2, smooth=False, material=gm)
        g2.location.z = -0.002
        bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=0.32 * Tm,
                                             location=(0.9 * Tm, 0.1 * Tm, 0.32 * Tm))
        sph = bpy.context.active_object
        target = (-0.35 * Tm, 0.0, 0.0)
        cam_dir = mathutils.Vector((0.25, -1.0, 0.8)).normalized()
        dist = 5.6 * Tm
        sun_d = mathutils.Vector((-0.8, 0.45, -0.32)).normalized()
    else:  # foliage
        sph = None
        _foliage_preview_bush(spec, mat)
        gv, gq = grid(1, 1, -12, -12, 24, 24)
        mesh_from_arrays("Ground", gv, gq, smooth=False, material=gm)
        target = (0.0, 0.0, 0.55)
        cam_dir = mathutils.Vector((0.35, -1.0, 0.3)).normalized()
        dist = 4.6
        sun_d = mathutils.Vector((-0.4, 0.8, -0.45)).normalized()  # Gegenlicht-Anteil
    if sph is not None:
        sph.data.materials.append(mat)
        bpy.ops.object.shade_smooth()
        uvd = sph.data.uv_layers[0].data
        uv = np.zeros(len(uvd) * 2, np.float32)
        uvd.foreach_get("uv", uv)
        uv = uv.reshape(-1, 2)
        circ = TAU * sph.dimensions.x / 2
        ku = max(1, round(circ / T[0]))
        uv[:, 0] *= ku
        uv[:, 1] *= circ / 2 / T[1]
        uvd.foreach_set("uv", uv.ravel())
        sph.data.uv_layers[0].name = "UVMap"
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 4.2
    sun.angle = math.radians(1.2)
    so = bpy.data.objects.new("Sun", sun)
    so.rotation_euler = sun_d.to_track_quat("-Z", "Y").to_euler()
    s.collection.objects.link(so)
    cd = bpy.data.cameras.new("Cam")
    cd.lens = 50
    cam = bpy.data.objects.new("Cam", cd)
    cam.location = mathutils.Vector(target) + cam_dir * dist
    _look_at(cam, target)
    s.collection.objects.link(cam)
    s.camera = cam
    s.render.image_settings.media_type = "IMAGE"
    s.render.image_settings.file_format = "JPEG"
    s.render.image_settings.quality = 88
    s.render.filepath = out_jpg
    t = time.time()
    bpy.ops.render.render(write_still=True)
    log(f"preview {os.path.basename(out_jpg)} {time.time() - t:.1f}s")


def _foliage_preview_bush(spec, mat):
    """Einfacher Busch aus Karten der Atlas-Zellen."""
    rng = np.random.default_rng(7)
    cells = spec.atlas["cells"]
    V, F, UV = [], [], []
    for i in range(46):
        c = cells[i % len(cells)]
        u0, v0, u1, v1 = c["uv"]
        w = 0.55 + rng.random() * 0.25
        h = w * (v1 - v0) / (u1 - u0)
        ang = rng.uniform(0, TAU)
        tilt = rng.uniform(0.2, 1.2)
        ctr = np.array([rng.normal(0, 0.28), rng.normal(0, 0.28), 0.25 + rng.random() * 0.75])
        R = rot_z(ang) @ rot_axis((1, 0, 0), tilt)
        base = len(V)
        for (a, b) in ((0, 0), (1, 0), (1, 1), (0, 1)):
            p = np.array([(a - 0.5) * w, (b - 0.5) * h, 0.0])
            V.append(ctr + R @ p)
            UV.append((u0 + a * (u1 - u0), v0 + b * (v1 - v0)))
        F.append([base, base + 1, base + 2, base + 3])
    mesh_from_arrays("Bush", np.array(V), np.array(F), smooth=False, uv=np.array(UV), material=mat)


# --------------------------------------------------------------------------------------
# Haupt-Ablauf
# --------------------------------------------------------------------------------------

def texel_density(spec, res):
    return round(res / spec.game_tile[0], 1)


MATERIALS_JSON = os.path.join(REPO, "assets", "materials.json")
SRC_TEX = os.path.join(REPO, "assets", "src", "textures")
TEX_TOOL = os.path.join(REPO, "assets", "blender", "tools", "textures.py")


def _hex(lin_rgb):
    c = lin2srgb(np.asarray(lin_rgb, np.float64))
    return "#" + "".join(f"{int(round(v * 255)):02x}" for v in c)


def _fmt_entry(d):
    """Eine Zeile je Material wie in assets/materials.json ueblich."""
    return "{ " + json.dumps(d, ensure_ascii=False, separators=(", ", ": "))[1:-1] + " }"


def update_library_entry(spec, M, src_res):
    """Traegt Kachelgroesse, Rueckfallwerte und Bibliotheks-Infos in assets/materials.json ein (einzige Quelle der
    Materialdaten). Bestehende Felder wie dirt/alphaTest/doubleSided bleiben erhalten."""
    import fcntl
    m = M["alpha"] > 0.5 if spec.alpha else np.ones(M["rough"].shape, bool)
    with open(MATERIALS_JSON + ".lock", "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        with open(MATERIALS_JSON, encoding="utf-8") as f:
            lib = json.load(f)
        d = lib["materials"].get(spec.name, {})
        d["base"] = _hex(M["albedo"][m].mean(0))
        d["rough"] = round(float(M["rough"][m].mean()), 2)
        d["metal"] = round(float(M["metal"][m].mean()), 2)
        d["tile"] = round(spec.game_tile[0], 3)
        d.setdefault("dirt", "#40362a")
        if spec.alpha:
            d["alphaTest"] = spec.alpha_cutoff
            d["doubleSided"] = True
        if spec.normal_scale != 1.0:
            d["normalScale"] = spec.normal_scale
        info = {
            "desc": spec.description,
            "orient": spec.orientation,
            "tileM": [spec.tile_m[0], spec.tile_m[1]],
            "srcPx": src_res,
            "texelPerUnit": texel_density(spec, src_res),
            "heightMm": round((M["height_range_m"][1] - M["height_range_m"][0]) * 1000, 1),
            "tint": spec.tint,
            "script": f"assets/blender/materials/{spec.name}.py",
            "seed": spec.seed,
        }
        if spec.notes:
            info["notes"] = spec.notes
        if spec.translucency:
            info["translucency"] = spec.translucency
        if spec.atlas:
            info["atlas"] = spec.atlas
        d["info"] = info
        lib["materials"][spec.name] = d
        lines = ["{", '  "_doc": ' + json.dumps(lib["_doc"], ensure_ascii=False) + ",", '  "materials": {']
        names = list(lib["materials"].keys())
        for i, n in enumerate(names):
            lines.append(f'    "{n}": ' + _fmt_entry(lib["materials"][n]) + ("," if i < len(names) - 1 else ""))
        lines += ["  }", "}", ""]
        tmp = MATERIALS_JSON + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        os.replace(tmp, MATERIALS_JSON)
        fcntl.flock(lk, fcntl.LOCK_UN)
    try:
        os.remove(MATERIALS_JSON + ".lock")
    except OSError:
        pass


def write_sources(spec, M, src_res):
    """Verlustfreie Quellen nach assets/src/textures/<M_Name>/ (Konvention der Pipeline):
    albedo.png (sRGB, RGBA bei Alpha), normal.png (OpenGL +Y), orm.png (R AO, G Rauheit, B Metall),
    zusaetzlich height.png (16 bit, 0..1 ueber heightMm; von der Laufzeit derzeit nicht genutzt)."""
    from PIL import Image
    R = downscale(M, src_res, spec.tiled)
    maps = pack_maps(R, spec)
    d = os.path.join(SRC_TEX, spec.name)
    os.makedirs(d, exist_ok=True)
    for k in ("albedo", "normal"):
        save_png(maps[k], os.path.join(d, k + ".png"))
    save_png(np.ascontiguousarray(maps["orm"][..., :3]), os.path.join(d, "orm.png"))
    h16 = np.clip(np.round(R["height"] * 65535), 0, 65535).astype(np.uint16)
    Image.fromarray(h16).save(os.path.join(d, "height.png"))
    return R, maps


def run_texture_tool(name):
    """Werkzeug der Pipeline: Quellen -> WebP (+ _512/_1024) und Manifest."""
    r = subprocess.run([sys.executable, TEX_TOOL, f"--only={name}"], cwd=REPO, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, text=True)
    out = r.stdout.strip().splitlines()
    log("textures.py:", " | ".join(x for x in out if name in x) or (out[-1] if out else ""))
    if r.returncode != 0:
        raise RuntimeError("textures.py fehlgeschlagen:\n" + r.stdout[-2000:])
    sizes = {}
    tdir = os.path.join(TEX_OUT, name)
    for f in sorted(os.listdir(tdir)):
        if f.endswith(".webp"):
            sizes[f] = os.path.getsize(os.path.join(tdir, f))
    return sizes


def ktx2_measure(spec, maps1k):
    """Nur Messung fuer die Formatentscheidung (Phase 5B): KTX2 der 1024er Karten im Arbeitsordner."""
    out = {}
    for k, arr in maps1k.items():
        png = os.path.join(spec.work, f"{k}_1k.png")
        save_png(arr if k != "orm" else np.ascontiguousarray(arr[..., :3]), png)
        dst = os.path.join(spec.work, f"{k}_1k.ktx2")
        encode_ktx2(png, dst, k)
        out[k] = os.path.getsize(dst)
    return out


def save_blend(spec):
    tmp = os.path.join(spec.work, spec.name + ".blend")
    bpy.ops.wm.save_as_mainfile(filepath=tmp, compress=True, copy=True)
    sz = os.path.getsize(tmp)
    dst = os.path.join(SRC_OUT, spec.name + ".blend")
    os.makedirs(SRC_OUT, exist_ok=True)
    if sz <= BLEND_MAX_BYTES:
        shutil.copyfile(tmp, dst)
        log(f".blend gespeichert ({sz / 1e6:.2f} MB)")
    else:
        if os.path.exists(dst):
            os.remove(dst)
        log(f".blend zu gross ({sz / 1e6:.1f} MB) -> nur Skript (Quelle wird reproduzierbar erzeugt)")
    return sz


def run(spec, build, post_extra=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="all", choices=["all", "render", "post", "preview"])
    ap.add_argument("--ktx2", action="store_true", help="zusaetzlich KTX2 (1024) im Arbeitsordner messen")
    args, _ = ap.parse_known_args(sys.argv[1:])
    exr = os.path.join(spec.work, "passes.exr")
    os.makedirs(DOC_OUT, exist_ok=True)
    src_res = 2048 if "2k" in spec.tiers else 1024
    t0 = time.time()
    if args.stage in ("all", "render"):
        s, tile = new_scene(spec)
        build(s, tile)
        if spec.tiled:
            tile_instances(tile, spec.tile_m)
        s.cycles.samples = spec.samples
        save_blend(spec)
        render_exr(exr)
    if args.stage in ("all", "render", "post"):
        P = load_exr(exr)
        M = postprocess(spec, P, post_extra)
        np.savez_compressed(os.path.join(spec.work, "master.npz"),
                            **{k: v.astype(np.float16) for k, v in M.items() if isinstance(v, np.ndarray)})
        write_sources(spec, M, src_res)
        R1 = downscale(M, 1024, spec.tiled)
        maps1 = pack_maps(R1, spec)
        info = {"srcPx": src_res}
        if spec.tiled:
            info["seam"] = {k: [round(v, 3) for v in seam_metric(maps1[k][..., :3])] for k in maps1}
            save_seam_sheet(maps1, os.path.join(spec.work, "seam_2x2.jpg"))
        update_library_entry(spec, M, src_res)
        info["webp"] = run_texture_tool(spec.name)
        if args.ktx2:
            info["ktx2_1k"] = ktx2_measure(spec, maps1)
        with open(os.path.join(spec.work, "info.json"), "w") as f:
            json.dump(info, f, indent=1)
        log("Info:", json.dumps(info))
    if args.stage in ("all", "preview"):
        render_preview(spec, os.path.join(TEX_OUT, spec.name), os.path.join(DOC_OUT, spec.name + ".jpg"))
    log(f"{spec.name} fertig in {time.time() - t0:.0f}s")
