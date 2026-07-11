const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://iffuewpvadmxhjdiuqhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_OmEkl2KgTxzeKaTn-8XN3g_aCOEvqeI';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fix() {
  const { data, error } = await supabase.from('projects').select('*').eq('id', 'proj-1783768650000').single();
  if (error) return console.error(error);
  
  let targetSpace = data;
  let modified = false;
  targetSpace.tasks = targetSpace.tasks.map(t => {
    if (t.notes && typeof t.notes === 'string') {
      const match = t.notes.match(/^\[At \d{2}:\d{2} [AP]M\] (.*)/s);
      if (match) {
        t.description = match[1].trim();
        modified = true;
      } else {
        if (!t.description && t.notes) {
          t.description = t.notes;
          modified = true;
        }
      }
    }
    return t;
  });
  
  if (modified) {
    const { error: upsertError } = await supabase.from('projects').upsert([targetSpace], { onConflict: 'id' });
    if (upsertError) console.error(upsertError);
    else console.log('Successfully updated notes -> description in Innovation Hub tasks');
  } else {
    console.log('No modifications needed');
  }
}
fix();
