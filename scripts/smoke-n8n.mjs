import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { config } from '../src/config.mjs';
const c=config();let polls=0,authorized=0;
fs.mkdirSync(path.join(c.root,'scratch'),{recursive:true});
// A mock local helper verifies the full native queue/wait/HTTP/Code/If loop, without Google calls.
const server=http.createServer((req,res)=>{
  if(req.headers['x-agency-token']!==c.token){res.writeHead(401);res.end('{}');return;}authorized++;
  const value=req.method==='POST'?{id:'mock_job',status:'queued'}:{id:'mock_job',status:++polls===1?'running':'complete',result:'{"offlineMock":true}'};
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));
});
server.on('error',e=>{console.error('Stop npm start/helper before this smoke test: '+e.message);process.exitCode=1;});
server.listen(8787,'127.0.0.1',()=>{
  const child=spawn(process.execPath,[path.join(c.root,'node_modules/n8n/bin/n8n'),'execute','--id=agency_report'],{windowsHide:true,env:{...process.env,N8N_USER_FOLDER:path.join(c.dataDir,'n8n'),N8N_DIAGNOSTICS_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});
  const timer=setTimeout(()=>child.kill('SIGTERM'),60000);
  child.on('exit',code=>{clearTimeout(timer);server.close();fs.writeFileSync(path.join(c.root,'scratch/n8n-poll-smoke.log'),output);
    if(code===0&&polls===2&&authorized===3&&output.includes('Execution was successful'))console.log('PASS: real n8n queue, HTTP Header Auth, Wait, Code, If and repeat polling against a mock local helper. No Google API calls.');
    else{console.error(`FAIL: code=${code}, polls=${polls}, authenticated requests=${authorized}. See scratch/n8n-poll-smoke.log`);process.exitCode=1;}});
});
