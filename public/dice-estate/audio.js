(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DiceEstateAudio = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createAudioManager(options = {}) {
    const AudioContextClass = options.AudioContext || (typeof globalThis !== "undefined" && (globalThis.AudioContext || globalThis.webkitAudioContext));
    let context = null;
    let master = null;
    let muted = Boolean(options.muted);

    function unlock() {
      if (!AudioContextClass) return false;
      if (!context) {
        context = new AudioContextClass();
        master = context.createGain();
        master.gain.value = muted ? 0 : 0.2;
        master.connect(context.destination);
      }
      if (context.state === "suspended" && context.resume) context.resume().catch(() => {});
      return true;
    }

    function setMuted(value) {
      muted = Boolean(value);
      if (master && context) master.gain.setTargetAtTime(muted ? 0 : 0.2, context.currentTime, 0.015);
    }

    function tone(frequency, offset, duration, type = "sine", volume = 0.18, endFrequency = frequency) {
      if (!context || !master || muted) return;
      const start = context.currentTime + offset;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(0.025, duration / 3));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }

    function noise(offset, duration, volume = 0.1, cutoff = 1400) {
      if (!context || !master || muted) return;
      const length = Math.max(1, Math.floor(context.sampleRate * duration));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const start = context.currentTime + offset;
      source.buffer = buffer;
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(start);
    }

    function play(name) {
      if (!context || !master || muted) return false;
      const patterns = {
        roll() {
          [0, 0.065, 0.14, 0.235, 0.36, 0.52].forEach((offset, index) => {
            noise(offset, 0.035 + index * 0.004, 0.045, 760 + index * 55);
            tone(168 - index * 8, offset, 0.045, "triangle", 0.035, 112 - index * 5);
          });
        },
        settle() {
          noise(0, 0.055, 0.075, 680);
          tone(156, 0, 0.085, "triangle", 0.12, 82);
          tone(218, 0.072, 0.09, "triangle", 0.065, 132);
        },
        double() {
          tone(523, 0.11, 0.14, "sine", 0.055, 659);
          tone(659, 0.2, 0.16, "sine", 0.045, 784);
        },
        step() {
          tone(120, 0, 0.055, "triangle", 0.045, 78);
        },
        purchase() {
          noise(0, 0.08, 0.08, 1800);
          tone(220, 0, 0.12, "square", 0.09, 150);
          tone(520, 0.1, 0.16, "triangle", 0.11, 680);
        },
        coins() {
          [0, 0.055, 0.11].forEach((offset, index) => tone(720 + index * 110, offset, 0.13, "sine", 0.07, 930 + index * 90));
        },
        build() {
          noise(0, 0.18, 0.06, 700);
          tone(105, 0.03, 0.2, "triangle", 0.12, 70);
          tone(440, 0.17, 0.18, "sine", 0.09, 620);
        },
        auction() {
          tone(330, 0, 0.1, "square", 0.07, 280);
          tone(440, 0.12, 0.1, "square", 0.07, 360);
        },
        card() {
          noise(0, 0.16, 0.05, 2400);
          tone(620, 0.05, 0.18, "sine", 0.06, 840);
        },
        warning() {
          tone(260, 0, 0.15, "sawtooth", 0.07, 210);
          tone(240, 0.19, 0.17, "sawtooth", 0.07, 180);
        },
        eliminate() {
          tone(230, 0, 0.22, "triangle", 0.12, 110);
          tone(150, 0.18, 0.3, "sine", 0.1, 62);
        },
        victory() {
          [392, 523, 659, 784].forEach((frequency, index) => tone(frequency, index * 0.12, 0.34, "triangle", 0.08, frequency * 1.08));
        }
      };
      const pattern = patterns[name];
      if (!pattern) return false;
      pattern();
      return true;
    }

    return {
      unlock,
      play,
      setMuted,
      isMuted: () => muted,
      isAvailable: () => Boolean(AudioContextClass),
      isUnlocked: () => Boolean(context)
    };
  }

  return { createAudioManager };
});
