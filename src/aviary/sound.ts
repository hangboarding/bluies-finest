// Bird calls made in the browser (no audio files), following the app's Sound setting. Each species' song
// plays the same notes its bill opens for (Species.song). They're impressions, not recordings.
import { audio, soundOn } from '../lib/timer';
import type { SpeciesId } from '../lib/flock';
import type { SoundKind } from './sim';
import { SPECIES } from './species';

type Curve = [number, number][]; // [share of the note, Hz]
interface ToneOpts { type?: OscillatorType; gain?: number; vib?: [number, number]; am?: [number, number]; bp?: [number, number] }

function tone(ac: AudioContext, out: AudioNode, t0: number, dur: number, f: Curve, o: ToneOpts = {}) {
  const osc = ac.createOscillator(), env = ac.createGain(), g = o.gain ?? 1, end = t0 + dur;
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(f[0]![1], t0);
  for (const [x, hz] of f.slice(1)) osc.frequency.linearRampToValueAtTime(hz, t0 + x * dur);
  const lfo = (rate: number, depth: number, to: AudioParam) => { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = rate; lg.gain.value = depth; l.connect(lg); lg.connect(to); l.start(t0); l.stop(end + 0.05); };
  if (o.vib) lfo(o.vib[0], o.vib[1], osc.frequency);
  let node: AudioNode = osc;
  if (o.bp) { const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = o.bp[0]; bp.Q.value = o.bp[1]; node.connect(bp); node = bp; }
  if (o.am) { const am = ac.createGain(); am.gain.value = 1 - o.am[1]; lfo(o.am[0], o.am[1], am.gain); node.connect(am); node = am; }
  env.gain.setValueAtTime(0.0001, t0); env.gain.exponentialRampToValueAtTime(g, t0 + Math.min(0.02, dur * 0.2));
  env.gain.setValueAtTime(g, t0 + dur * 0.7); env.gain.exponentialRampToValueAtTime(0.0001, end);
  node.connect(env); env.connect(out); osc.start(t0); osc.stop(end + 0.05);
}
let noiseBuf: AudioBuffer | null = null;
function noise(ac: AudioContext, out: AudioNode, t0: number, dur: number, bp: [number, number], gain: number) {
  if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), env = ac.createGain();
  src.buffer = noiseBuf; src.loop = true; f.type = 'bandpass'; f.frequency.value = bp[0]; f.Q.value = bp[1];
  env.gain.setValueAtTime(0.0001, t0); env.gain.exponentialRampToValueAtTime(gain, t0 + 0.01); env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(env); env.connect(out); src.start(t0); src.stop(t0 + dur + 0.05);
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
type Voice = (ac: AudioContext, out: AudioNode, t: number, notes: [number, number][]) => void;
const each = (notes: [number, number][], f: (t0: number, dur: number, i: number) => void) => notes.forEach(([a, e], i) => f(a, e - a, i));

const SONGS: Record<SpeciesId, Voice> = {
  currawong: (ac, o, t, n) => each(n, (a, d, i) => {
    if (i === 0) tone(ac, o, t + a, d, [[0, 700], [1, 880]], { type: 'triangle', am: [32, 0.8], gain: 0.8 }); // "curra", gargled
    else if (i === 1) { tone(ac, o, t + a, d, [[0, 1150], [0.3, 1050], [1, 640]], { vib: [7, 12] }); tone(ac, o, t + a, d, [[0, 2300], [0.3, 2100], [1, 1280]], { gain: 0.16 }); } // "wong", ringing
    else tone(ac, o, t + a, d, [[0, 980], [1, 1400]], { gain: 0.5 });
  }),
  galah: (ac, o, t, n) => each(n, (a, d) => { tone(ac, o, t + a, d, [[0, 2600], [1, 2100]], { type: 'sawtooth', bp: [2500, 4], gain: 0.7 }); noise(ac, o, t + a, d, [3000, 3], 0.25); }),
  kingparrot: (ac, o, t, n) => each(n, (a, d, i) => {
    if (i < 2) tone(ac, o, t + a, d, [[0, 1500], [1, 1250]], { type: 'sawtooth', am: [55, 0.6], bp: [1700, 3], gain: 0.8 });
    else tone(ac, o, t + a, d, [[0, 2500], [1, 2850]], { vib: [6, 30], gain: 0.55 });
  }),
  cockatoo: (ac, o, t, n) => each(n, (a, d) => { tone(ac, o, t + a, d, [[0, 1600], [0.15, 2200], [0.7, 2000], [1, 1500]], { type: 'sawtooth', am: [85, 0.7], bp: [2100, 1.5], gain: 0.9 }); noise(ac, o, t + a, d, [2600, 1], 0.3); }),
  rosella: (ac, o, t, n) => each(n, (a, d, i) => tone(ac, o, t + a, d, i < 2 ? [[0, 2700], [1, 2650]] : [[0, 2300], [1, 3300]], { gain: 0.6 })),
  crimsonrosella: (ac, o, t, n) => each(n, (a, d, i) => tone(ac, o, t + a, d, [[[0, 2350], [1, 2300]], [[0, 2150], [1, 2100]], [[0, 1750], [1, 2050]]][i] as Curve ?? [[0, 2000], [1, 2000]], { vib: [5, 15], gain: 0.6 })),
  magpie: (ac, o, t, n) => each(n, (a, d, i) => {
    const f0 = rnd(600, 2000), f1 = f0 * rnd(0.8, 1.3);
    tone(ac, o, t + a, d, [[0, f0], [0.5, (f0 + f1) / 2 * rnd(0.9, 1.15)], [1, f1]], { type: i % 2 ? 'triangle' : 'sine', vib: Math.random() < 0.5 ? [rnd(18, 30), rnd(20, 60)] : undefined, gain: 0.7 });
  }),
  raven: (ac, o, t, n) => each(n, (a, d, i) => tone(ac, o, t + a, d, i < n.length - 1 ? [[0, 440], [1, 400]] : [[0, 420], [0.4, 390], [1, 290]], { type: 'sawtooth', bp: [900, 2], am: i === n.length - 1 ? [38, 0.35] : undefined, gain: 1 })),
  woodduck: (ac, o, t, n) => each(n, (a, d) => tone(ac, o, t + a, d, [[0, 650], [0.4, 980], [1, 760]], { type: 'sawtooth', bp: [1300, 3], gain: 0.8 })),
  wattlebird: (ac, o, t, n) => each(n, (a, d, i) => {
    noise(ac, o, t + a, Math.min(d, 0.08), [1300, 2], 0.5);
    tone(ac, o, t + a, d, i < n.length - 1 ? [[0, 560], [1, 470]] : [[0, 700], [1, 430]], { type: 'square', bp: [1100, 2], gain: 0.45 });
  }),
};
const PITCH: Record<SpeciesId, number> = { currawong: 900, galah: 2400, kingparrot: 1700, cockatoo: 2000, rosella: 2600, crimsonrosella: 2300, magpie: 1200, raven: 500, woodduck: 800, wattlebird: 1200 };

let lastSong = 0, lastAny = 0;
/** Play a call. `pan` −1 (left) … 1 (right); `vol` 0..1 (nearer birds are louder). */
export function birdSound(id: SpeciesId, kind: SoundKind, pan: number, vol: number) {
  const ac = audio();
  if (!soundOn || !ac || ac.state !== 'running') return;
  const now = ac.currentTime;
  if (now - lastAny < 0.12 || (kind === 'song' && now - lastSong < 0.7)) return; // a flock, not a wall of noise
  lastAny = now; if (kind === 'song') lastSong = now;
  try {
    const out = ac.createGain(); out.gain.value = 0.2 * vol;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); out.connect(p); p.connect(ac.destination); }
    else out.connect(ac.destination);
    const t = now + 0.02, f = PITCH[id];
    if (kind === 'song') SONGS[id](ac, out, t, SPECIES[id].song);
    else if (kind === 'alarm') { tone(ac, out, t, 0.2, [[0, f * 1.6], [1, f * 1.2]], { type: 'sawtooth', bp: [f * 1.8, 2], am: [70, 0.5] }); noise(ac, out, t, 0.15, [f * 2, 2], 0.3); }
    else for (let i = 0; i < 3; i++) tone(ac, out, t + i * 0.12, 0.08, [[0, f * rnd(1.1, 1.5)], [1, f]], { type: 'sawtooth', bp: [f * 1.6, 2], gain: 0.7 });
  } catch { /* audio unavailable */ }
}
