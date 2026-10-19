(() => {
  const C=globalThis.AgencyCompose,states=new Map();let scanTimer,pending=null,origin='';
  const call=async message=>{const result=await chrome.runtime.sendMessage(message);if(!result?.ok)throw Error(result?.error||'Extension unavailable. Reload Gmail after updating the extension.');return result.value;};
  function note(state,message){state.note.textContent=message;}
  async function stop(state){state.enabled=false;state.toggle.checked=false;state.image?.remove();state.body.dispatchEvent(new Event('input',{bubbles:true}));let result={queued:false};if(state.id){try{result=await call({type:'CANCEL',id:state.id});}catch(e){result={error:e.message};}}state.id=null;state.meta=null;return result;}
  function stopped(state,result,undo=false){note(state,result.error?'Cancellation needs review: '+result.error:result.queued?'Image removed. Cancellation queued until the server reconnects.':undo?'Send undone. Tracking cancelled; enable again before resending.':'Off. Tracking image removed.');}
  async function enable(state){
    state.toggle.disabled=true;
    try{const meta=C.metadata(state.root,state.body);state.id=crypto.randomUUID();const result=await call({type:'CREATE',id:state.id,...meta});
      if(!C.same(meta,C.metadata(state.root,state.body))){await stop(state);throw Error('Recipient or subject changed. Review and enable tracking again.');}
      state.priorImage?.remove();state.priorImage=null;state.meta=meta;state.image=C.insert(state.body,result.pixelUrl);state.enabled=true;state.toggle.checked=true;note(state,'Ready. Opening signals are estimates.');
    }catch(e){state.toggle.checked=false;state.enabled=false;note(state,e.message);}finally{state.toggle.disabled=false;}
  }
  async function attach(body){
    const root=C.root(body);if(!root||states.has(body))return;
    const bar=document.createElement('div');bar.className='agency-tracker-bar';
    const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';label.append(toggle,document.createTextNode(' Track this email'));
    const status=document.createElement('span');status.className='agency-tracker-note';status.setAttribute('role','status');status.textContent='Off';bar.append(label,status);
    const state={body,root,bar,toggle,note:status,enabled:false};states.set(body,state);
    const send=C.send(root);send.parentElement.insertBefore(bar,send);toggle.addEventListener('change',()=>{if(toggle.checked)void enable(state);else void stop(state).then(result=>stopped(state,result));});
    const prior=C.images(body);
    if(prior.length){
      toggle.disabled=true;note(state,'Existing tracking image: checking…');
      try{const saved=await call({type:'RESOLVE',token:prior[0].token});
        if(saved&&saved.state==='draft'&&C.same(saved,C.metadata(root,body))){state.id=saved.id;state.meta=saved;state.image=prior[0].img;state.enabled=true;toggle.checked=true;toggle.disabled=false;note(state,'Tracking restored for this draft.');}
        else if(saved&&['cancelled','disabled'].includes(saved.state)&&prior.length===1){state.priorImage=prior[0].img;toggle.disabled=false;note(state,'Old tracking stopped. Enable to replace its image.');}
        else note(state,'Already contains tracking. Manage it in the dashboard.');
      }catch{note(state,'Existing tracking image. Check the dashboard.');}
    }
    root.addEventListener('click',event=>{
      if(!state.enabled||!event.target.closest('[role="button"],button')||event.target.closest('[role="button"],button')!==C.send(root))return;
      try{if(pending&&pending.state!==state)throw Error('Wait for the previous tracked send to finish.');const current=C.metadata(root,body);if(!C.same(current,state.meta)||!state.image?.isConnected)throw Error('Recipient, subject, or image changed. Disable tracking, review, and re-enable it.');if(!pending)startSend(state);}
      catch(e){event.preventDefault();event.stopImmediatePropagation();note(state,e.message);}
    },true);
    root.addEventListener('keydown',event=>{
      if(!state.enabled||!(event.ctrlKey||event.metaKey)||event.key!=='Enter')return;
      try{if(pending&&pending.state!==state)throw Error('Wait for the previous tracked send.');if(!C.same(C.metadata(root,body),state.meta)||!state.image?.isConnected)throw Error('Review the tracked recipient and subject first.');if(!pending)startSend(state);}
      catch(e){event.preventDefault();event.stopImmediatePropagation();note(state,e.message);}
    },true);
  }
  function startSend(state){
    state.awaitingSend=true;pending={state,started:Date.now(),confirmed:false,toastAt:0};note(state,'Waiting for Gmail send confirmation…');
    setTimeout(()=>{if(pending?.state===state&&!pending.confirmed){note(state,'Send was not confirmed. Check Gmail and the dashboard.');pending=null;}},15000);
  }
  function observeSend(mutations){
    if(!pending)return;
    for(const mutation of mutations){
      const nodes=mutation.type==='characterData'?[mutation.target]:mutation.addedNodes;
      for(const node of nodes)if(/\bMessage sent\b/.test(node.textContent||''))pending.toastAt=Date.now();
    }
    // Gmail may update its toast and remove the composer in separate mutations.
    if(!pending.confirmed&&pending.toastAt&&Date.now()-pending.toastAt<=2000&&!pending.state.body.isConnected){
      const state=pending.state;pending.confirmed=true;state.sent=true;void call({type:'SENT',id:state.id}).then(result=>note(state,result.queued?'Send confirmation queued; server offline.':'Tracking will start after the send buffer.')).catch(e=>note(state,e.message));
      setTimeout(()=>{if(pending?.state===state)pending=null;},35000);
    }
  }
  document.addEventListener('click',event=>{
    if(!pending?.confirmed)return;
    const button=event.target.closest('button,[role="button"],a');if(button?.textContent.trim()==='Undo'){
      const state=pending.state;pending=null;void stop(state).then(result=>stopped(state,result,true));
    }
  },true);
  async function scan(){for(const body of document.querySelectorAll(C.BODY))await attach(body);for(const [body,state]of states){if(!body.isConnected&&pending?.state!==state){states.delete(body);if(state.enabled&&state.id&&!state.sent&&!state.awaitingSend)void call({type:'CANCEL',id:state.id}).catch(()=>{});}}}
  const observer=new MutationObserver(mutations=>{observeSend(mutations);clearTimeout(scanTimer);scanTimer=setTimeout(()=>void scan(),200);});
  void call({type:'STATUS'}).then(result=>{origin=result.origin;if(!result.configured)return;observer.observe(document.body,{childList:true,subtree:true,characterData:true});void scan();}).catch(()=>{});
})();
