import * as migration_20251020_131410 from './20251020_131410';

export const migrations = [
  {
    up: migration_20251020_131410.up,
    down: migration_20251020_131410.down,
    name: '20251020_131410'
  },
];
