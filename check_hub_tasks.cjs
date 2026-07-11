const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://iffuewpvadmxhjdiuqhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_OmEkl2KgTxzeKaTn-8XN3g_aCOEvqeI';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data, error } = await supabase.from('projects').select('*').eq('id', 'proj-1783768650000').single();
  if (error) {
    console.error('Fetch failed', error);
  } else {
    console.log(JSON.stringify(data.tasks.slice(0, 3), null, 2));
    console.log("Total tasks:", data.tasks.length);
  }
}
check();
