import { useId, useRef, useState, type DragEvent } from 'react';
import { cn } from '@/lib/utils/cn';
import { Button } from '../primitives/Button';
import { Icon } from '../icons/Icon';

export interface DropzoneProps {
  label: string;
  description?: string;
  /** Same format as <input accept>, for example ".zip,.jar" or "image/*". */
  accept?: string;
  maxSizeBytes?: number;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  /** Called with files that were rejected and why. Rejections are also shown inline. */
  onReject?: (rejected: { file: File; reason: string }[]) => void;
  className?: string;
}

const fmt = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(b >= 10485760 ? 0 : 1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function matches(file: File, accept?: string): boolean {
  if (!accept) return true;
  return accept.split(',').map((a) => a.trim().toLowerCase()).some((a) => (a.startsWith('.') ? file.name.toLowerCase().endsWith(a) : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : file.type === a));
}

/** Drag and drop plus a real button, so keyboard and touch users can add files too. Validates type and size before handing files over. */
export function Dropzone({ label, description, accept, maxSizeBytes, multiple, disabled, onFiles, onReject, className }: DropzoneProps) {
  const [over, setOver] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  const handle = (list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list);
    const ok: File[] = [];
    const bad: { file: File; reason: string }[] = [];
    for (const f of files) {
      if (!matches(f, accept)) bad.push({ file: f, reason: `${f.name} is not an accepted file type.` });
      else if (maxSizeBytes && f.size > maxSizeBytes) bad.push({ file: f, reason: `${f.name} is ${fmt(f.size)}, over the ${fmt(maxSizeBytes)} limit.` });
      else ok.push(f);
    }
    const accepted = multiple ? ok : ok.slice(0, 1);
    if (!multiple && ok.length > 1) bad.push({ file: ok[1]!, reason: 'Only one file can be added here.' });
    setProblems(bad.map((b) => b.reason));
    if (bad.length) onReject?.(bad);
    if (accepted.length) onFiles(accepted);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) handle(e.dataTransfer.files);
  };

  return (
    <div className={cn('grid gap-2', className)}>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn('grid justify-items-center gap-3 rounded-lg px-5 py-8 text-center transition-colors', over ? 'bg-accent-bg ring-2 ring-accent' : 'bg-s2', disabled && 'opacity-50')}
      >
        <span className="grid size-12 place-items-center rounded-md bg-s1 text-ink2"><Icon name="cloud-upload" size={24} /></span>
        <div className="grid gap-1">
          <p id={`${id}-l`} className="text-[15px] font-extrabold tracking-[-0.02em]">{label}</p>
          <p className="text-[13px] text-ink2">{description ?? 'Drag files here, or choose from your device.'}</p>
        </div>
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => input.current?.click()} aria-describedby={`${id}-l`}>Choose {multiple ? 'files' : 'file'}</Button>
        <input ref={input} type="file" hidden accept={accept} multiple={multiple} disabled={disabled} onChange={(e) => { handle(e.target.files); e.target.value = ''; }} />
      </div>
      {problems.length ? (
        <ul role="alert" className="grid gap-1 rounded-md bg-bad-bg px-4 py-3 text-[13px] font-semibold text-bad">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
