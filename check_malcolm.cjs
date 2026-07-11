const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://iffuewpvadmxhjdiuqhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_OmEkl2KgTxzeKaTn-8XN3g_aCOEvqeI';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data, error } = await supabase.from('projects').select('*').eq('id', 'proj-1783769592696').single();
  if (error) {
    console.error('Fetch failed', error);
  } else {
    console.log(JSON.stringify(data.columns, null, 2));
    console.log("Total tasks:", data.tasks ? data.tasks.length : 0);
  }
}
check();
