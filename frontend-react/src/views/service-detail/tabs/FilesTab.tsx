import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, CodeEditor, Dialog, DialogClose, Dropzone, FileExplorer, FileUploadQueue, LoadingButton, Notice, TextField, type EditorLanguage, type FileEntry, type MenuEntry, type UploadItem } from '@/design-system';
import { useOp, type OpResult } from '@/features';
import { MAX_EDIT_BYTES } from '../contracts';
import { useService } from '../context';
import { joinPath, mapFiles, pathToDir } from '../mappers';
import { ServiceApiError } from '../ports';
import { useResource } from '../../shared/useResource';
import { pend } from './shared';

const langOf = (name: string): EditorLanguage => /\.(json)$/i.test(name) ? 'json' : /\.(ya?ml)$/i.test(name) ? 'yaml' : /\.(js|mjs|cjs|ts)$/i.test(name) ? 'javascript' : /\.(properties|cfg|conf|ini|env)$/i.test(name) ? 'properties' : 'text';
const ARCHIVE = /\.(zip|tar|tar\.gz|tgz|rar|7z)$/i;
const NAME_ERR = 'Use a name without slashes.';
const validName = (n: string) => !!n.trim() && !/[/\\\0]/.test(n) && n !== '.' && n !== '..' && n.length <= 255;

type Prompt =
  | { kind: 'folder' } | { kind: 'file' } | { kind: 'pull' }
  | { kind: 'rename'; e: FileEntry } | { kind: 'move'; e: FileEntry } | { kind: 'chmod'; e: FileEntry } | { kind: 'delete'; e: FileEntry };

/** Browse, edit, upload and manage server files through Fortless. Uploads and downloads go to the node through signed URLs minted per request. */
export function FilesTab() {
  const { id, ports, can } = useService();
  const [path, setPath] = useState<string[]>([]);
  const dir = pathToDir(path);
  const list = useResource((s) => ports.files.list(id, dir, s), [id, ports, dir]);
  const op = useOp();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [value, setValue] = useState(''); const [value2, setValue2] = useState(''); const [formErr, setFormErr] = useState<string>();
  const [edit, setEdit] = useState<{ path: string; name: string; original: string; text: string } | null>(null);
  const [editErr, setEditErr] = useState<string>();
  const [discard, setDiscard] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const cancels = useRef(new Map<string, () => void>());
  useEffect(() => () => { cancels.current.forEach((c) => c()); }, []);

  const canRead = can('file.read-content'); const canWrite = can('file.update'); const canCreate = can('file.create'); const canDelete = can('file.delete'); const canArchive = can('file.archive');
  const after = async (p: Promise<{ pending: boolean }>): Promise<OpResult> => { const r = await p; list.refresh(); return pend(r); };

  const open = async (e: FileEntry) => {
    if (!canRead) { op.clear(); setEditErr('Your access level can list files but not open them.'); return; }
    const p = joinPath(path, e.name); setOpening(e.name); setEditErr(undefined);
    try { const f = await ports.files.read(id, p, new AbortController().signal); setEdit({ path: p, name: e.name, original: f.content, text: f.content }); }
    catch (err) { setEditErr(err instanceof ServiceApiError && err.code === 'FILE_TOO_LARGE' ? `${e.name} is over ${MAX_EDIT_BYTES / 1048576} MB, so it cannot be edited here. Download it instead.` : err instanceof Error ? err.message : 'The file could not be opened.'); }
    finally { setOpening(null); }
  };
  const download = (e: FileEntry) => op.run('dl', async () => { const url = await ports.files.downloadUrl(id, joinPath(path, e.name)); window.open(url, '_blank', 'noopener,noreferrer'); });

  const actionsFor = useMemo(() => (e: FileEntry): MenuEntry[] => {
    const file = e.kind === 'file';
    return [
      ...(file && canRead ? [{ id: 'open', label: 'Edit', onSelect: () => void open(e) }, { id: 'dl', label: 'Download', onSelect: () => void download(e) }] : []),
      ...(canWrite ? [{ id: 'rn', label: 'Rename', onSelect: () => { setValue(e.name); setFormErr(undefined); setPrompt({ kind: 'rename', e }); } }, { id: 'mv', label: 'Move', onSelect: () => { setValue(dir); setFormErr(undefined); setPrompt({ kind: 'move', e }); } }, { id: 'ch', label: 'Permissions', onSelect: () => { setValue('644'); setFormErr(undefined); setPrompt({ kind: 'chmod', e }); } }] : []),
      ...(canCreate && file ? [{ id: 'cp', label: 'Duplicate', onSelect: () => void op.run('copy', () => after(ports.files.copy(id, joinPath(path, e.name))), 'Copy created.') }] : []),
      ...(canArchive ? [file && ARCHIVE.test(e.name) ? { id: 'un', label: 'Extract here', onSelect: () => void op.run('unarchive', () => after(ports.files.unarchive(id, dir, e.name)), 'Extraction started.') } : { id: 'ar', label: 'Compress', onSelect: () => void op.run('archive', () => after(ports.files.archive(id, dir, [e.name]).then((r) => ({ pending: r.pending }))), 'Archive created.') }] : []),
      ...(canDelete ? [{ kind: 'separator' as const, id: 's' }, { id: 'rm', label: 'Delete', tone: 'danger' as const, onSelect: () => setPrompt({ kind: 'delete', e }) }] : []),
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, dir, canRead, canWrite, canCreate, canDelete, canArchive]);

  const submit = async () => {
    if (!prompt) return;
    setFormErr(undefined);
    const run = (k: string, fn: () => Promise<OpResult>, ok: string) => op.run(k, fn, ok).then((done) => { if (done) setPrompt(null); });
    switch (prompt.kind) {
      case 'folder': if (!validName(value)) return setFormErr(NAME_ERR); return run('mkdir', () => after(ports.files.createFolder(id, dir, value.trim())), `${value.trim()} created.`);
      case 'file': if (!validName(value)) return setFormErr(NAME_ERR); return run('touch', () => after(ports.files.write(id, joinPath(path, value.trim()), '')), `${value.trim()} created.`);
      case 'rename': if (!validName(value)) return setFormErr(NAME_ERR); return run('rename', () => after(ports.files.rename(id, dir, prompt.e.name, value.trim())), 'Renamed.');
      case 'move': if (!value.startsWith('/') || value.includes('..')) return setFormErr('Enter an absolute folder such as /plugins.'); return run('move', () => after(ports.files.move(id, dir, prompt.e.name, value.replace(/\/+$/, '') || '/')), 'Moved.');
      case 'chmod': if (!/^[0-7]{3,4}$/.test(value)) return setFormErr('Enter an octal mode such as 644 or 755.'); return run('chmod', () => after(ports.files.chmod(id, dir, [prompt.e.name], value)), 'Permissions updated.');
      case 'pull': if (!/^https:\/\/[^\s/]+\S*$/.test(value)) return setFormErr('Enter a public https address.'); if (value2 && !validName(value2)) return setFormErr(NAME_ERR); return run('pull', () => after(ports.files.pull(id, dir, value.trim(), value2.trim() || undefined)), 'Download started on the server.');
      case 'delete': return run('rm', () => after(ports.files.remove(id, dir, [prompt.e.name])), `${prompt.e.name} deleted.`);
    }
  };

  const save = async () => {
    if (!edit) return;
    const done = await op.run('save', () => ports.files.write(id, edit.path, edit.text).then((r) => { setEdit({ ...edit, original: edit.text }); list.refresh(); return pend(r); }), `${edit.name} saved.`);
    if (!done) setEditErr(undefined);
  };
  const dirty = !!edit && edit.text !== edit.original;

  /** Kept so a failed upload can be retried for real: same file, same destination folder, fresh signed URL. */
  const sources = useRef(new Map<string, { file: File; dir: string }>());
  const runUpload = (uid: string, file: File, to: string) => {
    setUploads((u) => u.map((x) => (x.id === uid ? { ...x, progress: 0, state: 'uploading', error: undefined } : x)));
    const h = ports.files.upload(id, to, file, (p) => setUploads((u) => u.map((x) => (x.id === uid ? { ...x, progress: p } : x))));
    cancels.current.set(uid, h.cancel);
    h.promise.then(
      () => { sources.current.delete(uid); setUploads((u) => u.map((x) => (x.id === uid ? { ...x, progress: 100, state: 'done' } : x))); list.refresh(); },
      (e: unknown) => setUploads((u) => u.map((x) => (x.id === uid ? { ...x, state: 'failed', error: e instanceof DOMException ? 'Cancelled. Retry to upload again.' : e instanceof Error ? e.message : 'Upload failed' } : x))),
    ).finally(() => cancels.current.delete(uid));
  };
  const startUpload = (files: File[]) => {
    for (const f of files) {
      const uid = `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      sources.current.set(uid, { file: f, dir });
      setUploads((u) => [...u, { id: uid, name: f.name, size: f.size, progress: 0, state: 'uploading' }]);
      runUpload(uid, f, dir);
    }
  };
  const retryUpload = (uid: string) => { const src = sources.current.get(uid); if (src) runUpload(uid, src.file, src.dir); };

  const toolbar = (
    <div className="flex flex-wrap gap-2">
      {canCreate ? <><Button size="sm" variant="secondary" leadingIcon="folder-01" onClick={() => { setValue(''); setFormErr(undefined); setPrompt({ kind: 'folder' }); }}>New folder</Button>
        <Button size="sm" variant="secondary" leadingIcon="file-add" onClick={() => { setValue(''); setFormErr(undefined); setPrompt({ kind: 'file' }); }}>New file</Button>
        <Button size="sm" variant="secondary" leadingIcon="download-01" onClick={() => { setValue(''); setValue2(''); setFormErr(undefined); setPrompt({ kind: 'pull' }); }}>Download from URL</Button></> : null}
      <Button size="sm" variant="secondary" leadingIcon="refresh" onClick={list.reload}>Refresh</Button>
    </div>
  );
  const titles = { folder: 'New folder', file: 'New file', pull: 'Download from URL', rename: 'Rename', move: 'Move', chmod: 'Permissions', delete: 'Delete' } as const;
  return (
    <div className="grid gap-4">
      {op.feedback}
      {editErr ? <Notice tone="warn" action={<Button size="sm" variant="secondary" onClick={() => setEditErr(undefined)}>Dismiss</Button>}>{editErr}</Notice> : null}
      {opening ? <p role="status" className="text-[13.5px] text-ink3">Opening {opening}…</p> : null}
      <FileExplorer path={path} entries={list.status === 'ready' ? mapFiles(list.data) : []} loading={list.status === 'loading'} error={list.status === 'error' ? list.error : undefined} onRetry={list.reload}
        onNavigate={setPath} onOpenFile={(e) => void open(e)} actionsFor={actionsFor} toolbar={toolbar} />
      {canCreate ? <Dropzone label={`Upload to ${dir}`} description="Drop files here or choose them. They go straight to the server node." multiple onFiles={startUpload} /> : null}
      <FileUploadQueue items={uploads} onCancel={(uid) => cancels.current.get(uid)?.()} onRetry={retryUpload} onClearDone={() => setUploads((u) => u.filter((x) => x.state !== 'done'))} />

      <Dialog open={!!prompt} onOpenChange={(o) => !o && setPrompt(null)} title={prompt ? (prompt.kind === 'delete' ? `Delete ${prompt.e.name}?` : titles[prompt.kind]) : ''}
        description={prompt?.kind === 'delete' ? (prompt.e.kind === 'folder' ? 'The folder and everything inside it are removed. This cannot be undone.' : 'This cannot be undone.') : prompt?.kind === 'pull' ? 'The server downloads the file itself. Only public https addresses work.' : prompt?.kind === 'move' ? `Moving ${prompt.e.name}` : prompt && 'e' in prompt ? prompt.e.name : `In ${dir}`}
        footer={<><DialogClose render={<Button variant="secondary">Cancel</Button>} /><LoadingButton variant={prompt?.kind === 'delete' ? 'danger' : 'primary'} onClick={submit}>{prompt?.kind === 'delete' ? 'Delete' : 'Confirm'}</LoadingButton></>}>
        {prompt?.kind === 'delete' ? <span /> : prompt?.kind === 'pull' ? (
          <div className="grid gap-4"><TextField label="Address" value={value} error={formErr} placeholder="https://example.com/file.jar" onChange={(e) => setValue(e.target.value)} /><TextField label="Save as (optional)" value={value2} onChange={(e) => setValue2(e.target.value)} /></div>
        ) : <TextField label={prompt?.kind === 'move' ? 'Destination folder' : prompt?.kind === 'chmod' ? 'Mode' : 'Name'} value={value} error={formErr} onChange={(e) => setValue(e.target.value)} />}
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => { if (o) return; if (dirty) setDiscard(true); else setEdit(null); }} size="xl" title={edit?.name ?? ''} description={edit?.path}
        footer={discard
          ? <><span className="mr-auto text-[13.5px] font-semibold text-warn" role="alert">Discard your unsaved changes?</span><Button variant="secondary" onClick={() => setDiscard(false)}>Keep editing</Button><Button variant="danger" onClick={() => { setDiscard(false); setEdit(null); }}>Discard changes</Button></>
          : <><span className="mr-auto text-[13px] text-ink3" role="status">{dirty ? 'Unsaved changes' : 'No changes'}</span><Button variant="secondary" onClick={() => (dirty ? setDiscard(true) : setEdit(null))}>Close</Button><LoadingButton variant="primary" disabled={!dirty || !canWrite} onClick={save}>Save file</LoadingButton></>}>
        {edit ? <div className="grid gap-3">{!canWrite ? <Notice tone="info">Your access level can read this file but not change it.</Notice> : null}<CodeEditor label={`Contents of ${edit.name}`} language={langOf(edit.name)} value={edit.text} readOnly={!canWrite} height={420} onChange={(t) => setEdit((x) => (x ? { ...x, text: t } : x))} /></div> : null}
      </Dialog>
    </div>
  );
}
