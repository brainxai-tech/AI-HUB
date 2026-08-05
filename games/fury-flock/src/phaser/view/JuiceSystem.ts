import Phaser from 'phaser';
import { TEXTURES } from './createTextures';

export class JuiceSystem {
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly scene: Phaser.Scene) {}

  burst(x: number, y: number, color: number, count = 10, force = 1): void {
    const safeCount = this.reducedMotion ? Math.ceil(count * 0.55) : count;
    for (let index = 0; index < safeCount; index += 1) {
      const angle = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
      const distance = Phaser.Math.Between(28, 88) * force;
      const dot = this.scene.add.circle(x, y, Phaser.Math.Between(3, 7), color, 0.95).setDepth(18);
      this.scene.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance + Phaser.Math.Between(12, 44),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(320, 600),
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  launchBurst(x: number, y: number): void {
    for (let index = 0; index < (this.reducedMotion ? 3 : 6); index += 1) {
      const feather = this.scene.add.image(x, y, TEXTURES.feather)
        .setDepth(18)
        .setRotation(Phaser.Math.FloatBetween(-1, 1));
      this.scene.tweens.add({
        targets: feather,
        x: x + Phaser.Math.Between(-70, -20),
        y: y + Phaser.Math.Between(-35, 35),
        rotation: feather.rotation + Phaser.Math.FloatBetween(-2, 2),
        alpha: 0,
        duration: Phaser.Math.Between(350, 620),
        onComplete: () => feather.destroy(),
      });
    }
    this.shake(85, 0.0025);
  }

  trail(source: Phaser.Physics.Matter.Image): void {
    if (this.reducedMotion) return;
    const ghost = this.scene.add.image(source.x, source.y, source.texture.key)
      .setDisplaySize(source.displayWidth, source.displayHeight)
      .setRotation(source.rotation)
      .setAlpha(0.2)
      .setTint(Number(source.getData('trailColor') ?? 0xff9b70))
      .setDepth(8);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      scaleX: ghost.scaleX * 0.72,
      scaleY: ghost.scaleY * 0.72,
      duration: 260,
      onComplete: () => ghost.destroy(),
    });
  }

  flash(source: Phaser.Physics.Matter.Image, duration = 72): void {
    if (!source.active) return;
    source.setTintFill(0xffffff);
    this.scene.time.delayedCall(duration, () => {
      if (source.active) source.clearTint();
    });
  }

  scorePop(x: number, y: number, text: string, color = '#ffe69b'): void {
    const label = this.scene.add.text(x, y, text, {
      fontFamily: 'Arial Black, Microsoft YaHei, sans-serif',
      fontSize: '24px',
      color,
      stroke: '#2a2138',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(30);
    this.scene.tweens.add({
      targets: label,
      y: y - 58,
      alpha: 0,
      scale: 1.18,
      duration: 800,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  celebrate(): void {
    const colors = [0xffd166, 0x78d6a3, 0xf05b4f, 0x88d9d1];
    for (let index = 0; index < 26; index += 1) {
      this.scene.time.delayedCall(index * 28, () => {
        const x = Phaser.Math.Between(360, 1_130);
        const spark = this.scene.add.image(x, Phaser.Math.Between(80, 260), TEXTURES.spark)
          .setTint(Phaser.Utils.Array.GetRandom(colors))
          .setDepth(25);
        this.scene.tweens.add({
          targets: spark,
          y: spark.y + Phaser.Math.Between(80, 190),
          rotation: Phaser.Math.FloatBetween(-2, 2),
          alpha: 0,
          duration: Phaser.Math.Between(600, 1_000),
          onComplete: () => spark.destroy(),
        });
      });
    }
  }

  shake(duration: number, intensity: number): void {
    this.scene.cameras.main.shake(duration, this.reducedMotion ? intensity * 0.3 : intensity);
  }
}
