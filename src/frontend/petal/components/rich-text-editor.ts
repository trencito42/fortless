/**
 * Petal rich text editor adapter.
 * Canonical source: blueprint/fortless-blueprint/design/out.html (`rte()`, `.rte`, `.rtb`, `.rta`).
 * The gallery's contenteditable/execCommand interaction is retained, while output is converted
 * to the Markdown contract accepted by Fortless instead of submitting browser HTML.
 */

import { esc } from '../../core/utils/dom.js';

const tool = (command: string, icon: string, label: string) =>
  `<button type="button" class="btn sq s ghost" data-rcmd="${esc(command)}" aria-label="${esc(label)}" title="${esc(label)}"><svg class="ic s" aria-hidden="true"><use href="#i-${esc(icon)}"/></svg></button>`;

export function petalRichTextEditor(id: string, label: string, placeholder: string): string {
  return `<div class="rte" data-rte="${esc(id)}">
    <div class="rtb" data-rtb role="toolbar" aria-label="${esc(label)} formatting">
      ${tool('bold', 'text-bold', 'Bold')}
      ${tool('italic', 'text-italic', 'Italic')}
      <i aria-hidden="true"></i>
      ${tool('insertUnorderedList', 'left-to-right-list-bullet', 'Bulleted list')}
      ${tool('formatBlock:blockquote', 'quote', 'Quote')}
      ${tool('formatBlock:pre', 'source-code', 'Code block')}
      <i aria-hidden="true"></i>
      ${tool('createLink', 'link-02', 'Add link')}
    </div>
    <div id="${esc(id)}" class="rta" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${esc(label)}" data-placeholder="${esc(placeholder)}" spellcheck="true"><p><br></p></div>
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
  const editor = document.getElementById(id);
  if (!editor) return '';
  return Array.from(editor.childNodes).map(blockMarkdown).filter(Boolean).join('\n\n').trim();
}

export function resetEditor(id: string): void {
  const editor = document.getElementById(id);
  if (editor) editor.innerHTML = '<p><br></p>';
}

export function installRichTextEditors(root: ParentNode = document): () => void {
  const onMouseDown = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-rcmd]');
    if (button && root.contains(button)) event.preventDefault();
  };
  const onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-rcmd]');
    if (!button || !root.contains(button)) return;
    const editor = button.closest<HTMLElement>('[data-rte]')?.querySelector<HTMLElement>('.rta');
    if (!editor) return;
    editor.focus();
    const command = button.dataset.rcmd || '';
    if (command === 'createLink') {
      const requested = window.prompt('Paste an https:// link');
      const href = requested ? safeHref(requested.trim()) : null;
      if (href) document.execCommand('createLink', false, href);
      return;
    }
    if (command.includes(':')) {
      const [name, value] = command.split(':', 2);
      if (name) document.execCommand(name, false, value || '');
    } else {
      document.execCommand(command, false);
    }
  };
  root.addEventListener('mousedown', onMouseDown);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('mousedown', onMouseDown);
    root.removeEventListener('click', onClick);
  };
}
