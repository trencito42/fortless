import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '../icons/Icon';

export interface TreeNode {
  id: string;
  label: string;
  icon?: IconName;
  children?: TreeNode[];
  /** Right-aligned text, e.g. a file size. */
  meta?: ReactNode;
}

export interface TreeViewProps {
  nodes: TreeNode[];
  label: string;
  selectedId?: string;
  onSelect?: (node: TreeNode) => void;
  defaultExpanded?: string[];
}

interface Flat { node: TreeNode; level: number; parent?: string; pos: number; size: number }

/**
 * ARIA tree with roving tabindex. Up/Down move, Right expands or enters, Left collapses or goes to the parent,
 * Home/End jump, `*` opens siblings, typing jumps to a matching label, Enter selects. Items expose aria-level, aria-setsize and aria-posinset. Used for FileTree and any hierarchy.
 */
export function TreeView({ nodes, label, selectedId, onSelect, defaultExpanded = [] }: TreeViewProps) {
  const [expanded, setExpanded] = useState(() => new Set(defaultExpanded));
  const [focusId, setFocusId] = useState(selectedId ?? nodes[0]?.id);
  const refs = useRef(new Map<string, HTMLElement>());
  const typed = useRef({ text: '', at: 0 });

  const flat = useMemo(() => {
    const out: Flat[] = [];
    const walk = (list: TreeNode[], level: number, parent?: string) => {
      list.forEach((n, idx) => {
        out.push({ node: n, level, parent, pos: idx + 1, size: list.length });
        if (n.children?.length && expanded.has(n.id)) walk(n.children, level + 1, n.id);
      });
    };
    walk(nodes, 1);
    return out;
  }, [nodes, expanded]);

  const focus = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    refs.current.get(id)?.focus();
  };
  const toggle = (id: string, open?: boolean) => setExpanded((s) => { const n = new Set(s); if (open ?? !n.has(id)) n.add(id); else n.delete(id); return n; });

  const onKey = (e: KeyboardEvent, i: number) => {
    const cur = flat[i];
    if (!cur) return;
    const hasKids = !!cur.node.children?.length;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focus(flat[i + 1]?.node.id); break;
      case 'ArrowUp': e.preventDefault(); focus(flat[i - 1]?.node.id); break;
      case 'Home': e.preventDefault(); focus(flat[0]?.node.id); break;
      case 'End': e.preventDefault(); focus(flat[flat.length - 1]?.node.id); break;
      case 'ArrowRight': e.preventDefault(); if (hasKids) { if (!expanded.has(cur.node.id)) toggle(cur.node.id, true); else focus(flat[i + 1]?.node.id); } break;
      case 'ArrowLeft': e.preventDefault(); if (hasKids && expanded.has(cur.node.id)) toggle(cur.node.id, false); else focus(cur.parent); break;
      case '*': e.preventDefault(); {
        const sibs = flat.filter((f) => f.parent === cur.parent && f.node.children?.length);
        setExpanded((s) => { const n = new Set(s); sibs.forEach((f) => n.add(f.node.id)); return n; });
        break;
      }
      case 'Enter': case ' ': e.preventDefault(); onSelect?.(cur.node); if (hasKids) toggle(cur.node.id); break;
      default:
        // Type-ahead: printable characters typed within one second extend the prefix; repeating one letter cycles matches.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const now = Date.now();
          const t = typed.current;
          t.text = now - t.at > 1000 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
          t.at = now;
          const order = [...flat.slice(i + (t.text.length === 1 ? 1 : 0)), ...flat.slice(0, i + (t.text.length === 1 ? 1 : 0))];
          const hit = order.find((f) => f.node.label.toLowerCase().startsWith(t.text));
          if (hit) { e.preventDefault(); focus(hit.node.id); }
        }
    }
  };

  return (
    <ul role="tree" aria-label={label} className="grid gap-px">
      {flat.map(({ node, level, pos, size }, i) => {
        const hasKids = !!node.children?.length;
        const isOpen = expanded.has(node.id);
        return (
          <li
            key={node.id}
            role="treeitem"
            ref={(el) => { if (el) refs.current.set(node.id, el); else refs.current.delete(node.id); }}
            tabIndex={node.id === focusId ? 0 : -1}
            aria-level={level}
            aria-expanded={hasKids ? isOpen : undefined}
            aria-selected={node.id === selectedId}
            aria-setsize={size}
            aria-posinset={pos}
            onKeyDown={(e) => onKey(e, i)}
            onFocus={() => setFocusId(node.id)}
            onClick={() => { setFocusId(node.id); onSelect?.(node); if (hasKids) toggle(node.id); }}
            style={{ paddingLeft: 8 + (level - 1) * 20 }}
            className={cn('flex min-h-10 cursor-pointer items-center gap-2 rounded-sm pr-3 font-semibold outline-none select-none focus-visible:ring-2 focus-visible:ring-accent', node.id === selectedId ? 'bg-accent-bg text-accent' : 'text-ink2 hover:bg-s2')}
          >
            <span className="grid size-4 place-items-center">{hasKids ? <Icon name="arrow-right-01" size={14} className={cn('transition-transform', isOpen && 'rotate-90')} /> : null}</span>
            <Icon name={node.icon ?? (hasKids ? (isOpen ? 'folder-open' : 'folder-01') : 'file-01')} size={18} className="text-ink3" />
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
            {node.meta ? <span className="text-[12.5px] text-ink3">{node.meta}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

export const FileTree = TreeView;
