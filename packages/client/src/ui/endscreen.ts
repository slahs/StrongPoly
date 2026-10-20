import { ClientWorld, PLAYER_COLORS, PlayerStats, TICKS_PER_MONTH } from '@strongpoly/shared';
import { h, hex } from './dom';

export interface EndInfo {
  world: ClientWorld;
  myTeam: number;
  me: number;
  winnerTeam: number;
  onExit: () => void;
}

export interface TeamRank {
  team: number;
  players: number[];
  /** 1 = Sieger */
  rank: number;
}

/**
 * Rangfolge der Teams: Sieger zuerst, danach nach Zeitpunkt des Falls (wer länger durchhält, steht höher).
 * Reine Funktion (testbar).
 */
export function rankTeams(players: { id: number; team: number }[], stats: PlayerStats[], winnerTeam: number): TeamRank[] {
  const teams = new Map<number, number[]>();
  for (const p of players) teams.set(p.team, [...(teams.get(p.team) ?? []), p.id]);
  const survive = (team: number): number => {
    let best = -1;
    for (const id of teams.get(team) ?? []) {
      const s = stats.find((x) => x.id === id);
      if (!s) continue;
      best = Math.max(best, s.alive ? 1e9 : s.defeatedTick);
    }
    return best;
  };
  const order = [...teams.keys()].sort((a, b) => (a === winnerTeam ? -1 : b === winnerTeam ? 1 : survive(b) - survive(a)));
  return order.map((team, i) => ({ team, players: teams.get(team) ?? [], rank: i + 1 }));
}

function fmtTime(ticks: number): string {
  const s = Math.floor(ticks / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
}

/** Endbildschirm: Sieger/Verlierer, Podium und Statistik aller Spieler */
export function showEndScreen(parent: HTMLElement, info: EndInfo): HTMLElement {
  const root = h('div', { class: 'screen endscreen' });
  parent.append(root);
  let tries = 0;
  const build = () => {
    const w = info.world;
    const stats = w.endStats;
    if (!stats && tries++ < 20) {
      setTimeout(build, 100);
      return;
    }
    root.innerHTML = '';
    const won = info.winnerTeam === info.myTeam;
    const draw = info.winnerTeam < 0;
    const box = h('div', { class: 'panel pp box' });
    box.append(h('h1', { text: draw ? 'Unentschieden' : won ? 'Sieg!' : 'Niederlage', style: `color:${draw ? '#6a5a3a' : won ? '#7a5a00' : '#8a2a22'}` }));
    const st = stats ?? w.players.map((p) => ({ id: p.id, kills: 0, losses: 0, built: 0, goldEarned: 0, recruited: 0, buildings: 0, peasants: 0, alive: p.alive, defeatedTick: -1 }));
    const ranks = rankTeams(w.players, st, info.winnerTeam);
    // Podium (bis zu drei Plätze: Mitte = 1., links = 2., rechts = 3.)
    const podium = h('div', { class: 'podium' });
    const slots = [1, 0, 2];
    for (const idx of slots) {
      const r = ranks[idx];
      if (!r) continue;
      const names = r.players.map((id) => w.players[id]).filter(Boolean);
      podium.append(
        h('div', { class: `pod pod${r.rank}` },
          h('div', { class: 'pod-names' }, ...names.map((p) => h('div', { class: 'pod-name', style: `color:${hex(PLAYER_COLORS[p.color % PLAYER_COLORS.length])}`, text: p.name }))),
          h('div', { class: 'pod-block', text: `${r.rank}.` }),
        ),
      );
    }
    box.append(podium);
    const rest = ranks.slice(3);
    if (rest.length) box.append(h('div', { class: 'crumb', text: 'Weitere: ' + rest.map((r) => `${r.rank}. ${r.players.map((id) => w.players[id]?.name).join(', ')}`).join(' · ') }));
    const dur = stats && stats.length ? w.tick : w.tick;
    const table = h('table', { class: 'stats' });
    table.append(
      h('tr', {}, ...['Spieler', 'Gold verdient', 'Einheiten rekrutiert', 'Verluste', 'Gegner besiegt', 'Gebäude gebaut', 'Gebäude stehend', 'Bauern', 'Fall nach'].map((t) => h('th', { text: t }))),
    );
    for (const s of st) {
      const p = w.players[s.id];
      if (!p) continue;
      table.append(
        h('tr', { class: s.id === info.me ? 'me' : '' },
          h('td', { style: `color:${hex(PLAYER_COLORS[p.color % PLAYER_COLORS.length])};font-weight:700`, text: p.name }),
          h('td', { text: String(s.goldEarned) }),
          h('td', { text: String(s.recruited) }),
          h('td', { text: String(s.losses) }),
          h('td', { text: String(s.kills) }),
          h('td', { text: String(s.built) }),
          h('td', { text: String(s.buildings) }),
          h('td', { text: String(s.peasants) }),
          h('td', { text: s.alive ? 'unbesiegt' : s.defeatedTick >= 0 ? fmtTime(s.defeatedTick) : '–' }),
        ),
      );
    }
    box.append(table);
    box.append(h('div', { class: 'crumb', text: `Spielzeit ${fmtTime(dur)} · ${Math.floor(dur / TICKS_PER_MONTH)} Monate` }));
    box.append(h('div', { class: 'row', style: 'margin-top:14px;justify-content:center' }, h('button', { class: 'primary', text: 'Zurück zum Hauptmenü', onclick: () => { root.remove(); info.onExit(); } })));
    root.append(box);
  };
  build();
  return root;
}
