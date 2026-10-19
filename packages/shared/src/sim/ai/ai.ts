import { AI_DIFFICULTY_GOLD, AI_PROFILES, AiProfile } from '../../data/ai';
import { TICKS_PER_MONTH } from '../../data/balance';
import type { Sim } from '../sim';
import { AiController } from './controller';

/** Wird pro Tick aufgerufen; KI-Lords arbeiten verteilt über mehrere Ticks (Budget ~2 ms). */
export function updateAi(sim: Sim): void {
  for (const p of sim.players) {
    if (p.kind !== 'ai' || !p.alive) continue;
    let ai = p.ai as AiController | null;
    if (!ai) {
      const prof: AiProfile = AI_PROFILES[(sim.cfg.players[p.id].ai ?? p.id) % AI_PROFILES.length];
      ai = new AiController(sim, p.id, prof, sim.cfg.players[p.id].difficulty ?? 0);
      p.ai = ai;
    }
    ai.update(sim);
    // Schwierigkeitsbonus (optional, 0 = kein Cheat)
    const bonus = AI_DIFFICULTY_GOLD[Math.min(AI_DIFFICULTY_GOLD.length - 1, ai.difficulty)];
    if (bonus && sim.tick % 10 === 0) p.gold += (bonus / TICKS_PER_MONTH) * 10;
  }
}
