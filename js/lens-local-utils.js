// @ts-check
// js/lens-local-utils.js — pure helpers shared by the lens-local worker
// and the test suite.
//
// Kept as a standalone module so the algorithms are testable without
// spinning up a Web Worker, OPFS, or transformers.js. The worker imports
// these; run-tests.sh's browser harness and tests/test-lens-local-utils.js
// exercise them directly.

/**
 * Split text into chunks with overlap, snapping to whitespace boundaries when
 * possible so chunks do not end mid-word. Matches the lens Python chunker's
 * defaults (`packages/rag/src/lens/store.py::chunk_text`) so retrieval
 * behavior stays consistent across backends.
 * @param {unknown} text
 * @param {number} [maxSize]
 * @param {number} [overlap]
 * @param {number} [minSize]
 * @returns {string[]}
 */
export function chunkText(text, maxSize = 800, overlap = 50, minSize = 50) {
  const source = String(text || '').trim();
  if (source.length <= maxSize) return source.length >= minSize ? [source] : [];
  const out = [];
  let pos = 0;
  while (pos < source.length) {
    let end = Math.min(pos + maxSize, source.length);
    if (end < source.length) {
      for (const sep of ['\n\n', '\n', '. ', ' ']) {
        const idx = source.lastIndexOf(sep, end);
        if (idx > pos + minSize) { end = idx + sep.length; break; }
      }
    }
    const chunk = source.slice(pos, end).trim();
    if (chunk.length >= minSize) out.push(chunk);
    if (end >= source.length) break;
    pos = Math.max(end - overlap, pos + 1);
  }
  return out;
}

/**
 * Dot product on two unit-normalized vectors = cosine similarity.
 * Scalar so callers do not need to remember the normalization invariant.
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @returns {number}
 */
export function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/**
 * Maximal Marginal Relevance selection. `candidates` is sorted by score desc.
 * `getVec(i)` returns the unit-normalized vector for candidate index `i`.
 * λ=0.5 balances relevance against diversity; closer to 1 favors relevance,
 * closer to 0 favors diversity.
 * @param {Array<{ i: number, score: number }>} candidates
 * @param {number} topK
 * @param {number} lambda
 * @param {(index: number) => ArrayLike<number>} getVec
 * @returns {Array<{ i: number, score: number }>}
 */
export function mmrSelect(candidates, topK, lambda, getVec) {
  if (candidates.length <= topK) return candidates;
  const chosen = [candidates[0]];
  const remaining = candidates.slice(1);
  while (chosen.length < topK && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let r = 0; r < remaining.length; r++) {
      const cand = remaining[r];
      const cv = getVec(cand.i);
      // Initialize to -Infinity so negative cosines (vectors more than
      // 90° apart) are captured correctly. Initializing to 0 made λ=0
      // ties collapse to array order when all sims were ≤ 0.
      let maxSimToChosen = -Infinity;
      for (const c of chosen) {
        const s = cosine(cv, getVec(c.i));
        if (s > maxSimToChosen) maxSimToChosen = s;
      }
      const mmr = lambda * cand.score - (1 - lambda) * maxSimToChosen;
      if (mmr > bestScore) { bestScore = mmr; bestIdx = r; }
    }
    chosen.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }
  return chosen;
}
