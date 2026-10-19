import crypto from 'node:crypto';
import fs from 'node:fs';
import { root } from './config.mjs';
import path from 'node:path';
import { endpoint } from '../tracker/shared.mjs';
export const yes = v => v === true || String(v).trim().toLowerCase() === 'true';
export const normalizeEmail = value => String(value || '').trim().toLowerCase();
export function validEmail(value) { return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(value || '') && String(value).length <= 254 && !/[\r\n]/.test(value); }
export function canonicalWebsite(value) {
  const u = new URL(/^https?:\/\//i.test(String(value)) ? value : 'https://'+value);
  if (!['https:','http:'].includes(u.protocol) || u.username || u.password || (u.port && !['80','443'].includes(u.port))) throw Error('Invalid public website');
  const host=u.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');
  if (!host.includes('.') || /[\[\]:]/.test(host)) throw Error('Use a public company domain');
  return 'https://'+host;
}
export function leadId(website) { return 'lead_'+crypto.createHash('sha256').update(canonicalWebsite(website)).digest('hex').slice(0,24); }
export function deduplicate(leads) { const seen=new Set();return leads.filter(l=>{const id=leadId(l.Website);if(seen.has(id))return false;seen.add(id);return true;}); }
export function parseJson(value, fallback=null) { if(typeof value === 'object' && value!==null)return value;try{return JSON.parse(value);}catch{return fallback;} }
export const cleanText = s => String(s || '').replace(/\s+/g,' ').trim();
export function hasEvidence(fact, pages) { return !!fact && typeof fact.quote==='string' && cleanText(fact.quote).length>=12 && pages.some(p=>p.url===fact.url && cleanText(p.text).toLowerCase().includes(cleanText(fact.quote).toLowerCase())); }
export function validateResearch(data, pages, services) {
  if(!data || typeof data!=='object' || !Array.isArray(data.observations) || !Array.isArray(data.scoreEvidence)) throw Error('Invalid research JSON');
  if(!['low','medium','high'].includes(data.confidence) || typeof data.opportunity!=='string' || data.opportunity.length>1500)throw Error('Invalid research values');
  const facts=data.observations.filter(f=>hasEvidence(f,pages)).slice(0,5).map(f=>({quote:cleanText(f.quote),url:f.url}));
  if(!facts.length)throw Error('Missing verified source evidence');
  const verified=s=>typeof s==='string' && s.length>1 && pages.some(p=>cleanText(p.text).toLowerCase().includes(cleanText(s).toLowerCase())) ? cleanText(s) : '';
  const service=services.includes(data.service)?data.service:'';
  return {company:verified(data.company),country:verified(data.country),industry:verified(data.industry),observations:facts,
    description:facts.map(f=>f.quote).join(' '),opportunity:data.opportunity,service,confidence:data.confidence,
    scoreEvidence:data.scoreEvidence.filter(s=>['relevance','need','decisionMaker','budget','timing'].includes(s.dimension) && [0,1,2].includes(s.points) && hasEvidence(s,pages)).map(s=>({...s,reason:cleanText(s.reason).slice(0,300)}))};
}
export function scoreLead(lead, rules=JSON.parse(fs.readFileSync(path.join(root,'templates/scoring-rules.json'),'utf8'))) {
  const observations=parseJson(lead['Verified Observations'],[]);
  const inputs=parseJson(lead['Score Inputs'],{});
  const dimensions={}; const reasons=[];
  for(const key of ['relevance','need','decisionMaker','budget','timing']) {
    const e=inputs[key];
    const supported=e && typeof e.quote==='string' && observations.some(o=>o.url===e.url && cleanText(o.quote).includes(cleanText(e.quote)) && cleanText(e.quote).length>=12);
    dimensions[key]=supported && Number.isInteger(e.points) && e.points>=0 && e.points<=2 ? e.points : 0;
    reasons.push(`${key}: ${dimensions[key]} (${supported ? cleanText(e.reason) : 'no verified evidence'})`);
  }
  dimensions.delivery=yes(lead['Delivery Confirmed']) && lead['Recommended Service'] ? 2 : 0;
  reasons.push(`delivery: ${dimensions.delivery} (founder confirmation)`);
  const score=Object.values(dimensions).reduce((a,b)=>a+b,0);
  return {score,category:score>=rules.A ? 'A' : score>=rules.B ? 'B' : 'C',dimensions,explanation:reasons.join('; ')};
}
export function suppressionKey(email) { return normalizeEmail(email); }
export function enforceRecipient(email,c,suppression=[]) {
  email=normalizeEmail(email);
  if(!validEmail(email))throw Error('Invalid email address');
  if(suppression.some(s=>normalizeEmail(s.Email || s.email)===email))throw Error('Contact is suppressed');
  if(c.mode==='test' && !c.testRecipients.includes(email))throw Error('Test mode: recipient is not an account you control');
  return email;
}
export function currentReplyText(body) {
  return String(body || '').split(/\n(?:On .+wrote:|From:|[-_]{3,}\s*(?:Original|Forwarded) message)/i)[0].split('\n').filter(l=>!/^\s*>/.test(l)).join('\n').trim();
}
export function optOut(body) {
  const text=currentReplyText(body).toLowerCase();
  if(/\b(?:do not|don't|dont|never)\s+(?:unsubscribe|remove me)\b/.test(text)) return false;
  return /\b(?:unsubscribe|opt[ -]?out|remove me|remove (?:my|this) (?:email|address)|take me off|stop (?:emailing|contacting|sending)|do not (?:email|contact|send)|don't (?:email|contact|send)|no (?:more|further) (?:emails|contact))\b/.test(text);
}
export const replyLabels=['Interested','Meeting requested','Needs more information','Not interested','Opt-out','Uncertain / manual review'];
export const approvedSubjects=['Development partnership introduction','IT services introduction','Following up on IT services','Final follow-up on IT services'];
export const approvedIntroductions=["I'm a solo IT founder based in Pakistan.","I'm reaching out to introduce my IT services.","I wanted to follow up on my earlier introduction.","This is my final follow-up on my earlier introduction."];
export const approvedQuestions=['Would a brief conversation about a possible partnership be useful?','Would it be useful to discuss whether this service could support your team?','Is there someone on your team who handles development partnerships?'];
export function classifyReply(body, ai=null) {
  if(optOut(body))return 'Opt-out';
  const t=currentReplyText(body);
  if(/\b(not interested|no thanks|no thank you|not a fit)\b/i.test(t))return 'Not interested';
  // Positive decisions need explicit language. Ambiguous/AI-only results stop follow-ups for review.
  if(/\b(schedule (?:a )?(?:call|meeting)|book (?:a )?(?:call|meeting)|let'?s (?:meet|have a call))\b/i.test(t))return 'Meeting requested';
  if(/\b(we(?:'re| are) interested|i(?:'m| am) interested|sounds interesting)\b/i.test(t))return 'Interested';
  if(/\b(send (?:me |us )?(?:more |additional )?(?:information|details)|more information|what (?:is|are) your (?:rate|rates|pricing))\b/i.test(t))return 'Needs more information';
  return 'Uncertain / manual review';
}
export const DAY=86400000;
export function followupDue(outreach, now=Date.now()) {
  if(!outreach || !yes(outreach['Follow-up Allowed']) || outreach['Reply Status'] || outreach['Draft Status']!=='sent' || !outreach['Sent Date'])return false;
  const stage=Number(outreach['Stage']);if(!Number.isInteger(stage)||stage<0||stage>=2)return false;
  const sent=Date.parse(outreach['Sent Date']);return Number.isFinite(sent) && now>=sent+(stage===0?4:7)*DAY;
}
export function messageHeaders(message) { return Object.fromEntries((message.payload?.headers || []).map(h=>[h.name.toLowerCase(),h.value])); }
export function messageText(message) {
  const walk=p=>{if(p.mimeType==='text/plain' && p.body?.data)return Buffer.from(p.body.data,'base64url').toString('utf8');return (p.parts || []).map(walk).filter(Boolean).join('\n');};
  return walk(message.payload || {}) || (message.payload?.body?.data ? Buffer.from(message.payload.body.data,'base64url').toString('utf8').replace(/<[^>]+>/g,' ') : '');
}
export function extractAddress(header) { const m=String(header || '').match(/<([^>]+)>/);return normalizeEmail(m?m[1]:header); }
export function actualSent(message,operation,c) {
  const h=messageHeaders(message),body=messageText(message);
  const to=String(h.to || '').split(',').map(extractAddress);
  return (message.labelIds || []).includes('SENT') && extractAddress(h.from)===normalizeEmail(c.senderEmail) && to.length===1 && to[0]===normalizeEmail(operation.email) &&
    (h['message-id']===operation.messageId || body.includes(`Reference: ${operation.reference}`)) && Number.isFinite(Number(message.internalDate)) && Number(message.internalDate)>=Date.parse(operation.createdAt)-60000;
}
export function emailDraft(data, lead,c,operation,previous=null,tracking=null) {
  const email=enforceRecipient(lead.Email,c);
  if(!validEmail(c.senderEmail) || !c.senderName || !c.businessName || !c.address)throw Error('Complete real sender name, business, email and postal address');
  if(!data || typeof data.subject!=='string' || /[\r\n]/.test(data.subject) || data.subject.length>120 || typeof data.introduction!=='string' || data.introduction.length>700 || typeof data.question!=='string' || data.question.length>250)throw Error('Invalid email draft JSON');
  if(!approvedSubjects.includes(data.subject) || !approvedIntroductions.includes(data.introduction) || !approvedQuestions.includes(data.question))throw Error('AI email text must use approved, factual phrases');
  const facts=parseJson(lead['Verified Observations'],[]);const observation=facts[0]?.quote;
  if(!observation || !lead['Recommended Service'] || !c.services.includes(lead['Recommended Service']))throw Error('Draft requires verified evidence and a deliverable service');
  // AI supplies only a greeting and question. Facts, offer and commercial footer are deterministic.
  if(/https?:|\b(?:our clients|portfolio|award|guarantee|we built|we helped|your problem|struggling|broken|i noticed)\b/i.test(data.introduction+' '+data.question))throw Error('Unsubstantiated claims or links in AI draft');
  const greeting='Hello,';
  const body=`${greeting}\n\n${data.introduction.trim()}\n\nYour website states: "${observation}"\n\nI offer ${lead['Recommended Service']} and would be happy to explore whether this could support your team.\n\n${data.question.trim()}\n\n${c.senderName}\n${c.businessName}\n${c.address}\n${c.senderEmail}\n\nThis is a commercial introduction. If you prefer no further emails, reply "unsubscribe".\nReference: ${operation.reference}`;
  for(const s of [c.senderName,c.businessName,c.address,c.senderEmail,email,previous?.rfcId || ''])if(/[\r\n]/.test(s))throw Error('Header injection rejected');
  const encoded=s=>'=?UTF-8?B?'+Buffer.from(s).toString('base64')+'?=';
  const headers=[`From: ${encoded(c.senderName)} <${c.senderEmail}>`,`To: ${email}`,`Subject: ${encoded(previous?.subject || data.subject)}`,`Message-ID: ${operation.messageId}`,'MIME-Version: 1.0'];
  if(previous){if(!/^<[^<>\s]+@[^<>\s]+>$/.test(previous.rfcId || ''))throw Error('Missing valid parent Message-ID');headers.push(`In-Reply-To: ${previous.rfcId}`,`References: ${previous.rfcId}`);}
  const encodeBody=text=>Buffer.from(text).toString('base64').match(/.{1,76}/g).join('\r\n');let mime;
  if(tracking){
    const url=new URL(tracking.pixelUrl);if(url.origin!==endpoint(c.trackingUrl)||!/^\/p\/[a-f0-9]{64}\.gif$/.test(url.pathname)||url.search||url.hash)throw Error('Invalid tracking image address');
    const escape=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const html='<html><body>'+body.split('\n\n').map(p=>'<p>'+escape(p).replace(/\n/g,'<br>')+'</p>').join('')+'<img src="'+escape(url.href)+'" width="1" height="1" alt=""></body></html>';
    const boundary='agency_'+crypto.randomBytes(18).toString('hex');headers.push('Content-Type: multipart/alternative; boundary="'+boundary+'"');
    mime=`--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encodeBody(body)}\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encodeBody(html)}\r\n--${boundary}--\r\n`;
  }else{headers.push('Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64');mime=encodeBody(body);}
  return {raw:Buffer.from(headers.join('\r\n')+'\r\n\r\n'+mime).toString('base64url'),body,subject:data.subject,email};
}
export function dayKey(time,timezone='Asia/Karachi') { return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time)); }
export function dailyReport(events,leads,outreach,now=Date.now(),timezone='Asia/Karachi') {
  const date=dayKey(now,timezone);const today=events.filter(e=>dayKey(e.Timestamp,timezone)===date);
  const count=action=>today.filter(e=>e.Action===action && e.Outcome==='success').length;
  const latest=new Map();outreach.forEach((o,i)=>{const key=o['Lead ID'] || o.Email || 'row:'+i;const existing=latest.get(key);if(!existing || Number(o.Stage)>Number(existing.Stage))latest.set(key,o);});
  const due=[...latest.values()].filter(o=>followupDue(o,now));
  const meetings=new Set(outreach.filter(o=>o['Reply Status']==='Meeting requested').map((o,i)=>o['Lead ID'] || o.Email || 'row:'+i));
  return {Date:date,'New Leads Researched':count('researched'),'Qualified Leads':count('qualified'),
    'Drafts Awaiting Review':outreach.filter(o=>o['Draft Status']==='draft').length,'Emails Actually Sent':count('sent'),
    'Interested Responses':count('Interested'),'Follow-ups Due':due.length,
    'Meetings Needing Attention':meetings.size,
    'Workflow Errors':today.filter(e=>e.Outcome==='error').length};
}
