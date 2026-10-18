/**
 * Code editor for the server file manager (CodeMirror 6, bundled separately as editor-ui.js and loaded on demand).
 * Colours come from Petal tokens, so light and dark follow the app theme.
 */
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, StreamLanguage, syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
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
  '.cm-searchMatch': { backgroundColor: 'var(--warn-bg)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--s3)', border: 'none', color: 'var(--ink2)' },
  '.cm-panel input, .cm-panel button': { font: 'inherit', color: 'var(--ink)' },
});

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
      history(), indentOnInput(), bracketMatching(), highlightSelectionMatches(),
      syntaxHighlighting(highlight), theme, ...language(path.split('/').pop() || ''),
      keymap.of([
        { key: 'Mod-s', preventDefault: true, run: () => { hooks.onSave(path); return true; } },
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
