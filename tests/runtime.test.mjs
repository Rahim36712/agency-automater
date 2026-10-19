import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const project=new URL('../',import.meta.url);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agency-runtime-')),children=[],port=await freePort(),n8nPort=await freePort();
  for(const dir of ['src','tracker','scripts'])fs.mkdirSync(path.join(root,dir),{recursive:true});
  for(const file of fs.readdirSync(new URL('src/',project)))if(file.endsWith('.mjs'))fs.copyFileSync(new URL('src/'+file,project),path.join(root,'src',file));
  fs.copyFileSync(new URL('tracker/shared.mjs',project),path.join(root,'tracker/shared.mjs'));
  fs.copyFileSync(new URL('scripts/start.mjs',project),path.join(root,'scripts/start.mjs'));
  const token='owned-runtime-test-token-'.repeat(3),env={...process.env,HELPER_PORT:String(port),N8N_PORT:String(n8nPort),HELPER_TOKEN:token,OUTREACH_MODE:'test',TRACKING_ENABLED:'false'};
  function launch(file){const child=spawn(process.execPath,[path.join(root,file)],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});const closed=new Promise(resolve=>child.once('close',code=>resolve(code)));children.push({child,closed});return {child,closed,output:()=>output};}
  t.after(async()=>{for(const entry of children)if(entry.child.exitCode===null&&entry.child.signalCode===null)entry.child.kill('SIGTERM');await Promise.all(children.map(entry=>entry.closed));assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});});
  async function ready(server){for(let attempt=0;attempt<100;attempt++){try{const response=await fetch('http://127.0.0.1:'+port+'/health');if(response.ok)return;}catch{}if(server.child.exitCode!==null)throw Error(server.output());await wait(30);}throw Error('Isolated helper did not start: '+server.output());}
  return {root,port,token,launch,ready};
}

test('helper starts with a stale lock pointing to a live unrelated process and rejects unauthorized requests',{timeout:15000},async t=>{
  const h=await fixture(t);fs.mkdirSync(path.join(h.root,'.data'));fs.writeFileSync(path.join(h.root,'.data/helper.lock'),String(process.pid));const server=h.launch('src/server.mjs');await h.ready(server);
  assert.equal(fs.readFileSync(path.join(h.root,'.data/helper.lock'),'utf8'),String(server.child.pid));
  const origin='http://127.0.0.1:'+h.port;
  assert.equal((await fetch(origin+'/jobs',{method:'POST',body:JSON.stringify({task:'drafts'})})).status,401);
  assert.equal((await fetch(origin+'/health',{headers:{Origin:'https://outside.example'}})).status,403);
  assert.equal((await fetch(origin+'/jobs',{method:'POST',headers:{'x-agency-token':h.token},body:JSON.stringify({task:'send'})})).status,400);
});

test('a second helper fails before resetting another helper\'s running jobs',{timeout:15000},async t=>{
  const h=await fixture(t),first=h.launch('src/server.mjs');await h.ready(first);
  const db=new DatabaseSync(path.join(h.root,'.data/journal.sqlite'));db.prepare('INSERT INTO jobs VALUES(?,?,?,NULL,?)').run('owned-marker','report','running',new Date().toISOString());
  try{const second=h.launch('src/server.mjs');assert.equal(await second.closed,1);assert.match(second.output(),/EADDRINUSE/);assert.equal(db.prepare('SELECT status FROM jobs WHERE id=?').get('owned-marker').status,'running');assert.equal(fs.readFileSync(path.join(h.root,'.data/helper.lock'),'utf8'),String(first.child.pid));}finally{db.close();}
});

test('combined launcher returns failure when its helper cannot bind the port',{timeout:15000},async t=>{
  const h=await fixture(t),first=h.launch('src/server.mjs');await h.ready(first);
  const bin=path.join(h.root,'node_modules/n8n/bin');fs.mkdirSync(bin,{recursive:true});fs.writeFileSync(path.join(bin,'n8n'),'setInterval(()=>{},1000);');
  const launcher=h.launch('scripts/start.mjs');assert.equal(await launcher.closed,1);assert.match(launcher.output(),/EADDRINUSE/);
  assert.equal((await fetch('http://127.0.0.1:'+h.port+'/health')).status,200);
});
