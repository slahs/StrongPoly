/** Extreme-Modus: Machtleiste, Fähigkeiten, Fahnenstangen. */
export interface AbilityDef {
  id: number;
  key: string;
  name: string;
  cost: number;
  /** Abklingzeit in Sekunden */
  cooldown: number;
  radius: number;
  desc: string;
}

export const ABILITIES: AbilityDef[] = [
  { id: 0, key: 'arrows', name: 'Pfeilhagel', cost: 25, cooldown: 60, radius: 6, desc: 'Ein Pfeilregen geht auf das Zielgebiet nieder.' },
  { id: 1, key: 'reinforce', name: 'Verstärkung', cost: 45, cooldown: 120, radius: 0, desc: 'Truppen erscheinen am Kartenrand und marschieren zur Burg.' },
  { id: 2, key: 'heal', name: 'Heilung', cost: 20, cooldown: 45, radius: 8, desc: 'Heilt eigene Einheiten im Radius.' },
  { id: 3, key: 'rockfall', name: 'Felsschlag', cost: 55, cooldown: 90, radius: 3.5, desc: 'Ein gewaltiger Fels schlägt ein und zerschmettert Einheiten und Gebäude.' },
  { id: 4, key: 'gold', name: 'Goldspende', cost: 15, cooldown: 90, radius: 0, desc: 'Ein Gönner spendet 400 Gold.' },
];

export const EXTREME = {
  powerMax: 100,
  /** Grundzuwachs pro Sekunde */
  baseRate: 0.12,
  /** Zuwachs pro getöteter feindlicher Einheit */
  killGain: 0.45,
  /** Zuwachs pro Sekunde je eroberter Fahne */
  bannerRate: 0.4,
  bannerMax: 4,
  /** Sekunden zwischen neuen Fahnenstangen */
  bannerEvery: 90,
  /** Sekunden bis zur Eroberung bei ungestörter Anwesenheit */
  captureTime: 12,
  captureRadius: 3.2,
  goldDonation: 400,
  reinforceCount: 12,
};
