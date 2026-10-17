import { useCallback, useState } from 'react';
import type { PageModel } from './types';
type History = { past: PageModel[][]; present: PageModel[]; future: PageModel[][] };
export function useHistory() {
  const [state, setState] = useState<History>({ past: [], present: [], future: [] });
  const commit = useCallback((update: PageModel[] | ((p: PageModel[]) => PageModel[])) => setState(s => {
    const next = typeof update === 'function' ? update(s.present) : update;
    if (next === s.present) return s;
    return { past: [...s.past.slice(-39), s.present], present: next, future: [] };
  }), []);
  const reset = useCallback((pages: PageModel[]) => setState({ past: [], present: pages, future: [] }), []);
  const undo = useCallback(() => setState(s => s.past.length ? { past: s.past.slice(0, -1), present: s.past.at(-1)!, future: [s.present, ...s.future] } : s), []);
  const redo = useCallback(() => setState(s => s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s), []);
  return { pages: state.present, commit, reset, undo, redo, canUndo: !!state.past.length, canRedo: !!state.future.length };
}
