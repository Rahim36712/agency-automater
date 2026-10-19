import fs from 'node:fs';
import path from 'node:path';
import { requestJson } from './http.mjs';
export const GOOGLE_SCOPES=['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.compose'];
export function writeTokens(directory,tokens){fs.mkdirSync(directory,{recursive:true});const target=path.join(directory,'google-tokens.json');const temp=target+'.tmp';fs.writeFileSync(temp,JSON.stringify(tokens),{mode:0o600});fs.renameSync(temp,target);}
export class Google {
  constructor(c,{fetchImpl=fetch}={}){this.c=c;this.fetch=fetchImpl;this.tokenFile=path.join(c.dataDir,'google-tokens.json');}
  async accessToken(){
    if(!fs.existsSync(this.tokenFile))throw Error('Google is not authorized. Run npm run auth.');
    const tokens=JSON.parse(fs.readFileSync(this.tokenFile,'utf8'));
    if(tokens.access_token && tokens.expires_at>Date.now()+60000)return tokens.access_token;
    if(!tokens.refresh_token || !this.c.clientId || !this.c.clientSecret)throw Error('OAuth credentials missing. Run npm run auth.');
    let response;try{response=await this.fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.c.clientId,client_secret:this.c.clientSecret,refresh_token:tokens.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(30000)});}catch{throw Error('Google token refresh network failure');}
    if(!response.ok)throw Error('Google authorization expired or was revoked. Run npm run auth again.');
    const renewed=await response.json();if(!renewed.access_token)throw Error('Invalid Google token response');
    const merged={...tokens,...renewed,expires_at:Date.now()+renewed.expires_in*1000};writeTokens(this.c.dataDir,merged);return merged.access_token;
  }
  async call(service,endpoint,{method='GET',body}={}){
    if(service==='gmail' && !(/^\/users\/me\/(profile|messages(?:\/[^/]+)?|threads\/[^/]+|drafts(?:\/[^/]+)?)(?:\?.*)?$/.test(endpoint)))throw Error('Gmail endpoint not allowed');
    if(service==='gmail' && method!=='GET' && !(method==='POST' && endpoint==='/users/me/drafts'))throw Error('Only Gmail draft creation is allowed. Sending is disabled in code.');
    if(service==='sheets' && !(/^\/spreadsheets\/[a-zA-Z0-9_-]+\/values(?:\/|:).+/.test(endpoint)||(method==='GET'&&/^\/spreadsheets\/[a-zA-Z0-9_-]+(?:\?.*)?$/.test(endpoint))||(method==='POST'&&/^\/spreadsheets\/[a-zA-Z0-9_-]+:batchUpdate$/.test(endpoint))))throw Error('Sheets endpoint not allowed');
    const token=await this.accessToken();const base=service==='gmail'?'https://gmail.googleapis.com/gmail/v1':'https://sheets.googleapis.com/v4';
    return requestJson(base+endpoint,{method,body,headers:{Authorization:'Bearer '+token},service:'Google '+service,fetchImpl:this.fetch,retries:method==='POST'?0:2});
  }
  async profile(){return this.call('gmail','/users/me/profile');}
  async listMessages(q){return this.paginate('/users/me/messages?q='+encodeURIComponent(q),'messages');}
  async paginate(endpoint,key){let rows=[],page='';do{const data=await this.call('gmail',endpoint+(endpoint.includes('?')?'&':'?')+'maxResults=100'+(page?'&pageToken='+encodeURIComponent(page):''));rows.push(...(data[key] || []));page=data.nextPageToken || '';if(rows.length>10000)throw Error('Mailbox scan exceeds safe limit; narrow the query');}while(page);return rows;}
  async message(id){return this.call('gmail','/users/me/messages/'+encodeURIComponent(id)+'?format=full');}
  async thread(id){return this.call('gmail','/users/me/threads/'+encodeURIComponent(id)+'?format=full');}
  async draft(id){return this.call('gmail','/users/me/drafts/'+encodeURIComponent(id)+'?format=full');}
  async listDrafts(){return this.paginate('/users/me/drafts','drafts');}
  async createDraft(raw,threadId){return this.call('gmail','/users/me/drafts',{method:'POST',body:{message:{raw,...(threadId?{threadId}:{})}}});}
}
