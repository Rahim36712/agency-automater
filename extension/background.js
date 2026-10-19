import { api,endpoint,registration,permissionPattern } from './shared.mjs';
const area=chrome.storage.local;
// Content scripts must never be able to read the server admin credential.
const secured=area.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
let serial=Promise.resolve();
async function settings(){await secured;return (await area.get('settings')).settings||{};}
async function registry(){await secured;return (await area.get('registry')).registry||{};}
async function remote(route,args){const s=await settings();if(!s.origin||!s.key)throw Error('Connect a tracking server from the extension dashboard first.');return api(s.origin,s.key,route,args);}
async function saveRegistry(records){await area.set({registry:records});}
async function flushActions(){
  const records=await registry();for(const [id,r]of Object.entries(records)){
    if(!r.action)continue;
    try{await remote('/api/messages/'+id,{method:'PATCH',body:r.action});delete r.action;delete r.error;await saveRegistry(records);}
    catch(e){r.error=e.message;await saveRegistry(records);}
  }
}
function page(sender){return sender.id===chrome.runtime.id&&sender.url?.startsWith(chrome.runtime.getURL(''));}
function gmail(sender){return sender.id===chrome.runtime.id&&sender.tab&&/^https:\/\/mail\.google\.com\//.test(sender.url||sender.tab.url||'');}
async function handle(message,sender){
  const trusted=page(sender),content=gmail(sender);if(!trusted&&!content)throw Error('Unsupported message origin.');
  const s=await settings();
  if(message.type==='STATUS')return {configured:!!(s.origin&&s.key),origin:s.origin||''};
  if(message.type==='CREATE'&&content){
    const value=registration({id:message.id,recipient:message.recipient,subject:message.subject,source:'extension'});
    const result=await remote('/api/messages',{method:'POST',body:value});const records=await registry();
    records[value.id]={...value,pixelUrl:result.pixel_url,state:result.record.state,createdAt:result.record.created_at};
    await saveRegistry(records);return {id:value.id,pixelUrl:result.pixel_url,state:result.record.state};
  }
  if(message.type==='RESOLVE'&&content){const token=String(message.token||'');if(!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid image token.');return Object.values(await registry()).find(r=>r.pixelUrl?.includes('/p/'+token+'.gif'))||null;}
  if(['SENT','CANCEL'].includes(message.type)&&content){
    const records=await registry(),r=records[message.id];if(!r||r.source!=='extension')throw Error('Unknown compose tracking record.');
    if(message.type==='SENT'&&['cancelled','disabled'].includes(r.state))throw Error('Tracking was stopped.');
    r.state=message.type==='SENT'?'confirmed':'cancelled';r.action=message.type==='SENT'?{action:'confirm',confirmation:'gmail_ui',sent_at:new Date().toISOString()}:{action:'cancel'};
    await saveRegistry(records);await flushActions();return {queued:!!(await registry())[message.id]?.action};
  }
  if(!trusted)throw Error('Dashboard action required.');
  if(message.type==='SETTINGS')return {origin:s.origin||'',notifications:!!s.notifications,configured:!!s.key};
  if(message.type==='SAVE_SETTINGS'){
    const origin=endpoint(message.origin),key=message.key||(origin===s.origin?s.key:'');
    if(!await chrome.permissions.contains({origins:[permissionPattern(origin)]}))throw Error('Grant access to the configured server first.');
    await api(origin,key,'/api/messages?limit=1');
    const notifications=!!message.notifications&&await chrome.permissions.contains({permissions:['notifications']});
    if(s.origin&&s.origin!==origin)await area.set({registry:{},notified:{}});
    await area.set({settings:{origin,key,notifications}});await chrome.alarms.create('tracker-sync',{periodInMinutes:5});return {saved:true};
  }
  if(message.type==='LIST'){await flushActions();const result=await remote('/api/messages?limit=100'+(message.cursor?'&cursor='+encodeURIComponent(String(message.cursor)):''));return {...result,pending_actions:Object.values(await registry()).filter(r=>r.action).map(r=>({id:r.id,error:r.error||'Waiting for connection'}))};}
  if(message.type==='ACTION'){
    if(!/^[a-zA-Z0-9_-]{16,100}$/.test(message.id))throw Error('Invalid record identifier.');
    const action=message.action;if(!['delete','disable','confirm'].includes(action))throw Error('Unknown action.');
    const result=await remote('/api/messages/'+message.id,{method:action==='delete'?'DELETE':'PATCH',...(action==='delete'?{}:{body:{action,confirmation:'manual'}})});
    const records=await registry();if(action==='delete')delete records[message.id];else if(records[message.id]){records[message.id].state=action==='disable'?'disabled':'confirmed';delete records[message.id].action;}
    await saveRegistry(records);return result;
  }
  if(message.type==='DISCONNECT'){await area.remove('settings');await chrome.alarms.clear('tracker-sync');return {disconnected:true};}
  throw Error('Unknown extension action.');
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  const job=serial.then(()=>handle(message,sender));serial=job.catch(()=>{});job.then(value=>respond({ok:true,value}),error=>respond({ok:false,error:error.message}));return true;
});
async function poll(){
  const s=await settings();if(!s.origin||!s.key)return;await flushActions();
  const result=await remote('/api/messages?limit=100'),stored=await area.get('notified'),notified=stored.notified||{};
  for(const r of result.records){if(r.state!=='confirmed'||!r.first_fetch||notified[r.id])continue;
    if(s.notifications&&await chrome.permissions.contains({permissions:['notifications']}))await chrome.notifications.create('signal-'+r.id,{type:'basic',iconUrl:'icons/128.png',title:'Possible email open',message:r.recipient+' — '+r.subject.slice(0,100)});
    notified[r.id]=r.first_fetch;
  }
  await area.set({notified:Object.fromEntries(Object.entries(notified).slice(-1000))});
}
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='tracker-sync'){const job=serial.then(poll);serial=job.catch(()=>{});}});
chrome.runtime.onInstalled.addListener(()=>{void secured;});
chrome.runtime.onStartup.addListener(()=>{const job=serial.then(async()=>{const s=await settings();if(s.key)await chrome.alarms.create('tracker-sync',{periodInMinutes:5});await poll();});serial=job.catch(()=>{});});
