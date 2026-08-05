import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from './game/content/levels';
import { gameBus, type StartMissionPayload } from './game/events';
import { GAME_GRAVITY_Y } from './game/simulation/trajectory';
import { GameScene } from './phaser/scenes/GameScene';

export interface GameRuntime {
  startMission: (payload: StartMissionPayload) => void;
  stopMission: () => void;
}

interface GameRuntimeOptions {
  startsFromSitePortal: boolean;
  getLoadoutDebugState: () => Record<string, unknown>;
}

export function createGameRuntime(options: GameRuntimeOptions): GameRuntime {
  const config: Phaser.Types.Core.GameConfig = {
    type: options.startsFromSitePortal ? Phaser.CANVAS : Phaser.AUTO,
    parent: 'game-container',
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    backgroundColor: '#17132a',
    transparent: false,
    antialias: true,
    pixelArt: false,
    render: {
      roundPixels: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: import.meta.env.DEV && !options.startsFromSitePortal,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
    },
    physics: {
      default: 'matter',
      matter: {
        gravity: { x: 0, y: GAME_GRAVITY_Y },
        enableSleeping: true,
        debug: false,
      },
    },
  };

  const game = new Phaser.Game(config);
  game.scene.add('GameScene', GameScene, false);

  const scene = (): GameScene | undefined => game.scene.getScene('GameScene') as GameScene | undefined;
  const activeScene = (): GameScene | undefined => {
    const current = scene();
    return current?.scene.isActive() || current?.scene.isPaused() ? current : undefined;
  };

  const runtime: GameRuntime = {
    startMission: (payload) => {
      if (game.scene.isActive('GameScene') || game.scene.isPaused('GameScene')) game.scene.stop('GameScene');
      game.scene.start('GameScene', { levelIndex: payload.levelIndex, birdQueue: payload.birdQueue, totalScore: 0 });
    },
    stopMission: () => {
      if (game.scene.isActive('GameScene') || game.scene.isPaused('GameScene')) game.scene.stop('GameScene');
    },
  };

  if (import.meta.env.DEV) {
    window.__furyFlock = {
      getState: () => activeScene()?.getDebugState() ?? options.getLoadoutDebugState(),
      launch: (velocityX, velocityY) => activeScene()?.debugLaunch(velocityX, velocityY) ?? false,
      resolveTurn: () => activeScene()?.debugResolveTurn() ?? false,
      predictYAtX: (targetX) => activeScene()?.debugPredictYAtX(targetX) ?? null,
      completeLevel: () => activeScene()?.debugCompleteLevel() ?? false,
      damageTarget: (targetIndex, damage) => activeScene()?.debugDamageTarget(targetIndex, damage) ?? null,
      removeSupportUnderTarget: () => activeScene()?.debugRemoveSupportUnderTarget() ?? null,
      fireGunnerShot: (deflectionSign) => activeScene()?.debugFireGunnerShot(deflectionSign) ?? false,
      restart: () => {
        if (game.scene.isActive('GameScene')) gameBus.emit('command:restart');
      },
    };
  }

  return runtime;
}

declare global {
  interface Window {
    __furyFlock?: {
      getState: () => Record<string, any> | null;
      launch: (velocityX?: number, velocityY?: number) => boolean;
      resolveTurn: () => boolean;
      predictYAtX: (targetX: number) => number | null;
      completeLevel: () => boolean;
      damageTarget: (targetIndex: number, damage: number) => Record<string, unknown> | null;
      removeSupportUnderTarget: () => { x: number; initialY: number } | null;
      fireGunnerShot: (deflectionSign?: number) => boolean;
      restart: () => void;
    };
  }
}
