export type SourceFile = { name: string; content: string };

const normalize = (text: string) => text.normalize('NFKC').replace(/\s+/g, ' ').trim();

// A model supplies an index, never a filename or an invented page citation.
// This checks quotation fidelity; relevance remains an explicitly AI assessment.
export function renderSourceAnalysis(result: unknown, files: SourceFile[]): string {
  const r = result as any;
  if (!r || !['supported', 'partial', 'conflicting', 'not_found'].includes(r.finding)
    || typeof r.analysis !== 'string' || !r.analysis.trim() || r.analysis.length > 6000
    || !Array.isArray(r.evidence) || r.evidence.length > 5) {
    throw new Error('Invalid source analysis response.');
  }
  if (r.finding === 'not_found') {
    if (r.evidence.length) throw new Error('Inconsistent source analysis response.');
    return '**No matching evidence found in the supplied text**\nThe AI did not locate a supporting passage in the uploaded text for this question. This does not establish that the answer is wrong or that the original PDF lacks the evidence: image tables and diagrams may be missing from extracted text. Check the original referenced page.\n\n**Search scope:** ' + files.map(f => f.name).join('; ');
  }
  if (!r.evidence.length) throw new Error('Source analysis returned no supporting quotations.');
  const evidence = r.evidence.map((e: any) => {
    if (!Number.isInteger(e.fileId) || !files[e.fileId] || typeof e.quote !== 'string'
      || normalize(e.quote).length < 15 || e.quote.length > 4000
      || !normalize(files[e.fileId].content).includes(normalize(e.quote))) {
      throw new Error('The AI quotation could not be matched to the supplied file.');
    }
    return `**Source:** ${files[e.fileId].name}\n**Matched passage:** ${e.quote.trim()}`;
  });
  const label = { supported: 'Supporting passage found', partial: 'Partial support found', conflicting: 'Possible disagreement with the answer key' }[r.finding as 'supported' | 'partial' | 'conflicting'];
  return `**${label}**\n${evidence.join('\n\n')}\n\n**AI interpretation:** ${r.analysis.trim()}\n\nQuoted text was matched to the uploaded file. Its clinical interpretation is an AI assessment; check the original page for tables, diagrams and context.`;
}

export function sourceAnalysisError(error: unknown): { status: number; error: string } {
  const e = error as { status?: number; code?: number; message?: string };
  const message = typeof e?.message === 'string' ? e.message : '';
  const status = e?.status || e?.code;
  if (status === 503 || /UNAVAILABLE|high demand/i.test(message)) return { status: 503, error: 'Gemini is temporarily busy. Source analysis did not complete. Try again shortly; your answers are unchanged.' };
  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(message)) return { status: 429, error: 'Gemini has reached its request or quota limit. Source analysis did not complete. Try again later or check the API quota.' };
  if (status === 403 || /PERMISSION_DENIED/i.test(message)) return { status: 403, error: 'The source-analysis service could not access Gemini. Check the server API access.' };
  return { status: 502, error: 'Source analysis could not produce a checked quotation. Try again or consult the original referenced page.' };
}
