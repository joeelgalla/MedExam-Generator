import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTextMark, emptyMarks, textSegments } from '../services/textAnnotations.ts';

test('highlighting can be extended across existing marks and partially removed', () => {
  let marks = applyTextMark(emptyMarks(), { start: 2, end: 6 }, 'highlight');
  marks = applyTextMark(marks, { start: 4, end: 10 }, 'highlight');
  assert.deepEqual(marks.highlight, [{ start: 2, end: 10 }]);
  marks = applyTextMark(marks, { start: 4, end: 8 }, 'highlight');
  assert.deepEqual(marks.highlight, [{ start: 2, end: 4 }, { start: 8, end: 10 }]);
  marks = applyTextMark(marks, { start: 0, end: 12 }, 'erase');
  assert.deepEqual(marks, emptyMarks());
});

test('strikethrough toggles independently of highlights and erasing affects only selected text', () => {
  let marks = applyTextMark(emptyMarks(), { start: 0, end: 12 }, 'highlight');
  marks = applyTextMark(marks, { start: 3, end: 9 }, 'strike');
  const toggled = applyTextMark(marks, { start: 3, end: 9 }, 'strike');
  assert.deepEqual(toggled.strike, []);
  assert.deepEqual(toggled.highlight, marks.highlight);
  const erased = applyTextMark(marks, { start: 5, end: 7 }, 'erase');
  assert.deepEqual(erased.highlight, [{ start: 0, end: 5 }, { start: 7, end: 12 }]);
  assert.deepEqual(erased.strike, [{ start: 3, end: 5 }, { start: 7, end: 9 }]);
});

test('overlapping annotations preserve original text including Unicode and literal markup', () => {
  const text = '🙂 red < blue & green';
  let marks = applyTextMark(emptyMarks(), { start: 0, end: 10 }, 'highlight');
  marks = applyTextMark(marks, { start: 3, end: 15 }, 'strike');
  const segments = textSegments(text, marks);
  assert.equal(segments.map(segment => segment.text).join(''), text);
  assert.ok(segments.some(segment => segment.highlight && segment.strike));
  assert.deepEqual(applyTextMark(marks, { start: 5, end: 5 }, 'erase'), marks);
});
