import Phaser from 'phaser';
import {
  DEFAULT_BIRD_ID,
  computeLaunchVelocity,
  getBirdSpec,
  type BirdSpec,
  type BirdId,
} from '../../game/content/birds';
import { getLevelBackground } from '../../game/content/backgrounds';
import {
  GROUND_Y,
  LEVELS,
  MATERIAL_STATS,
  SLING_ANCHOR,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Material,
} from '../../game/content/levels';
import { ARMORED_TARGET_ART, GUNNER_TARGET_ART, TARGET_ART, getTargetArt } from '../../game/content/targets';
import { SLINGSHOT_ART } from '../../game/content/props';
import { gameBus, type HudPayload, type ResultPayload } from '../../game/events';
import { calculateStarRating } from '../../game/progression/starProgress';
import { RunState } from '../../game/simulation/RunState';
import { BirdTelemetry, type BirdImpactSource } from '../../game/simulation/BirdTelemetry';
import { normalizeBirdQueue, resizeBirdQueue } from '../../game/simulation/birdQueue';
import {
  GALE_SPLIT_RADIUS,
  GALE_SPLIT_SCALE,
  GALE_SPLIT_ORIGIN_HOLD_MS,
  IRON_BLAST_RADIUS,
  SCARLET_PRECISION_DAMAGE_MULTIPLIER,
  SCARLET_PRECISION_SCORE_BONUS,
  computeScarletPrecisionAlignment,
  computeObstacleExitPosition,
  computeObstaclePhaseDuration,
  computeExplosionDamage,
  computeSplitSpawnPositions,
  computeSplitVelocities,
  hasClearedIronLaunchZone,
  isScarletPrecisionImpact,
  resolveGaleSplitTrigger,
  shouldDetonateOnImpact,
  shouldPhaseFirstObstacle,
  shouldResolveFlightTurn,
  type GaleSplitTrigger,
} from '../../game/simulation/birdAbilities';
import {
  GUNNER_AIM_DURATION_MS,
  GUNNER_SHOT_TRAVEL_MS,
  getGunnerDeflectionSign,
  resolveGunnerShot,
  shouldStartGunnerAim,
  type GunnerState,
} from '../../game/simulation/gunnerShot';
import {
  TARGET_ARMOR_BREAK_GRACE_MS,
  isTargetDamageGuarded,
  resolveTargetDamage,
  type TargetDamageResult,
} from '../../game/simulation/targetArmor';
import { sampleBallisticTrajectory, sampleBallisticTrajectoryAtX } from '../../game/simulation/trajectory';
import { createProceduralTextures, TEXTURES } from '../view/createTextures';
import { JuiceSystem } from '../view/JuiceSystem';

type FlightPhase = 'ready' | 'dragging' | 'flying' | 'resolving' | 'ended';

interface SceneData {
  levelIndex?: number;
  totalScore?: number;
  birdQueue?: BirdId[];
}

interface Destructible {
  sprite: Phaser.Physics.Matter.Image;
  kind: 'block' | 'target';
  material: Material | 'jelly';
  health: number;
  maxHealth: number;
  points: number;
  armorHitsRemaining: number;
  damageGuardUntil: number;
  gunner: boolean;
  gunnerShotUsed: boolean;
  gunnerState?: GunnerState;
  gunnerBadge?: Phaser.GameObjects.Text;
  destroyed: boolean;
  lastImpactAt: number;
}

interface CollisionPair {
  bodyA: MatterJS.BodyType;
  bodyB: MatterJS.BodyType;
}

interface CollisionEvent {
  pairs: CollisionPair[];
}

interface GunnerShotDebug {
  gunnerX: number;
  gunnerY: number;
  birdId: BirdId;
  hit: boolean;
  exploded: boolean;
  velocityBefore: { x: number; y: number };
  velocityAfter: { x: number; y: number };
}

interface ActiveGunnerAim {
  gunner: Destructible;
  bird: Phaser.Physics.Matter.Image;
  startedAt: number;
  line: Phaser.GameObjects.Graphics;
  reticle: Phaser.GameObjects.Arc;
}

interface PhasePassDebug {
  obstacleId: number;
  obstacleLabel: string;
  startedAt: number;
  durationMs: number;
  completed: boolean;
  birdXAtStart: number;
  birdXAtEnd?: number;
  obstacleMinX: number;
  obstacleMaxX: number;
  obstacleHealthBefore?: number;
  obstacleHealthAfter?: number;
}

interface SplitDebug {
  x: number;
  y: number;
  flightAge: number;
  trigger: GaleSplitTrigger;
  releaseDelayMs: number;
  released: boolean;
  spawnPositions: Array<{ x: number; y: number }>;
}

interface ScarletPrecisionDebug {
  obstacleLabel: string;
  alignment: number;
  damageMultiplier: number;
  bonusPoints: number;
}

interface ScarletImpactDebug {
  obstacleLabel: string;
  alignment: number;
  relativeSpeed: number;
  precision: boolean;
}

interface IronImpactDebug {
  obstacleLabel: string;
  flightAge: number;
  birdX: number;
  launchCleared: boolean;
  armed: boolean;
  detonated: boolean;
}

const MATERIAL_TEXTURES: Record<Material, string> = {
  wood: TEXTURES.wood,
  stone: TEXTURES.stone,
  glass: TEXTURES.glass,
};

const BIRD_TEXTURES: Record<BirdId, string> = {
  scarlet: TEXTURES.bird,
  iron: TEXTURES.birdIron,
  gale: TEXTURES.birdGale,
  verdant: TEXTURES.birdVerdant,
};

const BIRD_ART_TEXTURES: Record<BirdId, string> = {
  scarlet: 'hero-bird-art-scarlet',
  iron: 'hero-bird-art-iron',
  gale: 'hero-bird-art-gale',
  verdant: 'hero-bird-art-verdant',
};

const OBSTACLE_COLLISION_CATEGORY = 0x0002;
const TARGET_COLLISION_CATEGORY = 0x0004;
const BIRD_COLLISION_CATEGORY = 0x0008;
const ALL_COLLISION_CATEGORIES = 0xffff_ffff;

export class GameScene extends Phaser.Scene {
  private state!: RunState;
  private readonly birdTelemetry = new BirdTelemetry();
  private juice!: JuiceSystem;
  private levelIndex = 0;
  private initialScore = 0;
  private birdId: BirdId = DEFAULT_BIRD_ID;
  private birdQueue: BirdId[] = [];
  private phase: FlightPhase = 'ready';
  private currentBird?: Phaser.Physics.Matter.Image;
  private readonly auxiliaryBirds = new Set<Phaser.Physics.Matter.Image>();
  private trajectory!: Phaser.GameObjects.Graphics;
  private backBand!: Phaser.GameObjects.Graphics;
  private frontBand!: Phaser.GameObjects.Graphics;
  private worldBackground?: Phaser.GameObjects.Image;
  private loadedBackgroundTextureKey?: string;
  private slingshotArt?: Phaser.GameObjects.Image;
  private readonly destructibles = new Map<number, Destructible>();
  private dragDistance = 0;
  private launchStartedAt = 0;
  private readonly birdSettledFor = new Map<Phaser.Physics.Matter.Image, number>();
  private trailClock = 0;
  private turnQueued = false;
  private pausedByUser = false;
  private lastImpactSoundAt = 0;
  private lastLaunchOrigin?: { x: number; y: number };
  private lastLaunchVelocity?: { x: number; y: number };
  private lastExplosion?: { x: number; y: number; radius: number; hits: number };
  private lastIronImpact?: IronImpactDebug;
  private ironImpactArmed = false;
  private lastGunnerShot?: GunnerShotDebug;
  private activeGunnerAim?: ActiveGunnerAim;
  private lastFlightVelocity?: { x: number; y: number };
  private lastSplit?: SplitDebug;
  private lastScarletPrecision?: ScarletPrecisionDebug;
  private lastScarletImpact?: ScarletImpactDebug;
  private readonly scarletPrecisionTargetIds = new Set<number>();
  private phasingObstacle?: MatterJS.BodyType;
  private phaseVelocity?: { x: number; y: number };
  private phaseStartedAt = 0;
  private phaseDeadline = 0;
  private lastPhasePass?: PhasePassDebug;

  constructor() {
    super('GameScene');
  }

  preload(): void {
    for (const birdId of Object.keys(BIRD_ART_TEXTURES) as BirdId[]) {
      const bird = getBirdSpec(birdId);
      const textureKey = BIRD_ART_TEXTURES[birdId];
      if (!this.textures.exists(textureKey)) this.load.image(textureKey, bird.assetPath);
    }
    for (const targetArt of [TARGET_ART, ARMORED_TARGET_ART, GUNNER_TARGET_ART]) {
      if (!this.textures.exists(targetArt.textureKey)) {
        this.load.image(targetArt.textureKey, targetArt.assetPath);
      }
    }
    const background = getLevelBackground(this.levelIndex);
    if (this.loadedBackgroundTextureKey
      && this.loadedBackgroundTextureKey !== background.textureKey
      && this.textures.exists(this.loadedBackgroundTextureKey)) {
      this.textures.remove(this.loadedBackgroundTextureKey);
    }
    this.loadedBackgroundTextureKey = background.textureKey;
    if (!this.textures.exists(background.textureKey)) {
      this.load.image(background.textureKey, background.assetPath);
    }
    if (!this.textures.exists(SLINGSHOT_ART.textureKey)) {
      this.load.image(SLINGSHOT_ART.textureKey, SLINGSHOT_ART.assetPath);
    }
  }

  init(data: SceneData): void {
    this.levelIndex = Phaser.Math.Clamp(data.levelIndex ?? 0, 0, LEVELS.length - 1);
    this.initialScore = data.totalScore ?? 0;
    this.birdQueue = normalizeBirdQueue(data.birdQueue, LEVELS[this.levelIndex].shots);
    this.birdId = this.birdQueue[0] ?? DEFAULT_BIRD_ID;
  }

  create(): void {
    this.phase = 'ready';
    this.turnQueued = false;
    this.pausedByUser = false;
    this.destructibles.clear();
    this.lastExplosion = undefined;
    this.lastGunnerShot = undefined;
    this.activeGunnerAim = undefined;
    this.lastPhasePass = undefined;
    this.phasingObstacle = undefined;
    this.birdTelemetry.reset();
    this.state = new RunState(this.initialScore);
    const level = LEVELS[this.levelIndex];
    this.state.startLevel(this.levelIndex, level.shots, level.targets.length);

    createProceduralTextures(this);
    this.juice = new JuiceSystem(this);
    this.drawWorld();
    this.createLevel();
    this.createSling();
    this.spawnBird();

    this.matter.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 42, true, true, true, true);
    this.matter.world.on('collisionstart', this.handleCollisions, this);
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    window.addEventListener('pointermove', this.handleGlobalPointerMove, true);
    window.addEventListener('pointerup', this.handleGlobalPointerRelease, true);
    window.addEventListener('pointercancel', this.handleGlobalPointerCancel, true);
    this.input.keyboard?.on('keydown-ESC', this.handlePauseCommand, this);
    this.input.keyboard?.on('keydown-R', this.handleRestartCommand, this);
    this.input.keyboard?.on('keydown-SPACE', this.handleQuickFireCommand, this);
    gameBus.on('command:quick-fire', this.handleQuickFireCommand, this);
    gameBus.on('command:restart', this.handleRestartCommand, this);
    gameBus.on('command:retry', this.handleRestartCommand, this);
    gameBus.on('command:pause', this.handlePauseCommand, this);
    gameBus.on('command:continue', this.handlePauseCommand, this);
    gameBus.on('command:next', this.handleNextCommand, this);
    gameBus.on('command:replay', this.handleReplayCommand, this);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);

    this.emitHud();
    gameBus.emit('loadout:sync', { levelIndex: this.levelIndex, birdQueue: [...this.birdQueue] });
    gameBus.emit('overlay:hide');
    gameBus.emit('pause:changed', false);
    gameBus.emit('hint:update', this.getReadyHint(), true);
    this.showLevelIntro();
    gameBus.emit('mission:ready');
  }

  update(time: number, delta: number): void {
    this.updateBands();
    this.updateGunnerBadges();
    if (this.phase !== 'flying' || !this.currentBird?.active) return;

    const flightAge = time - this.launchStartedAt;
    this.updateIronImpactArming();
    this.tryAutoSplit(flightAge);
    this.updateGunnerThreat(time, flightAge);
    this.updateObstaclePhase(time);
    const body = this.bodyOf(this.currentBird);
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    this.lastFlightVelocity = { x: body.velocity.x, y: body.velocity.y };
    const activeBirds = [this.currentBird, ...this.auxiliaryBirds]
      .filter((bird) => bird.active);
    const resolutionStates = activeBirds.map((bird) => {
      const activeBody = this.bodyOf(bird);
      const activeSpeed = Math.hypot(activeBody.velocity.x, activeBody.velocity.y);
      if (activeSpeed > 0.3) bird.setRotation(Math.atan2(activeBody.velocity.y, activeBody.velocity.x));
      const settledForMs = flightAge > 1_800 && activeSpeed < 0.48
        ? (this.birdSettledFor.get(bird) ?? 0) + delta
        : 0;
      this.birdSettledFor.set(bird, settledForMs);
      return {
        settledForMs,
        outOfPlay: bird.x > WORLD_WIDTH + 80
          || bird.x < -80
          || bird.y > WORLD_HEIGHT + 60,
      };
    });

    this.trailClock += delta;
    if (speed > 8 && this.trailClock >= 78) {
      this.juice.trail(this.currentBird);
      this.trailClock = 0;
    }

    if (shouldResolveFlightTurn(resolutionStates, flightAge)) this.queueTurnResolution(520);
  }

  getDebugState(): Record<string, unknown> {
    const birdBody = this.currentBird?.active ? this.bodyOf(this.currentBird) : undefined;
    return {
      phase: this.phase,
      level: this.state.levelIndex + 1,
      score: this.state.score,
      shots: this.state.shotsRemaining,
      targetsRemaining: this.state.targetsRemaining,
      status: this.state.status,
      stars: calculateStarRating(this.state.status === 'won', this.state.shotsRemaining),
      birdId: this.birdId,
      birdQueue: [...this.birdQueue],
      remainingBirdQueue: this.remainingBirdQueue(),
      birdTexture: this.currentBird?.texture.key ?? null,
      backgroundTexture: this.worldBackground?.texture.key ?? null,
      slingshotTexture: this.slingshotArt?.texture.key ?? null,
      loadoutOpen: false,
      launch: this.lastLaunchOrigin && this.lastLaunchVelocity ? {
        origin: this.lastLaunchOrigin,
        velocity: this.lastLaunchVelocity,
      } : null,
      bird: this.currentBird ? { x: this.currentBird.x, y: this.currentBird.y } : null,
      birdPhysics: birdBody ? {
        isStatic: birdBody.isStatic,
        isSleeping: birdBody.isSleeping,
        velocityX: birdBody.velocity.x,
        velocityY: birdBody.velocity.y,
        abilityUsed: Boolean(this.currentBird?.getData('abilityUsed')),
        phasing: Boolean(this.currentBird?.getData('phasing')),
        collisionMask: birdBody.collisionFilter.mask,
        density: birdBody.density,
      } : null,
      activeBirdBodies: (this.currentBird?.active ? 1 : 0)
        + [...this.auxiliaryBirds].filter((bird) => bird.active).length,
      birdCopies: [this.currentBird, ...this.auxiliaryBirds]
        .filter((bird): bird is Phaser.Physics.Matter.Image => Boolean(bird?.active))
        .map((bird) => ({
          texture: bird.texture.key,
          width: bird.displayWidth,
          height: bird.displayHeight,
        })),
      splitTriggered: this.birdId === 'gale' && Boolean(this.currentBird?.getData('abilityUsed')),
      lastSplit: this.lastSplit ? {
        ...this.lastSplit,
        spawnPositions: this.lastSplit.spawnPositions.map((position) => ({ ...position })),
      } : null,
      lastScarletPrecision: this.lastScarletPrecision ? { ...this.lastScarletPrecision } : null,
      lastScarletImpact: this.lastScarletImpact ? { ...this.lastScarletImpact } : null,
      explosionTriggered: Boolean(this.lastExplosion),
      lastExplosion: this.lastExplosion ? { ...this.lastExplosion } : null,
      ironImpactArmed: this.ironImpactArmed,
      lastIronImpact: this.lastIronImpact ? { ...this.lastIronImpact } : null,
      phaseTriggered: this.birdId === 'verdant' && Boolean(this.currentBird?.getData('abilityUsed')),
      lastPhasePass: this.lastPhasePass ? { ...this.lastPhasePass } : null,
      lastGunnerShot: this.lastGunnerShot ? { ...this.lastGunnerShot } : null,
      activeGunnerAim: this.activeGunnerAim ? {
        startedAt: this.activeGunnerAim.startedAt,
        fireAt: this.activeGunnerAim.startedAt + GUNNER_AIM_DURATION_MS,
      } : null,
      targets: [...this.destructibles.values()]
        .filter((record) => record.kind === 'target' && !record.destroyed && record.sprite.active)
        .map((record) => {
          const body = this.bodyOf(record.sprite);
          return {
            x: record.sprite.x,
            y: record.sprite.y,
            texture: record.sprite.texture.key,
            isSleeping: body.isSleeping,
            health: record.health,
            maxHealth: record.maxHealth,
            armorHitsRemaining: record.armorHitsRemaining,
            armored: record.armorHitsRemaining > 0,
            gunner: record.gunner,
            gunnerShotUsed: record.gunnerShotUsed,
            gunnerState: record.gunnerState ?? null,
            damageGuardRemaining: Math.max(0, record.damageGuardUntil - this.time.now),
          };
        }),
      birdTelemetry: this.birdTelemetry.snapshot(this.state.score),
    };
  }

  debugLaunch(velocityX = 16, velocityY = -7): boolean {
    if (this.phase !== 'ready' || !this.currentBird) return false;
    const strength = 0.15 * getBirdSpec(this.birdId).launchMultiplier;
    this.dragDistance = 100;
    this.currentBird.setPosition(SLING_ANCHOR.x - velocityX / strength, SLING_ANCHOR.y - velocityY / strength);
    this.launchCurrentBird();
    return true;
  }

  debugResolveTurn(): boolean {
    if (this.phase !== 'flying') return false;
    this.queueTurnResolution(0);
    return true;
  }

  debugPredictYAtX(targetX: number): number | null {
    if (!this.currentBird) return null;
    const aiming = this.phase === 'ready' || this.phase === 'dragging';
    const origin = aiming
      ? { x: this.currentBird.x, y: this.currentBird.y }
      : this.lastLaunchOrigin;
    const velocity = aiming ? this.getLaunchVelocity() : this.lastLaunchVelocity;
    if (!origin || !velocity) return null;
    return sampleBallisticTrajectoryAtX(
      origin,
      velocity,
      targetX,
    )?.y ?? null;
  }

  debugCompleteLevel(): boolean {
    if (this.phase === 'ended') return false;
    const targets = [...this.destructibles.values()].filter((record) => record.kind === 'target' && !record.destroyed);
    for (const target of targets) this.destroyDestructible(target, 40);
    return targets.length > 0;
  }

  debugDamageTarget(targetIndex: number, damage: number): Record<string, unknown> | null {
    const targets = [...this.destructibles.values()]
      .filter((record) => record.kind === 'target' && !record.destroyed && record.sprite.active);
    const target = targets[targetIndex];
    if (!target) return null;
    const result = this.damageDestructible(target, damage);
    return {
      ...result,
      texture: target.sprite.texture.key,
      targetIndex,
    };
  }

  debugRemoveSupportUnderTarget(): { x: number; initialY: number } | null {
    const target = [...this.destructibles.values()]
      .filter((record) => record.kind === 'target' && !record.destroyed && record.sprite.active)
      .sort((a, b) => a.sprite.x - b.sprite.x)[0];
    if (!target) return null;

    const support = [...this.destructibles.values()]
      .filter((record) => record.kind === 'block'
        && !record.destroyed
        && record.sprite.active
        && record.sprite.y > target.sprite.y
        && Math.abs(record.sprite.x - target.sprite.x) < record.sprite.displayWidth / 2 + 34)
      .sort((a, b) => a.sprite.y - b.sprite.y)[0];
    if (!support) return null;

    const result = { x: target.sprite.x, initialY: target.sprite.y };
    this.destroyDestructible(support, 40);
    return result;
  }

  debugFireGunnerShot(deflectionSign = 1): boolean {
    if (this.phase !== 'flying' || !this.currentBird?.active) return false;
    const gunner = [...this.destructibles.values()].find((record) =>
      record.kind === 'target'
      && record.gunner
      && record.gunnerState !== 'firing'
      && record.gunnerState !== 'spent'
      && !record.destroyed
      && record.sprite.active);
    if (!gunner) return false;
    if (this.activeGunnerAim?.gunner === gunner) this.clearGunnerAimVisuals();
    return this.fireGunnerShot(gunner, this.currentBird, deflectionSign);
  }

  private drawWorld(): void {
    const background = getLevelBackground(this.levelIndex);
    if (this.textures.exists(background.textureKey)) {
      this.worldBackground = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, background.textureKey)
        .setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT)
        .setDepth(-30);
    } else {
      this.worldBackground = undefined;
      this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x17132a)
        .setDepth(-30);
    }

    this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + 42, WORLD_WIDTH, 90, 0x3a2738).setDepth(-4);
    this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + 3, WORLD_WIDTH, 16, 0x7f9a5a).setDepth(-3);
    this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + 11, WORLD_WIDTH, 11, 0x516841).setDepth(-3);
    const ground = this.matter.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + 18, WORLD_WIDTH, 42, { isStatic: true });
    ground.label = 'ground';

    const grass = this.add.graphics().setDepth(-2).fillStyle(0xa7bd69, 1);
    for (let x = 0; x < WORLD_WIDTH; x += 18) {
      grass.fillTriangle(x, GROUND_Y - 4, x + 8, GROUND_Y - Phaser.Math.Between(8, 18), x + 14, GROUND_Y - 4);
    }
  }

  private createLevel(): void {
    const level = LEVELS[this.levelIndex];
    for (const platform of level.platforms ?? []) {
      this.add.rectangle(platform.x, platform.y, platform.width, platform.height, 0x594554)
        .setStrokeStyle(4, 0x2a2138)
        .setDepth(1);
      const body = this.matter.add.rectangle(platform.x, platform.y, platform.width, platform.height, { isStatic: true });
      body.label = 'platform';
      body.collisionFilter.category = OBSTACLE_COLLISION_CATEGORY;
    }

    for (const block of level.blocks) {
      const stats = MATERIAL_STATS[block.material];
      const sprite = this.matter.add.image(block.x, block.y, MATERIAL_TEXTURES[block.material])
        .setDisplaySize(block.width, block.height)
        .setRectangle(block.width, block.height)
        .setDensity(stats.density)
        .setFriction(0.82)
        .setFrictionAir(0.012)
        .setBounce(block.material === 'glass' ? 0.08 : 0.03)
        .setCollisionCategory(OBSTACLE_COLLISION_CATEGORY)
        .setDepth(5);
      if (block.angle) sprite.setRotation(block.angle);
      const body = this.bodyOf(sprite);
      body.label = `block:${block.material}`;
      this.destructibles.set(body.id, {
        sprite,
        kind: 'block',
        material: block.material,
        health: stats.health,
        maxHealth: stats.health,
        points: stats.points,
        armorHitsRemaining: 0,
        damageGuardUntil: 0,
        gunner: false,
        gunnerShotUsed: false,
        destroyed: false,
        lastImpactAt: 0,
      });
    }

    for (const target of level.targets) {
      const scale = target.scale ?? 1;
      const targetArt = getTargetArt({ armored: target.armored, gunner: target.gunner });
      const targetTexture = this.textures.exists(targetArt.textureKey) ? targetArt.textureKey : TEXTURES.target;
      const sprite = this.matter.add.image(target.x, target.y, targetTexture)
        .setDisplaySize(targetArt.spriteSize * scale, targetArt.spriteSize * scale)
        .setCircle(targetArt.collisionRadius * scale)
        .setDensity(0.0015)
        .setFriction(0.7)
        .setFrictionAir(0.01)
        .setBounce(0.25)
        .setCollisionCategory(TARGET_COLLISION_CATEGORY)
        .setDepth(7);
      const body = this.bodyOf(sprite);
      body.label = 'target';
      sprite.setData('armored', Boolean(target.armored));
      sprite.setData('gunner', Boolean(target.gunner));
      const record: Destructible = {
        sprite,
        kind: 'target',
        material: 'jelly',
        health: 15,
        maxHealth: 15,
        points: 1_500,
        armorHitsRemaining: target.armored ? 1 : 0,
        damageGuardUntil: 0,
        gunner: Boolean(target.gunner),
        gunnerShotUsed: false,
        gunnerState: target.gunner ? 'loaded' : undefined,
        destroyed: false,
        lastImpactAt: 0,
      };
      if (record.gunner) {
        record.gunnerBadge = this.add.text(sprite.x, sprite.y - sprite.displayHeight * 0.72, '火铳就绪', {
          fontFamily: '"Microsoft YaHei", sans-serif',
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#ffe2a8',
          backgroundColor: 'rgba(45, 28, 42, 0.86)',
          padding: { x: 7, y: 4 },
        }).setOrigin(0.5).setDepth(20);
        this.setGunnerState(record, 'loaded');
      }
      this.destructibles.set(body.id, record);
    }

    for (const record of this.destructibles.values()) {
      this.matter.body.set(this.bodyOf(record.sprite), 'isSleeping', true);
    }
  }

  private createSling(): void {
    // The posts are deliberately visual-only: no Matter body is created here,
    // so the launched bird can pass through them without ever getting stuck.
    this.add.ellipse(SLING_ANCHOR.x, 596, 132, 24, 0x241828, 0.38).setDepth(5);
    if (this.textures.exists(SLINGSHOT_ART.textureKey)) {
      this.slingshotArt = this.add.image(
        SLING_ANCHOR.x,
        SLING_ANCHOR.y + SLINGSHOT_ART.centerOffsetY,
        SLINGSHOT_ART.textureKey,
      )
        .setDisplaySize(SLINGSHOT_ART.displayWidth, SLINGSHOT_ART.displayHeight)
        .setDepth(6)
        .setName('decorative-slingshot-art');
    } else {
      this.slingshotArt = undefined;
      const fallback = this.add.graphics().setDepth(6).setName('decorative-sling-fallback');
      fallback.fillStyle(0x6e3d36).fillRoundedRect(SLING_ANCHOR.x - 48, 466, 26, 122, 12);
      fallback.fillRoundedRect(SLING_ANCHOR.x + 23, 466, 26, 122, 12);
      fallback.fillStyle(0xc87543).fillRoundedRect(SLING_ANCHOR.x - 42, 470, 13, 108, 7);
      fallback.fillRoundedRect(SLING_ANCHOR.x + 29, 470, 13, 108, 7);
    }
    this.backBand = this.add.graphics().setDepth(8);
    this.frontBand = this.add.graphics().setDepth(12);
    this.trajectory = this.add.graphics().setDepth(4);
  }

  private spawnBird(): void {
    if (this.state.shotsRemaining <= 0) {
      this.queueTurnResolution(350);
      return;
    }
    this.phase = 'ready';
    this.turnQueued = false;
    this.dragDistance = 0;
    this.birdSettledFor.clear();
    this.lastLaunchOrigin = undefined;
    this.lastLaunchVelocity = undefined;
    this.lastFlightVelocity = undefined;
    this.lastSplit = undefined;
    this.lastScarletPrecision = undefined;
    this.lastScarletImpact = undefined;
    this.scarletPrecisionTargetIds.clear();
    this.lastIronImpact = undefined;
    this.ironImpactArmed = false;
    this.phasingObstacle = undefined;
    this.phaseVelocity = undefined;
    this.lastPhasePass = undefined;
    this.lastGunnerShot = undefined;
    this.rearmGunners();
    this.birdId = this.birdQueue[this.currentQueueIndex()] ?? DEFAULT_BIRD_ID;
    const bird = getBirdSpec(this.birdId);
    const artTexture = BIRD_ART_TEXTURES[this.birdId];
    const texture = this.textures.exists(artTexture) ? artTexture : BIRD_TEXTURES[this.birdId];
    this.currentBird = this.matter.add.image(SLING_ANCHOR.x, SLING_ANCHOR.y, texture)
      .setDisplaySize(bird.spriteSize, bird.spriteSize)
      .setCircle(31)
      .setDensity(bird.density)
      .setFrictionAir(0)
      .setCollisionCategory(BIRD_COLLISION_CATEGORY)
      .setStatic(true)
      .setDepth(10);
    const body = this.bodyOf(this.currentBird);
    body.label = 'bird';
    this.currentBird.setData('kind', 'bird');
    this.currentBird.setData('birdId', this.birdId);
    this.currentBird.setData('trailColor', bird.burstColor);
    this.currentBird.setData('abilityUsed', false);
    this.currentBird.setData('phasing', false);
    this.birdSettledFor.set(this.currentBird, 0);
    gameBus.emit('hint:update', this.getReadyHint(), true);
    this.emitHud();
  }

  private handleQuickFireCommand(): void {
    if (!this.currentBird || this.pausedByUser || this.phase === 'ended' || this.phase === 'resolving') return;
    if (this.phase === 'flying') {
      return;
    }
    this.dragDistance = 112;
    this.currentBird.setPosition(SLING_ANCHOR.x - 102, SLING_ANCHOR.y + 46);
    this.launchCurrentBird();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.currentBird || this.phase === 'ended' || this.pausedByUser) return;
    if (this.phase === 'flying') {
      return;
    }
    if (this.phase !== 'ready') return;
    const distance = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, this.currentBird.x, this.currentBird.y);
    if (distance <= 68) {
      this.phase = 'dragging';
      gameBus.emit('sound', 'pull');
      gameBus.emit('hint:update', '虚线是预测轨迹 · 松手发射', true);
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    this.moveDraggedBird(pointer.worldX, pointer.worldY);
  }

  private moveDraggedBird(worldX: number, worldY: number): void {
    if (this.phase !== 'dragging' || !this.currentBird) return;
    const target = new Phaser.Math.Vector2(Math.min(worldX, SLING_ANCHOR.x + 24), worldY);
    const delta = target.subtract(new Phaser.Math.Vector2(SLING_ANCHOR.x, SLING_ANCHOR.y));
    if (delta.length() > 132) delta.setLength(132);
    this.currentBird.setPosition(SLING_ANCHOR.x + delta.x, SLING_ANCHOR.y + delta.y);
    this.dragDistance = delta.length();
    this.drawTrajectory();
  }

  private handlePointerUp(pointer?: Phaser.Input.Pointer): void {
    if (pointer?.wasCanceled) {
      this.cancelDrag();
      return;
    }
    if (this.phase !== 'dragging' || !this.currentBird) return;
    if (this.dragDistance < 22) {
      this.currentBird.setPosition(SLING_ANCHOR.x, SLING_ANCHOR.y);
      this.phase = 'ready';
      this.trajectory.clear();
      return;
    }
    this.launchCurrentBird();
  }

  private launchCurrentBird(): void {
    if (!this.currentBird || !this.state.launch()) return;
    const velocity = this.getLaunchVelocity();
    this.lastLaunchOrigin = { x: this.currentBird.x, y: this.currentBird.y };
    this.lastLaunchVelocity = velocity;
    this.lastFlightVelocity = { ...velocity };
    this.currentBird.setStatic(false);
    this.currentBird.setAwake();
    this.currentBird.setVelocity(velocity.x, velocity.y);
    this.currentBird.setAngularVelocity(0.055);
    this.phase = 'flying';
    this.launchStartedAt = this.time.now;
    this.birdTelemetry.beginShot({
      level: this.levelIndex + 1,
      birdId: this.birdId,
      startedAt: this.launchStartedAt,
      launchVelocity: velocity,
      startScore: this.state.score,
    });
    this.birdSettledFor.set(this.currentBird, 0);
    this.trailClock = 0;
    this.trajectory.clear();
    this.juice.launchBurst(this.currentBird.x, this.currentBird.y);
    gameBus.emit('sound', 'launch');
    gameBus.emit('hint:update', getBirdSpec(this.birdId).abilityHint, true);
    this.emitHud();
  }

  private tryAutoSplit(flightAge: number): void {
    const bird = this.currentBird;
    if (!bird) return;
    const nearestTargetDistance = [...this.destructibles.values()]
      .filter((record) => record.kind === 'target' && !record.destroyed && record.sprite.active)
      .reduce((nearest, record) => Math.min(
        nearest,
        Phaser.Math.Distance.Between(bird.x, bird.y, record.sprite.x, record.sprite.y),
      ), Number.POSITIVE_INFINITY);
    const trigger = resolveGaleSplitTrigger({
      birdId: this.birdId,
      flightAge,
      consumed: Boolean(bird.getData('abilityUsed')),
      positionX: bird.x,
      nearestTargetDistance,
    });
    if (!trigger) return;

    this.splitCurrentBird(flightAge, trigger);
  }

  private updateIronImpactArming(): void {
    const bird = this.currentBird;
    if (!bird?.active || this.ironImpactArmed || bird.getData('abilityUsed')) return;
    if (getBirdSpec(bird.getData('birdId')).id !== 'iron') return;
    this.ironImpactArmed = hasClearedIronLaunchZone(bird.x, SLING_ANCHOR.x);
  }

  private splitCurrentBird(flightAge: number, trigger: GaleSplitTrigger): void {
    const bird = this.currentBird;
    if (!bird || bird.getData('abilityUsed')) return;
    const birdSpec = getBirdSpec('gale');
    const body = this.bodyOf(bird);
    const velocities = computeSplitVelocities(body.velocity);
    const splitSize = birdSpec.spriteSize * GALE_SPLIT_SCALE;
    const splitGroup = this.matter.world.nextGroup(true);
    const splitOrigin = { x: bird.x, y: bird.y };
    const spawnPositions = computeSplitSpawnPositions(splitOrigin);
    const releasePlans: Array<{
      bird: Phaser.Physics.Matter.Image;
      velocity: { x: number; y: number };
      angularVelocity: number;
    }> = [];

    const holdAtSplitOrigin = (splitBird: Phaser.Physics.Matter.Image): void => {
      splitBird.setPosition(splitOrigin.x, splitOrigin.y)
        .setIgnoreGravity(true)
        .setVelocity(0, 0)
        .setAngularVelocity(0);
      this.bodyOf(splitBird).collisionFilter.mask = 0;
    };

    bird.setDisplaySize(splitSize, splitSize)
      .setCircle(GALE_SPLIT_RADIUS)
      .setDensity(birdSpec.density)
      .setFrictionAir(0)
      .setStatic(false)
      .setAwake()
      .setCollisionGroup(splitGroup);
    this.configureFlyingBird(bird, birdSpec, true);
    bird.setData('abilityUsed', true);
    holdAtSplitOrigin(bird);
    releasePlans.push({ bird, velocity: velocities[1], angularVelocity: -0.06 });

    const fragmentPlans = [
      { spawn: spawnPositions[1], velocity: velocities[0], angularVelocity: -0.075 },
      { spawn: spawnPositions[2], velocity: velocities[2], angularVelocity: 0.075 },
    ];
    for (const plan of fragmentPlans) {
      const fragment = this.matter.add.image(
        plan.spawn.x,
        plan.spawn.y,
        bird.texture.key,
      )
        .setDisplaySize(splitSize, splitSize)
        .setCircle(GALE_SPLIT_RADIUS)
        .setDensity(birdSpec.density)
        .setFrictionAir(0)
        .setDepth(10)
        .setCollisionGroup(splitGroup)
        .setRotation(bird.rotation);
      this.configureFlyingBird(fragment, birdSpec, true);
      fragment.setData('abilityUsed', true);
      holdAtSplitOrigin(fragment);
      this.auxiliaryBirds.add(fragment);
      this.birdSettledFor.set(fragment, 0);
      releasePlans.push({
        bird: fragment,
        velocity: plan.velocity,
        angularVelocity: plan.angularVelocity,
      });
    }

    this.lastSplit = {
      ...splitOrigin,
      flightAge,
      trigger,
      releaseDelayMs: GALE_SPLIT_ORIGIN_HOLD_MS,
      released: false,
      spawnPositions,
    };
    this.birdTelemetry.recordAbility({ at: this.time.now, ability: 'auto-split' });

    this.time.delayedCall(GALE_SPLIT_ORIGIN_HOLD_MS, () => {
      for (const plan of releasePlans) {
        if (!plan.bird.active) continue;
        plan.bird.setPosition(splitOrigin.x, splitOrigin.y)
          .setIgnoreGravity(false)
          .setVelocity(plan.velocity.x, plan.velocity.y)
          .setAngularVelocity(plan.angularVelocity);
        this.bodyOf(plan.bird).collisionFilter.mask = ALL_COLLISION_CATEGORIES;
      }
      if (this.lastSplit?.x === splitOrigin.x && this.lastSplit.y === splitOrigin.y) {
        this.lastSplit.released = true;
      }
    });

    this.juice.burst(splitOrigin.x, splitOrigin.y, birdSpec.burstColor, 18, 1.35);
    this.juice.flash(bird, 100);
    this.juice.shake(105, 0.0035);
    gameBus.emit('sound', 'split');
    gameBus.emit('hint:update', birdSpec.activatedHint, true);
  }

  private updateGunnerThreat(time: number, flightAge: number): void {
    const bird = this.currentBird;
    if (!bird?.active) return;

    if (this.activeGunnerAim) {
      const aim = this.activeGunnerAim;
      if (aim.gunner.destroyed || !aim.gunner.sprite.active || !aim.bird.active || aim.bird !== bird) {
        this.clearGunnerAimVisuals();
        return;
      }

      this.drawGunnerAim(aim, time);
      if (time - aim.startedAt >= GUNNER_AIM_DURATION_MS) {
        const deflectionSign = getGunnerDeflectionSign(aim.gunner.sprite.y, aim.bird.y);
        this.clearGunnerAimVisuals();
        this.fireGunnerShot(aim.gunner, aim.bird, deflectionSign);
      }
      return;
    }

    const gunner = [...this.destructibles.values()].find((record) =>
      record.kind === 'target'
      && record.gunner
      && record.gunnerState === 'loaded'
      && !record.destroyed
      && record.sprite.active);
    if (!gunner || !shouldStartGunnerAim({
      state: gunner.gunnerState ?? 'spent',
      flightAge,
      birdX: bird.x,
      birdActive: bird.active,
    })) return;

    this.beginGunnerAim(gunner, bird, time);
  }

  private beginGunnerAim(
    gunner: Destructible,
    bird: Phaser.Physics.Matter.Image,
    startedAt: number,
  ): void {
    this.setGunnerState(gunner, 'aiming');
    this.activeGunnerAim = {
      gunner,
      bird,
      startedAt,
      line: this.add.graphics().setDepth(16),
      reticle: this.add.circle(bird.x, bird.y, 19, 0xff6b57, 0.08)
        .setStrokeStyle(3, 0xff9a62, 0.92)
        .setDepth(18),
    };
    this.drawGunnerAim(this.activeGunnerAim, startedAt);
    this.juice.burst(gunner.sprite.x, gunner.sprite.y - 10, 0xffa34f, 7, 0.55);
    gameBus.emit('hint:update', '火铳正在锁定 · 击倒哨兵即可中断射击', true);
  }

  private drawGunnerAim(aim: ActiveGunnerAim, time: number): void {
    const remaining = Math.max(0, GUNNER_AIM_DURATION_MS - (time - aim.startedAt));
    const pulse = 0.58 + Math.sin((time - aim.startedAt) * 0.035) * 0.18;
    const muzzleX = aim.gunner.sprite.x - aim.gunner.sprite.displayWidth * 0.4;
    const muzzleY = aim.gunner.sprite.y + aim.gunner.sprite.displayHeight * 0.08;
    aim.line.clear().lineStyle(2, 0xff7358, pulse)
      .lineBetween(muzzleX, muzzleY, aim.bird.x, aim.bird.y);
    aim.reticle.setPosition(aim.bird.x, aim.bird.y).setScale(1 + pulse * 0.08);
    aim.gunner.gunnerBadge?.setText(`锁定 ${(remaining / 1_000).toFixed(1)}s`);
  }

  private clearGunnerAimVisuals(): void {
    if (!this.activeGunnerAim) return;
    this.activeGunnerAim.line.destroy();
    this.activeGunnerAim.reticle.destroy();
    this.activeGunnerAim = undefined;
  }

  private fireGunnerShot(
    gunner: Destructible,
    bird: Phaser.Physics.Matter.Image,
    deflectionSign: number,
  ): boolean {
    if (gunner.gunnerState === 'firing'
      || gunner.gunnerState === 'spent'
      || gunner.destroyed
      || !gunner.sprite.active
      || !bird.active) return false;

    this.setGunnerState(gunner, 'firing');
    const birdSpec = getBirdSpec(bird.getData('birdId'));
    const body = this.bodyOf(bird);
    const velocityBefore = { x: body.velocity.x, y: body.velocity.y };
    const result = resolveGunnerShot({
      deflectionSign,
      birdId: birdSpec.id,
      velocity: velocityBefore,
    });
    const muzzleX = gunner.sprite.x - gunner.sprite.displayWidth * 0.4;
    const muzzleY = gunner.sprite.y + gunner.sprite.displayHeight * 0.08;
    const destinationX = bird.x;
    const destinationY = bird.y;
    const tracer = this.add.graphics().setDepth(17).lineStyle(3, 0xffd166, 0.88)
      .lineBetween(muzzleX, muzzleY, destinationX, destinationY);
    const projectile = this.add.circle(muzzleX, muzzleY, 7, 0x332437, 1)
      .setStrokeStyle(3, 0xffb44f, 1)
      .setDepth(18);

    const exploded = false;
    bird.setVelocity(result.velocity.x, result.velocity.y)
      .setAngularVelocity(deflectionSign < 0 ? -0.2 : 0.2);
    const velocityAfter = { ...result.velocity };
    this.juice.flash(bird, 90);
    this.juice.burst(bird.x, bird.y, 0xffd166, 12, 0.85);
    gameBus.emit('hint:update', '火铳命中！怒羽偏离了原定轨道', true);
    this.lastGunnerShot = {
      gunnerX: gunner.sprite.x,
      gunnerY: gunner.sprite.y,
      birdId: birdSpec.id,
      hit: true,
      exploded,
      velocityBefore,
      velocityAfter,
    };

    this.juice.burst(muzzleX, muzzleY, 0xffb44f, 12, 1);
    this.juice.shake(82, 0.0032);
    gameBus.emit('sound', 'gunshot');
    this.tweens.add({
      targets: tracer,
      alpha: 0,
      duration: GUNNER_SHOT_TRAVEL_MS,
      onComplete: () => tracer.destroy(),
    });
    this.tweens.add({
      targets: projectile,
      x: destinationX,
      y: destinationY,
      duration: GUNNER_SHOT_TRAVEL_MS,
      ease: 'Quad.easeIn',
      onComplete: () => {
        projectile.destroy();
        if (!gunner.destroyed && gunner.sprite.active) this.setGunnerState(gunner, 'spent');
      },
    });
    return true;
  }

  private setGunnerState(gunner: Destructible, state: GunnerState): void {
    gunner.gunnerState = state;
    gunner.gunnerShotUsed = state === 'firing' || state === 'spent';
    gunner.sprite.setData('gunnerState', state);
    gunner.sprite.setAlpha(state === 'spent' ? 0.76 : 1);
    if (state === 'aiming') gunner.sprite.setTint(0xffc07a);
    else if (state === 'firing') gunner.sprite.setTint(0xff8b55);
    else gunner.sprite.clearTint();

    const label = state === 'loaded'
      ? '火铳就绪'
      : state === 'aiming'
        ? '锁定中'
        : state === 'firing'
          ? '开火！'
          : '空膛';
    gunner.gunnerBadge?.setText(label)
      .setColor(state === 'spent' ? '#b9b0bb' : state === 'aiming' ? '#fff0b8' : '#ffe2a8');
  }

  private rearmGunners(): void {
    this.clearGunnerAimVisuals();
    for (const record of this.destructibles.values()) {
      if (record.gunner && !record.destroyed && record.sprite.active) this.setGunnerState(record, 'loaded');
    }
  }

  private updateGunnerBadges(): void {
    for (const record of this.destructibles.values()) {
      if (!record.gunnerBadge?.active || !record.sprite.active) continue;
      record.gunnerBadge.setPosition(record.sprite.x, record.sprite.y - record.sprite.displayHeight * 0.72);
    }
  }

  private getReadyHint(): string {
    const level = LEVELS[this.levelIndex];
    if (this.state.shotsRemaining === level.shots && level.tacticalHint) return level.tacticalHint;
    return '拖拽怒羽瞄准，或点右下角「发射」';
  }

  private configureFlyingBird(
    bird: Phaser.Physics.Matter.Image,
    birdSpec: BirdSpec,
    splitFragment: boolean,
  ): void {
    bird.setCollisionCategory(BIRD_COLLISION_CATEGORY);
    this.bodyOf(bird).label = 'bird';
    bird.setData('kind', 'bird');
    bird.setData('birdId', birdSpec.id);
    bird.setData('trailColor', birdSpec.burstColor);
    bird.setData('isSplitFragment', splitFragment);
  }

  private drawTrajectory(): void {
    if (!this.currentBird) return;
    this.trajectory.clear();
    const origin = { x: this.currentBird.x, y: this.currentBird.y };
    const velocity = this.getLaunchVelocity();
    for (let index = 1; index <= 17; index += 1) {
      const tick = index * 2.6;
      const point = sampleBallisticTrajectory(origin, velocity, tick);
      if (point.x > WORLD_WIDTH || point.y > GROUND_Y) break;
      const alpha = 0.72 * (1 - index / 22);
      this.trajectory.fillStyle(0xffefbd, alpha)
        .fillCircle(point.x, point.y, Math.max(2.2, 5 - index * 0.13));
    }
  }

  private getLaunchVelocity(): { x: number; y: number } {
    if (!this.currentBird) return { x: 0, y: 0 };
    return computeLaunchVelocity(this.birdId, {
      x: SLING_ANCHOR.x - this.currentBird.x,
      y: SLING_ANCHOR.y - this.currentBird.y,
    });
  }

  private updateBands(): void {
    if (!this.backBand || !this.frontBand) return;
    const held = this.currentBird?.active && (this.phase === 'ready' || this.phase === 'dragging');
    const targetX = held ? this.currentBird!.x : SLING_ANCHOR.x;
    const targetY = held ? this.currentBird!.y : SLING_ANCHOR.y;
    const leftForkX = SLING_ANCHOR.x + SLINGSHOT_ART.leftForkOffset.x;
    const leftForkY = SLING_ANCHOR.y + SLINGSHOT_ART.leftForkOffset.y;
    const rightForkX = SLING_ANCHOR.x + SLINGSHOT_ART.rightForkOffset.x;
    const rightForkY = SLING_ANCHOR.y + SLINGSHOT_ART.rightForkOffset.y;
    this.backBand.clear().lineStyle(10, 0x3a2333, 1)
      .lineBetween(leftForkX, leftForkY, targetX, targetY);
    this.frontBand.clear().lineStyle(9, 0x5c3040, 1)
      .lineBetween(targetX, targetY, rightForkX, rightForkY);
  }

  private handleCollisions(event: CollisionEvent): void {
    for (const pair of event.pairs) {
      const phasedA = this.triggerFirstObstaclePhase(pair.bodyA, pair.bodyB);
      const phasedB = this.triggerFirstObstaclePhase(pair.bodyB, pair.bodyA);
      if (!phasedA && !phasedB) {
        this.applyImpact(pair.bodyA, pair.bodyB);
        this.applyImpact(pair.bodyB, pair.bodyA);
      }
      this.triggerImpactExplosion(pair.bodyA, pair.bodyB);
      this.triggerImpactExplosion(pair.bodyB, pair.bodyA);
    }
  }

  private triggerFirstObstaclePhase(birdBody: MatterJS.BodyType, obstacleBody: MatterJS.BodyType): boolean {
    if (this.phase !== 'flying') return false;
    const bird = birdBody.gameObject as Phaser.Physics.Matter.Image | undefined;
    const birdSpec = bird?.getData('kind') === 'bird'
      ? getBirdSpec(bird.getData('birdId'))
      : undefined;
    const isObstacle = obstacleBody.collisionFilter.category === OBSTACLE_COLLISION_CATEGORY;
    if (!bird || !birdSpec || !shouldPhaseFirstObstacle({
      birdId: birdSpec.id,
      consumed: Boolean(bird.getData('abilityUsed')),
      isObstacle,
    })) return false;

    const velocity = this.lastFlightVelocity ?? {
      x: birdBody.velocity.x,
      y: birdBody.velocity.y,
    };
    const horizontal = Math.abs(velocity.x) >= Math.abs(velocity.y);
    const obstacleExtent = horizontal
      ? obstacleBody.bounds.max.x - obstacleBody.bounds.min.x
      : obstacleBody.bounds.max.y - obstacleBody.bounds.min.y;
    const speed = horizontal ? velocity.x : velocity.y;
    const durationMs = computeObstaclePhaseDuration(obstacleExtent, speed);
    const obstacleRecord = this.destructibles.get(obstacleBody.id);
    const entryPosition = { x: bird.x, y: bird.y };
    const velocityMagnitude = Math.max(0.001, Math.hypot(velocity.x, velocity.y));
    const entryNudge = Math.min(18, Math.max(7, velocityMagnitude * 0.72));
    const phaseDirection = {
      x: velocity.x / velocityMagnitude,
      y: velocity.y / velocityMagnitude,
    };

    bird.setData('abilityUsed', true);
    this.birdTelemetry.recordAbility({ at: this.time.now, ability: 'first-obstacle-phase' });
    bird.setData('phasing', true);
    bird.setAlpha(0.58);
    birdBody.collisionFilter.mask = ALL_COLLISION_CATEGORIES & ~OBSTACLE_COLLISION_CATEGORY;
    bird.setPosition(
      entryPosition.x + phaseDirection.x * entryNudge,
      entryPosition.y + phaseDirection.y * entryNudge,
    );
    bird.setVelocity(velocity.x, velocity.y);
    this.phaseVelocity = { ...velocity };
    this.phasingObstacle = obstacleBody;
    this.phaseStartedAt = this.time.now;
    this.phaseDeadline = this.phaseStartedAt + durationMs;
    this.lastPhasePass = {
      obstacleId: obstacleBody.id,
      obstacleLabel: obstacleBody.label,
      startedAt: this.phaseStartedAt,
      durationMs,
      completed: false,
      birdXAtStart: entryPosition.x,
      obstacleMinX: obstacleBody.bounds.min.x,
      obstacleMaxX: obstacleBody.bounds.max.x,
      obstacleHealthBefore: obstacleRecord?.health,
    };

    this.juice.burst(bird.x, bird.y, birdSpec.burstColor, 16, 1.15);
    this.juice.flash(bird, 100);
    this.juice.shake(90, 0.003);
    gameBus.emit('sound', 'phase');
    gameBus.emit('hint:update', birdSpec.activatedHint, true);
    return true;
  }

  private updateObstaclePhase(time: number): void {
    const bird = this.currentBird;
    const obstacle = this.phasingObstacle;
    if (!bird?.active || !obstacle || !bird.getData('phasing')) return;
    const body = this.bodyOf(bird);
    const overlaps = body.bounds.min.x <= obstacle.bounds.max.x
      && body.bounds.max.x >= obstacle.bounds.min.x
      && body.bounds.min.y <= obstacle.bounds.max.y
      && body.bounds.max.y >= obstacle.bounds.min.y;
    const safelyInsideWindow = time - this.phaseStartedAt >= 34;
    if (safelyInsideWindow && !overlaps) {
      this.finishObstaclePhase();
      return;
    }
    if (time >= this.phaseDeadline) {
      const velocity = this.phaseVelocity ?? { x: body.velocity.x, y: body.velocity.y };
      const exit = computeObstacleExitPosition(
        obstacle.bounds,
        {
          x: Math.max(body.position.x - body.bounds.min.x, body.bounds.max.x - body.position.x),
          y: Math.max(body.position.y - body.bounds.min.y, body.bounds.max.y - body.position.y),
        },
        velocity,
        { x: bird.x, y: bird.y },
      );
      bird.setPosition(exit.x, exit.y);
      bird.setVelocity(velocity.x, velocity.y);
      this.finishObstaclePhase();
    }
  }

  private finishObstaclePhase(): void {
    const bird = this.currentBird;
    if (!bird?.active || !bird.getData('phasing')) return;
    const body = this.bodyOf(bird);
    body.collisionFilter.mask = ALL_COLLISION_CATEGORIES;
    bird.setData('phasing', false);
    bird.setAlpha(1);
    if (this.lastPhasePass) {
      const obstacleRecord = this.destructibles.get(this.lastPhasePass.obstacleId);
      this.lastPhasePass.completed = true;
      this.lastPhasePass.birdXAtEnd = bird.x;
      this.lastPhasePass.obstacleHealthAfter = obstacleRecord?.health;
    }
    this.phasingObstacle = undefined;
    this.phaseVelocity = undefined;
    gameBus.emit('hint:update', '首障未受伤 · 后续建筑恢复正常碰撞', true);
  }

  private applyImpact(body: MatterJS.BodyType, other: MatterJS.BodyType): void {
    const record = this.destructibles.get(body.id);
    if (!record || record.destroyed || this.phase === 'ended') return;
    if (this.phasingObstacle?.id === body.id) return;
    if (this.phase === 'ready' && this.state.shotsRemaining === LEVELS[this.levelIndex].shots) return;
    const now = this.time.now;
    if (now - record.lastImpactAt < 90) return;

    const relativeVelocity = {
      x: other.velocity.x - body.velocity.x,
      y: other.velocity.y - body.velocity.y,
    };
    const relativeSpeed = Math.hypot(relativeVelocity.x, relativeVelocity.y);
    if (relativeSpeed < 1.8) return;
    const otherObject = other.gameObject as Phaser.Physics.Matter.Image | undefined;
    const directBird = otherObject?.getData('kind') === 'bird';
    const directBirdSpec = directBird ? getBirdSpec(otherObject?.getData('birdId')) : undefined;
    const directImpactFactor = directBirdSpec?.ability === 'impact-blast'
      ? 3.8
      : directBirdSpec?.ability === 'auto-split'
        ? 3.1
        : 3.35;
    const splitFactor = otherObject?.getData('isSplitFragment') ? 0.82 : 1;
    const factor = directBird
      ? directImpactFactor * splitFactor * (directBirdSpec?.impactMultiplier ?? 1)
      : other.isStatic ? 1.55 : 2.1;
    const precisionState = directBirdSpec?.ability === 'precision-strike' ? {
      birdId: directBirdSpec.id,
      birdPosition: { x: other.position.x, y: other.position.y },
      obstacleBounds: body.bounds,
      relativeVelocity,
    } : undefined;
    const precision = Boolean(
      precisionState
      && !this.scarletPrecisionTargetIds.has(body.id)
      && !(record.kind === 'target' && isTargetDamageGuarded(now, record.damageGuardUntil))
      && isScarletPrecisionImpact(precisionState),
    );
    if (precisionState) {
      this.lastScarletImpact = {
        obstacleLabel: body.label,
        alignment: Number(computeScarletPrecisionAlignment(precisionState).toFixed(3)),
        relativeSpeed: Number(relativeSpeed.toFixed(3)),
        precision,
      };
    }
    const damage = Math.max(
      0,
      (relativeSpeed - 1.15) * factor * (precision ? SCARLET_PRECISION_DAMAGE_MULTIPLIER : 1),
    );
    if (damage < 1.4) return;

    if (precision && precisionState) {
      this.scarletPrecisionTargetIds.add(body.id);
      this.state.addImpactPoints(SCARLET_PRECISION_SCORE_BONUS);
      this.birdTelemetry.recordAbility({
        at: now,
        ability: 'precision-strike',
        score: SCARLET_PRECISION_SCORE_BONUS,
      });
      this.lastScarletPrecision = {
        obstacleLabel: body.label,
        alignment: Number(computeScarletPrecisionAlignment(precisionState).toFixed(3)),
        damageMultiplier: SCARLET_PRECISION_DAMAGE_MULTIPLIER,
        bonusPoints: SCARLET_PRECISION_SCORE_BONUS,
      };
      this.juice.scorePop(record.sprite.x, record.sprite.y - 46, `精准 +${SCARLET_PRECISION_SCORE_BONUS}`, '#ffd166');
      this.juice.shake(90, 0.0038);
      gameBus.emit('hint:update', getBirdSpec('scarlet').activatedHint, true);
    }
    record.lastImpactAt = now;
    this.damageDestructible(record, damage, directBirdSpec, directBird ? 'direct' : 'physics', precision);
  }

  private triggerImpactExplosion(birdBody: MatterJS.BodyType, otherBody: MatterJS.BodyType): void {
    if (this.phase !== 'flying') return;
    const bird = birdBody.gameObject as Phaser.Physics.Matter.Image | undefined;
    const other = otherBody.gameObject as Phaser.Physics.Matter.Image | undefined;
    if (bird?.getData('kind') !== 'bird' || other?.getData('kind') === 'bird') return;
    const birdId = getBirdSpec(bird.getData('birdId')).id;
    const consumed = Boolean(bird.getData('abilityUsed'));
    if (birdId !== 'iron' || consumed) return;
    this.updateIronImpactArming();
    const flightAge = this.time.now - this.launchStartedAt;
    const launchCleared = this.ironImpactArmed;
    const armed = shouldDetonateOnImpact({ birdId, launchCleared, consumed });
    this.lastIronImpact = {
      obstacleLabel: otherBody.label,
      flightAge,
      birdX: bird.x,
      launchCleared,
      armed,
      detonated: false,
    };
    if (!armed) return;
    this.lastIronImpact.detonated = this.detonateIronBird(bird);
  }

  private detonateIronBird(bird: Phaser.Physics.Matter.Image): boolean {
    const birdSpec = getBirdSpec(bird.getData('birdId'));
    if (birdSpec.ability !== 'impact-blast' || bird.getData('abilityUsed')) return false;
    bird.setData('abilityUsed', true);
    this.birdTelemetry.recordAbility({ at: this.time.now, ability: 'impact-blast' });
    const origin = { x: bird.x, y: bird.y };
    const affected = [...this.destructibles.values()].filter((record) => {
      if (record.destroyed || !record.sprite.active) return false;
      return Phaser.Math.Distance.Between(origin.x, origin.y, record.sprite.x, record.sprite.y)
        <= IRON_BLAST_RADIUS;
    });
    this.lastExplosion = { ...origin, radius: IRON_BLAST_RADIUS, hits: affected.length };

    for (const record of affected) {
      const dx = record.sprite.x - origin.x;
      const dy = record.sprite.y - origin.y;
      const distance = Math.hypot(dx, dy);
      const damage = computeExplosionDamage(distance);
      if (damage <= 0) continue;
      const normalX = distance > 0 ? dx / distance : 0;
      const normalY = distance > 0 ? dy / distance : -1;
      const impulse = 0.8 + 4.2 * (1 - distance / IRON_BLAST_RADIUS);
      const body = this.bodyOf(record.sprite);
      record.sprite.setVelocity(
        body.velocity.x + normalX * impulse,
        body.velocity.y + normalY * impulse - 0.8,
      );
      this.damageDestructible(record, damage, birdSpec, 'ability');
    }

    const ring = this.add.circle(origin.x, origin.y, 24, 0xffa552, 0.22)
      .setStrokeStyle(9, 0xffd166, 0.92)
      .setDepth(19);
    this.tweens.add({
      targets: ring,
      scale: IRON_BLAST_RADIUS / 24,
      alpha: 0,
      duration: 360,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    this.juice.burst(origin.x, origin.y, 0xff9f43, 24, 1.8);
    this.juice.shake(150, 0.006);
    gameBus.emit('sound', 'explosion');
    gameBus.emit('hint:update', birdSpec.activatedHint, true);
    return true;
  }

  private damageDestructible(
    record: Destructible,
    damage: number,
    directBirdSpec?: BirdSpec,
    source: BirdImpactSource = 'physics',
    precision = false,
  ): TargetDamageResult {
    if (record.kind === 'target' && isTargetDamageGuarded(this.time.now, record.damageGuardUntil)) {
      this.birdTelemetry.recordImpact({
        at: this.time.now,
        source,
        kind: record.kind,
        material: record.material,
        damageDealt: 0,
        score: 0,
        absorbed: false,
        precision,
      });
      return {
        health: record.health,
        armorHitsRemaining: record.armorHitsRemaining,
        absorbed: false,
      };
    }
    const healthBefore = record.health;
    const result = resolveTargetDamage(record.health, record.armorHitsRemaining, damage);
    record.health = result.health;
    record.armorHitsRemaining = result.armorHitsRemaining;
    const impactScore = result.absorbed ? 0 : Math.round(Math.min(120, damage * 5));
    this.birdTelemetry.recordImpact({
      at: this.time.now,
      source,
      kind: record.kind,
      material: record.material,
      damageDealt: Math.max(0, healthBefore - result.health),
      score: impactScore,
      absorbed: result.absorbed,
      precision,
    });
    this.juice.flash(record.sprite, 62);

    if (result.absorbed) {
      record.damageGuardUntil = this.time.now + TARGET_ARMOR_BREAK_GRACE_MS;
      const baseTexture = this.textures.exists(TARGET_ART.textureKey) ? TARGET_ART.textureKey : TEXTURES.target;
      record.sprite.setTexture(baseTexture).setData('armored', false);
      this.juice.burst(record.sprite.x, record.sprite.y - 12, 0xbcc4d9, 12, 0.9);
      this.juice.scorePop(record.sprite.x, record.sprite.y - 38, '破甲！', '#dce4f2');
      this.juice.shake(105, 0.0042);
      gameBus.emit('hint:update', '铁盔已碎 · 短暂破甲反馈后，下一击会造成伤害', true);
      this.emitHud();
      this.playImpactSound(directBirdSpec);
      return result;
    }

    const tint = record.material === 'jelly' ? 0x78d6a3 : MATERIAL_STATS[record.material].tint;
    this.juice.burst(record.sprite.x, record.sprite.y, tint, damage > 15 ? 7 : 4, 0.6);
    this.state.addImpactPoints(impactScore);
    this.emitHud();

    this.playImpactSound(directBirdSpec);
    if (record.health <= 0) this.destroyDestructible(record, damage);
    return result;
  }

  private playImpactSound(directBirdSpec?: BirdSpec): void {
    if (this.time.now - this.lastImpactSoundAt > 95) {
      gameBus.emit('sound', directBirdSpec?.impactCue ?? 'impact');
      this.lastImpactSoundAt = this.time.now;
    }
  }

  private destroyDestructible(record: Destructible, impact: number): void {
    if (record.destroyed) return;
    const interruptedGunnerAim = this.activeGunnerAim?.gunner === record;
    if (interruptedGunnerAim) this.clearGunnerAimVisuals();
    record.destroyed = true;
    record.gunnerBadge?.destroy();
    const sprite = record.sprite;
    const body = this.bodyOf(sprite);
    const isTarget = record.kind === 'target';
    const result = this.state.registerDestruction(record.points, isTarget, this.time.now);
    this.birdTelemetry.recordDestruction({
      at: this.time.now,
      kind: record.kind,
      material: record.material,
      score: result.points,
    });
    const color = record.material === 'jelly' ? 0x78d6a3 : MATERIAL_STATS[record.material].tint;

    this.juice.burst(sprite.x, sprite.y, color, isTarget ? 16 : 11, Math.min(1.5, 0.8 + impact / 35));
    this.juice.scorePop(sprite.x, sprite.y - 16, `+${result.points}`);
    this.juice.shake(isTarget ? 125 : 80, isTarget ? 0.0055 : 0.0032);
    gameBus.emit('sound', isTarget ? 'target' : 'break');
    gameBus.emit('combo:show', result.combo, result.points);
    if (interruptedGunnerAim) {
      gameBus.emit('hint:update', '哨兵已被击倒 · 火铳拦截中断！', true);
    }
    this.emitHud();

    this.destructibles.delete(body.id);
    this.time.delayedCall(0, () => {
      if (!sprite.active) return;
      this.matter.world.remove(body);
      sprite.destroy();
      this.wakeStructureBodies();
    });

    if (result.targetsRemaining === 0) this.queueTurnResolution(850);
  }

  private queueTurnResolution(delay: number): void {
    if (this.turnQueued || this.phase === 'ended') return;
    if (this.activeGunnerAim) {
      const gunner = this.activeGunnerAim.gunner;
      this.clearGunnerAimVisuals();
      if (!gunner.destroyed && gunner.sprite.active) this.setGunnerState(gunner, 'spent');
    }
    this.turnQueued = true;
    this.phase = 'resolving';
    gameBus.emit('hint:update', '', false);
    this.time.delayedCall(delay, () => this.resolveTurn());
  }

  private resolveTurn(): void {
    const status = this.state.resolveTurn();
    if (status !== 'playing') {
      this.birdTelemetry.endShot({
        endedAt: this.time.now,
        endScore: this.state.score,
        endReason: status,
      });
    }
    this.emitHud();
    if (status === 'won' || status === 'lost') {
      this.phase = 'ended';
      if (status === 'won') this.juice.celebrate();
      gameBus.emit('sound', status === 'won' ? 'win' : 'lose');
      const payload: ResultPayload = {
        levelIndex: this.levelIndex,
        won: status === 'won',
        finalLevel: this.levelIndex === LEVELS.length - 1,
        levelScore: this.state.levelScore,
        bestCombo: this.state.bestCombo,
        shotsRemaining: this.state.shotsRemaining,
        stars: calculateStarRating(status === 'won', this.state.shotsRemaining),
      };
      this.time.delayedCall(status === 'won' ? 620 : 180, () => gameBus.emit('result:show', payload));
      return;
    }

    this.destroyAuxiliaryBirds();
    if (this.currentBird?.active) {
      const body = this.bodyOf(this.currentBird);
      this.matter.world.remove(body);
      this.currentBird.destroy();
    }
    this.currentBird = undefined;
    this.spawnBird();
  }

  private destroyAuxiliaryBirds(): void {
    for (const bird of this.auxiliaryBirds) {
      if (!bird.active) continue;
      this.matter.world.remove(this.bodyOf(bird));
      bird.destroy();
      this.birdSettledFor.delete(bird);
    }
    this.auxiliaryBirds.clear();
    this.birdSettledFor.clear();
  }

  private emitHud(): void {
    const payload: HudPayload = {
      level: this.levelIndex + 1,
      totalLevels: LEVELS.length,
      score: this.state.score,
      shots: this.state.shotsRemaining,
      birdId: this.birdId,
      remainingBirdQueue: this.remainingBirdQueue(),
      status: this.state.status,
    };
    gameBus.emit('hud:update', payload);
  }

  private wakeStructureBodies(): void {
    for (const record of this.destructibles.values()) {
      if (!record.destroyed && record.sprite.active && !this.bodyOf(record.sprite).isStatic) {
        record.sprite.setAwake();
      }
    }
  }

  private showLevelIntro(): void {
    const level = LEVELS[this.levelIndex];
    const title = this.add.text(WORLD_WIDTH / 2, 120, `${this.levelIndex + 1} · ${level.name}`, {
      fontFamily: 'Arial Black, Microsoft YaHei, sans-serif',
      fontSize: '34px',
      color: '#fff0c4',
      stroke: '#2a2138',
      strokeThickness: 8,
    }).setOrigin(0.5).setDepth(30);
    const subtitle = this.add.text(WORLD_WIDTH / 2, 163, level.subtitle, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '17px',
      color: '#ffdba4',
      stroke: '#2a2138',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({
      targets: [title, subtitle],
      y: '-=12',
      alpha: 0,
      delay: 1_150,
      duration: 620,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        title.destroy();
        subtitle.destroy();
      },
    });
  }

  private handleRestartCommand(): void {
    if (this.pausedByUser) this.scene.resume();
    this.scene.restart({ levelIndex: this.levelIndex, totalScore: this.state.retryScore(), birdQueue: this.birdQueue });
  }

  private handleNextCommand(): void {
    if (this.state.status !== 'won') return;
    const nextLevel = Math.min(LEVELS.length - 1, this.levelIndex + 1);
    const birdQueue = resizeBirdQueue(this.birdQueue, LEVELS[nextLevel].shots);
    this.scene.restart({ levelIndex: nextLevel, totalScore: this.state.score, birdQueue });
  }

  private handleReplayCommand(): void {
    const birdQueue = resizeBirdQueue(this.birdQueue, LEVELS[0].shots);
    this.scene.restart({ levelIndex: 0, totalScore: 0, birdQueue });
  }

  private currentQueueIndex(): number {
    return Math.max(0, this.birdQueue.length - this.state.shotsRemaining);
  }

  private remainingBirdQueue(): BirdId[] {
    return this.birdQueue.slice(this.currentQueueIndex());
  }

  private handlePauseCommand(): void {
    if (this.phase === 'ended') return;
    this.pausedByUser = !this.pausedByUser;
    if (this.pausedByUser) this.scene.pause();
    else this.scene.resume();
    gameBus.emit('pause:changed', this.pausedByUser);
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden && !this.pausedByUser && this.phase !== 'ended') this.handlePauseCommand();
  };

  private readonly handleGlobalPointerRelease = (): void => {
    if (this.phase === 'dragging') this.handlePointerUp();
  };

  private readonly handleGlobalPointerCancel = (): void => {
    this.cancelDrag();
  };

  private cancelDrag(): void {
    if (this.phase !== 'dragging' || !this.currentBird) return;
    this.currentBird.setPosition(SLING_ANCHOR.x, SLING_ANCHOR.y);
    this.dragDistance = 0;
    this.phase = 'ready';
    this.trajectory.clear();
    gameBus.emit('hint:update', '拖拽怒羽瞄准，或点右下角「发射」', true);
  }

  private readonly handleGlobalPointerMove = (event: PointerEvent): void => {
    if (this.phase !== 'dragging') return;
    const bounds = this.game.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    this.moveDraggedBird(
      (event.clientX - bounds.left) * (WORLD_WIDTH / bounds.width),
      (event.clientY - bounds.top) * (WORLD_HEIGHT / bounds.height),
    );
  };

  private cleanup(): void {
    const matterWorld = this.matter?.world as Phaser.Physics.Matter.World | null | undefined;
    const input = this.input as Phaser.Input.InputPlugin | null | undefined;
    matterWorld?.off('collisionstart', this.handleCollisions, this);
    input?.off('pointerdown', this.handlePointerDown, this);
    input?.off('pointermove', this.handlePointerMove, this);
    input?.off('pointerup', this.handlePointerUp, this);
    window.removeEventListener('pointermove', this.handleGlobalPointerMove, true);
    window.removeEventListener('pointerup', this.handleGlobalPointerRelease, true);
    window.removeEventListener('pointercancel', this.handleGlobalPointerCancel, true);
    input?.keyboard?.off('keydown-ESC', this.handlePauseCommand, this);
    input?.keyboard?.off('keydown-R', this.handleRestartCommand, this);
    input?.keyboard?.off('keydown-SPACE', this.handleQuickFireCommand, this);
    gameBus.off('command:quick-fire', this.handleQuickFireCommand, this);
    gameBus.off('command:restart', this.handleRestartCommand, this);
    gameBus.off('command:retry', this.handleRestartCommand, this);
    gameBus.off('command:pause', this.handlePauseCommand, this);
    gameBus.off('command:continue', this.handlePauseCommand, this);
    gameBus.off('command:next', this.handleNextCommand, this);
    gameBus.off('command:replay', this.handleReplayCommand, this);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.clearGunnerAimVisuals();
    this.auxiliaryBirds.clear();
    this.birdSettledFor.clear();
    this.phasingObstacle = undefined;
  }

  private bodyOf(sprite: Phaser.Physics.Matter.Image): MatterJS.BodyType {
    return sprite.body as MatterJS.BodyType;
  }
}
