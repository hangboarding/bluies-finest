// What each week's bird looks like and how it tends to behave. Shapes are in "units": a currawong is
// about 100 units from bill to tail. Colours are from field guides, simplified for small sizes.
import type { SpeciesId } from '../lib/flock';

/** An ellipse painted over the body or head, in fractions of its radii from the centre (y down). */
export interface Patch { x: number; y: number; rx: number; ry: number; c: string }
export interface Look {
  body: string; bodyPatches?: Patch[]; scallop?: string; speckle?: Patch; sheen?: string;
  head: string; headPatches?: Patch[]; neck: string; nape?: string;
  iris: string; eyeRing?: string;
  billUp: string; billLo: string; billTip?: string;
  wing: string; primary: string; wingPatch?: string; shoulder?: string;
  tail: string; tailTip?: string; tailBase?: string; vent?: string;
  /** Black cockatoo: the yellow panels in the outer tail feathers, the middle ones dark. */
  tailPanel?: string;
  leg: string; thigh?: string; crest?: string; backLines?: string;
  /** Red wattlebird: the red skin hanging from the cheek, and the white streaks all over. */
  wattle?: string; streaks?: string;
}
export type Behaviour = 'walk' | 'hop' | 'peck' | 'probe' | 'seed' | 'footfeed' | 'graze' | 'swim' | 'drink' | 'bathe' | 'call' | 'preen'
  | 'stretch' | 'shake' | 'pester' | 'perch' | 'hang' | 'dance' | 'idle' | 'fly' | 'nectar' | 'hawk' | 'hunt';
export interface Species {
  id: SpeciesId;
  size: number;            // overall scale
  rx: number; ry: number;  // body half-length and half-height
  leg: number; neck: number; hr: number;
  bill: { type: 'heavy' | 'straight' | 'hook' | 'duck'; len: number; depth: number; curve?: number };
  tailLen: number; tailW0: number; tailW1: number; tailDroop: number;
  pitch: number;           // standing body tilt (rad)
  wingTip: number; span: number;
  crest?: 'cockatoo' | 'galah' | 'mane';
  feet: 'perch' | 'zygo' | 'web';
  gait: 'strut' | 'waddle' | 'hop';
  walkSpeed: number;       // units per second
  glide: number;           // 0..1: how much it glides between wingbeats
  flapHz: number;
  look: Look; female?: Partial<Look>;
  /** Relative likelihood of each behaviour when it picks something new to do. */
  acts: Partial<Record<Behaviour, number>>;
  /** How often it calls (relative), and how cheeky it is with the others (0..1). */
  chatty: number; bold: number;
  /** When the bill opens during its song (seconds); the synthesised call follows the same notes. */
  song: [number, number][];
}

const P = (x: number, y: number, rx: number, ry: number, c: string): Patch => ({ x, y, rx, ry, c });

export const SPECIES: Record<SpeciesId, Species> = {
  currawong: {
    id: 'currawong', size: 1, rx: 22, ry: 12, leg: 22, neck: 8, hr: 9.5,
    bill: { type: 'heavy', len: 16, depth: 6.4 }, tailLen: 34, tailW0: 5.5, tailW1: 8, tailDroop: 0.12, pitch: 0.3,
    wingTip: 8, span: 62, feet: 'perch', gait: 'strut', walkSpeed: 34, glide: 0.45, flapHz: 5.5,
    look: {
      body: '#1d1e22', head: '#1d1e22', neck: '#1d1e22', iris: '#f5d63b', billUp: '#141417', billLo: '#1c1c20',
      wing: '#222328', primary: '#16171a', wingPatch: '#f2f2ee', tail: '#1b1c20', tailTip: '#f4f4f0', vent: '#f2f2ee', leg: '#16171a', sheen: '#3a4150',
    },
    acts: { walk: 5, hop: 3, peck: 4, probe: 5, drink: 1.5, bathe: 1, call: 2.5, preen: 2, stretch: 1, shake: 1, pester: 3, perch: 2, idle: 3, fly: 1.5, hunt: 3, hawk: 1 },
    chatty: 1, bold: 0.75, song: [[0, 0.2], [0.24, 0.62], [0.9, 1.05]],
  },
  galah: {
    id: 'galah', size: 0.8, rx: 19, ry: 12.5, leg: 13, neck: 6, hr: 9.8,
    bill: { type: 'hook', len: 8, depth: 8.5 }, tailLen: 25, tailW0: 5, tailW1: 7.5, tailDroop: 0.05, pitch: 0.72,
    wingTip: 3, span: 54, crest: 'galah', feet: 'zygo', gait: 'waddle', walkSpeed: 20, glide: 0.25, flapHz: 6.5,
    look: {
      body: '#a3abb3', bodyPatches: [P(0.3, 0.32, 1, 0.82, '#e3708d')], head: '#e57491', headPatches: [P(-0.05, -0.78, 1.05, 0.6, '#f5cdd6')],
      neck: '#e3708d', iris: '#2a2224', eyeRing: '#cfd2d6', billUp: '#ece6d6', billLo: '#ddd5c2', wing: '#9aa2aa', primary: '#6f7882',
      tail: '#868e97', leg: '#8b9096', thigh: '#a3abb3', crest: '#f5cdd6',
    },
    female: { iris: '#d6435b' },
    acts: { walk: 3, peck: 3, seed: 6, footfeed: 2, drink: 1.5, bathe: 1, call: 3, preen: 3, stretch: 1, shake: 1, pester: 3.5, perch: 3, hang: 2, dance: 1, idle: 2, fly: 2 },
    chatty: 1.4, bold: 0.8, song: [[0, 0.11], [0.2, 0.31], [0.42, 0.52]],
  },
  kingparrot: {
    id: 'kingparrot', size: 0.9, rx: 19, ry: 12, leg: 13, neck: 6, hr: 9.2,
    bill: { type: 'hook', len: 7.5, depth: 7.5 }, tailLen: 40, tailW0: 4.5, tailW1: 7.5, tailDroop: 0.08, pitch: 0.8,
    wingTip: 2, span: 56, feet: 'zygo', gait: 'waddle', walkSpeed: 18, glide: 0.2, flapHz: 6,
    look: {
      body: '#2f8a3c', bodyPatches: [P(0.38, 0.3, 0.95, 0.9, '#e2261f')], head: '#e2261f', neck: '#e2261f', iris: '#e8b23a',
      billUp: '#ee5a2b', billLo: '#2b2b2b', billTip: '#232323', wing: '#2f8a3c', primary: '#1f5f31', shoulder: '#9fe07a',
      tail: '#1a4433', tailBase: '#2a5fae', leg: '#7c7f80', thigh: '#2f8a3c', vent: '#1f6a3a',
    },
    female: { head: '#2f8a3c', neck: '#2f8a3c', bodyPatches: [P(0.1, 0.62, 0.7, 0.42, '#e2261f')], billUp: '#3a3a3a', iris: '#d9a43a', shoulder: undefined },
    acts: { walk: 2, peck: 3, seed: 5, footfeed: 3, drink: 1.5, bathe: 0.7, call: 2, preen: 3, stretch: 1, shake: 1, pester: 2, perch: 5, idle: 3, fly: 2 },
    chatty: 0.9, bold: 0.55, song: [[0, 0.16], [0.24, 0.4], [0.7, 1.3]],
  },
  cockatoo: {
    id: 'cockatoo', size: 1.05, rx: 21, ry: 14, leg: 14, neck: 7, hr: 11,
    bill: { type: 'hook', len: 10, depth: 10.5 }, tailLen: 27, tailW0: 6, tailW1: 9, tailDroop: 0.05, pitch: 0.82,
    wingTip: 3, span: 66, crest: 'cockatoo', feet: 'zygo', gait: 'waddle', walkSpeed: 20, glide: 0.4, flapHz: 4.5,
    look: {
      body: '#f4f3ec', head: '#f6f5ef', headPatches: [P(0.05, 0.42, 0.45, 0.35, '#f7efc6')], neck: '#f4f3ec', iris: '#1b1717', eyeRing: '#e9f2f7',
      billUp: '#2e2e33', billLo: '#26262a', wing: '#eeede4', primary: '#e9e3c3', tail: '#ecebe0', leg: '#5d5f63', thigh: '#f1f0e8', crest: '#f5d33b', vent: '#efe7c2',
    },
    female: { iris: '#7a3324' },
    acts: { walk: 3, peck: 3, seed: 5, footfeed: 3, drink: 1, bathe: 1, call: 3.5, preen: 2.5, stretch: 1.2, shake: 1, pester: 3.5, perch: 3, hang: 1.5, dance: 2, idle: 2, fly: 2 },
    chatty: 1.6, bold: 0.9, song: [[0, 0.8]],
  },
  rosella: {
    id: 'rosella', size: 0.7, rx: 16, ry: 10.5, leg: 12, neck: 5, hr: 8,
    bill: { type: 'hook', len: 6, depth: 6.2 }, tailLen: 36, tailW0: 4, tailW1: 7, tailDroop: 0.06, pitch: 0.55,
    wingTip: 3, span: 46, feet: 'zygo', gait: 'hop', walkSpeed: 26, glide: 0.15, flapHz: 8,
    look: {
      body: '#1f201b', scallop: '#b9d24c',
      bodyPatches: [P(0.62, -0.05, 0.55, 1, '#e0262b'), P(0.15, 0.62, 0.62, 0.55, '#f4d83b'), P(-0.62, 0.55, 0.55, 0.55, '#7cc24a')],
      head: '#e0262b', headPatches: [P(0.08, 0.52, 0.6, 0.48, '#f7f7f2')], neck: '#e0262b', iris: '#3a2a20',
      billUp: '#ecebe3', billLo: '#d8d6cc', wing: '#1f201b', primary: '#2f63c9', shoulder: '#3b8ae0', tail: '#2e7fa8', tailTip: '#9fd2e8', leg: '#8a8d8f', thigh: '#7cc24a', vent: '#e0262b',
    },
    acts: { walk: 1, hop: 5, peck: 5, seed: 5, drink: 2, bathe: 1.5, call: 2.5, preen: 2, stretch: 1, shake: 1, pester: 2.5, perch: 3, idle: 2, fly: 2.5, hunt: 1 },
    chatty: 1.1, bold: 0.5, song: [[0, 0.1], [0.16, 0.26], [0.4, 0.66]],
  },
  magpie: {
    id: 'magpie', size: 0.95, rx: 22, ry: 13, leg: 26, neck: 8, hr: 9.5,
    bill: { type: 'straight', len: 15, depth: 5.8 }, tailLen: 26, tailW0: 5.5, tailW1: 8, tailDroop: 0.1, pitch: 0.28,
    wingTip: 5, span: 60, feet: 'perch', gait: 'strut', walkSpeed: 38, glide: 0.35, flapHz: 5.5,
    look: {
      body: '#141416', head: '#141416', neck: '#141416', nape: '#f7f7f4', iris: '#8a2d1d', billUp: '#d6dee4', billLo: '#c9d2d8', billTip: '#1a1a1c',
      wing: '#18181b', primary: '#121214', shoulder: '#f7f7f4', tail: '#141416', tailBase: '#f7f7f4', vent: '#f2f2ee', leg: '#141416',
    },
    female: { nape: '#b9bcbf', shoulder: '#e9e9e6' },
    acts: { walk: 6, peck: 3, probe: 6, drink: 1.5, bathe: 1, call: 3, preen: 2, stretch: 1.2, shake: 1, pester: 3.5, perch: 1.5, idle: 2.5, fly: 1.5, hunt: 4, hawk: 1.2 },
    chatty: 1.3, bold: 0.95, song: [[0, 0.16], [0.2, 0.36], [0.44, 0.7], [0.78, 0.94], [1, 1.3], [1.38, 1.75]],
  },
  raven: {
    id: 'raven', size: 1.1, rx: 24, ry: 14, leg: 25, neck: 9, hr: 10.5,
    bill: { type: 'straight', len: 18, depth: 7.4, curve: 0.18 }, tailLen: 29, tailW0: 6, tailW1: 9.5, tailDroop: 0.1, pitch: 0.24,
    wingTip: 7, span: 70, feet: 'perch', gait: 'strut', walkSpeed: 32, glide: 0.6, flapHz: 4,
    look: {
      body: '#111115', head: '#111115', neck: '#121216', iris: '#f2f2f0', billUp: '#0c0c0e', billLo: '#121214',
      wing: '#141419', primary: '#0e0e11', tail: '#121216', leg: '#0f0f12', sheen: '#3b3f6b',
    },
    acts: { walk: 6, hop: 2, peck: 3, probe: 4, drink: 1.5, bathe: 0.8, call: 2.5, preen: 2, stretch: 1, shake: 1, pester: 4, perch: 2, idle: 2.5, fly: 1.5, hunt: 2.5, hawk: 0.5 },
    chatty: 1, bold: 1, song: [[0, 0.3], [0.42, 0.72], [0.86, 1.6]],
  },
  woodduck: {
    id: 'woodduck', size: 1, rx: 25, ry: 13, leg: 17, neck: 14, hr: 8.8,
    bill: { type: 'duck', len: 9, depth: 5 }, tailLen: 14, tailW0: 6, tailW1: 7, tailDroop: -0.12, pitch: 0.1,
    wingTip: 2, span: 64, crest: 'mane', feet: 'web', gait: 'waddle', walkSpeed: 22, glide: 0.1, flapHz: 7.5,
    look: {
      body: '#8f8a85', speckle: P(0.7, 0.05, 0.28, 0.6, '#5b4636'), bodyPatches: [P(0.55, 0.05, 0.5, 0.8, '#b3a594')],
      head: '#5e412c', neck: '#5e412c', iris: '#2a1d14', billUp: '#2b2b2b', billLo: '#333', wing: '#7f7a75', primary: '#4a4744',
      wingPatch: '#2f7d6a', tail: '#1f1f1f', vent: '#1f1f1f', leg: '#3f3f3f', crest: '#2b2019', backLines: '#1f1d1b',
    },
    female: { head: '#7b5e45', neck: '#7b5e45', headPatches: [P(0.15, -0.42, 0.8, 0.12, '#efe8dc'), P(0.15, 0.2, 0.8, 0.12, '#efe8dc')], body: '#8c8176', bodyPatches: [P(0.55, 0.1, 0.5, 0.8, '#b8a58e')] },
    acts: { walk: 3, graze: 7, swim: 5, drink: 1, call: 1.5, preen: 3.5, stretch: 1, shake: 1.5, pester: 2, idle: 3, fly: 1, hunt: 1.5 },
    chatty: 0.8, bold: 0.5, song: [[0, 0.34], [0.5, 0.8]],
  },
  crimsonrosella: {
    id: 'crimsonrosella', size: 0.75, rx: 16.5, ry: 11, leg: 12, neck: 5, hr: 8.3,
    bill: { type: 'hook', len: 6.2, depth: 6.4 }, tailLen: 37, tailW0: 4, tailW1: 7, tailDroop: 0.06, pitch: 0.58,
    wingTip: 3, span: 48, feet: 'zygo', gait: 'hop', walkSpeed: 24, glide: 0.15, flapHz: 7.5,
    look: {
      body: '#c3172b', scallop: '#e0303f', bodyPatches: [P(-0.2, -0.55, 0.85, 0.5, '#1c1416')],
      head: '#cc1a2e', headPatches: [P(0.08, 0.55, 0.6, 0.48, '#4f6fd6')], neck: '#c3172b', iris: '#2d1b17',
      billUp: '#e9e6dc', billLo: '#d6d2c6', wing: '#1c1416', primary: '#2a4fb5', shoulder: '#5a86e8', tail: '#3264c2', tailTip: '#8fb0ee', leg: '#8a8d8f', thigh: '#c3172b',
    },
    // young ones are mostly green in their first year: plenty of them about in the mountains
    female: { body: '#5f8f3a', scallop: '#7fae4e', bodyPatches: [P(0.62, -0.25, 0.35, 0.45, '#c3172b'), P(-0.6, 0.55, 0.45, 0.45, '#c3172b')], head: '#6a963f', headPatches: [P(0.55, -0.55, 0.55, 0.4, '#c3172b'), P(0.08, 0.55, 0.6, 0.48, '#4f6fd6')], neck: '#5f8f3a', wing: '#4c7a30', thigh: '#5f8f3a' },
    acts: { walk: 1, hop: 4, peck: 4, seed: 5, nectar: 3, drink: 2, bathe: 1.5, call: 2.5, preen: 2, stretch: 1, shake: 1, pester: 2, perch: 4, idle: 2, fly: 2.5, hunt: 0.8 },
    chatty: 1.1, bold: 0.55, song: [[0, 0.2], [0.3, 0.5], [0.62, 0.95]],
  },
  wattlebird: {
    id: 'wattlebird', size: 0.82, rx: 18, ry: 10, leg: 17, neck: 6, hr: 8,
    bill: { type: 'straight', len: 13, depth: 4.2, curve: 0.16 }, tailLen: 38, tailW0: 4.5, tailW1: 7.5, tailDroop: 0.14, pitch: 0.45,
    wingTip: 4, span: 52, feet: 'perch', gait: 'hop', walkSpeed: 26, glide: 0.2, flapHz: 7,
    look: {
      body: '#6b5e52', streaks: '#e9e2d6', bodyPatches: [P(-0.25, 0.72, 0.42, 0.34, '#f0c234')], head: '#5d5148', headPatches: [P(0.1, 0.4, 0.55, 0.32, '#d8d0c3')],
      neck: '#665a4f', iris: '#c43b3b', billUp: '#141414', billLo: '#1d1d1d', wing: '#5b4f45', primary: '#3d342d', tail: '#54493f', tailTip: '#efe9df',
      leg: '#b7887a', wattle: '#d1323a', vent: '#efe0c4',
    },
    acts: { walk: 0.5, hop: 3, peck: 2, nectar: 6, hawk: 4, drink: 1.5, bathe: 1.5, call: 3, preen: 2, stretch: 1, shake: 1, pester: 6, perch: 5, idle: 2, fly: 2.5, hunt: 1 },
    chatty: 1.4, bold: 1, song: [[0, 0.12], [0.18, 0.3], [0.38, 0.62]],
  },
  blackcockatoo: {
    id: 'blackcockatoo', size: 1.25, rx: 22, ry: 13.5, leg: 13, neck: 7, hr: 10.5,
    bill: { type: 'hook', len: 10, depth: 11 }, tailLen: 44, tailW0: 6, tailW1: 10, tailDroop: 0.06, pitch: 0.85,
    wingTip: 4, span: 76, crest: 'galah', feet: 'zygo', gait: 'waddle', walkSpeed: 18, glide: 0.55, flapHz: 3.2,
    look: {
      body: '#2b2521', scallop: '#4d412c', head: '#2b2521', headPatches: [P(-0.08, 0.3, 0.46, 0.36, '#e9c13a')], neck: '#2b2521',
      iris: '#2a1a14', eyeRing: '#d9788a', billUp: '#2a2a2c', billLo: '#232325',
      wing: '#2a241f', primary: '#1d1916', tail: '#26211d', tailPanel: '#efc93f', leg: '#5b5552', thigh: '#2b2521', crest: '#2b2521',
    },
    // females have a pale bill, a grey eye ring, and a bigger, brighter yellow cheek
    female: { headPatches: [P(-0.06, 0.28, 0.58, 0.46, '#f2cd3e')], eyeRing: '#9b9b98', billUp: '#d9cdb2', billLo: '#cbbfa5' },
    acts: { walk: 2, peck: 2, seed: 5, footfeed: 4, probe: 3, drink: 1, bathe: 0.7, call: 3.5, preen: 2.5, stretch: 1.2, shake: 1, pester: 1.5, perch: 4, hang: 1, idle: 2, fly: 2.5 },
    chatty: 1.3, bold: 0.6, song: [[0, 0.62], [0.8, 1.45]],
  },
};

/** The look for one bird: males and females differ in some species. */
export const lookOf = (sp: Species, female: boolean): Look => (female && sp.female ? { ...sp.look, ...sp.female } : sp.look);
