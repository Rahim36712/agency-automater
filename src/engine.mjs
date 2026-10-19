import fs from 'node:fs';
import path from 'node:path';
import { canonicalWebsite,leadId,yes,parseJson,normalizeEmail,validEmail,validateResearch,hasEvidence,scoreLead,enforceRecipient,emailDraft,followupDue,actualSent,messageHeaders,messageText,extractAddress,currentReplyText,optOut,classifyReply,DAY,dailyReport } from './domain.mjs';
import { researchSchema,draftSchema,replySchema } from './gemini.mjs';
import { researchPages } from './research.mjs';
export const TASKS=['intake','research','qualify','drafts','replies','reconcile','followups','report','recover','crm-check','gemini-test','tracking-sync'];
export class Engine {
  constructor({c,store,crm,google,gemini,tracker=null,fetchResearch=researchPages}){Object.assign(this,{c,store,crm,google,gemini,tracker,fetchResearch});}
  event(workflow,lead,action,outcome='success',error='',id){return this.store.event({Workflow:workflow,'Lead ID':lead,Action:action,Outcome:outcome,Error:error,...(id?{'Event ID':id}:{})});}
  async flush(){
    // Suppression is written locally first, then retried to Sheets on every run.
    for(const s of this.store.suppression())await this.crm.upsert('SUPPRESSION',s);
    const synced=new Set(this.store.get('synced-events',[]));for(const e of this.store.events()){if(!synced.has(e['Event ID'])){await this.crm.upsert('ACTIVITY LOG',e);synced.add(e['Event ID']);this.store.set('synced-events',[...synced]);}}
  }
  async suppression(){const sheet=await this.crm.rows('SUPPRESSION');for(const row of sheet){const email=normalizeEmail(row.Email);if(validEmail(email))this.store.suppress(email,row.Reason || 'Manual suppression');}return this.store.suppression();}
  async run(task){
    if(!TASKS.includes(task))throw Error('Unknown task');
    try{
      if(task==='crm-check')return await this.crm.check({tracking:this.c.trackingEnabled});
      if(task==='gemini-test'){
        const content=await this.gemini.generate('email-drafting',{test:true,company:'Owned Test Account',service:'Python automation'},draftSchema);
        return {...content,model:this.store.get('gemini-last-model',this.c.model)};
      }
      await this.suppression();await this.flush();const result=await this[task]();await this.flush();return result;
    }catch(e){this.event(task,'','workflow','error',e.message);try{await this.flush();}catch{/* Local audit survives Google outage. */}throw e;}
  }
  async intake(){
    const rows=await this.crm.rows('LEADS'),seen=new Set();let added=0,duplicates=0;
    for(const row of rows){
      try{
        const website=canonicalWebsite(row.Website),id=leadId(website);
        if(seen.has(id)){duplicates++;await this.crm.updateInput(row,{'Lead Status':'duplicate','Last Error':'Same canonical company website already exists'});this.event('intake',id,'duplicate');continue;}
        seen.add(id);if(row['Lead ID'] && row['Lead ID']!==id)throw Error('Existing Lead ID does not match company website. Do not edit website after outreach.');
        const email=normalizeEmail(row.Email);const suppressed=(await this.suppression()).some(s=>s.Email===email);
        if(!row['Lead ID']){await this.crm.updateInput(row,{'Lead ID':id,Website:website,Email:email,'Lead Status':suppressed?'suppressed':'new','Created Date':new Date().toISOString()});this.event('intake',id,'added');added++;}
        else if(suppressed)await this.crm.upsert('LEADS',{'Lead ID':id,'Lead Status':'suppressed'});
      }catch(e){await this.crm.updateInput(row,{'Lead Status':'manual review','Last Error':e.message});this.event('intake',row['Lead ID'],'invalid lead','error',e.message);}
    }
    return {added,duplicates};
  }
  async import(rows){
    if(!Array.isArray(rows)||rows.length>100)throw Error('Import at most 100 leads at a time');
    const existing=await this.crm.rows('LEADS');const suppressed=await this.suppression();let added=0,duplicates=0;
    for(const row of rows){const website=canonicalWebsite(row.Website),id=leadId(website);if(existing.some(l=>leadId(l.Website)===id)){duplicates++;this.event('intake',id,'duplicate');continue;}
      const email=normalizeEmail(row.Email);if(email && !validEmail(email))throw Error('CSV contains invalid email');
      const record={'Lead ID':id,Website:website,Company:row.Company || '',Country:row.Country || '',Email:email,'Lead Status':suppressed.some(s=>s.Email===email)?'suppressed':'new','Created Date':new Date().toISOString(),
        'Research Allowed':false,'Contact Verified':false,'Outreach Approved':false,'Follow-up Allowed':false,'Score Reviewed':false,'Delivery Confirmed':false};
      await this.crm.upsert('LEADS',record);existing.push(record);added++;this.event('intake',id,'added');
    }await this.flush();return {added,duplicates};
  }
  async research(){
    await this.intake();const rows=(await this.crm.rows('LEADS')).filter(l=>l['Lead Status']==='new'&&yes(l['Research Allowed'])).slice(0,this.c.maxLeads);let researched=0;
    for(const lead of rows){try{
      const pages=await this.fetchResearch(lead.Website);const raw=await this.gemini.generate('company-research',{pages,deliverableServices:this.c.services},researchSchema);
      const result=validateResearch(raw,pages,this.c.services);const inputs=Object.fromEntries(result.scoreEvidence.map(e=>[e.dimension,e]));
      // Every scoring quote must also appear in the verified-observation list.
      const facts=[...result.observations];for(const e of result.scoreEvidence)if(!facts.some(f=>f.quote===e.quote && f.url===e.url))facts.push({quote:e.quote,url:e.url});
      const publicEmails=[...new Set(pages.flatMap(p=>p.publicEmails || []).filter(validEmail))];
      this.store.set('evidence:'+lead['Lead ID'],{website:lead.Website,pages,researchedAt:new Date().toISOString()});
      await this.crm.upsert('LEADS',{'Lead ID':lead['Lead ID'],Company:result.company,Country:result.country,Industry:result.industry,
        Email:lead.Email || (publicEmails.length===1?publicEmails[0]:''),'Business Description':result.description,'Verified Observations':JSON.stringify(facts),'Source URLs':JSON.stringify(pages.map(p=>p.url)),
        'Possible IT Opportunity':'Hypothesis to discuss: '+result.opportunity,'Recommended Service':result.service,Confidence:result.confidence,'Score Inputs':JSON.stringify(inputs),
        'Score Reviewed':false,'Delivery Confirmed':false,'Outreach Approved':false,'Contact Verified':false,'Lead Status':'researched','Researched Date':new Date().toISOString(),'Last Error':''});
      this.event('research',lead['Lead ID'],'researched','success','',`research:${lead['Lead ID']}`);researched++;
    }catch(e){await this.crm.upsert('LEADS',{'Lead ID':lead['Lead ID'],'Last Error':e.message});this.event('research',lead['Lead ID'],'research','error',e.message);}}
    return {researched,attempted:rows.length};
  }
  verified(lead){
    const evidence=this.store.get('evidence:'+lead['Lead ID']);const facts=parseJson(lead['Verified Observations'],[]);
    if(!evidence || evidence.website!==lead.Website || !facts.length)throw Error('Local source evidence missing. Research this lead again.');
    validateResearch({company:'',country:'',industry:'',opportunity:'',service:lead['Recommended Service'],confidence:'low',observations:facts,scoreEvidence:[]},evidence.pages,this.c.services);
    const normalized=s=>String(s).replace(/\s+/g,' ').trim().toLowerCase();
    if(!facts.every(f=>hasEvidence(f,evidence.pages)))throw Error('CRM observations differ from verified source evidence');
    if(!this.c.services.includes(lead['Recommended Service']))throw Error('Recommended service is outside your deliverable services');return evidence;
  }
  async qualify(){let qualified=0;for(const lead of await this.crm.rows('LEADS')){
    if(lead['Lead Status']!=='researched' || !yes(lead['Score Reviewed']))continue;
    try{this.verified(lead);const score=scoreLead(lead);await this.crm.upsert('LEADS',{'Lead ID':lead['Lead ID'],'Lead Score':score.score,Category:score.category,'Score Explanation':score.explanation,'Lead Status':score.category==='A'?'qualified':'additional research','Last Error':''});if(score.category==='A'){qualified++;this.event('qualify',lead['Lead ID'],'qualified','success','',`qualified:${lead['Lead ID']}`);}}
    catch(e){this.event('qualify',lead['Lead ID'],'qualification','error',e.message);await this.crm.upsert('LEADS',{'Lead ID':lead['Lead ID'],'Last Error':e.message});}}
    return {qualified};
  }
  async identity(){const profile=await this.google.profile();if(normalizeEmail(profile.emailAddress)!==this.c.senderEmail)throw Error('Authorized Gmail account differs from SENDER_EMAIL');}
  async syncOperation(op){
    if(!['draft','sent'].includes(op.state))return;
    const sent=op.state==='sent';await this.crm.upsert('OUTREACH',{'Operation ID':op.key,'Lead ID':op.lead,Email:op.email,'Draft ID':op.draftId || '',
      'Gmail Thread ID':op.threadId || '','Sent Message ID':op.sentMessageId || '','Sent Date':op.sentDate || '',Stage:op.stage,
      'Next Follow-up Date':sent && op.stage<2 && op.followupAllowed?new Date(Date.parse(op.sentDate)+(op.stage===0?4:7)*DAY).toISOString():'',
      'Draft Status':sent?'sent':'draft','Follow-up Allowed':op.followupAllowed || false,Reference:op.reference,'Message-ID':op.messageId,'Created Date':op.createdAt});
    if(sent&&op.trackingId&&!op.trackingConfirmed&&this.tracker){
      try{await this.tracker.confirm(op);op.trackingConfirmed=true;this.store.saveOperation(op);}
      catch(e){this.event('tracking-sync',op.lead,'tracking confirmation','error',e.message);}
    }
  }
  async prepare(lead,stage=0,previous=null){
    const evidence=this.verified(lead);if(!yes(lead['Outreach Approved'])||!yes(lead['Contact Verified'])||!yes(lead['Score Reviewed'])||!yes(lead['Delivery Confirmed'])||scoreLead(lead).category!=='A')throw Error('Lead approval, verified contact, delivery and A score required');
    const suppression=await this.suppression();const email=enforceRecipient(lead.Email,this.c,suppression);
    if(this.c.mode==='production' && !evidence.pages.some(p=>(p.publicEmails || []).map(normalizeEmail).includes(email)))throw Error('Production contact email must appear on a collected public company page. Never guess an email.');
    // Cross-company rows cannot create a second initial introduction to the same mailbox.
    if(stage===0 && this.store.operations().some(o=>o.email===email && o.lead!==lead['Lead ID']))throw Error('Recipient already has outreach on another lead');
    if(this.store.operation(`${lead['Lead ID']}:${stage}`))return {skipped:'existing operation'};
    const content=await this.gemini.generate('email-drafting',{company:lead.Company,service:lead['Recommended Service'],stage,verifiedObservation:parseJson(lead['Verified Observations'],[])[0]},draftSchema);
    // Re-read approvals/suppression after the AI call, before creating a draft.
    const fresh=(await this.crm.rows('LEADS')).find(l=>l['Lead ID']===lead['Lead ID']);
    if(!fresh || !yes(fresh['Outreach Approved'])||!yes(fresh['Contact Verified'])||!yes(fresh['Score Reviewed'])||!yes(fresh['Delivery Confirmed'])||scoreLead(fresh).category!=='A'||normalizeEmail(fresh.Email)!==email || fresh['Recommended Service']!==lead['Recommended Service'])throw Error('Contact, scoring, service or approval changed; review again');
    this.verified(fresh);
    enforceRecipient(email,this.c,await this.suppression());
    if(stage>0){
      if(!yes(fresh['Follow-up Allowed']) || this.store.get('reply-stop:'+email,false))throw Error('Follow-up permission revoked or reply received');
      const sentOps=this.store.operations().filter(o=>o.email===email&&o.state==='sent');
      const since=Math.floor(Math.min(...sentOps.map(o=>Date.parse(o.sentDate)))/1000)-60;
      const newReplies=await this.google.listMessages(`from:${email} after:${since} -in:sent -in:drafts`);
      if(newReplies.length){for(const m of newReplies)await this.processReply(await this.google.message(m.id),lead['Lead ID']);throw Error('Reply received while drafting; follow-up cancelled');}
    }
    emailDraft(content,fresh,this.c,{reference:'preview',messageId:'<preview@agency-automation.local>'},previous);
    let tracking=null;if(this.c.trackingEnabled){if(!this.tracker)throw Error('Tracking enabled without a configured tracker');tracking=await this.tracker.register(fresh,stage,previous?.subject||content.subject);}
    // The tracker call may take time; check opt-outs again before the Gmail intent.
    enforceRecipient(email,this.c,await this.suppression());
    if(tracking){
      const latest=(await this.crm.rows('LEADS')).find(l=>l['Lead ID']===fresh['Lead ID']);
      if(!latest||!yes(latest['Outreach Approved'])||!yes(latest['Contact Verified'])||!yes(latest['Score Reviewed'])||!yes(latest['Delivery Confirmed'])||scoreLead(latest).category!=='A'||normalizeEmail(latest.Email)!==email||latest['Recommended Service']!==fresh['Recommended Service']||JSON.stringify(parseJson(latest['Verified Observations']))!==JSON.stringify(parseJson(fresh['Verified Observations'])))throw Error('Lead approval or evidence changed while registering tracking. Review again.');
      this.verified(latest);
      if(stage>0){
        if(!yes(latest['Follow-up Allowed'])||this.store.get('reply-stop:'+email,false))throw Error('Follow-up permission revoked or reply received');
        const since=Math.floor(Math.min(...this.store.operations().filter(o=>o.email===email&&o.state==='sent').map(o=>Date.parse(o.sentDate)))/1000)-60;
        const replies=await this.google.listMessages(`from:${email} after:${since} -in:sent -in:drafts`);if(replies.length){for(const m of replies)await this.processReply(await this.google.message(m.id),lead['Lead ID']);throw Error('Reply received while registering tracking; follow-up cancelled');}
      }
    }
    const op=this.store.beginOperation(lead['Lead ID'],stage,email);op.followupAllowed=yes(fresh['Follow-up Allowed']);
    if(tracking)op.trackingId=tracking.id;
    try{
      const draft=emailDraft(content,fresh,this.c,op,previous,tracking);op.raw=draft.raw;op.subject=previous?.subject || draft.subject;
      op.state='creating';this.store.saveOperation(op); // Durable intent BEFORE Gmail POST. Never automatically retry it.
      const created=await this.google.createDraft(draft.raw,previous?.threadId);if(!created.id || !created.message?.id)throw Error('Incomplete Gmail create response');
      op.draftId=created.id;op.gmailMessageId=created.message.id;op.threadId=created.message.threadId;op.state='draft';delete op.raw;this.store.saveOperation(op);
      await this.syncOperation(op);this.event(stage?'followups':'drafts',op.lead,'draft created','success','',`draft:${op.key}`);return {draft:created.id};
    }catch(e){if(op.state==='creating'){op.state='uncertain';this.store.saveOperation(op);}throw e;}
  }
  async drafts(){await this.identity();await this.recover();let drafted=0;
    // Completed and ambiguous intents must not consume the next batch's slots.
    // Keep uncertain operations blocked while allowing later leads to proceed.
    const pending=(await this.crm.rows('LEADS')).filter(l=>l['Lead Status']==='qualified'&&yes(l['Outreach Approved'])&&!this.store.operation(`${l['Lead ID']}:0`)).slice(0,this.c.maxDrafts);
    for(const lead of pending){
    try{const result=await this.prepare(lead);if(result.draft)drafted++;}catch(e){this.event('drafts',lead['Lead ID'],'draft','error',e.message);await this.crm.upsert('LEADS',{'Lead ID':lead['Lead ID'],'Last Error':e.message});}}
    return {drafted};
  }
  async recover(){
    const ambiguous=this.store.operations().filter(o=>['creating','uncertain'].includes(o.state));let recovered=0;
    if(ambiguous.length){const drafts=await this.google.listDrafts();for(const op of ambiguous){for(const d of drafts){const full=await this.google.draft(d.id);const h=messageHeaders(full.message || {});if(h['message-id']===op.messageId && extractAddress(h.to)===op.email){op.state='draft';op.draftId=d.id;op.gmailMessageId=full.message.id;op.threadId=full.message.threadId;delete op.raw;this.store.saveOperation(op);recovered++;break;}}}}
    for(const op of this.store.operations())await this.syncOperation(op);return {recovered,uncertain:this.store.operations().filter(o=>['creating','uncertain'].includes(o.state)).map(o=>o.key)};
  }
  async reconcile(){await this.identity();let sent=0;for(const op of this.store.operations()){
    if(op.state==='sent'){await this.syncOperation(op);continue;}
    if(!['draft','creating','uncertain'].includes(op.state))continue;
    const query=`in:sent after:${Math.floor(Date.parse(op.createdAt)/1000)-60} {rfc822msgid:${op.messageId.replace(/[<>]/g,'')} "${op.reference}"}`;
    const matches=[];for(const stub of await this.google.listMessages(query)){const message=await this.google.message(stub.id);if(actualSent(message,op,this.c))matches.push(message);}
    if(matches.length>1){this.event('reconcile',op.lead,'multiple sent matches','error','Manual review required');continue;}
    if(matches.length===1){const m=matches[0],h=messageHeaders(m);op.state='sent';op.sentMessageId=m.id;op.threadId=m.threadId;op.sentDate=new Date(Number(m.internalDate)).toISOString();op.sentRfcId=h['message-id'];op.subject=h.subject;delete op.raw;this.store.saveOperation(op);await this.syncOperation(op);this.event('reconcile',op.lead,'sent','success','',`sent:${op.key}`);sent++;}}
    return {sent};
  }
  async processReply(message,leadIdValue){
    const h=messageHeaders(message),email=extractAddress(h.from);if(!validEmail(email)||email===this.c.senderEmail||(message.labelIds||[]).some(l=>['SENT','DRAFT'].includes(l)))return;
    const text=currentReplyText(messageText(message));const cached=this.store.message(message.id);
    if(cached?.done)return;
    let classification=cached?.classification;
    if(!classification){
      classification=classifyReply(text);
      if(optOut(text)){classification='Opt-out';this.store.suppress(email,'Reply requested no further contact');}
      else if(classification==='Uncertain / manual review'){
        try{const ai=await this.gemini.generate('reply-classification',{text:text.slice(0,4000)},replySchema);classification=classifyReply(text,ai);}
        catch(e){this.event('replies',leadIdValue,'reply AI','error',e.message);}
      }
      // Any inbound reply prevents follow-ups immediately, before Sheets sync or AI retries.
      this.store.set('reply-stop:'+email,true);
      this.store.saveMessage(message.id,{classification,email,lead:leadIdValue,done:false});
    }
    if(classification==='Opt-out'){this.store.suppress(email,'Reply requested no further contact');await this.flush();}
    for(const row of await this.crm.rows('OUTREACH'))if(normalizeEmail(row.Email)===email)await this.crm.upsert('OUTREACH',{'Operation ID':row['Operation ID'],'Reply Status':classification,'Follow-up Allowed':false,'Next Follow-up Date':''});
    for(const lead of await this.crm.rows('LEADS'))if(normalizeEmail(lead.Email)===email)await this.crm.upsert('LEADS',{'Lead ID':lead['Lead ID'],'Lead Status':classification==='Opt-out'?'suppressed':'reply received','Follow-up Allowed':false});
    this.event('replies',leadIdValue,classification,'success','',`reply:${message.id}`);this.store.saveMessage(message.id,{classification,email,lead:leadIdValue,done:true});
  }
  async replies(){
    await this.identity();await this.reconcile();const emails=[...new Set(this.store.operations().filter(o=>o.state==='sent').map(o=>o.email))];let scanned=0;
    for(const email of emails){const ops=this.store.operations().filter(o=>o.email===email&&o.state==='sent');
      // A full scan since first actual send catches separate-thread opt-outs and missed laptop downtime.
      const since=Math.floor(Math.min(...ops.map(o=>Date.parse(o.sentDate)))/1000)-60;
      const messages=await this.google.listMessages(`from:${email} after:${since} -in:sent -in:drafts`);
      for(const m of messages){await this.processReply(await this.google.message(m.id),ops[0].lead);scanned++;}
    }return {scanned};
  }
  async followups(){
    // Reconcile and scan replies in the same serialized job, immediately before preparing follow-ups.
    await this.replies();await this.recover();const suppression=await this.suppression();let drafted=0;
    const rows=await this.crm.rows('OUTREACH'),leads=await this.crm.rows('LEADS');
    for(const row of rows){if(drafted>=this.c.maxDrafts)break;if(!followupDue(row))continue;
      const op=this.store.operation(row['Operation ID']);if(!op || op.state!=='sent' || this.store.get('reply-stop:'+op.email,false))continue;
      if(this.store.operations().some(o=>o.lead===op.lead&&o.stage>op.stage))continue;
      const lead=leads.find(l=>l['Lead ID']===op.lead);if(!lead || !yes(lead['Follow-up Allowed']) || normalizeEmail(lead.Email)!==op.email)continue;
      try{enforceRecipient(op.email,this.c,suppression);
        const thread=await this.google.thread(op.threadId);const inbound=(thread.messages||[]).filter(m=>extractAddress(messageHeaders(m).from)!==this.c.senderEmail && !(m.labelIds||[]).includes('DRAFT'));
        if(inbound.length){for(const m of inbound)await this.processReply(m,op.lead);continue;}
        const result=await this.prepare(lead,op.stage+1,{threadId:op.threadId,rfcId:op.sentRfcId,subject:op.subject});if(result.draft)drafted++;
      }catch(e){this.event('followups',op.lead,'follow-up','error',e.message);}
    }return {drafted};
  }
  async report(){
    const leads=await this.crm.rows('LEADS'),outreach=await this.crm.rows('OUTREACH');
    const suppressed=new Set(this.store.suppression().map(s=>s.Email));
    const reportRows=outreach.map(o=>({...o,'Follow-up Allowed':yes(o['Follow-up Allowed']) && !suppressed.has(normalizeEmail(o.Email)) && !this.store.get('reply-stop:'+normalizeEmail(o.Email),false) && !this.store.operations().some(op=>op.lead===o['Lead ID']&&op.stage>Number(o.Stage))}));
    const report=dailyReport(this.store.events(),leads,reportRows,Date.now(),this.c.timezone);
    const directory=path.join(this.c.root,'reports');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,report.Date+'.json'),JSON.stringify(report,null,2));
    await this.crm.upsert('REPORTS',report);return report;
  }
  async ['tracking-sync'](){
    if(!this.c.trackingEnabled||!this.tracker)return {disabled:true};
    for(const op of this.store.operations().filter(o=>o.state==='sent'&&o.trackingId&&!o.trackingConfirmed))await this.syncOperation(op);
    const records=await this.tracker.records(),leads=await this.crm.rows('LEADS');let synced=0;
    for(const r of records){
      const matches=leads.filter(l=>normalizeEmail(l.Email)===r.recipient),lead=r.lead_id?leads.find(l=>l['Lead ID']===r.lead_id):matches.length===1?matches[0]:null;
      await this.crm.upsert('TRACKING',{'Tracking ID':r.id,'Operation ID':r.operation_id||'','Lead ID':lead?.['Lead ID']||'',Company:lead?.Company||r.company||'',Email:r.recipient,Subject:r.subject,Source:r.source,'Send Confirmation':r.confirmation,'Sent Date':r.sent_at||'','Tracking State':r.state,'First Possible Open':r.first_fetch||'','Last Image Request':r.last_fetch||'','Image Requests':r.image_requests,'Last Synced':new Date().toISOString()});synced++;
    }return {synced};
  }
}
