// Every icon in the app goes through ic(key). In "emoji" mode it renders the emoji,
// in "flat" mode a line icon: either a hand-drawn custom SVG (grips, moods) or a
// Lucide icon (hydrated by hydrateIcons() after the HTML is inserted).
import {
  createIcons, Timer, Wind, Repeat, Repeat1, Sofa, Ruler, Dumbbell, Anchor, Weight, Target, ArrowLeftRight, TrafficCone,
  Mountain, Trophy, ChartColumn, MessageCircle, User, Heart, Flame, Medal, CalendarDays, Download, Trash2, Pencil, Star,
  Volume2, Vibrate, Palette, Settings, LogOut, Plus, Play, Pause, SkipForward, X, Camera, BookOpen, Crown, Sparkles, Lock,
  CircleHelp, Zap, Sprout, Gem, TrendingUp, Clock, Moon, Sunrise, Award, BicepsFlexed, Layers, Hourglass, Brain, Baby, Wrench,
  MessagesSquare, Eye, RotateCcw, Check, Globe, Users, Square, Boxes, FlaskConical, BadgeCheck, Flag, TreePine, MoonStar,
  Snail, Glasses, RefreshCw, CalendarPlus, Cloud, Pointer, Bell, ShieldCheck, Copy, Ticket, PartyPopper, Bug, Bird, MapPin, ChartBarDecreasing,
  ListChecks, History, GripVertical, ArrowUp, ArrowDown, Wheat, Utensils, Binoculars, Undo2, Cherry, AlarmClock, Dices, ScanFace, Drama, Cat, Rocket,
} from 'lucide';

const LUCIDE = { Timer, Wind, Repeat, Repeat1, Sofa, Ruler, Dumbbell, Anchor, Weight, Target, ArrowLeftRight, TrafficCone, Mountain, Trophy, ChartColumn, MessageCircle, User, Heart, Flame, Medal, CalendarDays, Download, Trash2, Pencil, Star, Volume2, Vibrate, Palette, Settings, LogOut, Plus, Play, Pause, SkipForward, X, Camera, BookOpen, Crown, Sparkles, Lock, CircleHelp, Zap, Sprout, Gem, TrendingUp, Clock, Moon, Sunrise, Award, BicepsFlexed, Layers, Hourglass, Brain, Baby, Wrench, MessagesSquare, Eye, RotateCcw, Check, Globe, Users, Square, Boxes, FlaskConical, BadgeCheck, Flag, TreePine, MoonStar, Snail, Glasses, RefreshCw, CalendarPlus, Cloud, Pointer, Bell, ShieldCheck, Copy, Ticket, PartyPopper, Bug, Bird, MapPin, ChartBarDecreasing, ListChecks, History, GripVertical, ArrowUp, ArrowDown, Wheat, Utensils, Binoculars, Undo2, Cherry, AlarmClock, Dices, ScanFace, Drama, Cat, Rocket };

// ---- custom 24×24 line icons (same stroke style as Lucide) ----
// Grips are drawn side-on: a finger on an edge (the block top-right).
const EDGE = '<path d="M13.5 9.5H22v4.5h-8.5z" fill="currentColor" fill-opacity=".25"/>';
const FACE = '<circle cx="12" cy="12" r="9"/>';
const CUSTOM: Record<string, string> = {
  // open: finger drapes over the edge in one smooth curve
  gOpen: `${EDGE}<path d="M3 22c.8-6 3.4-10.8 8-12.6 1.9-.7 4.3-1 7.5-1" stroke-width="2.6"/>`,
  // drag: fingers nearly straight, the hand hanging low under the edge, pads dragged over the lip
  gDrag: `${EDGE}<path d="M8.5 22c.2-4.2 1.3-8.6 3.7-11.3 1-1.1 2.6-1.8 5.8-2.3" stroke-width="2.6"/>`,
  // half crimp: 90° bend at the middle joint, fingertip flat on top
  gHalf: `${EDGE}<path d="M3 22 5.8 15.2l5.6-1.7V7.8H19" stroke-width="2.6"/>`,
  // full crimp: middle joint pushed high above the edge, thumb locked over the top
  gFull: `${EDGE}<path d="M3 22 5.8 15.2 10.5 3.5 18.5 7.8" stroke-width="2.6"/><path d="M5.5 12.5c1.6-2.2 3.4-3.4 6.4-3.6" stroke-width="2"/>`,
  gPinch: '<rect x="10" y="4" width="4" height="13" rx="1"/><path d="M5 21c-.6-6 .6-10.6 4.4-12.6" stroke-width="2.6"/><path d="M19 21c.6-6-.6-10.6-4.4-12.6" stroke-width="2.6"/>',
  gSloper: '<path d="M3 13c2.5-6 15.5-6 18 0z"/><path d="M2.5 17.5c1-3.6 5-6.2 9.5-6.2s8.5 2.6 9.5 6.2" stroke-width="2.6" transform="translate(0 -6.5)"/>',
  fCry: `${FACE}<path d="M8 10c.7-.6 1.5-.6 2.2 0M13.8 10c.7-.6 1.5-.6 2.2 0M9 16.5c2-1.5 4-1.5 6 0"/><path d="M8.6 12v3.2M15.4 12v3.2"/>`,
  fHurt: `${FACE}<circle cx="9" cy="11" r=".6" fill="currentColor"/><circle cx="15" cy="11" r=".6" fill="currentColor"/><path d="M9.5 16h5"/><path d="m6 8 12-3.2" stroke-width="3"/>`,
  fTired: `${FACE}<path d="m8 9 2 1.2L8 11.4M16 9l-2 1.2 2 1.2M9 16.2c1-1 2-1 3 0s2 1 3 0"/>`,
  fSleepy: `${FACE}<path d="M7.8 11h2.6M13.6 11h2.6M11 15.5h2"/><path d="M17 2.5h3.5l-3.5 3.5h3.5" stroke-width="1.6"/>`,
  fMeh: `${FACE}<circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/><path d="M8.5 15.5h7"/>`,
  fHappy: `${FACE}<circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/><path d="M8.5 14c1.8 2.2 5.2 2.2 7 0"/>`,
  oneArm: '<rect x="8" y="2.5" width="8" height="3.5" rx="1"/><path d="M12 6v6.5M12 12.5l-2.5 4.5M12 12.5l2.5 4.5M12 9.5l4 2" stroke-width="2.2"/><circle cx="9.3" cy="9.8" r="1.6"/>',
};
const svg = (inner: string) => `<svg class="lic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

// key → [emoji, flat icon]. Flat icon is a CUSTOM key or a Lucide kebab name.
// Emoji characters are keys too, so achievement/feel emoji map to flat icons automatically.
const MAP: Record<string, [string, string]> = {
  hang: ['⏱', 'timer'], rest: ['😮‍💨', 'wind'], sets: ['🔁', 'repeat'], reps: ['🔂', 'repeat-1'], setRest: ['🛋️', 'sofa'],
  edge: ['📏', 'ruler'], add: ['🏋️', 'dumbbell'], rem: ['🪢', 'anchor'], lift: ['🪨', 'weight'], effort: ['🎯', 'target'],
  switch: ['🔄', 'arrow-left-right'], ready: ['🚦', 'traffic-cone'],
  open: ['✋', 'gOpen'], drag: ['🤚', 'gDrag'], half: ['🤏', 'gHalf'], full: ['✊', 'gFull'], pinch: ['🤌', 'gPinch'], sloper: ['🫳', 'gSloper'],
  grip: ['✊', 'gHalf'], fingers: ['☝️', 'pointer'], hands: ['🙌', 'arrow-left-right'], board: ['🪵', 'layers'], material: ['🧱', 'boxes'], profile: ['◜', 'square'],
  mode: ['🧲', 'zap'], about: ['📖', 'book-open'], feel: ['💭', 'brain'],
  tabHang: ['🧗', 'mountain'], tabWorkouts: ['📋', 'list-checks'], tabFeed: ['💬', 'message-circle'], tabRanks: ['🏆', 'trophy'], tabStats: ['📊', 'chart-column'], tabProfile: ['👤', 'user'],
  heart: ['🤍', 'heart'], hearted: ['❤️', 'heart'], comment: ['💬', 'messages-square'], streak: ['🔥', 'flame'], medal: ['🏅', 'medal'],
  calendar: ['📅', 'calendar-days'], chart: ['📈', 'trending-up'], top10: ['📊', 'chart-bar-decreasing'], download: ['⬇', 'download'], trash: ['🗑', 'trash-2'], edit: ['✎', 'pencil'],
  star: ['⭐', 'star'], sound: ['🔊', 'volume-2'], vib: ['📳', 'vibrate'], theme: ['🎨', 'palette'], settings: ['⚙️', 'settings'],
  logout: ['🚪', 'log-out'], plus: ['➕', 'plus'], play: ['▶', 'play'], pause: ['❚❚', 'pause'], skip: ['⏭', 'skip-forward'], x: ['✕', 'x'],
  camera: ['📷', 'camera'], crown: ['👑', 'crown'], sparkles: ['✨', 'sparkles'], lock: ['🔒', 'lock'], help: ['❓', 'circle-help'],
  bolt: ['⚡', 'zap'], sprout: ['🌱', 'sprout'], gem: ['💎', 'gem'], clock: ['⏱', 'clock'], moon: ['🌙', 'moon'], sunrise: ['🌅', 'sunrise'],
  award: ['🏆', 'award'], muscle: ['💪', 'biceps-flexed'], hourglass: ['⏳', 'hourglass'], baby: ['👶', 'baby'], wrench: ['🛠️', 'wrench'],
  eye: ['👀', 'eye'], bug: ['🐞', 'bug'], pin: ['📍', 'map-pin'], '⏳': ['⏳', 'hourglass'], '📅': ['📅', 'calendar-days'], replay: ['↺', 'rotate-ccw'], check: ['✓', 'check'], globe: ['🌍', 'globe'], users: ['🙋', 'users'], mountain: ['🏔️', 'mountain'],
  workouts: ['📋', 'list-checks'], history: ['🕘', 'history'], handle: ['⠿', 'grip-vertical'], up: ['↑', 'arrow-up'], down: ['↓', 'arrow-down'],
  user: ['👤', 'user'], bell: ['🔔', 'bell'], admin: ['🛡️', 'shield-check'], copy: ['📋', 'copy'], ticket: ['🎟️', 'ticket'], bird: ['🐦', 'bird'], party: ['🎉', 'party-popper'],
  // moods (stored values are the emoji)
  '😭': ['😭', 'fCry'], '🤕': ['🤕', 'fHurt'], '😫': ['😫', 'fTired'], '😴': ['😴', 'fSleepy'], '😐': ['😐', 'fMeh'], '🙂': ['🙂', 'fHappy'], '💪': ['💪', 'biceps-flexed'], '🔥': ['🔥', 'flame'],
  // achievements
  '🧗': ['🧗', 'mountain'], '🏔️': ['🏔️', 'layers'], '🏋️': ['🏋️', 'dumbbell'], '📏': ['📏', 'ruler'], '⏱': ['⏱', 'timer'], '🌱': ['🌱', 'sprout'],
  '🤏': ['🤏', 'gHalf'], '✋': ['✋', 'gOpen'], '🤚': ['🤚', 'gDrag'], '🤌': ['🤌', 'gPinch'], '🫳': ['🫳', 'gSloper'], '☝️': ['☝️', 'pointer'], '🪨': ['🪨', 'weight'], '💎': ['💎', 'gem'],
  '👶': ['👶', 'baby'], '📸': ['📸', 'camera'], '🪵': ['🪵', 'layers'], '🛠️': ['🛠️', 'flask-conical'], '🌅': ['🌅', 'sunrise'], '🦉': ['🦉', 'moon'],
  '💯': ['💯', 'badge-check'], '🙌': ['🙌', 'arrow-left-right'], '⚡': ['⚡', 'zap'], '🏅': ['🏅', 'medal'], '💬': ['💬', 'messages-square'], '❤️': ['❤️', 'heart'],
  '🫠': ['🫠', 'gOpen'], '🏳️': ['🏳️', 'flag'], '🎄': ['🎄', 'tree-pine'], '🐸': ['🐸', 'calendar-plus'], '🌚': ['🌚', 'moon-star'],
  '🐌': ['🐌', 'snail'], '😎': ['😎', 'glasses'], '🌀': ['🌀', 'refresh-cw'], '👀': ['👀', 'eye'], '🧂': ['🧂', 'cloud'], '❓': ['❓', 'circle-help'], '👑': ['👑', 'crown'],
  '🌾': ['🌾', 'wheat'], '🍽️': ['🍽️', 'utensils'], '🔭': ['🔭', 'binoculars'], '🪃': ['🪃', 'undo-2'], '🎰': ['🎰', 'cherry'], '⏰': ['⏰', 'alarm-clock'],
  '🎲': ['🎲', 'dices'], '🪞': ['🪞', 'scan-face'], '💍': ['💍', 'drama'], '🐈‍⬛': ['🐈‍⬛', 'cat'], '🎆': ['🎆', 'rocket'],
};

let mode: 'emoji' | 'flat' = 'flat';
export const setIconMode = (m: 'emoji' | 'flat') => { mode = m; };

/** Render an icon. `force` pins emoji or flat regardless of the user's setting. */
export function ic(key: string, force?: 'emoji' | 'flat') {
  const m = MAP[key];
  if (!m) return key; // unknown: raw text passthrough
  if ((force ?? mode) !== 'flat') return `<span class="emo">${m[0]}</span>`;
  const c = CUSTOM[m[1]];
  return c ? svg(c) : `<i data-lucide="${m[1]}" class="lic"></i>`;
}

export function hydrateIcons(root: Element | Document = document) {
  if (!root.querySelector?.('i[data-lucide]')) return; // nothing to do — skip the DOM walk
  createIcons({ icons: LUCIDE, attrs: { 'stroke-width': 2 }, root: root as any } as any);
}
