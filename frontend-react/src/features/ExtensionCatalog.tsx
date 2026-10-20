import { useState } from 'react';
import { Card, CardHeader, EmptyState, LoadingButton, Notice, SearchField, SegmentedControl, Skeleton, Badge } from '@/design-system';

export interface Extension {
  id: string;
  name: string;
  description: string;
  /** Icon URL from the catalog source. Optional: a lettered tile is shown without it. */
  iconUrl?: string;
  state: 'available' | 'installed' | 'unavailable';
  /** Why it cannot be installed (incompatible version, server running…). */
  unavailableReason?: string;
}
export interface ExtensionKind { id: string; label: string }

export interface ExtensionCatalogProps {
  title?: string;
  description?: string;
  kinds: ExtensionKind[];
  kind: string;
  onKindChange: (kind: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  items: Extension[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  /** Installs one item. A rejection is shown on that row and nothing else changes. */
  onInstall: (item: Extension) => Promise<void>;
  /** The whole catalog cannot be used (for example the server type has no plugin support). */
  unavailableReason?: string;
}

/**
 * Searchable list of installable plugins or mods. Search and tab state are controlled so the caller owns the (debounced) request.
 * Each row has its own pending and failure state, so one slow or failed install never blocks the rest.
 */
export function ExtensionCatalog({ title = 'Install', description = 'Search and manage server-side mods and plugins.', kinds, kind, onKindChange, query, onQueryChange, items, loading, error, onRetry, onInstall, unavailableReason }: ExtensionCatalogProps) {
  const [failures, setFailures] = useState<Record<string, string>>({});
  const install = async (item: Extension) => {
    setFailures((f) => { const { [item.id]: _drop, ...rest } = f; return rest; });
    try { await onInstall(item); } catch (e) { setFailures((f) => ({ ...f, [item.id]: e instanceof Error ? e.message : 'The install failed.' })); }
  };
  return (
    <Card>
      <CardHeader title={title} description={description} />
      {unavailableReason ? <Notice tone="warn" title="Installs are not available">{unavailableReason}</Notice> : (
        <div className="grid gap-4">
          {kinds.length > 1 ? <SegmentedControl aria-label="Extension type" size="sm" value={kind} onValueChange={onKindChange} options={kinds.map((k) => ({ value: k.id, label: k.label }))} /> : null}
          <SearchField label="Search extensions" placeholder="Search" value={query} onChange={(e) => onQueryChange(e.target.value)} onClear={() => onQueryChange('')} />
          {error ? <EmptyState tone="error" title="Could not load the catalog" description={error} action={onRetry ? <LoadingButton variant="secondary" onClick={async () => onRetry()}>Try again</LoadingButton> : undefined} />
            : loading ? <div role="status" aria-label="Loading catalog" className="grid gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            : items.length === 0 ? <EmptyState icon="search-01" title={query ? 'No matches' : 'Nothing to show yet'} description={query ? `Nothing matches “${query}”.` : 'The catalog returned no items.'} />
            : (
              <ul aria-label="Results" className="grid grid-cols-[minmax(0,1fr)] gap-2">
                {items.map((it) => (
                  <li key={it.id} className="grid min-w-0 gap-2 rounded-lg bg-s2 p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {it.iconUrl ? <img src={it.iconUrl} alt="" width={40} height={40} loading="lazy" className="size-10 shrink-0 rounded-md bg-s3 object-cover" /> : <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-md bg-s3 font-extrabold text-ink2">{it.name.slice(0, 1).toUpperCase()}</span>}
                      <div className="grid min-w-0 flex-1 gap-0.5">
                        <p className="truncate font-extrabold">{it.name}</p>
                        <p className="line-clamp-2 text-[13px] text-ink2">{it.description}</p>
                      </div>
                      {it.state === 'installed' ? <Badge tone="good">Installed</Badge>
                        : <LoadingButton size="sm" variant="secondary" leadingIcon="add-01" disabled={it.state === 'unavailable'} onClick={() => install(it)} aria-label={`Install ${it.name}`}>Install</LoadingButton>}
                    </div>
                    {it.state === 'unavailable' && it.unavailableReason ? <p className="text-[13px] font-semibold text-ink3">{it.unavailableReason}</p> : null}
                    {failures[it.id] ? <p role="alert" className="text-[13px] font-semibold text-bad">{failures[it.id]}</p> : null}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </Card>
  );
}
