import { supabase } from './supabase';
import { Project } from '../types';

export async function fetchProjects(): Promise<Project[] | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching from Supabase:', error);
    return null;
  }

  return data as Project[];
}

export async function saveProject(project: Project): Promise<boolean> {
  const { error } = await supabase
    .from('projects')
    .upsert(project, { onConflict: 'id' });

  if (error) {
    console.error('Error saving to Supabase:', error);
    return false;
  }

  return true;
}

export async function deleteProjectRemote(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting from Supabase:', error);
    return false;
  }

  return true;
}
