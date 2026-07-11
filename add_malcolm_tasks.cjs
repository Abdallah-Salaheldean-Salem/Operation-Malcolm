const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://iffuewpvadmxhjdiuqhc.supabase.co';
const supabaseAnonKey = 'sb_publishable_OmEkl2KgTxzeKaTn-8XN3g_aCOEvqeI';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const newTasks = [
  {
    "id": "TASK-001",
    "title": "Create BAC0 interaction script",
    "status": "col-done",
    "priority": "high",
    "assignee": "Yahya",
    "description": "Developed initial script to read presentValue of AnalogInput using BAC0.",
    "createdAt": new Date().toISOString(),
    "estimatedHours": 0,
    "actualHours": 0
  },
  {
    "id": "TASK-002",
    "title": "Code Review & Comments",
    "status": "col-done",
    "priority": "medium",
    "assignee": "Hamdi / Abdallah",
    "description": "Code versions sent to the team for review and feedback.",
    "createdAt": new Date().toISOString(),
    "estimatedHours": 0,
    "actualHours": 0
  },
  {
    "id": "TASK-003",
    "title": "PID Control Code",
    "status": "col-progress",
    "priority": "high",
    "assignee": "Hamdi",
    "description": "Hamdi parallelly developing the PID control logic.",
    "createdAt": new Date().toISOString(),
    "estimatedHours": 0,
    "actualHours": 0
  },
  {
    "id": "TASK-004",
    "title": "Fix Dependencies Bug",
    "status": "col-done",
    "priority": "critical",
    "assignee": "Yahya",
    "description": "Identified that the asyncio library was missing from the project requirements.",
    "createdAt": new Date().toISOString(),
    "estimatedHours": 0,
    "actualHours": 0
  },
  {
    "id": "TASK-005",
    "title": "Read Multiple Devices",
    "status": "col-done",
    "priority": "high",
    "assignee": "Yahya",
    "description": "Successfully tested and confirmed the ability to read from more than one device.",
    "createdAt": new Date().toISOString(),
    "estimatedHours": 0,
    "actualHours": 0
  },
  {
    "id": "TASK-006",
    "title": "Project Layering (Malcolm)",
    "status": "col-done",
    "priority": "medium",
    "assignee": "Hamdi",
    "description": "Restructured the software architecture by separating functions into layered .py files.",
    "createdAt": new Date().toISOString(),
    "estimatedHours": 0,
    "actualHours": 0
  },
  {
    "id": "TASK-007",
    "title": "Review Software Layering",
    "status": "col-done",
    "priority": "medium",
    "assignee": "Yahya",
    "description": "Tested Hamdi's new file structure and compared it to enterprise frameworks.",
    "createdAt": new Date().toISOString(),
    "estimatedHours": 0,
    "actualHours": 0
  },
  {
    "id": "TASK-008",
    "title": "Research BACnet/sc",
    "status": "col-progress",
    "priority": "medium",
    "assignee": "Yahya",
    "description": "Investigating the bacpypes library and the BACnet/sc protocol via GitHub repositories.",
    "createdAt": new Date().toISOString(),
    "estimatedHours": 0,
    "actualHours": 0
  }
];

async function addTasks() {
  const { data, error } = await supabase.from('projects').select('*').eq('id', 'proj-1783769592696').single();
  if (error) {
    console.error('Fetch failed', error);
    return;
  }
  
  let targetSpace = data;
  
  // ensure targetSpace.tasks exists
  if (!targetSpace.tasks) targetSpace.tasks = [];
  
  targetSpace.tasks = [...targetSpace.tasks, ...newTasks];
  
  const { error: upsertError } = await supabase.from('projects').upsert([targetSpace], { onConflict: 'id' });
  
  if (upsertError) {
    console.error('Supabase upload failed:', upsertError);
  } else {
    console.log(`Successfully added ${newTasks.length} tasks to Operation Malcolm`);
  }
}
addTasks();
