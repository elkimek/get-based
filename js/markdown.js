// @ts-check
// markdown.js — Markdown rendering for chat messages, focus card, EMF reports

import { escapeHTML } from './utils.js';

export function applyInlineMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      const safe = /^(https?:|mailto:)/.test(url) ? url.replace(/"/g, '&quot;') : '#';
      return `<a href="${safe}" target="_blank" rel="noopener">${escapeHTML(label)}</a>`;
    })
    .replace(/(?<!")(https?:\/\/[^\s<>")\]]+)/g, url => {
      return `<a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener">${url}</a>`;
    });
}

export function renderMarkdown(text) {
  const lines = text.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      if (lang) {
        // Language-tagged: render as code
        const escaped = codeLines.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        blocks.push(`<pre class="chat-code-block"><code>${escaped}</code></pre>`);
      } else {
        // No language tag: render as styled callout (AI often uses ``` for non-code structured text)
        blocks.push(`<div class="chat-callout">${codeLines.map(l => applyInlineMarkdown(l)).join('<br>')}</div>`);
      }
      continue;
    }

    // Horizontal rule
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      blocks.push('<hr class="chat-hr">');
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(`<div class="chat-h${level}">${applyInlineMarkdown(headingMatch[2])}</div>`);
      i++;
      continue;
    }

    // Blockquote (> lines)
    if (/^\s*>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push(`<blockquote class="chat-blockquote">${renderMarkdown(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    // Table (pipe-delimited: | header | ... then |---| separator then | data | rows)
    if (/^\s*\|.+\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:]*-+/.test(lines[i + 1])) {
      const headerCells = line.split('|').slice(1, -1).map(c => applyInlineMarkdown(c.trim()));
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && /^\s*\|.+\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map(c => applyInlineMarkdown(c.trim())));
        i++;
      }
      let tableHtml = '<div class="chat-table-wrap"><table class="chat-table"><thead><tr>' + headerCells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      for (const row of rows) tableHtml += '<tr>' + row.map(c => `<td>${c}</td>`).join('') + '</tr>';
      tableHtml += '</tbody></table></div>';
      blocks.push(tableHtml);
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(applyInlineMarkdown(lines[i].replace(/^\s*[-*+]\s+/, '')));
        i++;
      }
      blocks.push(`<ul class="chat-list">${items.map(it => `<li>${it}</li>`).join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(applyInlineMarkdown(lines[i].replace(/^\s*\d+[.)]\s+/, '')));
        i++;
      }
      blocks.push(`<ol class="chat-list">${items.map(it => `<li>${it}</li>`).join('')}</ol>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^(\s*[-*_]\s*){3,}$/.test(lines[i]) &&
      !(/^\s*\|.+\|/.test(lines[i]) && i + 1 < lines.length && /^\s*\|[\s:]*-+/.test(lines[i + 1]))) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(`<div class="chat-para">${applyInlineMarkdown(paraLines.join(' '))}</div>`);
    }
  }

  return blocks.join('');
}
