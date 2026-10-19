import { endpoint,permissionPattern,label } from './shared.mjs';
const $=id=>document.getElementById(id),popup=document.body.classList.contains('popup');let records=[],cursor=null,configured=false;
const call=async message=>{const result=await chrome.runtime.sendMessage(message);if(!result?.ok)throw Error(result?.error||'Extension unavailable.');return result.value;};
function status(message,error=false,id='status'){const el=$(id);if(el){el.textContent=message;el.classList.toggle('error',error);}}
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function date(value){return value?new Date(value).toLocaleString():'';}
function render(){
  $('total').textContent=String(records.length);$('signals').textContent=String(records.filter(r=>r.first_fetch&&r.state==='confirmed').length);
  if($('waiting'))$('waiting').textContent=String(records.filter(r=>r.state==='confirmed'&&!r.first_fetch).length);
  const query=$('search')?.value.trim().toLowerCase()||'',filtered=records.filter(r=>[r.company,r.recipient,r.subject].some(s=>String(s||'').toLowerCase().includes(query))),list=popup?filtered.slice(0,3):filtered;
  $('records').replaceChildren();
  if(!list.length){const box=element('div',undefined,'empty');box.append(element('strong',query?'No matching messages':configured?'Your activity starts here':'Connect your tracking server'),element('p',query?'Try a company name, email address or subject.':configured?'Open Gmail, add one recipient and a subject, then choose “Track this email”. Your messages will appear here.':'Open the dashboard connection settings to add your server address and private admin key.'));$('records').append(box);}
  for(const r of list){
    const card=element('article',undefined,'record'),info=element('div');info.append(element('h3',r.subject),element('p',(r.company?r.company+' · ':'')+r.recipient),element('p',(r.source==='agency'?'Agency draft':'Gmail compose')+' · '+(r.sent_at?'Send reported '+date(r.sent_at):'Created '+date(r.created_at))));
    const signal=element('div');signal.append(element('p',label(r),'signal'+(r.first_fetch&&r.state==='confirmed'?'':' neutral')));
    if(r.first_fetch)signal.append(element('p','First signal '+date(r.first_fetch)),element('p',r.image_requests+' image request'+(r.image_requests===1?'':'s')));
    const actions=element('div',undefined,'record-actions');
    if(!popup){
      if(r.state==='draft')actions.append(action('Confirm already sent',r,'confirm',true));
      if(!['disabled','cancelled'].includes(r.state))actions.append(action('Disable',r,'disable'));
      actions.append(action('Delete record',r,'delete',true));
    }
    card.append(info,signal,actions);$('records').append(card);
  }
  if($('load-more'))$('load-more').hidden=!cursor;
}
function action(title,record,command,confirmation=false){
  const button=element('button',title,command==='delete'?'danger':'');let armed=false;
  button.addEventListener('click',async()=>{
    if(confirmation&&!armed){armed=true;button.textContent=command==='delete'?'Confirm deletion':'Yes, already sent';status(command==='delete'?'Deleting removes this record and stops its tracking image. Click again to confirm.':'Only confirm if this exact message was already sent in Gmail. This is a manual confirmation, not verified sent-mail proof.');setTimeout(()=>{armed=false;button.textContent=title;},6000);return;}
    button.disabled=true;try{await call({type:'ACTION',id:record.id,action:command});await refresh();}catch(e){status(e.message,true);button.disabled=false;}
  });return button;
}
async function refresh(older=false){
  const button=older?$('load-more'):$('refresh');button.disabled=true;
  try{const s=await call({type:'STATUS'});configured=s.configured;$('connection').textContent=configured?'Connected':'Not connected';$('connection').classList.toggle('connected',configured);
    if(!configured){records=[];cursor=null;render();status('Add your server in connection settings.');return;}
    const result=await call({type:'LIST',cursor:older?cursor:null});records=older?[...records,...result.records.filter(r=>!records.some(old=>old.id===r.id))]:result.records;cursor=result.next_cursor;render();
    status(result.pending_actions?.length?result.pending_actions.length+' send confirmation(s) queued. Keep Chrome open and restore the server connection.':'Updated '+new Date().toLocaleTimeString()+' · Image requests are not a verified open count.');
  }catch(e){status(e.message,true);}finally{button.disabled=false;}
}
$('refresh').addEventListener('click',()=>void refresh());$('search')?.addEventListener('input',render);$('load-more')?.addEventListener('click',()=>void refresh(true));
$('open-dashboard')?.addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')}));
if($('settings-form')){
  void call({type:'SETTINGS'}).then(s=>{$('origin').value=s.origin;$('notifications').checked=s.notifications;$('setup').open=!s.configured;});
  $('settings-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;
    try{const origin=endpoint($('origin').value),notifications=$('notifications').checked;
      if(!await chrome.permissions.request({origins:[permissionPattern(origin)],...(notifications?{permissions:['notifications']}:{})}))throw Error('Server or notification access was not granted.');
      await call({type:'SAVE_SETTINGS',origin,key:$('key').value.trim(),notifications});$('key').value='';status('Connected. Refresh Gmail to show tracking toggles.',false,'settings-status');await refresh();
    }catch(e){status(e.message,true,'settings-status');}finally{button.disabled=false;}
  });
  $('disconnect').addEventListener('click',async()=>{try{await call({type:'DISCONNECT'});$('key').value='';status('Disconnected on this browser. Existing server records remain.',false,'settings-status');await refresh();}catch(e){status(e.message,true,'settings-status');}});
}
void refresh();
