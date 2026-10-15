import { timeline, splitCut, rippleDelete, moveCut, cutAt } from '@cb/renderer';
import { newId, type ReelProject } from '@cb/schema';
import { useStore } from '../store';

/** Reel düzenleme komutları: araç çubuğu düğmeleri ve klavye kısayolları aynı fonksiyonları çağırır. */

const reelOf = () => {
  const p = useStore.getState().project;
  return p.kind === 'reel' ? p : null;
};

export const reelDuration = (p: ReelProject) => timeline(p.captions).duration;

/** Oynatma kafasının altındaki kesiti ikiye böler (B, ⌘B). Seçim sağdaki parçaya geçer. */
export function splitAtPlayhead(): boolean {
  const st = useStore.getState();
  const p = reelOf();
  if (!p) return false;
  const r = splitCut(p.edl, st.time, () => newId('cut'));
  if (!r) return false;
  st.updateReel((q) => ({ ...q, edl: splitCut(q.edl, st.time, () => r.right)?.edl ?? q.edl }));
  st.select({ kind: 'cut', id: r.right });
  return true;
}

/** Oynatma kafası seçili kesitin içinde mi (bölme düğmesi için). */
export function canSplitAt(p: ReelProject, t: number): boolean {
  return !!cutAt(p, t) && !!splitCut(p.edl, t, () => '_');
}

/** Seçili öğeyi siler. Kesitte ripple: sonrakiler sola kayar, boşluk kalmaz. */
export function deleteSelection(): boolean {
  const st = useStore.getState();
  const p = reelOf();
  const s = st.selection;
  if (!p || !s) return false;
  if (s.kind === 'caption') {
    if (p.captions.length <= 1) return false;
    st.updateReel((q) => ({ ...q, captions: q.captions.filter((c) => c.id !== s.id) }));
  } else if (s.kind === 'cut') st.updateReel((q) => ({ ...q, edl: rippleDelete(q.edl, s.id) }));
  else if (s.kind === 'sfx') st.updateReel((q) => ({ ...q, sfx: q.sfx.filter((x) => x.id !== s.id) }));
  else return false;
  st.select(null);
  return true;
}

/** Seçili kesiti bir sıra öne (-1) ya da arkaya (+1) taşır (⌥← ⌥→). */
export function nudgeCut(d: -1 | 1): boolean {
  const st = useStore.getState();
  const p = reelOf();
  const s = st.selection;
  if (!p || s?.kind !== 'cut') return false;
  const i = p.edl.findIndex((c) => c.id === s.id);
  if (i < 0 || i + d < 0 || i + d >= p.edl.length) return false;
  st.updateReel((q) => ({ ...q, edl: moveCut(q.edl, i, i + d) }));
  return true;
}

export function togglePlay() {
  const st = useStore.getState();
  const p = reelOf();
  if (!p) return;
  if (!st.playing && st.time >= reelDuration(p) - 0.02) st.setTime(0);
  st.setPlaying(!st.playing);
}

/** J/K/L: L ileri (tekrar basınca 2×, 4×), J geri, K durdur. */
export function shuttle(key: 'j' | 'k' | 'l') {
  const st = useStore.getState();
  const p = reelOf();
  if (!p) return;
  if (key === 'k') return st.setPlaying(false);
  if (key === 'l') {
    if (st.playing && st.rate > 0) return st.shuttle(Math.min(4, st.rate * 2));
    if (st.time >= reelDuration(p) - 0.02) st.setTime(0);
    return st.shuttle(1);
  }
  if (st.playing && st.rate < 0) return st.shuttle(Math.max(-4, st.rate * 2));
  if (st.time <= 0.01) return;
  st.shuttle(-1);
}
