const fs = require('fs');

let content = fs.readFileSync('src/data.ts', 'utf8');
const projectDataStr = fs.readFileSync('parsed_project.json', 'utf8');
const projectData = JSON.parse(projectDataStr);

const tasksIndex = content.indexOf('    tasks: [\n');
if (tasksIndex !== -1) {
  const insertIndex = tasksIndex + '    tasks: [\n'.length;
  const newTasksStr = projectData.tasks.map(t => JSON.stringify(t, null, 6).replace(/\n/g, '\n      ')).join(',\n      ') + ',\n      ';
  
  content = content.substring(0, insertIndex) + newTasksStr + content.substring(insertIndex);
  
  // also remove the old sync project from src/data.ts
  const syncBlockRegex = /,\s*{\s*"id": "proj-innovation-hub-sync"[\s\S]*?\n  }\n\];/;
  content = content.replace(syncBlockRegex, '\n];');
  
  fs.writeFileSync('src/data.ts', content);
  console.log('Fixed src/data.ts');
} else {
  console.log('Could not find tasks array to modify');
}

