export type SfxCue = "tap" | "join" | "letter" | "bus" | "approve" | "reject" | "win" | "ready" | "reveal" | "combo" | "tie";

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
      note(context, 220, now, .32, { wave: "triangle", volume: .11, cutoff: 1100 });
      note(context, 329.63, now + .012, .29, { wave: "sine", volume: .085, cutoff: 1800 });
      softAir(context, now, .22);
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
  }
}
