export const VERSION='1.0.0';
export const ARM_DELAY_MS=45000;
export const TRACKING_HEADERS=['Tracking ID','Operation ID','Lead ID','Company','Email','Subject','Source','Send Confirmation','Sent Date','Tracking State','First Possible Open','Last Image Request','Image Requests','Last Synced'];
export function endpoint(value){
  const u=new URL(String(value).trim());
  const local=['127.0.0.1','localhost'].includes(u.hostname);
  if((u.protocol!=='https:'&&!(u.protocol==='http:'&&local))||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Use an HTTPS server origin, or http://127.0.0.1:8788 for local testing.');
  return u.origin;
}
export function validId(value){return typeof value==='string'&&/^[a-zA-Z0-9_-]{16,100}$/.test(value);}
export function email(value){const s=String(value||'').trim().toLowerCase();if(s.length>254||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(s))throw Error('A single valid recipient email is required.');return s;}
export function text(value,max=200){const s=String(value||'').trim();if(s.length>max||/[\u0000-\u001f\u007f]/.test(s))throw Error('Text field is too long or contains control characters.');return s;}
export function registration(data){
  if(!validId(data.id))throw Error('Invalid tracking identifier.');
  if(!['extension','agency'].includes(data.source))throw Error('Unknown tracking source.');
  const recipient=email(data.recipient),subject=text(data.subject),company=text(data.company,120);
  if(!subject)throw Error('Add an email subject before enabling tracking.');
  return {id:data.id,recipient,subject,company,source:data.source,operation_id:text(data.operation_id,100),lead_id:text(data.lead_id,100)};
}
export function label(record,now=Date.now()){
  if(record.state==='disabled')return 'Tracking disabled';
  if(record.state==='cancelled')return 'Send cancelled';
  if(record.state==='draft')return 'Awaiting send confirmation';
  if(Date.parse(record.arm_at)>now)return 'Send buffer active';
  return record.first_fetch?'Possible open detected':'No opening signal detected';
}
export function pixelUrl(origin,token){if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('Invalid tracking image token.');return endpoint(origin)+'/p/'+token+'.gif';}
export function permissionPattern(origin){const u=new URL(endpoint(origin));return u.protocol+'//'+u.hostname+'/*';}
export async function api(origin,key,route,{method='GET',body,fetchImpl=fetch}={}){
  if(!/^[a-f0-9]{64}$/.test(key||''))throw Error('Enter the 64-character admin key from your local tracker setup.');
  if(!/^\/api\/[a-zA-Z0-9_/?=&%-]+$/.test(route))throw Error('Invalid tracker API route.');
  let response;try{response=await fetchImpl(endpoint(origin)+route,{method,headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'});}catch{throw Error('Tracking server unavailable. Check its address and your connection.');}
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw Error(response.status===401?'The tracker admin key is incorrect.':response.status===409?'Tracking record conflicts with a previous recipient, subject, or send state.':response.status===429?'Tracking server quota reached. Try again later.':'Tracking request failed ('+response.status+').');
  if(!value)throw Error('Tracking server returned an invalid response.');return value;
}
