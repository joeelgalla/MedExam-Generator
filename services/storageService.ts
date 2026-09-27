
import { Project } from '../types';
import { supabase } from '../lib/supabase';
import { mergeProjectCopies } from './projectMerge';
import { cacheProject, cachedProjects, removeCachedProject } from './localProjects';

// --- PROJECT METHODS (Supabase PostgreSQL) ---

// Postgres JSONB rejects NUL (\u0000); strip before save.
const stripNulls = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value).replace(/\\u0000/g, ''));

// Per-project queues serialize network saves so an older response cannot overwrite
// a newer answer. The device copy commits before any network write.
const queues = new Map<string, Promise<Project>>();
const cloudBaselines = new Map<string, Project>();
export const saveProject = async (project: Project): Promise<Project> => {
  const previous=queues.get(project.id) || Promise.resolve(project);
  const next=previous.catch(()=>{}).then(async()=>{
    const updatedProject=stripNulls(project);
    await cacheProject(updatedProject);
    if(project.storageMode==='local') return project;
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.user || project.userId!==session.user.id) throw new Error('Saved on this device; sign in to the project owner account to sync.');
    for(let retry=0;retry<4;retry++) {
      const {data:remote,error:readError}=await supabase.from('projects').select('data,last_modified').eq('id',project.id).maybeSingle();
      if(readError)throw new Error('Saved on this device; could not check the latest cloud copy. Retry sync.');
      const merged=remote?mergeProjectCopies(updatedProject,remote.data,cloudBaselines.get(project.id)):updatedProject;
      const syncedAt=new Date(Math.max(Date.now(),Date.parse(merged.lastModified)+1)).toISOString();
      const saved={...merged,lastModified:syncedAt,cloudSyncedAt:syncedAt,syncPending:false,syncNotice:undefined};
      const row={id:saved.id,user_id:session.user.id,data:saved,last_modified:saved.lastModified};
      if(!remote) {
        const {error}=await supabase.from('projects').insert(row);
        if(error?.code==='23505')continue;
        if(error)throw new Error('Saved on this device, but cloud sync failed. Retry or download a backup.');
      } else {
        // Compare-and-swap in the existing column: concurrent saves cannot drop
        // an attempt between the read and write. No schema migration required.
        const {data,error}=await supabase.from('projects').update(row).eq('id',saved.id).eq('last_modified',remote.last_modified).select('id');
        if(error)throw new Error('Saved on this device, but cloud sync failed. Retry or download a backup.');
        if(!data?.length)continue;
      }
      cloudBaselines.set(saved.id,saved);
      await cacheProject(saved,project.lastModified);return saved;
    }
    throw new Error('Another device is updating this project. Your device copy is saved; retry sync shortly.');
  });
  queues.set(project.id,next);
  try {return await next;} finally {if(queues.get(project.id)===next) queues.delete(project.id);}
};

export const getAllProjects = async (_userId?: string): Promise<Project[]> => {
  try {
    // RLS automatically filters by authenticated user
    const { data, error } = await supabase
      .from('projects')
      .select('data')
      .order('last_modified', { ascending: false });

    if (error) throw error;

    const cached=await cachedProjects(_userId);
    const merged=new Map((data || []).map(row=>[row.data.id,{...row.data,storageMode:'cloud'} as Project]));
    for(const local of cached) {
      const remote=merged.get(local.id);
      if(!remote && !local.cloudSyncedAt){merged.set(local.id,{...local,syncPending:true});continue;}
      try {
        if(!remote)throw new Error('The cloud project was removed.');
        merged.set(local.id,{...mergeProjectCopies(local,remote),syncPending:local.lastModified>remote.lastModified});
      } catch {
        // A conflict in one project must not hide every other cloud project.
        // Preserve an independently recoverable device copy before selecting cloud.
        const recovery:Project={...local,id:`${local.id}-recovery-${Date.parse(local.lastModified)}`,name:`${local.name} — device recovery`,storageMode:'local',userId:'local',allowOnlineAI:false,syncPending:false,syncNotice:undefined};
        try {
          await cacheProject(recovery);
          await removeCachedProject(local);
          if(remote)await cacheProject(remote);
        } catch {
          merged.set(local.id,{...local,syncPending:false,syncNotice:'A sync conflict could not be archived because device storage failed. Download a private backup before editing this project, then reload. Other cloud projects remain available.'});
          continue;
        }
        if(remote)merged.set(local.id,{...remote,syncPending:false,syncNotice:'A conflicting device copy was preserved in On this device as a device recovery project. This is the cloud copy.'});
        else merged.set(recovery.id,{...recovery,syncNotice:'The cloud project was removed. This recovered copy stays on this device.'});
      }
    }
    for(const row of data || [])cloudBaselines.set(row.data.id,row.data);
    return [...merged.values()];
  } catch (error) {
    throw new Error('Could not load cloud projects. Device recovery copies remain available.');
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

export const deleteProject = async (project: Project): Promise<void> => {
  if(project.storageMode==='local') {await removeCachedProject(project);return;}
  const id=project.id;
  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await removeCachedProject(project);
  } catch (error) {
    throw error;
  }
};
