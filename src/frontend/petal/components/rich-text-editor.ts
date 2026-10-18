/**
 * Petal rich text editor adapter.
 * Canonical source: blueprint/fortless-blueprint/design/out.html (`rte()`, `.rte`, `.rtb`, `.rta`).
 * The gallery's contenteditable/execCommand interaction is retained, while output is converted
 * to the Markdown contract accepted by Fortless instead of submitting browser HTML.
 */

import { esc } from '../../core/utils/dom.js';

export function petalRichTextEditor(id: string, label: string, placeholder: string): string {
  const action = (command: string, icon: string, title: string) => `<button type="button" data-rcmd="${command}" aria-label="${title}" title="${title}">
        <svg class="ic s" aria-hidden="true" width="16" height="16"><use href="/assets/petal-icons.svg#i-${icon}"/></svg>
      </button>`;
  return `<div class="rte-shell" data-c="Markdown editor">
    <div class="edtb" data-c="Rich text toolbar" role="toolbar" aria-label="${esc(label)} formatting">
      ${action('heading', 'heading', 'Heading')}
      ${action('bold', 'bold', 'Bold')}
      ${action('italic', 'italic', 'Italic')}
      ${action('strike', 'strikethrough', 'Strikethrough')}
      <span class="rte-sep" aria-hidden="true"></span>
      ${action('link', 'link-01', 'Link')}
      ${action('quote', 'quote', 'Quote')}
      ${action('bullet', 'left-to-right-list-bullet', 'Bulleted list')}
      ${action('ordered', 'check-list', 'Numbered list')}
      ${action('code', 'code', 'Inline code')}
      ${action('codeblock', 'code', 'Code block')}
    </div>
    <div class="inp">
      <textarea id="${esc(id)}" placeholder="${esc(placeholder)}" aria-label="${esc(label)}"></textarea>
    </div>
  </div>`;
}

function safeHref(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return value.startsWith('/') ? `${url.pathname}${url.search}${url.hash}` : url.href;
  } catch {
    return null;
  }
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').replace(/([\\`*_\[\]])/g, '\\$1');
  if (!(node instanceof HTMLElement)) return '';
  const body = Array.from(node.childNodes).map(inlineMarkdown).join('');
  switch (node.tagName) {
    case 'B':
    case 'STRONG': return `**${body}**`;
    case 'I':
    case 'EM': return `*${body}*`;
    case 'CODE': return `\`${body.replace(/`/g, '\\`')}\``;
    case 'A': {
      const href = safeHref(node.getAttribute('href') || '');
      return href ? `[${body}](${href})` : body;
    }
    case 'BR': return '\n';
    default: return body;
  }
}

function blockMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return inlineMarkdown(node);
  if (!(node instanceof HTMLElement)) return '';
  if (node.tagName === 'UL' || node.tagName === 'OL') {
    return Array.from(node.children).map((li, index) => `${node.tagName === 'OL' ? `${index + 1}.` : '-'} ${inlineMarkdown(li).trim()}`).join('\n');
  }
  if (node.tagName === 'BLOCKQUOTE') return inlineMarkdown(node).split('\n').map((line) => `> ${line}`).join('\n');
  if (node.tagName === 'PRE') return `\`\`\`\n${node.textContent || ''}\n\`\`\``;
  return inlineMarkdown(node).trim();
}

export function editorMarkdown(id: string): string {
  const el = document.getElementById(id);
  if (!el) return '';
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value.trim();
  }
  return Array.from(el.childNodes).map(blockMarkdown).filter(Boolean).join('\n\n').trim();
}

export function resetEditor(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    el.value = '';
    return;
  }
  el.innerHTML = '<p><br></p>';
}

export function installRichTextEditors(root: ParentNode = document): () => void {
  const onMouseDown = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-rcmd]');
    if (button && root.contains(button)) event.preventDefault();
  };
  const onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-rcmd]');
    if (!button || !root.contains(button)) return;
    const container = button.closest('.rte-shell');
    const textarea = container?.querySelector('textarea');
    if (!textarea) return;

    const cmd = button.dataset.rcmd;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const sel = text.slice(start, end);

    const selectedOr = (fallback: string) => sel || fallback;
    const prefixLines = (prefix: (index: number) => string, fallback: string) => selectedOr(fallback).split('\n').map((line, index) => `${prefix(index)}${line}`).join('\n');
    let replacement = sel;
    if (cmd === 'bold') {
      replacement = `**${selectedOr('bold text')}**`;
    } else if (cmd === 'italic') {
      replacement = `*${selectedOr('italic text')}*`;
    } else if (cmd === 'strike') {
      replacement = `~~${selectedOr('strikethrough text')}~~`;
    } else if (cmd === 'code') {
      replacement = `\`${selectedOr('code')}\``;
    } else if (cmd === 'codeblock') {
      replacement = `\`\`\`\n${selectedOr('code')}\n\`\`\``;
    } else if (cmd === 'heading') {
      replacement = prefixLines(() => '## ', 'Heading');
    } else if (cmd === 'quote') {
      replacement = prefixLines(() => '> ', 'Quote');
    } else if (cmd === 'bullet') {
      replacement = prefixLines(() => '- ', 'List item');
    } else if (cmd === 'ordered') {
      replacement = prefixLines((index) => `${index + 1}. `, 'List item');
    } else if (cmd === 'link') {
      const url = window.prompt('Enter link URL (https://...):', 'https://');
      const safe = url ? safeHref(url.trim()) : null;
      if (safe) replacement = `[${selectedOr('link text')}](${safe})`;
      else return;
    }

    textarea.value = text.slice(0, start) + replacement + text.slice(end);
    textarea.focus();
    const newPos = start + replacement.length;
    textarea.setSelectionRange(newPos, newPos);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  };
  root.addEventListener('mousedown', onMouseDown);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('mousedown', onMouseDown);
    root.removeEventListener('click', onClick);
  };
}
