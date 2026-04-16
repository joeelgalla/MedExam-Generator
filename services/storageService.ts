
import { Project } from '../types';
import { supabase } from '../lib/supabase';

// --- PROJECT METHODS (Supabase PostgreSQL) ---

export const saveProject = async (project: Project): Promise<void> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Not authenticated');

    const updatedProject = { ...project, lastModified: new Date().toISOString() };

    const { error } = await supabase.from('projects').upsert({
      id: project.id,
      user_id: session.user.id,
      data: updatedProject,
      last_modified: new Date().toISOString(),
    });

    if (error) throw error;
  } catch (error) {
    console.error(`Failed to save project ${project.id}:`, error);
  }
};

export const getAllProjects = async (_userId?: string): Promise<Project[]> => {
  try {
    // RLS automatically filters by authenticated user
    const { data, error } = await supabase
      .from('projects')
      .select('data')
      .order('last_modified', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => row.data as Project);
  } catch (error) {
    console.error('Failed to load projects:', error);
    return [];
  }
};

export const getProject = async (id: string): Promise<Project | null> => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('data')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data?.data as Project || null;
  } catch (error) {
    console.error(`Failed to load project ${id}:`, error);
    return null;
  }
};

export const deleteProject = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Failed to delete project:', error);
  }
};
