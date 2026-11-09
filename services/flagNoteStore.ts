import { supabase } from '../lib/supabase';
import type { FlagNote, FlagNoteStore } from './flagNotes';

// Only the signed-in app imports this, so the standalone practice page never loads the database client.
const columns = 'project_id,attempt_id,question_id,item_id,note,updated_at';

export const supabaseFlagNoteStore: FlagNoteStore = {
  async load(projectId) {
    const { data, error } = await supabase.from('flag_notes').select(columns).eq('project_id', projectId);
    if (error) throw new Error(error.message);
    return (data || []) as FlagNote[];
  },
  async save(row) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Sign in to save notes');
    const { data, error } = await supabase.from('flag_notes')
      .upsert({ ...row, user_id: session.user.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id,project_id,attempt_id,question_id' })
      .select(columns).single();
    if (error) throw new Error(error.message);
    return data as FlagNote;
  },
  async remove(projectId, attemptId, questionId) {
    const { error } = await supabase.from('flag_notes').delete().eq('project_id', projectId).eq('attempt_id', attemptId).eq('question_id', questionId);
    if (error) throw new Error(error.message);
  },
};
