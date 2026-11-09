import type { ExamQuestion } from '../types';

// Question reports live in their own table, outside the synced project
// document, so marking a question never touches attempts or the bank merge.
// Row-level security limits every account to its own reports.
export type ReportPlace = 'exam' | 'results' | 'progress';

export interface QuestionReport {
  id?: string;
  project_id: string;
  item_id: string;
  exam_id: string | null;
  exam_title: string | null;
  attempt_id: string | null;
  question_id: number | null;
  where_reported: ReportPlace;
  selected_option: string | null;
  comment: string;
  question_snapshot?: { leadIn: string; vignetteStart: string; correctAnswer: string };
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ReportTarget {
  question: ExamQuestion;
  where: ReportPlace;
  selectedOption: string | null;
  attemptId: string | null;
  examId: string | null;
  examTitle: string | null;
}

export interface ReportStore {
  load: (projectId: string) => Promise<QuestionReport[]>;
  save: (row: QuestionReport) => Promise<QuestionReport>;
  remove: (projectId: string, itemId: string) => Promise<void>;
}

export const MAX_REPORT_COMMENT = 2000;

export const reportItemId = (question: ExamQuestion, examId: string | null) =>
  question.metadata.itemId || `${examId || 'exam'}:${question.id}`;

export function buildReportRow(projectId: string, target: ReportTarget, comment: string): QuestionReport {
  const q = target.question;
  return {
    project_id: projectId,
    item_id: reportItemId(q, target.examId),
    exam_id: target.examId,
    exam_title: target.examTitle,
    attempt_id: target.attemptId,
    question_id: Number.isInteger(q.id) ? q.id : null,
    where_reported: target.where,
    selected_option: target.selectedOption || null,
    comment: comment.trim().slice(0, MAX_REPORT_COMMENT),
    // A short copy keeps the report readable after the bank question is revised.
    question_snapshot: { leadIn: q.leadIn || '', vignetteStart: (q.vignette || '').slice(0, 300), correctAnswer: q.correctAnswer || '' },
  };
}
