/**
 * Code editor for the server file manager (CodeMirror 6, bundled separately as editor-ui.js and loaded on demand).
 * Colours come from Petal tokens, so light and dark follow the app theme.
 */
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, type Panel, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, StreamLanguage, syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import { SearchQuery, closeSearchPanel, findNext, findPrevious, getSearchQuery, highlightSelectionMatches, openSearchPanel, replaceAll, replaceNext, search, searchKeymap, setSearchQuery } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { java } from '@codemirror/lang-java';
import { python } from '@codemirror/lang-python';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { lua } from '@codemirror/legacy-modes/mode/lua';

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--s1)', color: 'var(--ink)', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--accent)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-gutters': { backgroundColor: 'var(--s1)', color: 'var(--ink3)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--s2)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--s2)', color: 'var(--ink2)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--accent-bg)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--s3)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--s3)', outline: '1px solid var(--s4)' },
  '.cm-panels': { backgroundColor: 'var(--s2)', color: 'var(--ink)', borderColor: 'var(--s3)' },
  '.cm-panels-top': { borderBottom: '1px solid var(--s3)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--warn) 24%, transparent)', outline: '1px solid color-mix(in srgb, var(--warn) 46%, transparent)', borderRadius: '3px' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--accent) 34%, var(--s1))', outline: '2px solid var(--accent)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--s3)', border: 'none', color: 'var(--ink2)' },
  '.cm-panel.card': { margin: '0', borderRadius: '0', border: '0', padding: '10px 12px', gap: '8px', flexWrap: 'wrap' },
  '.cm-panel.card > .inp': { flex: '1 1 210px' },
  '.cm-panel.card > .row': { gap: '6px', flexWrap: 'wrap' },
  '.cm-panel.card .seg input': { position: 'absolute', opacity: '0', pointerEvents: 'none' },
});

function fortlessSearchPanel(view: EditorView): Panel {
  const dom = document.createElement('div');
  dom.className = 'card row';
  const field = document.createElement('label'); field.className = 'inp s';
  const queryInput = document.createElement('input'); queryInput.type = 'text'; queryInput.placeholder = 'Find in file'; queryInput.setAttribute('aria-label', 'Find in file');
  field.append(queryInput);
  const replaceField = field.cloneNode(false) as HTMLLabelElement;
  const replaceInput = document.createElement('input'); replaceInput.type = 'text'; replaceInput.placeholder = 'Replace with'; replaceInput.setAttribute('aria-label', 'Replace with'); replaceField.append(replaceInput);
  const actions = document.createElement('div'); actions.className = 'row';
  const counter = document.createElement('span'); counter.className = 'pill'; counter.setAttribute('aria-live', 'polite');
  const button = (label: string, title: string, run: () => boolean, primary = false) => {
    const el = document.createElement('button'); el.type = 'button'; el.className = `btn xs${primary ? ' pri' : ''}`; el.textContent = label; el.title = title;
    el.addEventListener('click', () => { run(); view.focus(); refresh(); }); actions.append(el); return el;
  };
  const reveal = () => view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main, { y: 'center', x: 'center', yMargin: 48, xMargin: 32 }) });
  const navigate = (previous = false) => { const ok = (previous ? findPrevious : findNext)(view); if (ok) reveal(); return ok; };
  button('↑', 'Previous match (Shift+Enter)', () => navigate(true));
  button('↓', 'Next match (Enter)', () => navigate(), true);
  button('Replace', 'Replace current match', () => { const ok = replaceNext(view); if (ok) reveal(); return ok; });
  button('All', 'Replace all matches', () => replaceAll(view));
  button('×', 'Close search (Escape)', () => closeSearchPanel(view));
  actions.append(counter);
  const options = document.createElement('div'); options.className = 'seg';
  const toggle = (label: string, title: string) => { const wrap = document.createElement('label'); wrap.title = title; const input = document.createElement('input'); input.type = 'checkbox'; const caption = document.createElement('span'); caption.className = 'seg-btn'; caption.textContent = label; wrap.append(input, caption); options.append(wrap); return input; };
  const caseInput = toggle('Case', 'Match case'); const wordInput = toggle('Word', 'Match whole words'); const regexInput = toggle('Regex', 'Use a regular expression');
  dom.append(field, replaceField, actions, options);

  let syncing = false;
  const commit = () => {
    if (syncing) return;
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: queryInput.value, replace: replaceInput.value, caseSensitive: caseInput.checked, wholeWord: wordInput.checked, regexp: regexInput.checked })) });
  };
  const refresh = () => {
    const query = getSearchQuery(view.state);
    counter.className = 'pill';
    if (!query.search) { counter.textContent = 'Type to search'; return; }
    if (!query.valid) { counter.textContent = 'Invalid regex'; counter.classList.add('bad'); return; }
    let total = 0; let active = 0; const selected = view.state.selection.main;
    const cursor = query.getCursor(view.state.doc);
    for (let match = cursor.next(); !match.done; match = cursor.next()) {
      total++;
      if (match.value.from === selected.from && match.value.to === selected.to) active = total;
    }
    counter.textContent = total ? `${active || 1} of ${total}` : 'No matches';
    counter.classList.add(total ? 'info' : 'bad');
  };
  [queryInput, replaceInput].forEach((input) => input.addEventListener('input', () => { commit(); refresh(); }));
  [caseInput, wordInput, regexInput].forEach((input) => input.addEventListener('change', () => { commit(); refresh(); }));
  dom.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); navigate(event.shiftKey); refresh(); }
    else if (event.key === 'Escape') { event.preventDefault(); closeSearchPanel(view); view.focus(); }
  });
  const initial = getSearchQuery(view.state); syncing = true;
  queryInput.value = initial.search; replaceInput.value = initial.replace; caseInput.checked = initial.caseSensitive; wordInput.checked = initial.wholeWord; regexInput.checked = initial.regexp; syncing = false;
  return { dom, top: true, mount: () => { queryInput.focus(); queryInput.select(); refresh(); }, update: (_update: ViewUpdate) => refresh() };
}

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: 'var(--violet)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--good)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--warn)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--ink3)', fontStyle: 'italic' },
  { tag: [t.propertyName, t.attributeName, t.definition(t.variableName)], color: 'var(--info)' },
  { tag: [t.typeName, t.className, t.tagName], color: 'var(--info)' },
  { tag: [t.function(t.variableName), t.labelName], color: 'var(--accent)' },
  { tag: [t.heading], color: 'var(--ink)', fontWeight: '700' },
  { tag: [t.link, t.url], color: 'var(--accent)', textDecoration: 'underline' },
  { tag: [t.invalid], color: 'var(--bad)' },
]);

function language(filename: string): Extension[] {
  const name = filename.toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  switch (ext) {
    case 'json': case 'mcmeta': return [json()];
    case 'yml': case 'yaml': return [yaml()];
    case 'js': case 'mjs': case 'cjs': return [javascript()];
    case 'ts': return [javascript({ typescript: true })];
    case 'md': return [markdown()];
    case 'xml': return [xml()];
    case 'html': case 'htm': return [html()];
    case 'css': return [css()];
    case 'java': return [java()];
    case 'py': return [python()];
    case 'properties': case 'conf': case 'cfg': case 'ini': case 'env': return [StreamLanguage.define(properties)];
    case 'sh': case 'bash': return [StreamLanguage.define(shell)];
    case 'toml': return [StreamLanguage.define(toml)];
    case 'lua': return [StreamLanguage.define(lua)];
    default: return [];
  }
}

export interface EditorHost {
  open(path: string, content: string): void;
  show(path: string): void;
  value(path: string): string | undefined;
  markSaved(path: string): void;
  close(path: string): void;
  focus(): void;
  destroy(): void;
}

export function mountEditor(parent: HTMLElement, hooks: { onDirty(path: string, dirty: boolean): void; onSave(path: string): void }): EditorHost {
  const states = new Map<string, EditorState>();
  const saved = new Map<string, string>();
  let current: string | null = null;
  let view: EditorView | null = null;

  const make = (path: string, doc: string): EditorState => EditorState.create({
    doc,
    extensions: [
      lineNumbers(), foldGutter(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(),
      history(), indentOnInput(), bracketMatching(), highlightSelectionMatches(), search({ top: true, createPanel: fortlessSearchPanel }),
      syntaxHighlighting(highlight), theme, ...language(path.split('/').pop() || ''),
      keymap.of([
        { key: 'Mod-s', preventDefault: true, run: () => { hooks.onSave(path); return true; } },
        { key: 'Mod-f', preventDefault: true, run: openSearchPanel },
        { key: 'Mod-h', preventDefault: true, run: openSearchPanel },
        { key: 'Mod-Alt-f', preventDefault: true, run: openSearchPanel },
        { key: 'Mod-g', preventDefault: true, run: (v) => { const ok = findNext(v); if (ok) v.dispatch({ effects: EditorView.scrollIntoView(v.state.selection.main, { y: 'center', x: 'center' }) }); return ok; } },
        { key: 'Shift-Mod-g', preventDefault: true, run: (v) => { const ok = findPrevious(v); if (ok) v.dispatch({ effects: EditorView.scrollIntoView(v.state.selection.main, { y: 'center', x: 'center' }) }); return ok; } },
        indentWithTab, ...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap,
      ]),
      EditorView.updateListener.of((u) => {
        if (!u.docChanged) return;
        hooks.onDirty(path, u.state.doc.toString() !== saved.get(path));
      }),
    ],
  });

  const ensureView = (state: EditorState) => {
    if (!view) view = new EditorView({ state, parent });
    else view.setState(state);
  };
  const stash = () => { if (view && current) states.set(current, view.state); };

  return {
    open(path, content) {
      stash();
      saved.set(path, content);
      states.set(path, make(path, content));
      current = path;
      ensureView(states.get(path)!);
    },
    show(path) {
      const state = states.get(path);
      if (!state) return;
      stash();
      current = path;
      ensureView(state);
    },
    value(path) {
      if (view && current === path) return view.state.doc.toString();
      return states.get(path)?.doc.toString();
    },
    markSaved(path) {
      const v = view && current === path ? view.state.doc.toString() : states.get(path)?.doc.toString();
      if (v !== undefined) saved.set(path, v);
      hooks.onDirty(path, false);
    },
    close(path) {
      states.delete(path);
      saved.delete(path);
      if (current === path) { current = null; view?.destroy(); view = null; }
    },
    focus() { view?.focus(); },
    destroy() { view?.destroy(); view = null; states.clear(); saved.clear(); current = null; },
  };
}

(window as unknown as { FortlessEditor: unknown }).FortlessEditor = { mountEditor };
