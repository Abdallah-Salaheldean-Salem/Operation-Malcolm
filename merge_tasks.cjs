const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://iffuewpvadmxhjdiuqhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_OmEkl2KgTxzeKaTn-8XN3g_aCOEvqeI';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function merge() {
  const projectDataStr = fs.readFileSync('parsed_project.json', 'utf8');
  const projectData = JSON.parse(projectDataStr);
  const newTasks = projectData.tasks;
  
  // Fetch the "Innovation Hub" space
  const { data, error } = await supabase.from('projects').select('*').eq('id', 'proj-1783768650000').single();
  
  if (error) {
    console.error('Supabase fetch failed:', error);
    return;
  }
  
  const targetSpace = data;
  
  // Merge tasks, avoiding duplicates by ID
  const existingTaskIds = new Set(targetSpace.tasks.map(t => t.id));
  const tasksToAdd = newTasks.filter(t => !existingTaskIds.has(t.id));
  
  targetSpace.tasks = [...targetSpace.tasks, ...tasksToAdd];
  
  // Also merge any missing columns if needed, though they probably exist.
  // The default columns are To Do, In Progress, Blocked, Completed
  
  const { error: upsertError } = await supabase.from('projects').upsert([targetSpace], { onConflict: 'id' });
  
  if (upsertError) {
    console.error('Supabase upload failed:', upsertError);
  } else {
    console.log(`Successfully added ${tasksToAdd.length} tasks to Innovation Hub`);
  }

  // Delete the sub-space "proj-innovation-hub-sync" as it's no longer needed
  await supabase.from('projects').delete().eq('id', 'proj-innovation-hub-sync');
  console.log('Deleted the temp subspace');
}
merge();
