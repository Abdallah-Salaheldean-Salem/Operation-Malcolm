import { supabase, isSupabaseConfigured } from './supabase';
import { Project } from '../types';

// Only the fields that belong to the Project type — created_at/updated_at
// stay in the database and never round-trip through app state.
const PROJECT_COLUMNS = 'id,name,description,columns,tasks,tags,ideas,teams,members,color,icon,archived';

export async function fetchProjects(): Promise<Project[] | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('Supabase fetch failed. See supabase-schema.sql', error);
    return null;
  }

  return data as unknown as Project[];
}

export async function saveProjectsBulk(projects: Project[]): Promise<boolean> {
  if (!isSupabaseConfigured || projects.length === 0) return false;

  const { error } = await supabase
    .from('projects')
    .upsert(projects, { onConflict: 'id' });

  if (error) {
    console.warn('Supabase bulk save failed. See supabase-schema.sql', error);
    return false;
  }

  return true;
}

export async function deleteProjectRemote(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;

  const { error } = await supabase.from('projects').delete().eq('id', id);

  if (error) {
    console.warn('Supabase delete failed. See supabase-schema.sql', error);
    return false;
  }

  return true;
}

// Small shared-state key/value store (e.g. the Daily Logs feed).
// ok=false means the request failed; value=null with ok=true means the key
// has never been written, so the caller should seed it.
export async function fetchAppState(
  key: string
): Promise<{ ok: boolean; value: unknown | null }> {
  if (!isSupabaseConfigured) return { ok: false, value: null };

  const { data, error } = await supabase
    .from('app_state')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.warn(`Supabase app_state fetch failed for "${key}"`, error);
    return { ok: false, value: null };
  }

  return { ok: true, value: data ? data.value : null };
}

export async function saveAppState(key: string, value: unknown): Promise<boolean> {
  if (!isSupabaseConfigured) return false;

  const { error } = await supabase
    .from('app_state')
    .upsert({ key, value }, { onConflict: 'key' });

  if (error) {
    console.warn(`Supabase app_state save failed for "${key}"`, error);
    return false;
  }

  return true;
}

// JSON.stringify with object keys sorted, so content comparisons are stable
// regardless of key order (Postgres jsonb normalizes key order on storage).
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v)
        .sort()
        .reduce((acc: Record<string, unknown>, key) => {
          acc[key] = (v as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return v;
  });
}
