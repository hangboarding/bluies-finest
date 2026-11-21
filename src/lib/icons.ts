// Every icon in the app goes through ic(key). In "emoji" mode it renders the emoji,
// in "flat" mode a Lucide line icon. Call hydrateIcons() after inserting HTML.
import {
  createIcons, Timer, Wind, Repeat, Repeat1, Sofa, Ruler, Dumbbell, Anchor, Weight, Target, ArrowLeftRight, TrafficCone,
  Hand, HandGrab, Grab, Pointer, HandMetal, Mountain, Trophy, ChartColumn, MessageCircle, User, Heart, Flame, Medal, CalendarDays,
  Download, Trash2, Pencil, Star, Volume2, Vibrate, Palette, Settings, LogOut, Plus, Play, Pause, SkipForward, X, Camera,
  BookOpen, Crown, Sparkles, Lock, CircleHelp, Zap, Sprout, Gem, TrendingUp, Clock, Moon, Sunrise, Award, BicepsFlexed, Layers,
  Hourglass, Brain, Baby, Wrench, MessagesSquare, Eye, RotateCcw, Check, Globe, Users, Square, Boxes, Footprints,
} from 'lucide';

const LUCIDE = { Timer, Wind, Repeat, Repeat1, Sofa, Ruler, Dumbbell, Anchor, Weight, Target, ArrowLeftRight, TrafficCone, Hand, HandGrab, Grab, Pointer, HandMetal, Mountain, Trophy, ChartColumn, MessageCircle, User, Heart, Flame, Medal, CalendarDays, Download, Trash2, Pencil, Star, Volume2, Vibrate, Palette, Settings, LogOut, Plus, Play, Pause, SkipForward, X, Camera, BookOpen, Crown, Sparkles, Lock, CircleHelp, Zap, Sprout, Gem, TrendingUp, Clock, Moon, Sunrise, Award, BicepsFlexed, Layers, Hourglass, Brain, Baby, Wrench, MessagesSquare, Eye, RotateCcw, Check, Globe, Users, Square, Boxes, Footprints };

// key → [emoji, lucide kebab name]
const MAP: Record<string, [string, string]> = {
  hang: ['⏱', 'timer'], rest: ['😮‍💨', 'wind'], sets: ['🔁', 'repeat'], reps: ['🔂', 'repeat-1'], setRest: ['🛋️', 'sofa'],
  edge: ['📏', 'ruler'], add: ['🏋️', 'dumbbell'], rem: ['🪢', 'anchor'], lift: ['🪨', 'weight'], effort: ['🎯', 'target'],
  switch: ['🔄', 'arrow-left-right'], ready: ['🚦', 'traffic-cone'],
  open: ['✋', 'hand'], half: ['🤏', 'pointer'], full: ['✊', 'grab'], pinch: ['🤌', 'hand-grab'], sloper: ['🫳', 'hand-metal'],
  grip: ['✊', 'grab'], fingers: ['☝️', 'pointer'], hands: ['🙌', 'hand'], board: ['🪵', 'layers'], material: ['🧱', 'boxes'], profile: ['◜', 'square'],
  mode: ['🧲', 'zap'], about: ['📖', 'book-open'], feel: ['💭', 'brain'],
  tabHang: ['🧗', 'mountain'], tabFeed: ['💬', 'message-circle'], tabRanks: ['🏆', 'trophy'], tabStats: ['📊', 'chart-column'], tabProfile: ['👤', 'user'],
  heart: ['🤍', 'heart'], hearted: ['❤️', 'heart'], comment: ['💬', 'messages-square'], streak: ['🔥', 'flame'], medal: ['🏅', 'medal'],
  calendar: ['📅', 'calendar-days'], chart: ['📈', 'trending-up'], download: ['⬇', 'download'], trash: ['🗑', 'trash-2'], edit: ['✎', 'pencil'],
  star: ['⭐', 'star'], sound: ['🔊', 'volume-2'], vib: ['📳', 'vibrate'], theme: ['🎨', 'palette'], settings: ['⚙️', 'settings'],
  logout: ['🚪', 'log-out'], plus: ['➕', 'plus'], play: ['▶', 'play'], pause: ['❚❚', 'pause'], skip: ['⏭', 'skip-forward'], x: ['✕', 'x'],
  camera: ['📷', 'camera'], crown: ['👑', 'crown'], sparkles: ['✨', 'sparkles'], lock: ['🔒', 'lock'], help: ['❓', 'circle-help'],
  bolt: ['⚡', 'zap'], sprout: ['🌱', 'sprout'], gem: ['💎', 'gem'], clock: ['⏱', 'clock'], moon: ['🌙', 'moon'], sunrise: ['🌅', 'sunrise'],
  award: ['🏆', 'award'], muscle: ['💪', 'biceps-flexed'], hourglass: ['⏳', 'hourglass'], baby: ['👶', 'baby'], wrench: ['🛠️', 'wrench'],
  eye: ['👀', 'eye'], replay: ['↺', 'rotate-ccw'], check: ['✓', 'check'], globe: ['🌍', 'globe'], users: ['🙋', 'users'], mountain: ['🏔️', 'mountain'],
  footprints: ['🧗', 'footprints'],
};

let mode: 'emoji' | 'flat' = 'emoji';
export const setIconMode = (m: 'emoji' | 'flat') => { mode = m; };
export const iconMode = () => mode;

/** Render an icon. `force` pins emoji or flat regardless of the user's setting. */
export function ic(key: string, force?: 'emoji' | 'flat') {
  const m = MAP[key];
  if (!m) return key; // raw emoji passthrough
  return (force ?? mode) === 'flat' ? `<i data-lucide="${m[1]}" class="lic"></i>` : `<span class="emo">${m[0]}</span>`;
}

export function hydrateIcons(root: Element | Document = document) {
  createIcons({ icons: LUCIDE, attrs: { 'stroke-width': 2 }, root: root as any } as any);
}
