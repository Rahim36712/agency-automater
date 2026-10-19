import { spawn } from 'node:child_process';
import path from 'node:path';
import { config } from '../src/config.mjs';
const c=config();
if (!c.token || c.token.length<32) throw Error('Run npm run setup first.');
const children=[];
const helper=spawn(process.execPath,[path.join(c.root,'src/server.mjs')],{stdio:'inherit',windowsHide:true}); children.push(helper);
const n8n=spawn(process.execPath,[path.join(c.root,'node_modules/n8n/bin/n8n'),'start'],{stdio:'inherit',windowsHide:true,env:{...process.env,
  N8N_LISTEN_ADDRESS:'127.0.0.1',N8N_HOST:'localhost',N8N_PORT:String(c.n8nPort),N8N_PROTOCOL:'http',N8N_SECURE_COOKIE:'false',
  N8N_USER_FOLDER:path.join(c.root,'.data','n8n'),GENERIC_TIMEZONE:c.timezone,TZ:c.timezone,
  N8N_DIAGNOSTICS_ENABLED:'false',N8N_PERSONALIZATION_ENABLED:'false',N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS:'true',
  N8N_BLOCK_ENV_ACCESS_IN_NODE:'true',EXECUTIONS_DATA_SAVE_ON_SUCCESS:'none',EXECUTIONS_DATA_SAVE_ON_ERROR:'all',EXECUTIONS_DATA_PRUNE:'true',EXECUTIONS_DATA_MAX_AGE:'168',
  N8N_UNVERIFIED_PACKAGES_ENABLED:'false',N8N_COMMUNITY_PACKAGES_ENABLED:'false'
}}); children.push(n8n);
let stopping=false;
function stop(code=0) { if(stopping)return;stopping=true;process.exitCode=code;for(const child of children)child.kill('SIGTERM');setTimeout(()=>process.exit(code),1500).unref(); }
for(const child of children){child.on('error',e=>{console.error(e.message);stop(1);});child.on('exit',code=>stop(code||0));}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
console.log(`Open http://localhost:${c.n8nPort}. Keep this terminal open. Ctrl+C stops both processes.`);
