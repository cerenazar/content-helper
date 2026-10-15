import { create } from 'zustand';
import type { Project, ReelProject, CarouselProject } from '@cb/schema';
import { api, type Job } from './api';

export type Selection =
  | { kind: 'caption'; id: string }
  | { kind: 'cut'; id: string }
  | { kind: 'scene'; id: string }
  | { kind: 'clip'; id: string }
  | { kind: 'slide'; id: string }
  | { kind: 'element'; slide: string; id: string }
  | null;

interface Doc {
  project: Project;
  scenes: string;
}

interface State extends Doc {
  slug: string | null;
  past: Doc[];
  future: Doc[];
  saveState: 'saved' | 'pending' | 'saving' | 'error';
  saveError: string | null;
  invalidError: string | null;
  selection: Selection;
  time: number;
  playing: boolean;
  claudeRunning: boolean;
  /** Claude'un son turda değiştirdiği öğe id'leri (kısa süre turuncu yanar). */
  flash: Set<string>;
  jobs: Record<string, Job>;
  lastKey: string | null;
  lastAt: number;

  open(slug: string, project: Project, scenes: string, claudeRunning: boolean): void;
  /** Elle düzenleme. key: sürükleme gibi art arda gelen değişiklikleri tek geri alma adımında birleştirir. */
  apply(fn: (d: Doc) => Doc, key?: string): void;
  updateReel(fn: (p: ReelProject) => ReelProject, key?: string): void;
  updateCarousel(fn: (p: CarouselProject) => CarouselProject, key?: string): void;
  setScenes(code: string): void;
  fromServer(project: Project, scenes: string, source: 'claude' | 'external'): void;
  undo(): void;
  redo(): void;
  select(s: Selection): void;
  setTime(t: number): void;
  setPlaying(p: boolean): void;
  setJob(j: Job): void;
  /** Bekleyen kaydı hemen yaz (sunucunun diskten okuyacağı işlerden önce). */
  flush(): Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** İki proje arasında değişen öğe id'leri (caption, kesit, sahne, öğe). */
function changedIds(a: Project, b: Project): Set<string> {
  const out = new Set<string>();
  const idx = (xs: { id: string }[]) => new Map(xs.map((x) => [x.id, JSON.stringify(x)]));
  const cmp = (xa: { id: string }[], xb: { id: string }[]) => {
    const ma = idx(xa);
    for (const x of xb) if (ma.get(x.id) !== JSON.stringify(x)) out.add(x.id);
  };
  if (a.kind === 'reel' && b.kind === 'reel') {
    cmp(a.captions, b.captions);
    cmp(a.edl, b.edl);
    cmp(a.scenes, b.scenes);
  }
  if (a.kind === 'carousel' && b.kind === 'carousel') {
    cmp(a.slides, b.slides);
    cmp(a.slides.flatMap((s) => s.elements), b.slides.flatMap((s) => s.elements));
  }
  return out;
}

export const useStore = create<State>((set, get) => {
  const scheduleSave = () => {
    set({ saveState: 'pending' });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 450);
  };
  const save = async () => {
    const { slug, project, scenes, claudeRunning } = get();
    if (!slug) return;
    if (claudeRunning) return void (saveTimer = setTimeout(save, 1000));
    set({ saveState: 'saving' });
    try {
      await api.save(slug, project, scenes);
      if (get().saveState === 'saving') set({ saveState: 'saved', saveError: null });
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 409) return void (saveTimer = setTimeout(save, 1000));
      set({ saveState: 'error', saveError: err.message });
    }
  };
  const push = (next: Doc, key?: string) => {
    const s = get();
    const now = Date.now();
    const coalesce = key && key === s.lastKey && now - s.lastAt < 900;
    set({
      ...next,
      past: coalesce ? s.past : [...s.past.slice(-199), { project: s.project, scenes: s.scenes }],
      future: [],
      lastKey: key ?? null,
      lastAt: now,
    });
    scheduleSave();
  };

  return {
    slug: null,
    project: null as unknown as Project,
    scenes: '',
    past: [],
    future: [],
    saveState: 'saved',
    saveError: null,
    invalidError: null,
    selection: null,
    time: 0,
    playing: false,
    claudeRunning: false,
    flash: new Set(),
    jobs: {},
    lastKey: null,
    lastAt: 0,

    open(slug, project, scenes, claudeRunning) {
      set({ slug, project, scenes, claudeRunning, past: [], future: [], selection: null, time: 0, playing: false, saveState: 'saved', invalidError: null, jobs: {} });
    },
    apply(fn, key) {
      if (get().claudeRunning) return;
      const s = get();
      push(fn({ project: s.project, scenes: s.scenes }), key);
    },
    updateReel(fn, key) {
      get().apply((d) => (d.project.kind === 'reel' ? { ...d, project: fn(d.project) } : d), key);
    },
    updateCarousel(fn, key) {
      get().apply((d) => (d.project.kind === 'carousel' ? { ...d, project: fn(d.project) } : d), key);
    },
    setScenes(code) {
      get().apply((d) => ({ ...d, scenes: code }), 'scenes-code');
    },
    fromServer(project, scenes, source) {
      const s = get();
      const flash = source === 'claude' ? changedIds(s.project, project) : new Set<string>();
      set({
        project,
        scenes,
        past: [...s.past.slice(-199), { project: s.project, scenes: s.scenes }],
        future: [],
        flash,
        invalidError: null,
        saveState: 'saved',
        lastKey: null,
      });
      if (flash.size) setTimeout(() => get().flash === flash && set({ flash: new Set() }), 2600);
    },
    undo() {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev || s.claudeRunning) return;
      set({ ...prev, past: s.past.slice(0, -1), future: [{ project: s.project, scenes: s.scenes }, ...s.future], lastKey: null });
      scheduleSave();
    },
    redo() {
      const s = get();
      const next = s.future[0];
      if (!next || s.claudeRunning) return;
      set({ ...next, future: s.future.slice(1), past: [...s.past, { project: s.project, scenes: s.scenes }], lastKey: null });
      scheduleSave();
    },
    select: (selection) => set({ selection }),
    setTime: (time) => set({ time: Math.max(0, time) }),
    setPlaying: (playing) => set({ playing }),
    setJob: (j) => set({ jobs: { ...get().jobs, [j.id]: j } }),
    async flush() {
      if (saveTimer) clearTimeout(saveTimer);
      if (get().saveState !== 'saved') await save();
    },
  };
});

export const reel = (p: Project) => (p.kind === 'reel' ? p : null);
