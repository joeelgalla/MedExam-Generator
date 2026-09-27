// Synthetic, nonmedical content. No course documents or private exam questions.
export function fixture() {
  return {
    format: 'medexam-practice', version: 1, examId: 'demo-01', title: 'Demo reasoning exam', durationMinutes: 1,
    instructions: 'A short synthetic exam for checking the practice interface.',
    registry: { id: 'demo-v1', buckets: { basics: 'Foundations' }, topics: { numbers: { title: 'Number sense', bucketId: 'basics' } }, objectives: { 'DEMO.1#1': { topicId: 'numbers' }, 'DEMO.1#2': { topicId: 'numbers' } } },
    questions: [1, 2, 3].map(n => ({ id: n, vignette: `A box contains ${n} red counters and two blue counters.`, leadIn: 'How many counters are in the box?',
      options: { A: String(n + 1), B: String(n + 2), C: String(n + 3), D: String(n + 4) }, correctAnswer: 'B',
      explanation: `Add the ${n} red counters and the two blue counters.`,
      metadata: { week: 0, cluster: 'Foundations', cognitiveLevel: '1.2', subtype: 'criteria_or_score', itemId: `demo-item-${n}`, objectiveIds: ['DEMO.1#1'], topicId: 'numbers', bucketId: 'basics', losTested: ['Combine two small sets.'], sourceDocument: 'Synthetic fixture', sources: [{ title: 'Synthetic fixture', page: 1 }] },
    })),
  };
}
