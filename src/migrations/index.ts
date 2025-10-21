import * as migration_20251020_131410 from './20251020_131410';
import * as migration_20251020_174043 from './20251020_174043';
import * as migration_20251021_044042 from './20251021_044042';
import * as migration_20251021_064903_seo_meta from './20251021_064903_seo_meta';
import * as migration_20251021_132717_sync_20250305 from './20251021_132717_sync_20250305';

export const migrations = [
  {
    up: migration_20251020_131410.up,
    down: migration_20251020_131410.down,
    name: '20251020_131410',
  },
  {
    up: migration_20251020_174043.up,
    down: migration_20251020_174043.down,
    name: '20251020_174043',
  },
  {
    up: migration_20251021_044042.up,
    down: migration_20251021_044042.down,
    name: '20251021_044042',
  },
  {
    up: migration_20251021_064903_seo_meta.up,
    down: migration_20251021_064903_seo_meta.down,
    name: '20251021_064903_seo_meta',
  },
  {
    up: migration_20251021_132717_sync_20250305.up,
    down: migration_20251021_132717_sync_20250305.down,
    name: '20251021_132717_sync_20250305'
  },
];
