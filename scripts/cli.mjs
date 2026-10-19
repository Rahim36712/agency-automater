import fs from 'node:fs';
import { config } from '../src/config.mjs';
import { parseCSV } from '../src/csv.mjs';
import { TASKS } from '../src/engine.mjs';
import { wait } from '../src/http.mjs';
const c=config(),[command,arg]=process.argv.slice(2);
async function call(route,body){let r;try{r=await fetch(`http://127.0.0.1:${c.port}${route}`,{method:body?'POST':'GET',headers:{'x-agency-token':c.token || '','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});}catch{throw Error('Start npm start first; the helper is unavailable.');}const data=await r.json();if(!r.ok)throw Error(data.error || 'Helper request failed');return data;}
let job;
if(command==='import'){if(!arg)throw Error('Usage: npm run leads:import -- path/to/leads.csv');job=await call('/import',{rows:parseCSV(fs.readFileSync(arg,'utf8'))});}
else {const task=command==='run'?arg:command;if(!TASKS.includes(task))throw Error('Usage: npm run run -- '+TASKS.join('|'));job=await call('/jobs',{task});}
console.log('Queued job '+job.id);
for(;;){await wait(1000);const status=await call('/jobs/'+job.id);if(status.status==='complete'){console.log(JSON.stringify(JSON.parse(status.result),null,2));break;}if(['failed','interrupted'].includes(status.status)){console.error(status.result || 'Job interrupted during restart. Run it again; uncertain draft operations remain blocked.');process.exitCode=1;break;}}
