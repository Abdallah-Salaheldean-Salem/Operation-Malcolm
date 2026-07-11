const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://iffuewpvadmxhjdiuqhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_OmEkl2KgTxzeKaTn-8XN3g_aCOEvqeI';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fix() {
  const { data, error } = await supabase.from('projects').select('*').eq('id', 'proj-1783768650000').single();
  
  if (error) {
    console.error('Supabase fetch failed:', error);
    return;
  }
  
  const targetSpace = data;
  
  targetSpace.columns = [
    { id: "col-todo", title: "Not Started", color: "#64748b" },
    { id: "col-progress", title: "In Progress", color: "#3b82f6" },
    { id: "col-blocked", title: "Blocked", color: "#f43f5e" },
    { id: "col-done", title: "Completed", color: "#10b981" }
  ];
  
  const { error: upsertError } = await supabase.from('projects').upsert([targetSpace], { onConflict: 'id' });
  
  if (upsertError) {
    console.error('Supabase upload failed:', upsertError);
  } else {
    console.log('Successfully updated columns in Innovation Hub');
  }
}
fix();
