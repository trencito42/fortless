import { cn } from '@/lib/utils/cn';
import { IconButton } from '../primitives/IconButton';
import { Icon } from '../icons/Icon';

export interface UploadItem { id: string; name: string; size: number; /** 0–100 */ progress: number; state: 'queued' | 'uploading' | 'done' | 'failed'; error?: string }

const fmt = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Progress list for uploads. Pair with Dropzone; the transfer itself (and its real progress) is the caller's. */
export function FileUploadQueue({ items, onCancel, onRetry, onClearDone }: { items: UploadItem[]; onCancel: (id: string) => void; onRetry: (id: string) => void; onClearDone?: () => void }) {
  if (items.length === 0) return null;
  const done = items.filter((i) => i.state === 'done').length;
  return (
    <section aria-label="Uploads" className="grid gap-2">
      <p role="status" className="text-[13.5px] font-semibold text-ink3">{done} of {items.length} uploaded{done > 0 && onClearDone ? <> · <button type="button" className="underline" onClick={onClearDone}>Clear finished</button></> : null}</p>
      <ul className="grid gap-2">
        {items.map((i) => (
          <li key={i.id} className="grid gap-2 rounded-md bg-s2 p-3">
            <div className="flex items-center gap-3">
              <Icon name={i.state === 'done' ? 'checkmark-circle-02' : i.state === 'failed' ? 'alert-circle' : 'file-01'} size={20} className={i.state === 'done' ? 'text-good' : i.state === 'failed' ? 'text-bad' : 'text-ink3'} />
              <div className="min-w-0 flex-1"><p className="truncate font-bold">{i.name}</p><p className="text-[12.5px] text-ink3">{fmt(i.size)}{i.state === 'failed' && i.error ? ` · ${i.error}` : ''}</p></div>
              {i.state === 'failed' ? <IconButton label={`Retry ${i.name}`} icon="refresh" size="sm" variant="secondary" onClick={() => onRetry(i.id)} /> : null}
              {i.state === 'queued' || i.state === 'uploading' ? <IconButton label={`Cancel ${i.name}`} icon="cancel-01" size="sm" variant="ghost" onClick={() => onCancel(i.id)} /> : null}
            </div>
            {i.state === 'uploading' || i.state === 'queued' ? (
              <div role="progressbar" aria-label={`Uploading ${i.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={i.state === 'queued' ? undefined : Math.round(i.progress)} className="h-1.5 overflow-hidden rounded-full bg-s3">
                <div className={cn('h-full rounded-full bg-accent transition-[width] duration-200', i.state === 'queued' && 'w-0')} style={i.state === 'queued' ? undefined : { width: `${i.progress}%` }} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
