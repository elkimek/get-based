// @ts-check
// markdown.js — Markdown rendering for chat messages, focus card, EMF reports

import { escapeHTML } from './utils.js';

const MAX_BLOCKQUOTE_DEPTH = 8;

function normalizeComparisonEntities(text) {
  return text
    .replace(/&(?:lt|#0*60|#x0*3c);/gi, '<')
    .replace(/&(?:gt|#0*62|#x0*3e);/gi, '>')
    .replace(/&(?:le|#0*8804|#x0*2264);/gi, '≤')
    .replace(/&(?:ge|#0*8805|#x0*2265);/gi, '≥');
}

function safeMarkdownHref(url) {
  const candidate = url.trim();
  if (candidate !== url || /[\s\u007f]/.test(candidate)) return '#';
  if (!/^(?:https?:\/\/|mailto:)/i.test(candidate)) return '#';
  return candidate.replace(/"/g, '&quot;');
}

export function applyInlineMarkdown(text) {
  /** @type {string[]} */
  const protectedHtml = [];
  const protect = html => {
    const token = `\u0000gbmd:${protectedHtml.length}\u0000`;
    protectedHtml.push(html);
    return token;
  };

  let html = escapeHTML(normalizeComparisonEntities(String(text ?? ''))
    // NUL is reserved for internal placeholders and has no useful display form.
    .replace(/\u0000/g, '\ufffd'))
    // Protect code before processing emphasis or links inside it.
    .replace(/`([^`\n]+?)`/g, (_, code) => protect(`<code>${code}</code>`))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      const safe = safeMarkdownHref(url);
      // The whole input, including the label, was escaped before Markdown tags
      // were introduced. Protect the complete anchor from the bare-URL pass.
      return protect(`<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    })
    .replace(/(?<!")(https?:\/\/[^\s<>")\]]+)/g, url => {
      const trailingMatch = url.match(/[.,;:!?]+$/);
      const trailing = trailingMatch?.[0] || '';
      const href = trailing ? url.slice(0, -trailing.length) : url;
      return `<a href="${safeMarkdownHref(href)}" target="_blank" rel="noopener noreferrer">${href}</a>${trailing}`;
    });

  // Resolve placeholders recursively so a protected link label can contain a
  // protected inline-code span without repeatedly rescanning the whole output.
  /** @param {string} value @returns {string} */
  function restoreProtected(value) {
    return value.replace(/\u0000gbmd:(\d+)\u0000/g, (_, index) => {
      const protectedValue = protectedHtml[Number(index)];
      return protectedValue === undefined ? '' : restoreProtected(protectedValue);
    });
  }
  return restoreProtected(html);
}

export function renderMarkdown(text) {
  return renderMarkdownBlocks(String(text ?? ''), 0);
}

function renderMarkdownBlocks(text, blockquoteDepth) {
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
      let quoteText = quoteLines.join('\n');
      if (blockquoteDepth >= MAX_BLOCKQUOTE_DEPTH) {
        quoteText = quoteText.split('\n').map(quoteLine => quoteLine.replace(/^(?:\s*>\s?)+/, '')).join('\n');
      }
      blocks.push(`<blockquote class="chat-blockquote">${renderMarkdownBlocks(quoteText, blockquoteDepth + 1)}</blockquote>`);
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
