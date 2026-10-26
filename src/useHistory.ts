import { useCallback, useState } from 'react';
import type { FormValue, FormValues, PageModel } from './types';
type DocumentState = { pages: PageModel[]; formValues: FormValues };
type History = { past: DocumentState[]; present: DocumentState; future: DocumentState[] };
export function useHistory() {
  const [state, setState] = useState<History>({ past: [], present: { pages: [], formValues: {} }, future: [] });
  const commit = useCallback((update: PageModel[] | ((p: PageModel[]) => PageModel[])) => setState(s => {
    const next = typeof update === 'function' ? update(s.present.pages) : update;
    if (next === s.present.pages) return s;
    return { past: [...s.past.slice(-39), s.present], present: { ...s.present, pages: next }, future: [] };
  }), []);
  const commitForm = useCallback((name: string, value: FormValue) => setState(s => {
    if (JSON.stringify(s.present.formValues[name]) === JSON.stringify(value)) return s;
    return { past: [...s.past.slice(-39), s.present], present: { ...s.present, formValues: { ...s.present.formValues, [name]: value } }, future: [] };
  }), []);
  const reset = useCallback((pages: PageModel[]) => setState({ past: [], present: { pages, formValues: {} }, future: [] }), []);
  const undo = useCallback(() => setState(s => s.past.length ? { past: s.past.slice(0, -1), present: s.past.at(-1)!, future: [s.present, ...s.future] } : s), []);
  const redo = useCallback(() => setState(s => s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s), []);
  return { ...state.present, commit, commitForm, reset, undo, redo, canUndo: !!state.past.length, canRedo: !!state.future.length };
}
