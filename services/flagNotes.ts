// A private "why I flagged this" note per flagged question, stored in its own
// table so it never enters the synced project document.
export interface FlagNote {
  project_id: string;
  attempt_id: string;
  question_id: number;
  item_id: string | null;
  note: string;
  updated_at?: string;
}

export interface FlagNoteStore {
  load: (projectId: string) => Promise<FlagNote[]>;
  save: (row: FlagNote) => Promise<FlagNote>;
  remove: (projectId: string, attemptId: string, questionId: number) => Promise<void>;
}

export const MAX_FLAG_NOTE = 1000;
export const flagNoteKey = (attemptId: string, questionId: number) => `${attemptId}:${questionId}`;
export const cleanFlagNote = (text: string) => text.trim().slice(0, MAX_FLAG_NOTE);
