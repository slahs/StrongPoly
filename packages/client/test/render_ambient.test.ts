import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { generateMap } from '@strongpoly/shared';
import { AmbientLife } from '../src/render/ambient';
import { QUALITY } from '../src/render/quality';

describe('Umgebungsleben (Vögel, Schmetterlinge, Blätter)', () => {
  const map = generateMap({ seed: 1, size: 96, players: 2 });
  const count = (a: AmbientLife): number => {
    let n = 0;
    for (const o of a.group.children) n += (o as THREE.Mesh).geometry instanceof THREE.InstancedBufferGeometry ? ((o as THREE.Mesh).geometry as THREE.InstancedBufferGeometry).instanceCount : 0;
    return n;
  };
  it('Niedrig: nichts; Mittel: Vögel; Hoch: zusätzlich Blätter/Staub und (nach dem Platzieren) Schmetterlinge', () => {
    const a = new AmbientLife(map);
    a.applyQuality(QUALITY.low);
    expect(a.group.children.length).toBe(0);
    a.applyQuality(QUALITY.medium);
    expect(a.group.children.length).toBe(1);
    const medium = count(a);
    expect(medium).toBeGreaterThan(5);
    expect(medium).toBeLessThanOrEqual(QUALITY.medium.ambientMax);
    a.applyQuality(QUALITY.high);
    expect(a.group.children.length).toBe(2);
    a.update(48, 48, 0, new THREE.Vector2(0.8, 0.6));
    expect(a.group.children.length).toBe(3);
    const high = count(a);
    expect(high).toBeGreaterThan(medium);
    expect(high).toBeLessThanOrEqual(QUALITY.high.ambientMax * 1.05);
  });
  it('ist deterministisch (gleiche Karte, gleiche Instanzdaten)', () => {
    const attrs = (): number[] => {
      const a = new AmbientLife(map);
      a.applyQuality(QUALITY.high);
      a.update(48, 48, 0, new THREE.Vector2(0.8, 0.6));
      const out: number[] = [];
      for (const o of a.group.children) {
        const g = (o as THREE.Mesh).geometry;
        for (const n of ['aA', 'aB']) for (const v of g.getAttribute(n).array) out.push(Math.round(v * 1000));
      }
      return out;
    };
    const x = attrs();
    expect(attrs()).toEqual(x);
    expect(x.every((v) => Number.isFinite(v))).toBe(true);
  });
  it('Schmetterlinge sitzen über Wiesen in Kameranähe', () => {
    const a = new AmbientLife(map);
    a.applyQuality(QUALITY.high);
    a.update(48, 48, 0, new THREE.Vector2(0.8, 0.6));
    const bugs = a.group.children[2] as THREE.Mesh;
    const arr = bugs.geometry.getAttribute('aA').array as Float32Array;
    for (let i = 0; i < arr.length; i += 4) {
      expect(Math.abs(arr[i] - 48)).toBeLessThanOrEqual(26);
      expect(Math.abs(arr[i + 2] - 48)).toBeLessThanOrEqual(26);
    }
  });
});
