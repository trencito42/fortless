import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { unifiedMergeView } from '@codemirror/merge';
import { baseTheme } from './CodeEditorImpl';

export function DiffViewerImpl({ original, modified, label, height }: { original: string; modified: string; label: string; height: number | string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: modified,
        extensions: [
          lineNumbers(), baseTheme, EditorView.lineWrapping, EditorState.readOnly.of(true), EditorView.editable.of(false),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          unifiedMergeView({ original, mergeControls: false, highlightChanges: true, gutter: true }),
        ],
      }),
    });
    return () => v.destroy();
  }, [original, modified, label]);
  return <div ref={host} style={{ height }} className="overflow-hidden rounded-lg bg-s1 [&_.cm-deletedChunk]:bg-bad-bg [&_.cm-changedLine]:bg-good-bg/60" />;
}
