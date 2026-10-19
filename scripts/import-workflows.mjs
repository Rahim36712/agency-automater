import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { config } from '../src/config.mjs';
const c=config();
async function listening(port){return new Promise((resolve,reject)=>{const socket=net.createConnection({host:'127.0.0.1',port});socket.setTimeout(2000);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',error=>{socket.destroy();if(error.code==='ECONNREFUSED')resolve(false);else reject(Error('Cannot verify local service status; stop services before importing.'));});socket.once('timeout',()=>{socket.destroy();reject(Error('Local service status timed out; stop services before importing.'));});});}
if((await listening(c.port))||(await listening(c.n8nPort)))throw Error('Stop npm start before CLI workflow import. Then restart it.');
if(!c.token || c.token.length<32)throw Error('Run npm run setup first.');
const env={...process.env,N8N_USER_FOLDER:path.join(c.dataDir,'n8n'),N8N_DIAGNOSTICS_ENABLED:'false'};
const run=args=>{const r=spawnSync(process.execPath,[path.join(c.root,'node_modules/n8n/bin/n8n'),...args],{stdio:'inherit',windowsHide:true,env});if(r.status || r.error)throw Error('n8n CLI import failed');};
const credentialFile=path.join(c.dataDir,'helper-credential-import.json');
try{
  fs.writeFileSync(credentialFile,JSON.stringify([{id:'agency_helper',name:'Agency Helper',type:'httpHeaderAuth',data:{name:'x-agency-token',value:c.token}}]),{mode:0o600});
  run(['import:credentials','--input='+credentialFile]);
}finally{if(fs.existsSync(credentialFile))fs.unlinkSync(credentialFile);}
const runtimeDir=path.join(c.dataDir,'workflow-import');fs.mkdirSync(runtimeDir,{recursive:true});
for(const file of fs.readdirSync(path.join(c.root,'workflows'))){const w=JSON.parse(fs.readFileSync(path.join(c.root,'workflows',file),'utf8'));for(const n of w.nodes){if(n.credentials?.httpHeaderAuth)n.credentials.httpHeaderAuth={id:'agency_helper',name:'Agency Helper'};}fs.writeFileSync(path.join(runtimeDir,file),JSON.stringify(w));}
run(['import:workflow','--separate','--input='+runtimeDir]);
console.log('Local helper credential connected. All imported workflows are inactive. Google/Gemini authorization remains separate.');
