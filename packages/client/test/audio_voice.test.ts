import { ADVISOR_KEYS, allVoiceLines, BT, BUILDING_TYPES, MIN_VARIANTS, parseVoiceKey, U, UNIT_TYPES, VOICE_EVENTS, VOICE_GROUPS, VOICE_PROFILES, voiceEventsOf, voiceKey, voiceLines, voiceText } from '@strongpoly/shared';
import { VOICE_DE } from '../../shared/src/data/voices.de';
import { VOICE_EN } from '../../shared/src/data/voices.en';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ClipRegistry, Lru, validateManifest } from '../src/audio/clips';
import type { AudioSettings } from '../src/audio/engine';
import { DEFAULT_AUDIO } from '../src/audio/engine';
import { VoiceSystem } from '../src/audio/voice';
import { eventOfCommand, groupOfBuilding, groupOfUnit, leadGroup, reachableGroups } from '../src/audio/voice_groups';
import { estimateDurationMs, GATE_CFG, GateReq, LinePicker, normText, subtitleHoldMs, VoiceGate } from '../src/audio/voice_logic';

const PACK = join(__dirname, '../public/voice/de');

describe('Sprachdaten: Register', () => {
  it('jede Gruppe hat Stimmprofil, jedes Profil gehört zu Gruppe oder Berater (keine toten Profile)', () => {
    for (const g of VOICE_GROUPS) expect(VOICE_PROFILES[g], g).toBeDefined();
    for (const id of Object.keys(VOICE_PROFILES)) expect(VOICE_GROUPS.includes(id) || id === 'advisor' || id === 'advisor.alarm', id).toBe(true);
    for (const p of Object.values(VOICE_PROFILES)) {
      expect(p.label.length).toBeGreaterThan(2);
      expect(p.speed).toBeGreaterThan(0.7);
      expect(p.speed).toBeLessThan(1.3);
      expect(Math.abs(p.pitch)).toBeLessThanOrEqual(5);
    }
  });

  it('mind. drei Varianten je definiertem Ereignis, Texte nicht leer/kurz genug/ohne Dubletten', () => {
    for (const g of VOICE_GROUPS) {
      const evs = voiceEventsOf(g);
      expect(evs.length, g).toBeGreaterThanOrEqual(4);
      for (const ev of evs) {
        const lines = voiceLines(g, ev);
        expect(lines.length, `${g}.${ev}`).toBeGreaterThanOrEqual(MIN_VARIANTS);
        expect(new Set(lines).size, `${g}.${ev} Dubletten`).toBe(lines.length);
        for (const t of lines) {
          expect(t.trim(), `${g}.${ev}`).toBe(t);
          expect(t.length, t).toBeGreaterThan(3);
          expect(t.length, t).toBeLessThanOrEqual(60);
          expect(/\d/.test(t), `Ziffern in "${t}"`).toBe(false);
        }
      }
    }
  });

  it('häufige Ereignisse sind je Klasse vorhanden: Kämpfer (Auswahl, Befehl, Angriff, Halten), Bewohner (Auswahl, Arbeit, Abschluss)', () => {
    const civil = ['peasant', 'woodcutter', 'mason', 'farmer', 'baker', 'miller', 'brewer', 'smith', 'trader'];
    for (const g of VOICE_GROUPS) {
      const evs = voiceEventsOf(g);
      expect(evs, g).toContain('select');
      expect(evs, g).toContain('move');
      if (civil.includes(g)) {
        expect(evs, g).toContain('work');
        expect(evs, g).toContain('done');
      } else {
        expect(evs, g).toContain('attack');
        expect(evs, g).toContain('hold');
        expect(evs, g).toContain('wounded');
      }
    }
  });

  it('Pflichtklassen sind vertreten', () => {
    for (const g of ['swordsman', 'spearman', 'archer', 'crossbow', 'knight', 'mercenary', 'siege', 'engineer', 'lord', 'peasant', 'woodcutter', 'mason', 'farmer', 'baker', 'miller', 'brewer', 'smith', 'trader']) {
      expect(VOICE_GROUPS, g).toContain(g);
    }
  });

  it('Englisch deckt sich mit Deutsch (gleiche Schlüssel, gleiche Variantenzahl, keine Extras)', () => {
    for (const g of Object.keys(VOICE_EN)) expect(VOICE_DE[g], `EN-Gruppe ${g}`).toBeDefined();
    for (const g of VOICE_GROUPS) {
      for (const ev of VOICE_EVENTS) {
        const de = VOICE_DE[g]?.[ev];
        const en = VOICE_EN[g]?.[ev];
        if (!de) expect(en, `${g}.${ev}`).toBeUndefined();
        else if (en) expect(en.length, `${g}.${ev}`).toBe(de.length);
      }
    }
    const de = allVoiceLines('de');
    const en = allVoiceLines('en');
    expect(en.map((l) => l.key)).toEqual(de.map((l) => l.key));
    expect(en.filter((l, i) => l.text === de[i].text && l.event !== 'advisor').length).toBe(0);
  });

  it('Schlüssel: eindeutig, parsebar, Text per voiceText auffindbar', () => {
    const lines = allVoiceLines('de');
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length);
    for (const l of lines) {
      expect(voiceText(l.key, 'de')).toBe(l.text);
      if (l.event !== 'advisor') {
        const k = parseVoiceKey(l.key)!;
        expect(voiceKey(k.group, k.event, k.n)).toBe(l.key);
      } else expect(l.key.startsWith('advisor.')).toBe(true);
      expect(VOICE_PROFILES[l.profile], l.key).toBeDefined();
    }
    expect(voiceText('gibt.es.nicht')).toBeUndefined();
    expect(ADVISOR_KEYS.length).toBeGreaterThanOrEqual(30);
  });

  it('Beraterzeilen decken die Ereignisse aus der Aufgabe ab', () => {
    const need = ['wood.low', 'food.low', 'production.stalled', 'workers.few', 'pop.taxes', 'pop.rations', 'pop.leaving', 'enemy.near', 'enemy.attack', 'tower.fallen', 'enemy.siege', 'growth', 'solved', 'army.ready'];
    for (const n of need) expect(ADVISOR_KEYS, n).toContain(`advisor.${n}`);
    const alarm = allVoiceLines('de').filter((l) => l.profile === 'advisor.alarm');
    expect(alarm.length).toBeGreaterThan(5);
  });
});

describe('Sprachdaten: Zuordnung', () => {
  it('jeder Einheitentyp hat eine existierende Gruppe (Ochsen sprechen nicht)', () => {
    for (let t = 0; t < UNIT_TYPES; t++) {
      const g = groupOfUnit(t);
      if (t === U.Ox) expect(g).toBeNull();
      else expect(VOICE_GROUPS, `Einheit ${t}`).toContain(g);
    }
  });

  it('Gebäudegruppen existieren; Schmiede/Mühle/Bäckerei/Markt sprechen mit ihrer Stimme', () => {
    for (let t = 0; t < BUILDING_TYPES; t++) {
      const g = groupOfBuilding(t);
      if (g) expect(VOICE_GROUPS, `Gebäude ${t}`).toContain(g);
    }
    expect(groupOfBuilding(BT.Blacksmith)).toBe('smith');
    expect(groupOfBuilding(BT.Mill)).toBe('miller');
    expect(groupOfBuilding(BT.Bakery)).toBe('baker');
    expect(groupOfBuilding(BT.Brewery)).toBe('brewer');
    expect(groupOfBuilding(BT.Market)).toBe('trader');
    expect(groupOfBuilding(BT.Woodcutter)).toBe('woodcutter');
    expect(groupOfBuilding(BT.Quarry)).toBe('mason');
    expect(groupOfBuilding(BT.WallHigh)).toBeNull();
  });

  it('keine toten Gruppen: jede ist über Einheit, Gebäude oder Arbeitsart erreichbar', () => {
    const r = reachableGroups();
    for (const g of VOICE_GROUPS) expect(r.has(g), g).toBe(true);
    for (const g of r) expect(VOICE_GROUPS, g).toContain(g);
  });

  it('gemischte Auswahl: Lord vor Reiter vor Belagerung vor Fußvolk vor Schützen vor Bauern', () => {
    expect(leadGroup([U.Peasant, U.Archer, U.Swordsman])).toBe('swordsman');
    expect(leadGroup([U.Archer, U.Peasant])).toBe('archer');
    expect(leadGroup([U.Swordsman, U.Knight, U.Lord])).toBe('lord');
    expect(leadGroup([U.Swordsman, U.Catapult])).toBe('siege');
    expect(leadGroup([U.Ox])).toBeNull();
    expect(leadGroup([])).toBeNull();
  });

  it('Befehlsarten → Ereignis', () => {
    expect(eventOfCommand('move')).toBe('move');
    expect(eventOfCommand('attack')).toBe('attack');
    expect(eventOfCommand('attackMove')).toBe('attack');
    expect(eventOfCommand('stop')).toBe('hold');
    expect(eventOfCommand('other')).toBeNull();
  });
});

const req = (o: Partial<GateReq> = {}): GateReq => ({ category: 'unit', voice: 'archer', key: 'archer.select.1', event: 'select', priority: 1, ...o });

describe('Sprachlogik: Tor (Entprellung, Prioritäten)', () => {
  it('lässt eine Zeile zu und sperrt dieselbe Zeile für den Wiederholungsabstand', () => {
    const g = new VoiceGate();
    expect(g.decide(req(), 0).kind).toBe('play');
    g.begin(req(), 0, 1000);
    expect(g.decide(req(), 2000)).toEqual({ kind: 'drop', reason: 'repeat' });
    expect(g.decide(req({ force: true }), 2000).kind).not.toBe('drop');
    // auch nach Ablauf der Sperrfrist kommt dieselbe Zeile nicht direkt nach sich selbst, eine andere schon
    expect(g.decide(req(), GATE_CFG.keyGap.unit + 1)).toEqual({ kind: 'drop', reason: 'same' });
    expect(g.decide(req({ key: 'archer.select.2' }), GATE_CFG.keyGap.unit + 1).kind).toBe('play');
  });

  it('dieselbe Zeile nie zweimal direkt hintereinander (je Stimme)', () => {
    const g = new VoiceGate({ ...GATE_CFG, keyGap: { unit: 0, advisor: 0 } });
    g.begin(req(), 0, 300);
    expect(g.decide(req(), 5000)).toEqual({ kind: 'drop', reason: 'same' });
    expect(g.decide(req({ key: 'archer.select.2' }), 5000).kind).toBe('play');
  });

  it('Mindestabstände: global je Ereignis, je Stimme; Arbeit/Abschluss deutlich seltener als Auswahl', () => {
    const g = new VoiceGate();
    g.begin(req(), 0, 200);
    expect(g.decide(req({ voice: 'knight', key: 'knight.select.1' }), 100)).toEqual({ kind: 'drop', reason: 'global-gap' });
    expect(g.decide(req({ voice: 'knight', key: 'knight.select.1' }), 400).kind).toBe('play');
    expect(g.decide(req({ key: 'archer.select.2' }), 400)).toEqual({ kind: 'drop', reason: 'voice-gap' });
    expect(GATE_CFG.unitGlobalGap.work).toBeGreaterThan(GATE_CFG.unitGlobalGap.select * 10);
    expect(GATE_CFG.unitVoiceGap.work).toBeGreaterThan(GATE_CFG.unitVoiceGap.select * 10);
    const w = new VoiceGate();
    w.begin(req({ voice: 'peasant', key: 'peasant.work.1', event: 'work', priority: 0 }), 0, 1500);
    expect(w.decide(req({ voice: 'smith', key: 'smith.work.1', event: 'work', priority: 0 }), 3000)).toEqual({ kind: 'drop', reason: 'global-gap' });
    expect(w.decide(req({ voice: 'smith', key: 'smith.work.1', event: 'work', priority: 0 }), 8000).kind).toBe('play');
  });

  it('höchstens eine Einheitenstimme zugleich: Hintergrund wartet nicht, Spielerrückmeldung unterbricht', () => {
    const g = new VoiceGate();
    const id = g.begin(req({ voice: 'peasant', key: 'peasant.work.1', event: 'work', priority: 0 }), 0, 3000);
    // Hintergrundzeile, solange jemand spricht: verworfen
    expect(g.decide(req({ voice: 'smith', key: 'smith.work.1', event: 'work', priority: 0 }), 2000).kind).toBe('drop');
    // Spielerrückmeldung unterbricht die laufende Hintergrundzeile
    const d = g.decide(req({ voice: 'knight', key: 'knight.move.1', event: 'move', priority: 1 }), 2500);
    expect(d).toEqual({ kind: 'play', interrupt: [id] });
    // laufende Spielerrückmeldung wird von Hintergrund nicht gestört, gleichrangige neue unterbricht sie
    const g2 = new VoiceGate();
    const first = g2.begin(req({ key: 'archer.select.1' }), 0, 2000);
    expect(g2.decide(req({ voice: 'knight', key: 'knight.select.1' }), 1000)).toEqual({ kind: 'play', interrupt: [first] });
    expect(g2.decide(req({ voice: 'knight', key: 'knight.work.1', event: 'work', priority: 0 }), 1000).kind).toBe('drop');
    // nach Ablauf wieder frei
    expect(g2.activeCount(2500, 'unit')).toBe(0);
  });

  it('Berater: höhere Priorität verdrängt, wichtige Zeile wartet in der Schlange, normale wird verworfen', () => {
    const g = new VoiceGate();
    const a = (o: Partial<GateReq>): GateReq => ({ category: 'advisor', voice: 'advisor', key: 'advisor.x', priority: 1, ...o });
    expect(g.decide(a({ key: 'advisor.wood.low' }), 0).kind).toBe('play');
    const id = g.begin(a({ key: 'advisor.wood.low' }), 0, 2000);
    expect(g.decide(a({ key: 'advisor.stone.low', priority: 0 }), 500)).toEqual({ kind: 'drop', reason: 'busy' });
    expect(g.decide(a({ key: 'advisor.food.low' }), 500)).toEqual({ kind: 'queue' });
    expect(g.decide(a({ key: 'advisor.enemy.attack', priority: 2 }), 600)).toEqual({ kind: 'play', interrupt: [id] });
    g.end(id, 700);
    // wartende Zeile erst nach kurzer Pause
    expect(g.nextQueued(710)).toBeNull();
    expect(g.nextQueued(700 + GATE_CFG.advisorGap + 1)?.key).toBe('advisor.food.low');
    expect(g.nextQueued(5000)).toBeNull();
  });

  it('Berater: Schlange begrenzt, abgelaufene Zeilen verfallen, Beraterzeile wiederholt sich nicht binnen Sperrfrist', () => {
    const g = new VoiceGate();
    const a = (key: string, priority: 0 | 1 | 2 = 1): GateReq => ({ category: 'advisor', voice: 'advisor', key, priority });
    g.begin(a('advisor.a'), 0, 60000);
    for (let i = 0; i < GATE_CFG.advisorQueue; i++) expect(g.decide(a(`advisor.q${i}`), 100 + i)).toEqual({ kind: 'queue' });
    expect(g.decide(a('advisor.extra'), 200)).toEqual({ kind: 'drop', reason: 'queue-full' });
    expect(g.decide(a('advisor.crit', 2), 210).kind).toBe('play'); // kritisch verdrängt die laufende Zeile
    expect(g.nextQueued(GATE_CFG.advisorQueueTtl + 1000)).toBeNull();
    const h = new VoiceGate();
    h.begin(a('advisor.wood.low'), 0, 1000);
    h.end(1, 1000);
    expect(h.decide(a('advisor.wood.low'), 5000)).toEqual({ kind: 'drop', reason: 'repeat' });
    expect(h.decide(a('advisor.wood.low', 2), 6000).kind).toBe('play');
    expect(h.decide(a('advisor.wood.low'), GATE_CFG.keyGap.advisor + 2000).kind).toBe('play');
  });

  it('Einheiten und Berater dürfen gleichzeitig sprechen, aber insgesamt höchstens zwei', () => {
    const g = new VoiceGate();
    g.begin({ category: 'advisor', voice: 'advisor', key: 'advisor.a', priority: 1 }, 0, 3000);
    expect(g.decide(req(), 100).kind).toBe('play');
    g.begin(req(), 100, 3000);
    expect(g.activeCount(200)).toBe(2);
    expect(g.decide(req({ voice: 'knight', key: 'knight.select.1', priority: 0 }), 200).kind).toBe('drop');
  });
});

describe('Sprachlogik: Zeilenauswahl', () => {
  it('nie dieselbe Zeile zweimal hintereinander, alle Varianten kommen dran', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = seed * 7919;
      const rand = (): number => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      const p = new LinePicker(rand);
      let last = -1;
      const seen = new Set<number>();
      for (let i = 0; i < 400; i++) {
        const k = p.pick('archer.select', 4);
        expect(k).not.toBe(last);
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThan(4);
        seen.add(k);
        last = k;
      }
      expect(seen.size).toBe(4);
    }
    expect(new LinePicker().pick('x', 1)).toBe(0);
  });

  it('Mischbeutel: in jedem Durchgang kommt jede Variante genau einmal', () => {
    const p = new LinePicker();
    for (let round = 0; round < 10; round++) {
      const got = [p.pick('a', 3), p.pick('a', 3), p.pick('a', 3)];
      expect(new Set(got).size).toBe(3);
    }
  });
});

describe('Sprachlogik: Hilfsfunktionen', () => {
  it('Textvergleich ignoriert Satzzeichen und Schreibweise', () => {
    expect(normText('Unsere Bögen sind bereit.')).toBe(normText('  unsere  BÖGEN sind bereit! '));
    expect(normText('Herr, das Holz')).not.toBe(normText('Herr, das Erz'));
  });
  it('Dauerabschätzung und Untertitelzeit wachsen mit der Länge und bleiben begrenzt', () => {
    expect(estimateDurationMs('Fertig!')).toBeLessThan(estimateDurationMs('Die Arbeit macht sich nicht von allein.'));
    expect(subtitleHoldMs('Ja.')).toBeGreaterThanOrEqual(1800);
    expect(subtitleHoldMs('x'.repeat(500))).toBeLessThanOrEqual(7000);
  });
  it('Lru verdrängt die älteste Zeile', () => {
    const l = new Lru<number>(2);
    l.set('a', 1);
    l.set('b', 2);
    l.get('a');
    l.set('c', 3);
    expect(l.has('b')).toBe(false);
    expect(l.has('a')).toBe(true);
    expect(l.size).toBe(2);
  });
  it('Manifestprüfung lässt kaputte Einträge aus', () => {
    expect(validateManifest(null)).toBeNull();
    expect(validateManifest({ lang: 'de' })).toBeNull();
    const m = validateManifest({ lang: 'de', clips: { ok: { f: 'a.mp3', d: 1.2, t: 'Hallo', v: 'x' }, bad1: { f: 'b.mp3', d: 0, t: 'x' }, bad2: { d: 1, t: 'x' }, bad3: 5 } })!;
    expect(Object.keys(m.clips)).toEqual(['ok']);
  });
});

describe('Sprachpaket de: Manifest und Dateien', () => {
  const have = existsSync(join(PACK, 'manifest.json'));
  it.skipIf(!have)('jede Zeile hat einen Clip mit passendem Text, Datei vorhanden, Dauer plausibel', () => {
    const man = validateManifest(JSON.parse(readFileSync(join(PACK, 'manifest.json'), 'utf8')))!;
    const lines = allVoiceLines('de');
    for (const l of lines) {
      const e = man.clips[l.key];
      expect(e, `Clip fehlt: ${l.key}`).toBeDefined();
      expect(normText(e.t), l.key).toBe(normText(l.text));
      expect(e.v, l.key).toBe(l.voice);
      expect(e.d, l.key).toBeGreaterThan(0.3);
      expect(e.d, l.key).toBeLessThan(6);
      const f = join(PACK, e.f);
      expect(existsSync(f), `Datei fehlt: ${e.f}`).toBe(true);
      expect(statSync(f).size, e.f).toBeGreaterThan(1500);
    }
  });
  it.skipIf(!have)('keine toten Clips (jeder Manifestschlüssel gehört zu einer Zeile) und Gesamtgröße unter 15 MB', () => {
    const man = validateManifest(JSON.parse(readFileSync(join(PACK, 'manifest.json'), 'utf8')))!;
    const keys = new Set(allVoiceLines('de').map((l) => l.key));
    let size = 0;
    for (const [k, e] of Object.entries(man.clips)) {
      expect(keys.has(k), `toter Clip ${k}`).toBe(true);
      size += statSync(join(PACK, e.f)).size;
    }
    expect(size).toBeLessThan(15 * 1024 * 1024);
  });
  it.skipIf(!have)('Dateien sind MP3 (Rahmenkopf oder ID3)', () => {
    const man = validateManifest(JSON.parse(readFileSync(join(PACK, 'manifest.json'), 'utf8')))!;
    for (const e of Object.values(man.clips).slice(0, 40)) {
      const b = readFileSync(join(PACK, e.f)).subarray(0, 3);
      expect((b[0] === 0xff && (b[1] & 0xe0) === 0xe0) || (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33), e.f).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Sprachsystem mit Attrappen (ohne Browser)

class FakeNode {
  gain = { value: 1, setTargetAtTime: () => undefined };
  frequency = { value: 0 };
  Q = { value: 0 };
  pan = { value: 0 };
  type = '';
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connected: unknown[] = [];
  started = false;
  stopped = false;
  connect(n: unknown): unknown {
    this.connected.push(n);
    return n;
  }
  disconnect(): void {
    /* nichts */
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
    setTimeout(() => this.onended?.(), 0);
  }
}

function makeSystem(over: Partial<AudioSettings> = {}, withClips = true): { vs: VoiceSystem; cfg: AudioSettings; sources: FakeNode[]; subs: string[]; fetched: string[] } {
  const cfg: AudioSettings = { ...DEFAULT_AUDIO, subtitles: true, ttsFallback: false, ...over };
  const sources: FakeNode[] = [];
  const bus = { input: { voice: new FakeNode(), advisor: new FakeNode() } } as never;
  const ctx = {
    currentTime: 0,
    createGain: () => new FakeNode(),
    createBufferSource: () => {
      const n = new FakeNode();
      sources.push(n);
      return n;
    },
    createBiquadFilter: () => new FakeNode(),
    createStereoPanner: () => new FakeNode(),
  } as never;
  const vs = new VoiceSystem({ isReady: () => true, settings: () => cfg, ctx: () => ctx, bus: () => bus, listener: () => ({ x: 0, y: 0, yaw: Math.PI / 4, dist: 38 }) });
  const fetched: string[] = [];
  if (withClips) {
    const manifest = {
      lang: 'de',
      format: 'mp3',
      clips: {
        'archer.select.1': { f: 'archer/select_1.mp3', d: 1.2, t: 'Unsere Bögen sind bereit.', v: 'archer' },
        'archer.select.2': { f: 'archer/select_2.mp3', d: 1.0, t: 'Die Pfeile sind im Köcher.', v: 'archer' },
        'advisor.wood.low': { f: 'advisor/wood.low.mp3', d: 1.3, t: 'Herr, das Holz wird knapp.', v: 'advisor' },
      },
    };
    const fetcher = (async (url: string) => {
      fetched.push(url);
      if (url.endsWith('manifest.json')) return { ok: true, json: async () => manifest } as Response;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response;
    }) as unknown as typeof fetch;
    vs.clips = new ClipRegistry(async () => ({ duration: 1 }) as AudioBuffer, '/voice/', fetcher);
  }
  const subs: string[] = [];
  vs.onSubtitle = (t, v) => subs.push(`${v}:${t}`);
  return { vs, cfg, sources, subs, fetched };
}

const tick = (ms = 5): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('Sprachsystem (Attrappen)', () => {
  it('spielt den Clip der Zeile, sobald er geladen ist, und meldet den Untertitel', async () => {
    const { vs, sources, subs, fetched } = makeSystem();
    await vs.clips!.ensure('de');
    expect(vs.say({ voice: 'archer', key: 'archer.select.1', text: 'Unsere Bögen sind bereit.', lang: 'de', priority: 1 })).toBe(true);
    await tick(20);
    expect(sources.length).toBe(1);
    expect(sources[0].started).toBe(true);
    expect(subs).toEqual(['archer:Unsere Bögen sind bereit.']);
    expect(fetched.some((u) => u.endsWith('archer/select_1.mp3'))).toBe(true);
    expect(vs.debug().stats.clip).toBe(1);
    expect(vs.lastText('archer')).toBe('Unsere Bögen sind bereit.');
  });

  it('abweichender Text → Clip wird nicht benutzt (kein falscher Satz), ohne Ersatz nur Untertitel', async () => {
    const { vs, sources, subs } = makeSystem();
    await vs.clips!.ensure('de');
    vs.say({ voice: 'advisor', key: 'advisor.wood.low', text: 'Holz wird knapp, Herr!', lang: 'de', priority: 1 });
    await tick(20);
    expect(sources.length).toBe(0);
    expect(subs).toEqual(['advisor:Holz wird knapp, Herr!']);
    expect(vs.debug().stats.textOnly).toBe(1);
  });

  it('Entprellung: Wiederholung wird verworfen, Rückgabe false', async () => {
    const { vs } = makeSystem();
    await vs.clips!.ensure('de');
    const r = { voice: 'archer', key: 'archer.select.1', text: 'Unsere Bögen sind bereit.', lang: 'de' as const, priority: 1 as const };
    expect(vs.say(r)).toBe(true);
    expect(vs.say(r)).toBe(false);
    expect(vs.lastDrop).toBe('repeat');
  });

  it('stumm, nicht bereit, fern (Hintergrund): keine Wiedergabe', async () => {
    const m = makeSystem({ muted: true });
    await m.vs.clips!.ensure('de');
    expect(m.vs.say({ voice: 'archer', key: 'archer.select.1', text: 'x', priority: 1 })).toBe(false);
    expect(m.vs.lastDrop).toBe('muted');
    const f = makeSystem();
    await f.vs.clips!.ensure('de');
    expect(f.vs.say({ voice: 'archer', key: 'archer.work.1', text: 'Test', priority: 0, pos: { x: 900, y: 900 } })).toBe(false);
    expect(f.vs.lastDrop).toBe('far');
    // Spielerrückmeldung bleibt trotz Entfernung hörbar
    expect(f.vs.say({ voice: 'archer', key: 'archer.select.2', text: 'Die Pfeile sind im Köcher.', priority: 1, pos: { x: 900, y: 900 } })).toBe(true);
  });

  it('Lautstärke 0 für Stimmen: stumm, aber Untertitel bleiben', async () => {
    const { vs, sources, subs } = makeSystem({ voice: 0 });
    await vs.clips!.ensure('de');
    expect(vs.say({ voice: 'archer', key: 'archer.select.1', text: 'Unsere Bögen sind bereit.', priority: 1 })).toBe(true);
    await tick(20);
    expect(sources.length).toBe(0);
    expect(subs.length).toBe(1);
  });

  it('Untertitel aus: kein Rückruf; ohne Clip, ohne Ersatz und ohne Untertitel: nicht verfügbar', async () => {
    const { vs, subs } = makeSystem({ subtitles: false }, false);
    expect(vs.say({ voice: 'archer', key: 'archer.select.1', text: 'Unsere Bögen sind bereit.', priority: 1 })).toBe(false);
    expect(vs.lastDrop).toBe('unavailable');
    expect(subs.length).toBe(0);
  });

  it('speak() wählt Varianten abwechselnd, Berater-Wiederholung und Stop funktionieren', async () => {
    const { vs, subs } = makeSystem({}, false);
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      vs.gate.reset();
      expect(vs.speak('swordsman', 'select', { priority: 1 })).toBe(true);
      seen.push(subs[subs.length - 1]);
    }
    expect(seen[0]).not.toBe(seen[1]);
    expect(new Set(seen).size).toBeGreaterThanOrEqual(3);
    expect(vs.speak('nope', 'select')).toBe(false);
    vs.gate.reset();
    vs.say({ voice: 'advisor', key: 'advisor.wood.low', text: 'Herr, das Holz wird knapp.', priority: 1 });
    expect(vs.lastText()).toBe('Herr, das Holz wird knapp.');
    expect(vs.lastText('nobody')).toBeNull();
    expect(vs.replayLast()).toBe(true);
    expect(subs[subs.length - 1]).toBe('advisor:Herr, das Holz wird knapp.');
    vs.stop('advisor');
    expect(vs.replayLast('nobody')).toBe(false);
  });
});
