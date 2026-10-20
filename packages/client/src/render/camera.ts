import * as THREE from 'three';
import { GameMap, HEIGHT_STEP } from '@strongpoly/shared';

/** Isometrisch-perspektivische RTS-Kamera mit 90°-Rotation, Zoom und Scrollen. */
export class RtsCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Blickpunkt in Tile-Koordinaten */
  tx = 100;
  tz = 100;
  yawIndex = 0;
  yaw = Math.PI / 4;
  dist = 38;
  private distTarget = 38;
  pitch = THREE.MathUtils.degToRad(52);
  minDist = 10;
  maxDist = 90;
  bounds = { w: 200, h: 200 };
  scrollSpeed = 1.4;
  /** feste Blickrichtung (nur Prüfszenen/Screenshot-Werkzeug); null = Spielsteuerung über yawIndex */
  yawOverride: number | null = null;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(36, aspect, 0.5, 500);
  }

  /** Feste Ansicht ohne Übergänge (Prüfszenen und Screenshot-Werkzeug); yaw im Bogenmaß, Neigung in Grad */
  setView(x: number, y: number, dist: number, yaw: number, pitchDeg: number): void {
    this.maxDist = Math.max(this.maxDist, dist);
    this.minDist = Math.min(this.minDist, dist);
    this.tx = x;
    this.tz = y;
    this.dist = dist;
    this.distTarget = dist;
    this.yawOverride = yaw;
    this.yaw = yaw;
    this.pitch = THREE.MathUtils.degToRad(pitchDeg);
    this.clamp();
  }

  setAspect(a: number): void {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  rotate(dir: 1 | -1): void {
    this.yawIndex = (this.yawIndex + dir + 4) % 4;
  }

  zoom(delta: number): void {
    this.distTarget = THREE.MathUtils.clamp(this.distTarget * (1 + delta * 0.0012), this.minDist, this.maxDist);
  }

  /** Bewegt den Blickpunkt relativ zur Kamerarichtung (Eingabe in Bildschirmachsen). */
  pan(sx: number, sy: number, dt: number): void {
    const speed = this.scrollSpeed * (this.dist * 0.9 + 10) * dt;
    const f = this.forward();
    const r = { x: -f.z, z: f.x };
    this.tx += (r.x * sx + f.x * -sy) * speed;
    this.tz += (r.z * sx + f.z * -sy) * speed;
    this.clamp();
  }

  forward(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  clamp(): void {
    this.tx = THREE.MathUtils.clamp(this.tx, 0, this.bounds.w);
    this.tz = THREE.MathUtils.clamp(this.tz, 0, this.bounds.h);
  }

  lookAt(x: number, y: number): void {
    this.tx = x;
    this.tz = y;
    this.clamp();
  }

  update(dt: number, map: GameMap | null): void {
    const targetYaw = this.yawOverride ?? Math.PI / 4 + (this.yawIndex * Math.PI) / 2;
    // kürzester Weg zur Zielrotation
    let d = targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 9);
    this.dist += (this.distTarget - this.dist) * Math.min(1, dt * 10);
    let groundY = 0;
    if (map) {
      const ix = Math.min(map.w - 1, Math.max(0, Math.floor(this.tx)));
      const iy = Math.min(map.h - 1, Math.max(0, Math.floor(this.tz)));
      groundY = map.height[map.idx(ix, iy)] * HEIGHT_STEP;
    }
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    // Kamera sitzt hinter dem Blickpunkt (entgegen der Blickrichtung)
    this.camera.position.set(
      this.tx + Math.sin(this.yaw) * cp * this.dist,
      groundY + sp * this.dist,
      this.tz + Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(this.tx, groundY, this.tz);
  }

  /** Schnittpunkt eines Strahls (NDC) mit dem Höhenfeld in Tile-Koordinaten. */
  pick(ndcX: number, ndcY: number, map: GameMap): { x: number; y: number } | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    // grobes Marching, dann Verfeinern
    let t = 0;
    const step = 0.5;
    let prevT = 0;
    for (; t < 400; t += step) {
      const x = o.x + d.x * t;
      const y = o.y + d.y * t;
      const z = o.z + d.z * t;
      const tx = Math.floor(x);
      const tz = Math.floor(z);
      if (tx < -2 || tz < -2 || tx > map.w + 2 || tz > map.h + 2) {
        if (t > 20 && d.y > 0) break;
        prevT = t;
        continue;
      }
      const cx = Math.min(map.w - 1, Math.max(0, tx));
      const cz = Math.min(map.h - 1, Math.max(0, tz));
      const gy = map.height[map.idx(cx, cz)] * HEIGHT_STEP;
      if (y <= gy) {
        let lo = prevT;
        let hi = t;
        for (let k = 0; k < 8; k++) {
          const mid = (lo + hi) / 2;
          const mx = o.x + d.x * mid;
          const my = o.y + d.y * mid;
          const mz = o.z + d.z * mid;
          const mcx = Math.min(map.w - 1, Math.max(0, Math.floor(mx)));
          const mcz = Math.min(map.h - 1, Math.max(0, Math.floor(mz)));
          if (my <= map.height[map.idx(mcx, mcz)] * HEIGHT_STEP) hi = mid;
          else lo = mid;
        }
        return { x: o.x + d.x * hi, y: o.z + d.z * hi };
      }
      prevT = t;
    }
    return null;
  }
}
