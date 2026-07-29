import './styles.css';
import './site-v2.css';
import { LEVELS } from './game/content/levels';
import { gameBus, type SoundCue, type StartMissionPayload } from './game/events';
import { createBrowserStarProgress } from './game/progression/starProgress';
import type { GameRuntime } from './gameRuntime';
import { AudioSynth } from './ui/AudioSynth';
import { HudController } from './ui/HudController';
import { LoadoutController } from './ui/LoadoutController';
import { SitePortalController } from './ui/SitePortalController';

const audio = new AudioSynth();
const starProgress = createBrowserStarProgress(LEVELS.length);
const loadout = new LoadoutController(starProgress);
new HudController(audio, starProgress);
new SitePortalController(starProgress);
gameBus.on('sound', (cue: SoundCue) => audio.play(cue));

const startsFromSitePortal = import.meta.env.VITE_SITE_ENTRY !== 'play'
  || /^#(?:home|mission|roster)$/.test(window.location.hash);
const launchScreen = document.getElementById('mission-launch-screen');
let runtimePromise: Promise<GameRuntime> | undefined;
let missionRequestId = 0;

const setMissionLaunching = (launching: boolean): void => {
  launchScreen?.classList.toggle('visible', launching);
  launchScreen?.setAttribute('aria-hidden', String(!launching));
};

const ensureRuntime = (): Promise<GameRuntime> => {
  runtimePromise ??= import('./gameRuntime')
    .then(({ createGameRuntime }) => createGameRuntime({
      startsFromSitePortal,
      getLoadoutDebugState: () => loadout.getDebugState(),
    }))
    .catch((error: unknown) => {
      runtimePromise = undefined;
      throw error;
    });
  return runtimePromise;
};

const startMission = (payload: StartMissionPayload): void => {
  const requestId = ++missionRequestId;
  gameBus.emit('loadout:hide');
  gameBus.emit('overlay:hide');
  setMissionLaunching(true);
  void ensureRuntime().then((runtime) => {
    if (requestId !== missionRequestId) return;
    runtime.startMission(payload);
  }).catch((error: unknown) => {
    if (requestId !== missionRequestId) return;
    setMissionLaunching(false);
    console.error('Unable to start Fury Flock runtime', error);
  });
};

const stopMission = (): void => {
  missionRequestId += 1;
  setMissionLaunching(false);
  if (runtimePromise) void runtimePromise.then((runtime) => runtime.stopMission()).catch(() => undefined);
  gameBus.emit('overlay:hide');
};

gameBus.on('command:start-mission', startMission);
gameBus.on('mission:ready', () => setMissionLaunching(false));
gameBus.on('command:return-loadout', () => {
  stopMission();
  gameBus.emit('loadout:show');
});
gameBus.on('command:return-site', () => {
  stopMission();
  gameBus.emit('loadout:hide');
  gameBus.emit('site:show');
});

if (!startsFromSitePortal) void ensureRuntime();
