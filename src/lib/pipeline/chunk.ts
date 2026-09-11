import type { ChunkData } from './types';

/** Target chunk size in characters (~600 tokens at ~4 chars/token). */
const TARGET_CHUNK_CHARS = 2400;

/**
 * Split text into overlapping chunks on paragraph boundaries.
 *
 * Paragraphs accumulate into a buffer until it would exceed
 * `TARGET_CHUNK_CHARS`, at which point the buffer is finalized as a chunk.
 * The last paragraph of each chunk is carried over as the start of the next,
 * giving natural overlap without cutting a sentence in half. A paragraph that
 * alone exceeds the target becomes its own chunk rather than being split
 * mid-paragraph, so citation offsets always land on paragraph text.
 *
 * Pure and synchronous — no external calls, easy to unit test in isolation.
 */
export function chunk(text: string): ChunkData[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  // Split on blank lines, keeping track of each paragraph's offset in the
  // original (untrimmed-relative) string so start/end char offsets are
  // reproducible via `text.slice(startChar, endChar)`.
  const leadingWhitespace = text.length - text.trimStart().length;
  const paragraphs: { content: string; start: number }[] = [];
  let cursor = leadingWhitespace;

  for (const raw of trimmed.split(/\n\s*\n/)) {
    const start = text.indexOf(raw, cursor);
    const resolvedStart = start === -1 ? cursor : start;
    paragraphs.push({ content: raw, start: resolvedStart });
    cursor = resolvedStart + raw.length;
  }

  const chunks: ChunkData[] = [];
  let bufferParagraphs: { content: string; start: number }[] = [];
  let bufferLength = 0;

  const finalize = () => {
    if (bufferParagraphs.length === 0) return;
    const first = bufferParagraphs[0];
    const last = bufferParagraphs[bufferParagraphs.length - 1];
    const startChar = first.start;
    const endChar = last.start + last.content.length;
    const content = text.slice(startChar, endChar);

    chunks.push({
      index: chunks.length,
      content,
      startChar,
      endChar,
      tokenEstimate: Math.ceil(content.length / 4),
    });
  };

  for (const paragraph of paragraphs) {
    const additionalLength = paragraph.content.length + (bufferLength > 0 ? 2 : 0);

    if (bufferLength > 0 && bufferLength + additionalLength > TARGET_CHUNK_CHARS) {
      finalize();
      // Overlap: carry the last paragraph of the just-finalized chunk into
      // the new buffer so context isn't lost at the boundary.
      const overlapParagraph = bufferParagraphs[bufferParagraphs.length - 1];
      bufferParagraphs = [overlapParagraph, paragraph];
      bufferLength = overlapParagraph.content.length + 2 + paragraph.content.length;
    } else {
      bufferParagraphs.push(paragraph);
      bufferLength += additionalLength;
    }

    // A single paragraph longer than the target becomes its own chunk —
    // flush immediately rather than waiting for the next paragraph.
    if (bufferParagraphs.length === 1 && paragraph.content.length > TARGET_CHUNK_CHARS) {
      finalize();
      bufferParagraphs = [];
      bufferLength = 0;
    }
  }

  finalize();

  return chunks;
}
