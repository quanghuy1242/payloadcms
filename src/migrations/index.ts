import * as migration_20251020_131410 from './20251020_131410';
import * as migration_20251020_174043 from './20251020_174043';
import * as migration_20251021_044042 from './20251021_044042';
import * as migration_20251021_064903_seo_meta from './20251021_064903_seo_meta';
import * as migration_20251021_132717_sync_20250305 from './20251021_132717_sync_20250305';
import * as migration_20251022_150330 from './20251022_150330';
import * as migration_20251023_055030 from './20251023_055030';
import * as migration_20251023_061046 from './20251023_061046';
import * as migration_20251023_072210 from './20251023_072210';
import * as migration_20251023_093702 from './20251023_093702';

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
    name: '20251021_132717_sync_20250305',
  },
  {
    up: migration_20251022_150330.up,
    down: migration_20251022_150330.down,
    name: '20251022_150330',
  },
  {
    up: migration_20251023_055030.up,
    down: migration_20251023_055030.down,
    name: '20251023_055030',
  },
  {
    up: migration_20251023_061046.up,
    down: migration_20251023_061046.down,
    name: '20251023_061046',
  },
  {
    up: migration_20251023_072210.up,
    down: migration_20251023_072210.down,
    name: '20251023_072210',
  },
  {
    up: migration_20251023_093702.up,
    down: migration_20251023_093702.down,
    name: '20251023_093702'
  },
];
