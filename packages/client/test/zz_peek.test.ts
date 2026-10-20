import { it } from 'vitest';
import { BT, U } from '@strongpoly/shared';
import { docText } from '../src/ui/doc/blocks';
import { buildingTipDoc, unitTipDoc } from '../src/ui/tooltips/model';

it('peek', () => {
  for (const b of [BT.Quarry, BT.Mill, BT.Church, BT.Gallows, BT.TurretBallista, BT.Inn]) console.log(docText(buildingTipDoc(b)) + '\n-----');
  for (const u of [U.Archer, U.Knight, U.Ram, U.Catapult]) console.log(docText(unitTipDoc(u)) + '\n-----');
});
