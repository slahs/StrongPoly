import { describe, expect, it } from 'vitest';
import { A, ARMOR_CLASSES, D, DAMAGE_TYPES, DMG_TABLE, STRONG_MIN, STRONG_RATIO, U, UNITS, WEAK_MAX, damageMult, matchups } from '../src';

const byArmor = (m: ReturnType<typeof matchups>, a: number) => m.offense.find((g) => g.armor === a);

describe('matchups(): Stark/Schwach aus DMG_TABLE', () => {
  it('Bogenschütze (Stich): Multiplikatoren stimmen mit der Tabelle überein', () => {
    const m = matchups(U.Archer);
    expect(m.dtype).toBe(D.Pierce);
    expect(m.canAttack).toBe(true);
    // Beispiele aus DMG_TABLE[Stich] = [1.0, 0.75, 0.4, 0.3, 0.2, 0.03, 0.25]
    expect(byArmor(m, A.None)?.mult).toBe(1.0);
    expect(byArmor(m, A.Light)?.mult).toBe(0.75);
    expect(byArmor(m, A.Heavy)?.mult).toBe(0.4);
    expect(byArmor(m, A.Plate)?.mult).toBe(0.3);
    expect(byArmor(m, A.BldWood)?.mult).toBe(0.2);
    expect(byArmor(m, A.BldStone)?.mult).toBe(0.03);
    expect(byArmor(m, A.SiegeEng)?.mult).toBe(0.25);
    // stark nur gegen Ungepanzerte (Leicht 0,75 liegt unter 80 % des Bestwerts)
    expect(m.strong.map((g) => g.armor)).toEqual([A.None]);
    // schwach: aufsteigend, das schwächste zuerst (Steingebäude)
    expect(m.weak.map((g) => g.armor)).toEqual([A.BldStone, A.BldWood, A.SiegeEng, A.Plate, A.Heavy]);
    // die Einheitentypen hinter „Ungepanzert“ enthalten den Bauern, den Bogenschützen selbst, aber nicht den Ochsen
    const none = byArmor(m, A.None)!;
    expect(none.units).toContain(U.Peasant);
    expect(none.units).toContain(U.Archer);
    expect(none.units).not.toContain(U.Ox);
    expect(none.building).toBe(false);
    expect(byArmor(m, A.BldWood)?.building).toBe(true);
    expect(byArmor(m, A.BldWood)?.units).toEqual([]);
  });

  it('Ritter (Platte): Verteidigung gegen jede Schadensart', () => {
    const m = matchups(U.Knight);
    expect(m.armor).toBe(A.Plate);
    expect(m.defense.map((e) => [e.dtype, e.mult])).toEqual([
      [D.Siege, 1.2],
      [D.Blunt, 0.8],
      [D.Fire, 0.7],
      [D.Slash, 0.4],
      [D.Pierce, 0.3],
    ]);
    // verwundbar: Belagerung und Wucht; es widersteht: Stich (zuerst) und Hieb
    expect(m.hardestHit.map((e) => e.dtype)).toEqual([D.Siege, D.Blunt]);
    expect(m.resists.map((e) => e.dtype)).toEqual([D.Pierce, D.Slash]);
    // die Verursacher: Wucht = Streitkolbenkämpfer, Feuer = Sklave/Feuerwerfer/Feuerballista
    const blunt = m.defense.find((e) => e.dtype === D.Blunt)!;
    expect(blunt.dealers).toContain(U.Maceman);
    expect(blunt.dealers).not.toContain(U.Peasant); // Zivilisten zählen nicht
    const fire = m.defense.find((e) => e.dtype === D.Fire)!;
    expect(fire.dealers).toEqual(expect.arrayContaining([U.Slave, U.Firethrower, U.FireBallista]));
  });

  it('Rammbock greift nur Gebäude an: nur Gebäudeklassen als Ziel', () => {
    const m = matchups(U.Ram);
    expect(m.bldOnly).toBe(true);
    expect(m.offense.map((g) => g.armor).sort()).toEqual([A.BldWood, A.BldStone].sort());
    expect(m.offense.every((g) => g.building)).toBe(true);
    expect(byArmor(m, A.BldWood)?.mult).toBe(1.3);
    expect(byArmor(m, A.BldStone)?.mult).toBe(1.0);
    // 1,3 Holz ist stark, 1,0 Stein liegt unter 80 % des Bestwerts
    expect(m.strong.map((g) => g.armor)).toEqual([A.BldWood]);
    expect(m.weak).toEqual([]);
  });

  it('Katapult (Belagerung): stark gegen alles außer Stein und Gerät', () => {
    const m = matchups(U.Catapult);
    expect(m.strong.map((g) => g.armor).sort()).toEqual([A.None, A.Light, A.Heavy, A.Plate, A.BldWood].sort());
    expect(m.strong[0].armor).toBe(A.BldWood); // höchster Multiplikator zuerst
    expect(m.weak).toEqual([]);
  });

  it('Einheiten ohne Angriff (Belagerungsturm, Schutzschild): kein Angriffsprofil, aber Verteidigung', () => {
    for (const id of [U.SiegeTower, U.Mantlet]) {
      const m = matchups(id);
      expect(m.canAttack).toBe(false);
      expect(m.offense).toEqual([]);
      expect(m.strong).toEqual([]);
      expect(m.weak).toEqual([]);
      expect(m.defense.length).toBe(DAMAGE_TYPES.length);
      expect(m.armor).toBe(A.SiegeEng);
    }
  });

  it('Eigenschaften für alle Einheiten: konsistent zur Tabelle und sortiert', () => {
    for (const u of UNITS) {
      const m = matchups(u.id);
      // Verteidigung: genau eine Zeile je Schadensart, Wert aus der Tabelle
      expect(m.defense.length).toBe(DAMAGE_TYPES.length);
      for (const e of m.defense) expect(e.mult).toBe(DMG_TABLE[e.dtype][u.armor]);
      for (let i = 1; i < m.defense.length; i++) expect(m.defense[i - 1].mult).toBeGreaterThanOrEqual(m.defense[i].mult);
      expect(m.hardestHit.every((e) => e.mult >= STRONG_MIN)).toBe(true);
      expect(m.resists.every((e) => e.mult <= WEAK_MAX)).toBe(true);
      if (u.dmg <= 0) continue;
      for (const g of m.offense) expect(g.mult).toBe(DMG_TABLE[u.dtype][g.armor]);
      for (let i = 1; i < m.offense.length; i++) expect(m.offense[i - 1].mult).toBeGreaterThanOrEqual(m.offense[i].mult);
      const best = m.offense[0].mult;
      for (const g of m.strong) {
        expect(g.mult).toBeGreaterThanOrEqual(STRONG_MIN);
        expect(g.mult).toBeGreaterThanOrEqual(best * STRONG_RATIO);
      }
      for (const g of m.weak) expect(g.mult).toBeLessThanOrEqual(WEAK_MAX);
      for (const g of m.strong) expect(m.weak).not.toContain(g);
      // alle Rüstungsklassen sind abgedeckt, außer bei Einheiten, die nur Gebäude angreifen
      expect(m.offense.length).toBe(u.bldOnly ? 2 : ARMOR_CLASSES.length);
    }
  });

  it('damageMult liest direkt aus DMG_TABLE', () => {
    for (const d of DAMAGE_TYPES) for (const a of ARMOR_CLASSES) expect(damageMult(d, a)).toBe(DMG_TABLE[d][a]);
  });

  it('unbekannte Einheit wirft', () => {
    expect(() => matchups(9999)).toThrow();
  });
});
