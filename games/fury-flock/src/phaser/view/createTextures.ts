import Phaser from 'phaser';

const COLORS = {
  ink: 0x2a2138,
  cream: 0xffe6bd,
  bird: 0xf05b4f,
  birdDark: 0xb93645,
  mint: 0x78d6a3,
  mintDark: 0x28866f,
} as const;

export const TEXTURES = {
  bird: 'hero-bird',
  birdIron: 'hero-bird-iron',
  birdGale: 'hero-bird-gale',
  birdVerdant: 'hero-bird-verdant',
  target: 'jelly-raider',
  wood: 'block-wood',
  stone: 'block-stone',
  glass: 'block-glass',
  feather: 'fx-feather',
  spark: 'fx-spark',
} as const;

type BirdTextureVariant = 'scarlet' | 'iron' | 'gale' | 'verdant';

function generateBirdTexture(
  graphics: Phaser.GameObjects.Graphics,
  key: string,
  bodyColor: number,
  darkColor: number,
  variant: BirdTextureVariant,
): void {
  graphics.clear();
  graphics.fillStyle(0x000000, 0.18);
  graphics.fillEllipse(49, 82, 62, 10);
  graphics.fillStyle(darkColor);
  graphics.fillTriangle(23, 52, 4, 42, 17, 64);
  graphics.fillTriangle(28, 32, 28, 6, 42, 28);
  graphics.fillTriangle(43, 25, 53, 3, 57, 30);
  if (variant === 'gale') {
    graphics.fillTriangle(33, 26, 39, 0, 47, 27);
    graphics.fillTriangle(14, 49, 0, 30, 21, 39);
  }
  if (variant === 'verdant') {
    graphics.fillTriangle(31, 28, 35, 0, 47, 27);
    graphics.fillTriangle(45, 27, 58, 2, 61, 31);
    graphics.fillStyle(0x77dfe0, 0.92);
    graphics.fillTriangle(18, 53, 0, 44, 19, 64);
    graphics.fillTriangle(22, 60, 4, 76, 28, 68);
  }
  graphics.lineStyle(5, COLORS.ink, 1);
  graphics.fillStyle(bodyColor);
  graphics.fillCircle(49, 52, 34);
  graphics.strokeCircle(49, 52, 34);
  if (variant === 'iron') {
    graphics.fillStyle(darkColor, 0.95);
    graphics.fillRoundedRect(25, 20, 47, 15, 6);
    graphics.lineStyle(3, COLORS.ink, 1);
    graphics.strokeRoundedRect(25, 20, 47, 15, 6);
  }
  graphics.fillStyle(COLORS.cream);
  graphics.fillEllipse(53, 67, 40, 29);
  graphics.fillStyle(0xffffff);
  graphics.fillEllipse(52, 43, 18, 20);
  graphics.fillEllipse(69, 45, 16, 18);
  graphics.fillStyle(COLORS.ink);
  graphics.fillCircle(56, 45, 5);
  graphics.fillCircle(73, 47, 4);
  graphics.lineStyle(5, COLORS.ink, 1);
  graphics.lineBetween(43, 34, 59, 39);
  graphics.lineBetween(63, 39, 77, 36);
  graphics.fillStyle(variant === 'iron' ? 0xe6d08f : 0xf7b44a);
  graphics.fillTriangle(69, 51, variant === 'iron' ? 98 : 94, 60, 69, 67);
  graphics.lineStyle(3, COLORS.ink, 1);
  graphics.strokeTriangle(69, 51, variant === 'iron' ? 98 : 94, 60, 69, 67);
  graphics.fillStyle(0xffffff, 0.55);
  graphics.fillCircle(37, 39, 6);
  graphics.generateTexture(key, 100, 96);
}

export function createProceduralTextures(scene: Phaser.Scene): void {
  const baseTexturesReady = [
    TEXTURES.bird,
    TEXTURES.target,
    TEXTURES.wood,
    TEXTURES.stone,
    TEXTURES.glass,
    TEXTURES.feather,
    TEXTURES.spark,
  ].every((key) => scene.textures.exists(key));

  if (baseTexturesReady) {
    if (scene.textures.exists(TEXTURES.birdIron)
      && scene.textures.exists(TEXTURES.birdGale)
      && scene.textures.exists(TEXTURES.birdVerdant)) return;
    const variants = new Phaser.GameObjects.Graphics(scene);
    if (!scene.textures.exists(TEXTURES.birdIron)) {
      generateBirdTexture(variants, TEXTURES.birdIron, 0x9aa1b4, 0x565d73, 'iron');
    }
    if (!scene.textures.exists(TEXTURES.birdGale)) {
      generateBirdTexture(variants, TEXTURES.birdGale, 0x78d6c5, 0x288c82, 'gale');
    }
    if (!scene.textures.exists(TEXTURES.birdVerdant)) {
      generateBirdTexture(variants, TEXTURES.birdVerdant, 0x7fd25a, 0x27704f, 'verdant');
    }
    variants.destroy();
    return;
  }

  const graphics = new Phaser.GameObjects.Graphics(scene);

  generateBirdTexture(graphics, TEXTURES.bird, COLORS.bird, COLORS.birdDark, 'scarlet');
  generateBirdTexture(graphics, TEXTURES.birdIron, 0x9aa1b4, 0x565d73, 'iron');
  generateBirdTexture(graphics, TEXTURES.birdGale, 0x78d6c5, 0x288c82, 'gale');
  generateBirdTexture(graphics, TEXTURES.birdVerdant, 0x7fd25a, 0x27704f, 'verdant');

  graphics.clear();
  graphics.fillStyle(0x000000, 0.16);
  graphics.fillEllipse(46, 76, 62, 10);
  graphics.lineStyle(5, COLORS.ink, 1);
  graphics.fillStyle(COLORS.mint);
  graphics.fillCircle(46, 48, 31);
  graphics.fillCircle(26, 28, 12);
  graphics.fillCircle(66, 28, 12);
  graphics.strokeCircle(46, 48, 31);
  graphics.fillStyle(0xa7ebbf);
  graphics.fillEllipse(39, 58, 43, 27);
  graphics.fillStyle(0xffffff);
  graphics.fillEllipse(38, 43, 17, 19);
  graphics.fillEllipse(56, 43, 17, 19);
  graphics.fillStyle(COLORS.ink);
  graphics.fillCircle(41, 46, 4);
  graphics.fillCircle(59, 46, 4);
  graphics.lineStyle(3, COLORS.mintDark, 1);
  graphics.strokeCircle(46, 59, 7);
  graphics.lineStyle(4, COLORS.ink, 1);
  graphics.lineBetween(29, 34, 42, 38);
  graphics.lineBetween(51, 38, 65, 34);
  graphics.fillStyle(0xffffff, 0.5);
  graphics.fillCircle(30, 38, 5);
  graphics.generateTexture(TEXTURES.target, 92, 84);

  graphics.clear();
  graphics.fillStyle(0xc87543);
  graphics.fillRoundedRect(2, 2, 60, 60, 8);
  graphics.lineStyle(4, 0x6e3d36, 1);
  graphics.strokeRoundedRect(2, 2, 60, 60, 8);
  graphics.lineStyle(3, 0xe9a967, 0.75);
  graphics.lineBetween(12, 6, 12, 58);
  graphics.lineBetween(35, 5, 35, 59);
  graphics.lineBetween(55, 6, 55, 58);
  graphics.lineStyle(2, 0x8f4f3a, 0.7);
  graphics.lineBetween(5, 24, 59, 18);
  graphics.lineBetween(5, 43, 59, 48);
  graphics.generateTexture(TEXTURES.wood, 64, 64);

  graphics.clear();
  graphics.fillStyle(0x817a8e);
  graphics.fillRoundedRect(2, 2, 60, 60, 7);
  graphics.lineStyle(4, 0x413b50, 1);
  graphics.strokeRoundedRect(2, 2, 60, 60, 7);
  graphics.fillStyle(0xa9a2b3);
  graphics.fillCircle(18, 18, 7);
  graphics.fillCircle(47, 35, 9);
  graphics.fillCircle(22, 51, 5);
  graphics.lineStyle(3, 0x5c556b, 0.8);
  graphics.lineBetween(29, 4, 25, 25);
  graphics.lineBetween(25, 25, 36, 37);
  graphics.lineBetween(36, 37, 31, 61);
  graphics.generateTexture(TEXTURES.stone, 64, 64);

  graphics.clear();
  graphics.fillStyle(0x86d8d2, 0.8);
  graphics.fillRoundedRect(2, 2, 60, 60, 6);
  graphics.lineStyle(4, 0xd3fff1, 0.9);
  graphics.strokeRoundedRect(2, 2, 60, 60, 6);
  graphics.lineStyle(3, 0xffffff, 0.7);
  graphics.lineBetween(10, 55, 29, 9);
  graphics.lineBetween(29, 9, 38, 42);
  graphics.lineBetween(38, 42, 55, 20);
  graphics.fillStyle(0xffffff, 0.45);
  graphics.fillTriangle(8, 8, 25, 8, 8, 30);
  graphics.generateTexture(TEXTURES.glass, 64, 64);

  graphics.clear();
  graphics.fillStyle(COLORS.cream);
  graphics.fillEllipse(10, 5, 18, 8);
  graphics.fillStyle(COLORS.bird);
  graphics.fillTriangle(2, 5, 19, 1, 13, 10);
  graphics.generateTexture(TEXTURES.feather, 20, 12);

  graphics.clear();
  graphics.fillStyle(0xffe69b);
  graphics.fillTriangle(8, 0, 11, 6, 16, 8);
  graphics.fillTriangle(16, 8, 11, 11, 8, 16);
  graphics.fillTriangle(8, 16, 5, 11, 0, 8);
  graphics.fillTriangle(0, 8, 5, 5, 8, 0);
  graphics.generateTexture(TEXTURES.spark, 16, 16);

  graphics.destroy();
}
