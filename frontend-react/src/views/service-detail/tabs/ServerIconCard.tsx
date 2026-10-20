import { useRef, useState } from 'react';
import { Button, Card, CardHeader, Notice } from '@/design-system';
import { useOp } from '@/features';
import { useService } from '../context';

const MAX_BYTES = 256 * 1024;

/** Reads a File as a PNG and checks the one rule Minecraft enforces: exactly 64x64 pixels. Returns the preview URL and base64 body. */
async function inspect(file: File): Promise<{ url: string; base64: string }> {
  if (file.type !== 'image/png') throw new Error('Use a PNG image.');
  if (file.size > MAX_BYTES) throw new Error('The image is larger than 256 KB.');
  const url = URL.createObjectURL(file);
  try {
    const dim = await new Promise<{ w: number; h: number }>((res, rej) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => rej(new Error('That file is not a readable image.')); i.src = url; });
    if (dim.w !== 64 || dim.h !== 64) throw new Error(`Minecraft needs exactly 64×64 pixels. This image is ${dim.w}×${dim.h}.`);
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = ''; for (const b of buf) bin += String.fromCharCode(b);
    return { url, base64: btoa(bin) };
  } catch (e) { URL.revokeObjectURL(url); throw e; }
}

/** Server list icon for Minecraft. Validated here so the person sees the problem before the upload, and again by the server. */
export function ServerIconCard({ hasIcon, onSaved }: { hasIcon: boolean; onSaved: () => void }) {
  const { id, ports, can } = useService();
  const op = useOp();
  const input = useRef<HTMLInputElement>(null);
  const [pick, setPick] = useState<{ url: string; base64: string; name: string }>();
  const [error, setError] = useState<string>();
  const canWrite = can('file.create');
  const choose = async (f?: File) => {
    setError(undefined); if (pick) URL.revokeObjectURL(pick.url); setPick(undefined);
    if (!f) return;
    try { setPick({ ...(await inspect(f)), name: f.name }); } catch (e) { setError(e instanceof Error ? e.message : 'The image could not be read.'); }
  };
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Server icon" description={hasIcon ? 'An icon is set. Upload a new one to replace it.' : 'Shown next to your server in the Minecraft server list.'} />
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md bg-s3 text-[12px] font-bold text-ink3">{pick ? <img src={pick.url} alt="Selected icon preview" width={64} height={64} className="size-16 [image-rendering:pixelated]" /> : '64×64'}</div>
        <div className="grid gap-2">
          <input ref={input} type="file" accept="image/png" className="sr-only" aria-label="Choose icon file" tabIndex={-1} onChange={(e) => void choose(e.target.files?.[0])} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" leadingIcon="cloud-upload" disabled={!canWrite} onClick={() => input.current?.click()}>Choose PNG</Button>
            <Button variant="primary" disabled={!pick || !canWrite} loading={op.busy === 'icon'} onClick={() => pick && void op.run('icon', async () => { await ports.game.setIcon(id, pick.base64); onSaved(); }, 'Icon saved. Restart the server to see it in the list.')}>Save icon</Button>
          </div>
          {pick ? <p className="text-[13px] text-ink3">{pick.name}</p> : <p className="text-[13px] text-ink3">PNG, exactly 64×64 pixels, up to 256 KB.</p>}
        </div>
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {op.feedback}
      {canWrite ? null : <p className="text-[13px] text-ink3">Your access level cannot change files.</p>}
    </Card>
  );
}
