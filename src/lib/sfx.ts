export type SfxCue =
  | "tap"
  | "join"
  | "letter"
  | "bus"
  | "approve"
  | "reject"
  | "win"
  | "ready"
  | "reveal"
  | "combo"
  | "tie"
  | "streak"
  | "profile"
  | "badge"
  | "whoosh";

let audioContext: AudioContext | null = null;
let master: GainNode | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return null;
    audioContext = new AudioContextConstructor();
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = .004;
    compressor.release.value = .16;
    master = audioContext.createGain();
    master.gain.value = .38;
    master.connect(compressor);
    compressor.connect(audioContext.destination);
  }
  return audioContext;
}

function note(context: AudioContext, frequency: number, start: number, duration: number, options: {
  wave?: OscillatorType; volume?: number; endFrequency?: number; cutoff?: number;
} = {}) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  const filter = context.createBiquadFilter();
  const peak = options.volume ?? .16;
  oscillator.type = options.wave ?? "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  if (options.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, start + duration);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(options.cutoff ?? 4200, start);
  envelope.gain.setValueAtTime(.0001, start);
  envelope.gain.exponentialRampToValueAtTime(peak, start + Math.min(.018, duration * .2));
  envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(filter);
  filter.connect(envelope);
  envelope.connect(master!);
  oscillator.start(start);
  oscillator.stop(start + duration + .015);
}

function softAir(context: AudioContext, start: number, duration: number) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) channel[index] = (Math.random() * 2 - 1) * (1 - index / channel.length);
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  filter.type = "lowpass";
  filter.frequency.value = 720;
  envelope.gain.setValueAtTime(.0001, start);
  envelope.gain.exponentialRampToValueAtTime(.045, start + .025);
  envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(master!);
  source.start(start);
  source.stop(start + duration + .02);
}

function createStereo3D(context: AudioContext, masterNode: GainNode, pan = 0) {
  if (context.createStereoPanner) {
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(pan, context.currentTime);
    panner.connect(masterNode);
    return panner;
  }
  return masterNode;
}

// 1. Classic Egyptian Bus Dual Air Horn (أتوبيس النصر الكلاسيكي)
function playClassicBusHorn(context: AudioContext, masterNode: GainNode, start: number) {
  const leftPan = createStereo3D(context, masterNode, -0.25);
  const rightPan = createStereo3D(context, masterNode, 0.25);

  const blasts = [
    { offset: 0, duration: 0.16, gain: 0.24 },
    { offset: 0.22, duration: 0.46, gain: 0.28 },
  ];

  const freqs = [146.83, 293.66, 369.99, 440.0];

  for (const blast of blasts) {
    const blastStart = start + blast.offset;
    const blastDur = blast.duration;

    const lfo = context.createOscillator();
    lfo.frequency.setValueAtTime(28, blastStart);
    const lfoGain = context.createGain();
    lfoGain.gain.setValueAtTime(8, blastStart);
    lfo.connect(lfoGain);

    const bellFilter = context.createBiquadFilter();
    bellFilter.type = "bandpass";
    bellFilter.frequency.setValueAtTime(1150, blastStart);
    bellFilter.Q.setValueAtTime(1.8, blastStart);

    const formantFilter = context.createBiquadFilter();
    formantFilter.type = "peaking";
    formantFilter.frequency.setValueAtTime(2800, blastStart);
    formantFilter.gain.setValueAtTime(7, blastStart);

    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, blastStart);
    envelope.gain.linearRampToValueAtTime(blast.gain, blastStart + 0.016);
    envelope.gain.setValueAtTime(blast.gain * 0.95, blastStart + blastDur - 0.04);
    envelope.gain.exponentialRampToValueAtTime(0.0001, blastStart + blastDur);

    bellFilter.connect(formantFilter);
    formantFilter.connect(envelope);
    envelope.connect(leftPan);
    envelope.connect(rightPan);

    for (let i = 0; i < freqs.length; i++) {
      const osc = context.createOscillator();
      osc.type = i === 0 ? "triangle" : "sawtooth";
      osc.frequency.setValueAtTime(freqs[i], blastStart);
      osc.frequency.setValueAtTime(freqs[i], blastStart + blastDur - 0.05);
      osc.frequency.linearRampToValueAtTime(freqs[i] * 0.96, blastStart + blastDur);

      lfoGain.connect(osc.frequency);
      osc.connect(bellFilter);
      osc.start(blastStart);
      osc.stop(blastStart + blastDur + 0.02);
    }

    lfo.start(blastStart);
    lfo.stop(blastStart + blastDur + 0.02);
  }

  softAir(context, start + 0.62, 0.28);
}

// 2. Cairo Microbus Twin Disc Electric Horn (ميكروباص الدائري - تيت تييييت حاد وسريع)
function playMicrobusHorn(context: AudioContext, masterNode: GainNode, start: number) {
  const panner = createStereo3D(context, masterNode, 0.15);
  const blasts = [
    { offset: 0, duration: 0.12, gain: 0.26 },
    { offset: 0.16, duration: 0.32, gain: 0.28 },
  ];

  // High-tone disc chord: 420Hz + 510Hz + 840Hz
  const freqs = [420, 510, 840];

  for (const blast of blasts) {
    const bStart = start + blast.offset;
    const bDur = blast.duration;

    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1450, bStart);
    filter.Q.setValueAtTime(2.2, bStart);

    const env = context.createGain();
    env.gain.setValueAtTime(0.0001, bStart);
    env.gain.linearRampToValueAtTime(blast.gain, bStart + 0.008);
    env.gain.setValueAtTime(blast.gain * 0.9, bStart + bDur - 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, bStart + bDur);

    filter.connect(env);
    env.connect(panner);

    for (const f of freqs) {
      const osc = context.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(f, bStart);
      osc.connect(filter);
      osc.start(bStart);
      osc.stop(bStart + bDur + 0.01);
    }
  }
}

// 3. Squeaky Musical TokTok Bulb Horn (توك توك بطوطة بييب بييب مضحك)
function playTokTokHorn(context: AudioContext, masterNode: GainNode, start: number) {
  const panner = createStereo3D(context, masterNode, -0.18);
  const honks = [
    { offset: 0, dur: 0.15, base: 760 },
    { offset: 0.18, dur: 0.22, base: 820 },
  ];

  for (const h of honks) {
    const hStart = start + h.offset;
    const osc = context.createOscillator();
    const env = context.createGain();

    osc.type = "triangle";
    // Pitch drops comically like a rubber squeeze bulb: 820 -> 540
    osc.frequency.setValueAtTime(h.base, hStart);
    osc.frequency.linearRampToValueAtTime(h.base * 1.08, hStart + 0.03);
    osc.frequency.exponentialRampToValueAtTime(h.base * 0.72, hStart + h.dur);

    env.gain.setValueAtTime(0.001, hStart);
    env.gain.linearRampToValueAtTime(0.25, hStart + 0.015);
    env.gain.exponentialRampToValueAtTime(0.001, hStart + h.dur);

    osc.connect(env);
    env.connect(panner);

    osc.start(hStart);
    osc.stop(hStart + h.dur + 0.02);
  }
}

// 4. London Red Double Decker Majestic Chime (أتوبيس أحمر إنجليزي فخم)
function playLondonHorn(context: AudioContext, masterNode: GainNode, start: number) {
  const left = createStereo3D(context, masterNode, -0.3);
  const right = createStereo3D(context, masterNode, 0.3);

  // Majestic cathedral baritone triad: F2 (87Hz), C3 (130Hz), F3 (174Hz), A3 (220Hz)
  const freqs = [87.31, 130.81, 174.61, 220.0];
  const dur = 0.58;

  const env = context.createGain();
  env.gain.setValueAtTime(0.001, start);
  env.gain.linearRampToValueAtTime(0.32, start + 0.04);
  env.gain.setValueAtTime(0.28, start + dur - 0.1);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(850, start);
  filter.Q.setValueAtTime(1.5, start);

  env.connect(left);
  env.connect(right);

  for (const f of freqs) {
    const osc = context.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f, start);
    osc.connect(filter);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
  filter.connect(env);
  softAir(context, start + 0.45, 0.25);
}

// 5. Cyberpunk Gold 2077 Warp Horn (أتوبيس المستقبل الذهبي - نفاث فضائي هايبر)
function playCyberHorn(context: AudioContext, masterNode: GainNode, start: number) {
  const left = createStereo3D(context, masterNode, -0.4);
  const right = createStereo3D(context, masterNode, 0.4);

  const osc1 = context.createOscillator();
  const osc2 = context.createOscillator();
  const filter = context.createBiquadFilter();
  const env = context.createGain();

  osc1.type = "sawtooth";
  osc2.type = "triangle";

  // Futuristic laser warp pitch sweep
  osc1.frequency.setValueAtTime(240, start);
  osc1.frequency.exponentialRampToValueAtTime(960, start + 0.25);
  osc1.frequency.linearRampToValueAtTime(440, start + 0.55);

  osc2.frequency.setValueAtTime(120, start);
  osc2.frequency.exponentialRampToValueAtTime(480, start + 0.25);
  osc2.frequency.linearRampToValueAtTime(220, start + 0.55);

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(600, start);
  filter.frequency.exponentialRampToValueAtTime(3200, start + 0.25);
  filter.frequency.exponentialRampToValueAtTime(800, start + 0.55);
  filter.Q.setValueAtTime(4.5, start);

  env.gain.setValueAtTime(0.001, start);
  env.gain.linearRampToValueAtTime(0.28, start + 0.03);
  env.gain.setValueAtTime(0.24, start + 0.4);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.56);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(env);
  env.connect(left);
  env.connect(right);

  osc1.start(start);
  osc2.start(start);
  osc1.stop(start + 0.58);
  osc2.stop(start + 0.58);
}

export function playVehicleHorn(enabled: boolean, vehicleId = "classic_bus") {
  if (!enabled) return;
  const context = getAudioContext();
  if (!context || !master) return;
  void context.resume();
  const now = context.currentTime + 0.008;

  switch (vehicleId) {
    case "cairo_microbus":
      playMicrobusHorn(context, master, now);
      break;
    case "fire_toktok":
      playTokTokHorn(context, master, now);
      break;
    case "london_red":
      playLondonHorn(context, master, now);
      break;
    case "cyber_gold":
      playCyberHorn(context, master, now);
      break;
    case "classic_bus":
    default:
      playClassicBusHorn(context, master, now);
      break;
  }
}

function playBusAirHorn(context: AudioContext, masterNode: GainNode, start: number) {
  playClassicBusHorn(context, masterNode, start);
}

export function playGameSfx(enabled: boolean, cue: SfxCue = "tap") {
  if (!enabled) return;
  const context = getAudioContext();
  if (!context || !master) return;
  void context.resume();
  const now = context.currentTime + .008;

  switch (cue) {
    case "tap":
      note(context, 740, now, .075, { wave: "triangle", volume: .055, endFrequency: 610, cutoff: 3000 });
      break;
    case "join":
      note(context, 523.25, now, .24, { wave: "triangle", volume: .105 });
      note(context, 659.25, now + .055, .26, { wave: "sine", volume: .085 });
      note(context, 783.99, now + .115, .34, { wave: "triangle", volume: .07 });
      break;
    case "letter":
      note(context, 360, now, .17, { wave: "triangle", volume: .075, endFrequency: 510 });
      note(context, 510, now + .12, .22, { wave: "sine", volume: .075, endFrequency: 640 });
      break;
    case "ready":
      note(context, 587.33, now, .12, { wave: "triangle", volume: .055, cutoff: 2400 });
      note(context, 783.99, now + .075, .16, { wave: "sine", volume: .05, cutoff: 2800 });
      break;
    case "reveal":
      note(context, 659.25, now, .16, { wave: "sine", volume: .045, cutoff: 2600 });
      note(context, 880, now + .08, .2, { wave: "triangle", volume: .04, cutoff: 3000 });
      break;
    case "combo":
      note(context, 523.25, now, .13, { wave: "triangle", volume: .06, cutoff: 2800 });
      note(context, 659.25, now + .065, .15, { wave: "sine", volume: .055, cutoff: 3200 });
      note(context, 783.99, now + .13, .17, { wave: "triangle", volume: .05, cutoff: 3500 });
      note(context, 1046.5, now + .2, .25, { wave: "sine", volume: .045, cutoff: 3800 });
      break;
    case "tie":
      note(context, 440, now, .22, { wave: "sine", volume: .05, cutoff: 2200 });
      note(context, 554.37, now + .12, .24, { wave: "triangle", volume: .045, cutoff: 2400 });
      break;
    case "bus":
      playVehicleHorn(enabled, typeof window !== "undefined" ? localStorage.getItem("bus-equipped-vehicle") || "classic_bus" : "classic_bus");
      break;
    case "approve":
      note(context, 523.25, now, .18, { wave: "triangle", volume: .09 });
      note(context, 659.25, now + .065, .2, { wave: "sine", volume: .08 });
      note(context, 783.99, now + .13, .25, { wave: "triangle", volume: .065 });
      break;
    case "reject":
      note(context, 392, now, .13, { wave: "sine", volume: .065, endFrequency: 350, cutoff: 1900 });
      note(context, 311.13, now + .085, .18, { wave: "triangle", volume: .055, endFrequency: 277.18, cutoff: 1500 });
      break;
    case "win":
      note(context, 523.25, now, .28, { wave: "triangle", volume: .09 });
      note(context, 659.25, now + .09, .31, { wave: "sine", volume: .08 });
      note(context, 783.99, now + .18, .34, { wave: "triangle", volume: .075 });
      note(context, 1046.5, now + .3, .58, { wave: "sine", volume: .08 });
      break;
    case "streak":
      // Ascending energetic fanfare arpeggio with high harmonic shimmer for win streaks
      note(context, 440, now, .11, { wave: "triangle", volume: .08, cutoff: 3600 });
      note(context, 554.37, now + .055, .12, { wave: "sine", volume: .08, cutoff: 4000 });
      note(context, 659.25, now + .11, .14, { wave: "triangle", volume: .085, cutoff: 4200 });
      note(context, 880, now + .17, .18, { wave: "sine", volume: .09, cutoff: 4500 });
      note(context, 1108.73, now + .24, .32, { wave: "triangle", volume: .095, cutoff: 5000 });
      softAir(context, now + .15, .25);
      break;
    case "profile":
      // Smooth welcoming pop chord
      note(context, 523.25, now, .14, { wave: "triangle", volume: .07, endFrequency: 587, cutoff: 3200 });
      note(context, 659.25, now + .04, .18, { wave: "sine", volume: .065, cutoff: 3600 });
      break;
    case "badge":
      // Triumphant sparkling celebratory chime
      note(context, 783.99, now, .12, { wave: "sine", volume: .07, cutoff: 3800 });
      note(context, 987.77, now + .06, .14, { wave: "triangle", volume: .065, cutoff: 4200 });
      note(context, 1174.66, now + .12, .16, { wave: "sine", volume: .06, cutoff: 4500 });
      note(context, 1567.98, now + .18, .36, { wave: "triangle", volume: .07, cutoff: 5200 });
      break;
    case "whoosh":
      softAir(context, now, .18);
      note(context, 320, now, .15, { wave: "sine", volume: .04, endFrequency: 540, cutoff: 1800 });
      break;
  }
}
