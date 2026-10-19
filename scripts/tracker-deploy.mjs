import fs from 'node:fs';
import path from 'node:path';
import { root,loadEnv } from '../src/config.mjs';
import { hash } from '../tracker/worker.mjs';
loadEnv();const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,name=process.env.TRACKING_WORKER_NAME||'agency-mail-tracker',key=process.env.TRACKING_ADMIN_TOKEN;
if(process.env.CLOUDFLARE_FREE_CONFIRMED!=='true')throw Error('Confirm your Cloudflare account uses Workers Free and D1 Free, then set CLOUDFLARE_FREE_CONFIRMED=true. This script cannot inspect billing.');
if(!/^[a-f0-9]{32}$/.test(account||'')||!token||!/^[a-f0-9]{64}$/.test(key||'')||!/^[a-z][a-z0-9-]{2,50}$/.test(name))throw Error('Complete the Cloudflare account/token and tracker key/name in .env. Run tracking:setup for a private tracker key.');
const base='https://api.cloudflare.com/client/v4/accounts/'+account;
async function cloud(route,{method='GET',body,form}={}){
  let response;try{response=await fetch(base+route,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:form|| (body?JSON.stringify(body):undefined),redirect:'error',signal:AbortSignal.timeout(60000)});}catch{throw Error('Cloudflare network failure. Re-run to inspect/reuse saved resources.');}
  const data=await response.json().catch(()=>null);if(!response.ok||!data?.success)throw Error('Cloudflare setup failed ('+response.status+'). Check account permissions, quotas and dashboard. No automatic paid upgrade is attempted.');return data.result;
}
const privateDir=path.join(root,'.data');fs.mkdirSync(privateDir,{recursive:true});const stateFile=path.join(privateDir,'tracking-deployment.json');let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{};
if(state.account&&state.account!==account)throw Error('Existing tracker deployment belongs to another account. Use a separate project for another account.');
if(state.name&&state.name!==name)throw Error('Existing deployment has a different worker name. Use its name or a separate project.');
const subdomain=await cloud('/workers/subdomain');if(!subdomain?.subdomain)throw Error('Open Workers & Pages in Cloudflare and choose your workers.dev subdomain first.');
const scripts=await cloud('/workers/scripts');if(scripts.some(s=>s.id===name)&&state.name!==name)throw Error('That Worker already exists and was not created by this project. Choose a different TRACKING_WORKER_NAME.');
if(!state.databaseId){const databases=await cloud('/d1/database?name='+encodeURIComponent(name));const same=databases.filter(d=>d.name===name);if(same.length)throw Error('A database with this name already exists outside the saved deployment. Choose a new worker name or recover tracking-deployment.json.');const database=await cloud('/d1/database',{method:'POST',body:{name}});state={account,name,databaseId:database.uuid};fs.writeFileSync(stateFile,JSON.stringify(state,null,2),{mode:0o600});}
for(const sql of fs.readFileSync(path.join(root,'tracker/schema.sql'),'utf8').split(';').map(s=>s.trim()).filter(Boolean))await cloud('/d1/database/'+state.databaseId+'/query',{method:'POST',body:{sql,params:[]}});
const metadata={main_module:'worker.mjs',compatibility_date:'2026-01-01',bindings:[{type:'d1',name:'DB',id:state.databaseId},{type:'secret_text',name:'ADMIN_HASH',text:await hash(key)},{type:'plain_text',name:'RETENTION_DAYS',text:'90'}],observability:{enabled:false}};
const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));for(const file of ['worker.mjs','shared.mjs'])form.set(file,new Blob([fs.readFileSync(path.join(root,'tracker',file),'utf8')],{type:'application/javascript+module'}),file);
await cloud('/workers/scripts/'+name,{method:'PUT',form});await cloud('/workers/scripts/'+name+'/subdomain',{method:'POST',body:{enabled:true,previews_enabled:false}});
await cloud('/workers/scripts/'+name+'/schedules',{method:'PUT',body:[{cron:'17 3 * * *'}]});
const origin='https://'+name+'.'+subdomain.subdomain+'.workers.dev';state.origin=origin;fs.writeFileSync(stateFile,JSON.stringify(state,null,2),{mode:0o600});
let ready=false;for(let attempt=0;attempt<5;attempt++){
  try{const response=await fetch(origin+'/api/messages?limit=1',{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(10000)});const result=await response.json();if(response.ok&&Array.isArray(result.records)){ready=true;break;}}catch{/* DNS and Worker propagation can take a few seconds. */}
  if(attempt<4)await new Promise(resolve=>setTimeout(resolve,2000));
}
if(!ready)throw Error('Resources were saved, but the deployed private API is not responding yet. Check the Worker dashboard/bindings and re-run this command; agency tracking remains disabled.');
const envFile=path.join(root,'.env');let content=fs.readFileSync(envFile,'utf8');content=/^TRACKING_URL=.*$/m.test(content)?content.replace(/^TRACKING_URL=.*$/m,'TRACKING_URL='+origin):content+'\nTRACKING_URL='+origin+'\n';fs.writeFileSync(envFile,content,{mode:0o600});
console.log('Tracker deployed at '+origin+'. Enter that address and your local TRACKING_ADMIN_TOKEN in the extension. Agency tracking remains disabled until TRACKING_ENABLED=true.');
