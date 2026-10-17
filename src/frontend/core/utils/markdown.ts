import { esc } from './dom.js';

export function renderMarkdown(text: string | null | undefined): string {
  if (!text) return '';
  let s = esc(text);
  // Code blocks ```code```
  s = s.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, _lang, code) => `<pre><code class="code">${code.trim()}</code></pre>`);
  // Inline code `code`
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Bold **text**
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  // Italics *text*
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  // Blockquote > quote
  s = s.replace(/^(?:>|&gt;)\s*(.+)$/gm, '<blockquote>$1</blockquote>');
  // List items * item or - item
  s = s.replace(/^[*-]\s+(.+)$/gm, '<li>$1</li>');
  // Wrap list items
  s = s.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  // Links [text](url)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  const paragraphs = s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return `<div class="prose">${paragraphs
    .map((p) => (p.startsWith('<pre') || p.startsWith('<ul') || p.startsWith('<blockquote') ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`))
    .join('')}</div>`;
}
