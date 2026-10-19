import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { root } from '../src/config.mjs';
const dir=path.join(root,'workflows');fs.mkdirSync(dir,{recursive:true});
const credential={httpHeaderAuth:{id:'REPLACE_WITH_YOUR_HELPER_CREDENTIAL_ID',name:'Agency Helper'}};
const node=(name,type,version,parameters,position,extra={})=>({id:crypto.createHash('sha256').update(name).digest('hex').slice(0,16),name,type:'n8n-nodes-base.'+type,typeVersion:version,parameters,position,...extra});
const http=(name,method,url,body,pos)=>node(name,'httpRequest',4.2,{method,url,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',...(body?{sendBody:true,specifyBody:'json',jsonBody:body}:{}),options:{timeout:15000}},pos,{credentials:credential});
const schedules={intake:'*/30 * * * *',research:'0 9 * * *',qualify:'15 10 * * *',drafts:'0 11 * * *',replies:'*/30 * * * *',reconcile:'*/30 * * * *',followups:'0 12 * * *',report:'0 18 * * *','tracking-sync':'*/30 * * * *'};
const labels={intake:'00 Lead intake',research:'A Lead research',qualify:'B Lead qualification',drafts:'C Gmail drafts for review',replies:'D Reply detection and suppression',followups:'E Follow-up drafts',report:'F Daily business report',reconcile:'Sent Mail reconciliation','tracking-sync':'Optional tracking CRM sync'};
const workflows=[];
for(const task of Object.keys(labels)){
  const name='Agency - '+labels[task];const nodes=[node('Run manually','manualTrigger',1,{},[0,0]),node('Schedule','scheduleTrigger',1.2,{rule:{interval:[{field:'cronExpression',expression:schedules[task]}]}},[0,160]),
    http('Queue local job','POST','http://127.0.0.1:8787/jobs',JSON.stringify({task}),[250,0]),node('Wait before polling','wait',1.1,{resume:'timeInterval',amount:5,unit:'seconds'},[480,0]),
    http('Read job status','GET','=http://127.0.0.1:8787/jobs/{{ $json.id }}',null,[710,0]),
    node('Reject failed job','code',2,{jsCode:"const job = $input.first().json; if (['failed','interrupted'].includes(job.status)) throw new Error(job.result || 'Local job interrupted'); return [{json:job}];"},[940,0]),
    node('Job complete','if',2.2,{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:'finished',leftValue:'={{ $json.status }}',rightValue:'complete',operator:{type:'string',operation:'equals'}}],combinator:'and'},options:{}},[1180,0]),
    node('Setup note','stickyNote',1,{content:'Connect the Agency Helper HTTP Header Auth credential to BOTH HTTP nodes. Header name: x-agency-token. Value: HELPER_TOKEN from local .env. Run manually first. All workflows import inactive. Long jobs are queued durably and polled. Google/Gemini credentials are managed by the local helper. No email sending exists.',height:260,width:440},[220,250])];
  const connections={'Run manually':{main:[[{node:'Queue local job',type:'main',index:0}]]},Schedule:{main:[[{node:'Queue local job',type:'main',index:0}]]},'Queue local job':{main:[[{node:'Wait before polling',type:'main',index:0}]]},'Wait before polling':{main:[[{node:'Read job status',type:'main',index:0}]]},'Read job status':{main:[[{node:'Reject failed job',type:'main',index:0}]]},'Reject failed job':{main:[[{node:'Job complete',type:'main',index:0}]]},'Job complete':{main:[[],[{node:'Wait before polling',type:'main',index:0}]]}};
  workflows.push({id:'agency_'+task,name,nodes,connections,active:false,settings:{executionOrder:'v1',timezone:'Asia/Karachi',errorWorkflow:'agency_errors',executionTimeout:3600},pinData:{},versionId:crypto.randomUUID()});
}
workflows.push({id:'agency_errors',name:'Agency - G Error monitoring',active:false,nodes:[node('Workflow error','errorTrigger',1,{},[0,0]),http('Log local error','POST','http://127.0.0.1:8787/errors','{}',[260,0])],connections:{'Workflow error':{main:[[{node:'Log local error',type:'main',index:0}]]}},settings:{executionOrder:'v1',timezone:'Asia/Karachi'},pinData:{},versionId:crypto.randomUUID()});
workflows.push({id:'agency_smoke',name:'Agency - Local connection test',active:false,nodes:[node('Run manually','manualTrigger',1,{},[0,0]),node('Helper health','httpRequest',4.2,{url:'http://127.0.0.1:8787/health',options:{timeout:10000}},[250,0])],connections:{'Run manually':{main:[[{node:'Helper health',type:'main',index:0}]]}},settings:{executionOrder:'v1'},pinData:{},versionId:crypto.randomUUID()});
for(const w of workflows){const file=path.join(dir,w.id+'.json');if(fs.existsSync(file)){const old=JSON.parse(fs.readFileSync(file,'utf8'));if(JSON.stringify({...old,versionId:null})===JSON.stringify({...w,versionId:null}))w.versionId=old.versionId;}fs.writeFileSync(file,JSON.stringify(w,null,2)+'\n');}console.log(`Built ${workflows.length} inactive workflows.`);
