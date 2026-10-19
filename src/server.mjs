import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.mjs';
import { Store } from './store.mjs';
import { Google } from './google.mjs';
import { CRM } from './crm.mjs';
import { Gemini } from './gemini.mjs';
import { Engine,TASKS } from './engine.mjs';
import { Tracker } from './tracking.mjs';
const c=config();if(!c.token || c.token.length<32)throw Error('Run npm run setup first.');fs.mkdirSync(c.dataDir,{recursive:true});
const lockPath=path.join(c.dataDir,'helper.lock');
// The listening socket is the single-writer lock. Windows can reuse a stale
// lock file's PID for an unrelated process, so a PID alone is not ownership.
let store,gemini;const google=new Google(c);
let engine;function getEngine(){return engine ||= new Engine({c,store,google,gemini,crm:new CRM(google,c.sheetId),tracker:c.trackingEnabled?new Tracker(c):null});}
let working=false;
async function drain(){if(working)return;working=true;try{let job;while((job=store.nextJob())){store.finishJob(job.id,'running',null);try{const result=job.task==='import'?await getEngine().import(store.get('import:'+job.id)):await getEngine().run(job.task);store.finishJob(job.id,'complete',result);}catch(e){if(!engine || job.task==='import')store.event({'Event ID':'job:'+job.id,Workflow:job.task,'Lead ID':'',Action:'workflow',Outcome:'error',Error:e.message});store.finishJob(job.id,'failed',{error:e.message});console.error(`[${job.task}] ${e.message}`);}}}finally{working=false;}}
function response(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{
  const host=req.headers.host;if(![`127.0.0.1:${c.port}`,`localhost:${c.port}`].includes(host) || req.headers.origin)return response(res,403,{error:'Local authenticated clients only'});
  if(req.url==='/health' && req.method==='GET')return response(res,200,{ok:true,working,mode:c.mode});
  const supplied=Buffer.from(String(req.headers['x-agency-token'] || '')),expected=Buffer.from(c.token);
  if(supplied.length!==expected.length || !crypto.timingSafeEqual(supplied,expected))return response(res,401,{error:'Missing or invalid helper credential'});
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method==='GET' && url.pathname.startsWith('/jobs/')){const job=store.jobStatus(url.pathname.slice(6));return response(res,job?200:404,job || {error:'Job not found'});}
    if(req.method!=='POST')return response(res,404,{error:'Endpoint not found'});
    let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>200000)return response(res,413,{error:'Request too large'});body+=chunk;}const data=JSON.parse(body || '{}');
    if(url.pathname==='/errors'){store.event({Workflow:'n8n','Lead ID':'',Action:'workflow failure',Outcome:'error',Error:'n8n execution failed; inspect the local n8n execution log'});return response(res,200,{logged:true});}
    if(url.pathname==='/jobs' && TASKS.includes(data.task)){
      const prior=store.db.prepare("SELECT id FROM jobs WHERE task=? AND status IN ('queued','running') LIMIT 1").get(data.task);
      const id=prior?.id || store.job(data.task);response(res,202,{id,status:prior?'already queued':'queued'});void drain();return;
    }
    if(url.pathname==='/import'){const id=store.job('import');store.set('import:'+id,data.rows);response(res,202,{id,status:'queued'});void drain();return;}
    return response(res,400,{error:'Invalid task'});
  }catch(e){return response(res,400,{error:e.message});}
});
server.listen(c.port,'127.0.0.1',()=>{
  try{store=new Store(c.dataDir);gemini=new Gemini(c,store);fs.writeFileSync(lockPath,String(process.pid),{mode:0o600});}
  catch(e){console.error(e.message);server.close();cleanup();process.exitCode=1;return;}
  console.log(`Agency helper: http://127.0.0.1:${c.port} (${c.mode} mode). No sending endpoint exists.`);void drain();
});
server.on('error',e=>{console.error(e.message);cleanup();process.exit(1);});
function cleanup(){store?.close();if(fs.existsSync(lockPath)&&fs.readFileSync(lockPath,'utf8')===String(process.pid))fs.unlinkSync(lockPath);}
let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(stopping)return;stopping=true;server.close();if(!working){cleanup();process.exit(0);}else{const timer=setInterval(()=>{if(!working){clearInterval(timer);cleanup();process.exit(0);}},200);}});
