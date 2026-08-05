export interface LevelBackgroundSpec {
  textureKey: string;
  assetPath: string;
}

const BACKGROUND_FILES = [
  'level-01-wood-bridge-outpost.webp',
  'level-02-twin-tower-ruse.webp',
  'level-03-twilight-cloud-terrace.webp',
  'level-04-glass-corridor.webp',
  'level-05-falling-hammer-yard.webp',
  'level-06-double-gate.webp',
  'level-07-cliff-relay.webp',
  'level-08-eclipse-fortress.webp',
  'level-09-prism-passage.webp',
  'level-10-needle-bridge-balance.webp',
  'level-11-triple-wind-aerie.webp',
  'level-12-black-powder-vault.webp',
  'level-13-dawn-citadel.webp',
  'level-14-mist-harbor-drawbridge.webp',
  'level-15-thundercloud-step-city.webp',
  'level-16-sunset-bell-tower.webp',
  'level-17-red-furnace-heart-city.webp',
  'level-18-three-gate-gallery.webp',
  'level-19-mirror-lake-floating-city.webp',
  'level-20-split-crown-arena.webp',
  'level-21-storm-spiral.webp',
  'level-22-twilight-armory.webp',
  'level-23-sky-throne.webp',
  'level-19-mirror-lake-floating-city.webp',
  'level-21-storm-spiral.webp',
  'level-22-twilight-armory.webp',
  'level-27-sunken-bell-catacomb.webp',
  'level-28-mirror-fork-city.webp',
  'level-11-triple-wind-aerie.webp',
  'level-14-mist-harbor-drawbridge.webp',
  'level-31-final-star-bastion.webp',
  'level-32-ember-bridge-balance.webp',
  'level-09-prism-passage.webp',
  'level-21-storm-spiral.webp',
  'level-17-red-furnace-heart-city.webp',
  'level-13-dawn-citadel.webp',
  'level-37-frost-mirror-arcade.webp',
  'level-38-long-wind-threefold-terrace.webp',
  'level-39-black-tide-blast-heart-vault.webp',
  'level-40-myriad-feather-heaven-gate.webp',
] as const;

export const LEVEL_BACKGROUNDS: readonly LevelBackgroundSpec[] = BACKGROUND_FILES.map((filename, index) => ({
  textureKey: `level-background-${index + 1}`,
  assetPath: assetUrl(`assets/backgrounds/${filename}`),
}));

export const getLevelBackground = (levelIndex: number): LevelBackgroundSpec =>
  LEVEL_BACKGROUNDS[levelIndex] ?? LEVEL_BACKGROUNDS[0];
import { assetUrl } from '../assets';
