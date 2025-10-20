import * as migration_20251020_131410 from './20251020_131410';
import * as migration_20251020_174043 from './20251020_174043';

export const migrations = [
  {
    up: migration_20251020_131410.up,
    down: migration_20251020_131410.down,
    name: '20251020_131410',
  },
  {
    up: migration_20251020_174043.up,
    down: migration_20251020_174043.down,
    name: '20251020_174043'
  },
];
