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
import * as migration_20251024_154251 from './20251024_154251';
import * as migration_20251025_081558 from './20251025_081558';
import * as migration_20251026_000001_better_auth_user_id from './20251026_000001_better_auth_user_id';
import * as migration_20260412_000001_books_chapters from './20260412_000001_books_chapters';
import * as migration_20260415_175817_epub_import_gap_1_3 from './20260415_175817_epub_import_gap_1_3';
import * as migration_20260416_000001_epub_import_gap_6 from './20260416_000001_epub_import_gap_6';
import * as migration_20260417_000001_chapter_word_count from './20260417_000001_chapter_word_count';
import * as migration_20260417_000002_import_failure_log_typed from './20260417_000002_import_failure_log_typed';
import * as migration_20260417_134949 from './20260417_134949';
import * as migration_20260418_105401 from './20260418_105401';
import * as migration_20260418_135904 from './20260418_135904';
import * as migration_20260427_114636 from './20260427_114636';
import * as migration_20260428_153110 from './20260428_153110';
import * as migration_20260501_164038 from './20260501_164038';
import * as migration_20260502_051258 from './20260502_051258';

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
    name: '20251023_093702',
  },
  {
    up: migration_20251024_154251.up,
    down: migration_20251024_154251.down,
    name: '20251024_154251',
  },
  {
    up: migration_20251025_081558.up,
    down: migration_20251025_081558.down,
    name: '20251025_081558',
  },
  {
    up: migration_20251026_000001_better_auth_user_id.up,
    down: migration_20251026_000001_better_auth_user_id.down,
    name: '20251026_000001_better_auth_user_id',
  },
  {
    up: migration_20260412_000001_books_chapters.up,
    down: migration_20260412_000001_books_chapters.down,
    name: '20260412_000001_books_chapters',
  },
  {
    up: migration_20260415_175817_epub_import_gap_1_3.up,
    down: migration_20260415_175817_epub_import_gap_1_3.down,
    name: '20260415_175817_epub_import_gap_1_3',
  },
  {
    up: migration_20260416_000001_epub_import_gap_6.up,
    down: migration_20260416_000001_epub_import_gap_6.down,
    name: '20260416_000001_epub_import_gap_6',
  },
  {
    up: migration_20260417_000001_chapter_word_count.up,
    down: migration_20260417_000001_chapter_word_count.down,
    name: '20260417_000001_chapter_word_count',
  },
  {
    up: migration_20260417_000002_import_failure_log_typed.up,
    down: migration_20260417_000002_import_failure_log_typed.down,
    name: '20260417_000002_import_failure_log_typed',
  },
  {
    up: migration_20260417_134949.up,
    down: migration_20260417_134949.down,
    name: '20260417_134949',
  },
  {
    up: migration_20260418_105401.up,
    down: migration_20260418_105401.down,
    name: '20260418_105401',
  },
  {
    up: migration_20260418_135904.up,
    down: migration_20260418_135904.down,
    name: '20260418_135904',
  },
  {
    up: migration_20260427_114636.up,
    down: migration_20260427_114636.down,
    name: '20260427_114636',
  },
  {
    up: migration_20260428_153110.up,
    down: migration_20260428_153110.down,
    name: '20260428_153110',
  },
  {
    up: migration_20260501_164038.up,
    down: migration_20260501_164038.down,
    name: '20260501_164038',
  },
  {
    up: migration_20260502_051258.up,
    down: migration_20260502_051258.down,
    name: '20260502_051258'
  },
];
