export type TextRange = { start: number; end: number };
export type TextMarks = { highlight: TextRange[]; strike: TextRange[] };
export type AnnotationTool = 'highlight' | 'strike' | 'erase';

export const emptyMarks = (): TextMarks => ({ highlight: [], strike: [] });

function merge(ranges: TextRange[]): TextRange[] {
  const result: TextRange[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const previous = result[result.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else result.push({ ...range });
  }
  return result;
}

function remove(ranges: TextRange[], selection: TextRange): TextRange[] {
  return ranges.flatMap(range => {
    if (range.end <= selection.start || range.start >= selection.end) return [range];
    return [
      ...(range.start < selection.start ? [{ start: range.start, end: selection.start }] : []),
      ...(range.end > selection.end ? [{ start: selection.end, end: range.end }] : []),
    ];
  });
}

// Offsets refer to the original plain text, so overlapping selections never nest
// DOM wrappers or change the question itself.
export function applyTextMark(marks: TextMarks, selection: TextRange, tool: AnnotationTool): TextMarks {
  if (selection.start < 0 || selection.end <= selection.start) return marks;
  if (tool === 'erase') return {
    highlight: remove(marks.highlight, selection), strike: remove(marks.strike, selection),
  };
  const ranges = merge(marks[tool]);
  const alreadyMarked = ranges.some(range => range.start <= selection.start && range.end >= selection.end);
  return { ...marks, [tool]: alreadyMarked ? remove(ranges, selection) : merge([...ranges, selection]) };
}

export function textSegments(text: string, marks: TextMarks) {
  const boundaries = [...new Set([0, text.length, ...[...marks.highlight, ...marks.strike]
    .flatMap(range => [range.start, range.end])])].filter(n => n >= 0 && n <= text.length).sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, i) => {
    const end = boundaries[i + 1];
    return {
      start, text: text.slice(start, end),
      highlight: marks.highlight.some(range => range.start <= start && range.end >= end),
      strike: marks.strike.some(range => range.start <= start && range.end >= end),
    };
  });
}
