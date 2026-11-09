import React from 'react';
import type { ExamQuestion } from '../types';

type Source = NonNullable<ExamQuestion['metadata']['sources']>[number];

// Sources, objectives and the author's note for a reviewed question, folded
// into one closed disclosure so the explanation stays the main thing on screen.
// Each source is listed once: quoted passages grouped by document, then
// link-only references.
export default function ReviewSources({ question, showSourceDocument = false }: { question: ExamQuestion; showSourceDocument?: boolean }) {
  const meta = question.metadata;
  const sources = meta.sources || [];
  const objectives = meta.losTested || [];
  const objectiveIds = meta.objectiveIds || [];
  const groups = new Map<string, Source[]>();
  for (const source of sources.filter(s => s.quote)) groups.set(source.title, [...(groups.get(source.title) || []), source]);
  const references = sources.filter(s => !s.quote);
  const extraDocument = showSourceDocument && meta.sourceDocument && !sources.some(s => s.title === meta.sourceDocument) ? meta.sourceDocument : '';
  if (!sources.length && !objectives.length && !meta.coverageNote && !extraDocument) return null;

  return (
    <details className="group text-xs text-slate-600">
      <summary className="cursor-pointer select-none font-medium text-slate-600 hover:text-slate-900">
        Sources &amp; objectives{sources.length ? ` (${sources.length})` : ''}
      </summary>
      <div className="mt-2 space-y-3 rounded-lg border border-slate-200 bg-white p-3 leading-relaxed">
        {objectives.length > 0 && (
          <p><span className="font-medium text-slate-700">Objective{objectiveIds.length ? ` ${objectiveIds[0]}` : ''}:</span> {objectives.join('; ')}
            {objectiveIds.length > 1 && <span> · Related: {objectiveIds.slice(1).join(', ')}</span>}</p>
        )}
        {groups.size > 0 && (
          <div>
            <p className="font-medium text-slate-700">Passage from the study material</p>
            {[...groups].map(([title, passages]) => (
              <div key={title} className="mt-2">
                <p className="text-slate-500 break-words">{title}</p>
                {passages.map((s, i) => (
                  <blockquote key={i} className="mt-1 whitespace-pre-line border-l-2 border-blue-200 pl-3 text-sm text-slate-700">
                    {s.quote}{s.page ? <span className="ml-1 text-xs text-slate-400">(p. {s.page})</span> : null}
                    {(s.kind === 'supplement' || s.title.startsWith('Primary reference note -')) && <span className="block text-xs font-medium text-amber-900">Reference note, not a handbook passage.</span>}
                  </blockquote>
                ))}
              </div>
            ))}
          </div>
        )}
        {(references.length > 0 || extraDocument) && (
          <div>
            <p className="font-medium text-slate-700">Other references</p>
            <ul className="mt-1 space-y-1">
              {references.map((s, i) => (
                <li key={i} className="break-words">
                  {s.kind === 'supplement' && <span className="font-medium text-amber-900">Supplemental · </span>}
                  {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.title}</a> : s.title}{s.page ? ` · p. ${s.page}` : ''}
                </li>
              ))}
              {extraDocument && <li className="break-words">{extraDocument}</li>}
            </ul>
          </div>
        )}
        {meta.coverageNote && <p className="text-slate-500"><span className="font-medium">Author's note:</span> {meta.coverageNote}</p>}
      </div>
    </details>
  );
}
