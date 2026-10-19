import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { Engine } from '../src/engine.mjs';
import { root } from '../src/config.mjs';
import { leadId,approvedSubjects,approvedIntroductions,approvedQuestions,DAY } from '../src/domain.mjs';
export const quote='We build websites and seek development partners with a project budget of $5000 and a November deadline.';
export const url='https://agency.example/';
export const content={subject:approvedSubjects[0],introduction:approvedIntroductions[0],question:approvedQuestions[0]};
export const c={root,senderEmail:'founder@owned.example',senderName:'Test Founder',businessName:'Owned Test Business',address:'123 Test Street, Karachi, Pakistan',services:['Python automation'],mode:'test',testRecipients:['inbox@owned.example'],maxLeads:3,maxDrafts:3,timezone:'Asia/Karachi'};
export function goodLead(){return {'Lead ID':leadId('https://agency.example'),Website:'https://agency.example',Company:'Test Agency',Email:'inbox@owned.example','Recommended Service':'Python automation','Verified Observations':JSON.stringify([{quote,url}]),'Score Inputs':JSON.stringify(Object.fromEntries(['relevance','need','decisionMaker','budget','timing'].map(d=>[d,{points:2,quote,url,reason:'Exact public signal'}]))),'Score Reviewed':true,'Delivery Confirmed':true,'Contact Verified':true,'Outreach Approved':true,'Follow-up Allowed':true,'Lead Status':'qualified'};}
export class FakeCRM {
  constructor(leads=[]){this.tabs={LEADS:leads,OUTREACH:[],SUPPRESSION:[],'ACTIVITY LOG':[],REPORTS:[]};this.failTab=null;}
  async rows(tab){if(this.failTab===tab)throw Error('Sheets offline');return structuredClone(this.tabs[tab]||[]);}
  async upsert(tab,r){if(this.failTab===tab)throw Error('Sheets offline');const key={LEADS:'Lead ID',OUTREACH:'Operation ID',SUPPRESSION:'Email','ACTIVITY LOG':'Event ID',REPORTS:'Date'}[tab];const found=this.tabs[tab].find(o=>o[key]===r[key]);if(found)Object.assign(found,structuredClone(r));else this.tabs[tab].push(structuredClone(r));}
  async updateInput(row,r){Object.assign(this.tabs.LEADS.find(l=>l.Website===row.Website),r);}
  async check(){return Object.fromEntries(Object.entries(this.tabs).map(([k,v])=>[k,v.length]));}
}
export function gmailMessage({id='msg1',from=c.senderEmail,to='inbox@owned.example',body='',rfc='<sent@owned.example>',sent=false,date=Date.now(),thread='thread1'}={}){return {id,threadId:thread,internalDate:String(date),labelIds:sent?['SENT']:['INBOX'],payload:{mimeType:'text/plain',headers:[{name:'From',value:from},{name:'To',value:to},{name:'Message-ID',value:rfc},{name:'Subject',value:'Development partnership introduction'}],body:{data:Buffer.from(body).toString('base64url')}}};}
export function harness(t,lead=goodLead()){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agency-test-'));const store=new Store(dir);t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  const crm=new FakeCRM(lead?[lead]:[]);let creates=0;let sentMessages=[],incoming=[],drafts=[];
  const google={profile:async()=>({emailAddress:c.senderEmail}),createDraft:async()=>{creates++;return {id:'draft'+creates,message:{id:'gm'+creates,threadId:'thread1'}};},listDrafts:async()=>drafts,draft:async id=>drafts.find(d=>d.id===id),listMessages:async q=>(q.startsWith('in:sent')?sentMessages:incoming).map(m=>({id:m.id})),message:async id=>[...sentMessages,...incoming].find(m=>m.id===id),thread:async()=>({messages:incoming})};
  const gemini={generate:async name=>name==='company-research'?{company:'Test Agency',country:'',industry:'',opportunity:'Could a partnership be useful?',service:'Python automation',confidence:'medium',observations:[{quote,url}],scoreEvidence:[]}:name==='reply-classification'?{classification:'Interested',reason:'AI guess'}:content};
  const engine=new Engine({c,store,crm,google,gemini,fetchResearch:async()=>[{url,text:'Test Agency '+quote,publicEmails:['inbox@owned.example']}]});
  if(lead)store.set('evidence:'+lead['Lead ID'],{website:lead.Website,pages:[{url,text:quote}]});
  return {engine,store,crm,google,gemini,dir,get creates(){return creates;},set sent(value){sentMessages=value;},set incoming(value){incoming=value;},set drafts(value){drafts=value;}};
}
