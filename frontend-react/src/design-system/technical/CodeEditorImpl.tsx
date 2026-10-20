import { useEffect, useRef } from 'react';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting, StreamLanguage, indentOnInput, bracketMatching } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { yaml } from '@codemirror/lang-yaml';
import { tags as t } from '@lezer/highlight';

export type EditorLanguage = 'json' | 'yaml' | 'javascript' | 'properties' | 'text';

const properties = StreamLanguage.define({
  token(stream) {
    if (stream.sol() && (stream.peek() === '#' || stream.peek() === '!')) { stream.skipToEnd(); return 'comment'; }
    if (stream.sol()) { stream.eatWhile(/[^=:\s]/); return 'propertyName'; }
    if (stream.eat(/[=:]/)) return 'operator';
    stream.skipToEnd();
    return 'string';
  },
});

const lang = (l: EditorLanguage): Extension => (l === 'json' ? json() : l === 'yaml' ? yaml() : l === 'javascript' ? javascript() : l === 'properties' ? properties : []);

const highlight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--ink3)', fontStyle: 'italic' },
  { tag: [t.propertyName, t.attributeName, t.definition(t.variableName)], color: 'var(--accent)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--good)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--violet)' },
  { tag: [t.keyword, t.operatorKeyword, t.controlKeyword], color: 'var(--bad)' },
]);

export const baseTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--s1)', color: 'var(--ink)', fontSize: '14px', height: '100%' },
  '&.cm-focused': { outline: '2px solid var(--accent)', outlineOffset: '-2px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55', overflow: 'auto' },
  '.cm-gutters': { backgroundColor: 'var(--s2)', color: 'var(--ink3)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--accent) 7%, transparent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--ink)' },
});

export interface CodeEditorImplProps {
  value: string;
  onChange?: (value: string) => void;
  language: EditorLanguage;
  readOnly?: boolean;
  label: string;
  height: number | string;
  lineWrapping?: boolean;
}

/** CodeMirror 6 editor. The document is owned by the editor; `value` is applied when it differs from the current text. */
export function CodeEditorImpl({ value, onChange, language, readOnly, label, height, lineWrapping = true }: CodeEditorImplProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  const ro = useRef(new Compartment());

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), history(), drawSelection(), highlightActiveLine(), indentOnInput(), bracketMatching(), highlightSelectionMatches(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          syntaxHighlighting(highlight), baseTheme, lang(language),
          lineWrapping ? EditorView.lineWrapping : [],
          ro.current.of([EditorState.readOnly.of(!!readOnly), EditorView.editable.of(!readOnly)]),
          EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true' }),
          EditorView.updateListener.of((u) => { if (u.docChanged) cb.current?.(u.state.doc.toString()); }),
        ],
      }),
    });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, lineWrapping, label]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: ro.current.reconfigure([EditorState.readOnly.of(!!readOnly), EditorView.editable.of(!readOnly)]) });
  }, [readOnly]);

  return <div ref={host} style={{ height }} className="overflow-hidden rounded-lg bg-s1" />;
}
