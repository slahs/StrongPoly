/**
 * Bewegungsmessung (4A): Aufruf  tsx bench/motion.ts [scene|all] [profile|all] [model|all] [speed]
 * Beispiel: tsx bench/motion.ts all local60 all
 */
import { MOTION_SCENES } from '../src/game/motion_scenes';
import { fmt, PoseModel, PROFILES, runLab, Stats } from './motion_lab';
import { LegacyPose } from './motion_legacy';

const MODELS: Record<string, () => PoseModel> = { legacy: () => new LegacyPose() };
try {
  const m = await import('./motion_new');
  MODELS.new = m.mkNewModel;
} catch {
  /* neues Modell noch nicht vorhanden */
}

const sceneArg = process.argv[2] ?? 'all';
const profArg = process.argv[3] ?? 'local60';
const modelArg = process.argv[4] ?? 'all';
const speed = Number(process.argv[5] ?? 1);
const scenes = MOTION_SCENES.filter((s) => sceneArg === 'all' || s.id === sceneArg);
const profs = Object.values(PROFILES).filter((p) => profArg === 'all' || p.name === profArg);
const models = Object.entries(MODELS).filter(([k]) => modelArg === 'all' || k === modelArg);

const rows: { scene: string; profile: string; model: string; st: Stats }[] = [];
for (const sc of scenes)
  for (const pr of profs)
    for (const [name, mk] of models) {
      const t0 = performance.now();
      const st = runLab(mk, { scene: sc, profile: pr, speed });
      rows.push({ scene: sc.id, profile: pr.name, model: name, st });
      console.log(`${sc.id.padEnd(10)} ${pr.name.padEnd(9)} ${name.padEnd(7)} [${st.moveFrames} Bewegungsframes, ${((performance.now() - t0) / 1000).toFixed(1)} s] ${fmt(st)}`);
    }
if (process.env.OUT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.OUT, JSON.stringify(rows, null, 1));
}
