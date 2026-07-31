// @ts-check
// voice-text.js — normalize rendered assistant Markdown into natural speech.

const MAX_SPEECH_CHARACTERS = 24_000;

function splitTableRow(line) {
  let value = String(line || '').trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0, -1);

  const cells = [];
  let cell = '';
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  if (escaped) cell += '\\';
  cells.push(cell.trim());
  return cells;
}

function isTableDivider(line) {
  const cells = splitTableRow(line);
  return cells.length > 1 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

const TABLE_OMISSION_NOTICE = 'See the table in the message for details.';

function narrateMarkdownTables(value) {
  const lines = String(value || '').split(/\r?\n/);
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const headerLine = lines[index];
    const dividerLine = lines[index + 1];
    if (!headerLine?.includes('|') || !dividerLine || !isTableDivider(dividerLine)) {
      output.push(headerLine);
      continue;
    }

    index += 2;
    while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
      index += 1;
    }
    output.push(TABLE_OMISSION_NOTICE);
    index -= 1;
  }
  return output.join('\n');
}

export function normalizeSpeechText(value) {
  let text = narrateMarkdownTables(value);
  if (!text.trim()) return '';

  text = text
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')
    .replace(/<https?:\/\/[^>]+>/g, ' link ')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*(\d+)[.)]\s+/gm, '$1. ')
    .replace(/^\s*\|?[-:|\s]{3,}\|?\s*$/gm, ' ')
    .replace(/\|/g, ', ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]+/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, ' and ')
    .replace(/&lt;/gi, ' less than ')
    .replace(/&gt;/gi, ' greater than ')
    .replace(/\r/g, '')
    .replace(/([.!?])\s*\n{2,}\s*/g, '$1 ')
    // A heading or label without sentence punctuation introduces the next
    // paragraph. Keep it in the same Kokoro chunk instead of making the model
    // play a short title and then pause while generating the paragraph.
    .replace(/([^\s.!?])\s*\n{2,}\s*/g, '$1: ')
    .replace(/\n/g, ' ')
    .replace(/([.!?])\1+/g, '$1')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (text.length > MAX_SPEECH_CHARACTERS) {
    text = `${text.slice(0, MAX_SPEECH_CHARACTERS).trim()}…`;
  }
  return text;
}

export function splitSpeechText(value, maxCharacters = 3500) {
  const text = normalizeSpeechText(value);
  if (!text) return [];
  const limit = Math.max(200, Number(maxCharacters) || 3500);
  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    const candidate = remaining.slice(0, limit + 1);
    const sentenceBreak = Math.max(
      candidate.lastIndexOf('. '),
      candidate.lastIndexOf('! '),
      candidate.lastIndexOf('? '),
    );
    const whitespaceBreak = candidate.lastIndexOf(' ');
    const splitAt = sentenceBreak >= Math.floor(limit * 0.55)
      ? sentenceBreak + 1
      : whitespaceBreak >= Math.floor(limit * 0.55)
        ? whitespaceBreak
        : limit;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
