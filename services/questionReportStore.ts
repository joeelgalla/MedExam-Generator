import { supabase } from '../lib/supabase';
import type { QuestionReport, ReportStore } from './questionReports';

// Only the signed-in app imports this, so the standalone practice page never loads the database client.
const columns = 'id,project_id,item_id,exam_id,exam_title,attempt_id,question_id,where_reported,selected_option,comment,status,created_at,updated_at';

export const supabaseReportStore: ReportStore = {
  async load(projectId) {
    const { data, error } = await supabase.from('question_reports').select(columns).eq('project_id', projectId).eq('status', 'open');
    if (error) throw new Error(error.message);
    return (data || []) as QuestionReport[];
  },
  async save(row) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Sign in to mark questions for review');
    const { data, error } = await supabase.from('question_reports')
      .upsert({ ...row, user_id: session.user.id, status: 'open', updated_at: new Date().toISOString() }, { onConflict: 'user_id,project_id,item_id' })
      .select(columns).single();
    if (error) throw new Error(error.message);
    return data as QuestionReport;
  },
  async remove(projectId, itemId) {
    const { error } = await supabase.from('question_reports').delete().eq('project_id', projectId).eq('item_id', itemId);
    if (error) throw new Error(error.message);
  },
};
