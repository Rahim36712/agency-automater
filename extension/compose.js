(() => {
  const BODY='[contenteditable="true"][role="textbox"][g_editable="true"],[contenteditable="true"][aria-label="Message Body"],[contenteditable="true"][aria-label="Message body"]';
  function send(root){return [...root.querySelectorAll('[role="button"],button')].find(e=>/^(Send|Send \()/i.test(e.getAttribute('data-tooltip')||e.getAttribute('aria-label')||e.textContent.trim()));}
  function root(body){let p=body.parentElement;while(p&&p!==document.body){if(p.querySelector('input[name="subjectbox"]')&&send(p))return p;p=p.parentElement;}return null;}
  function metadata(composer,body){
    const addresses=new Set();let cc=false;
    for(const field of composer.querySelectorAll('input[name="to"],input[name="cc"],input[name="bcc"],[email],[data-hovercard-id]')){
      if(body.contains(field))continue;
      const value=field.getAttribute('email')||field.getAttribute('data-hovercard-id')||field.value||'';
      const found=value.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}/ig)||[];
      for(const address of found)addresses.add(address.toLowerCase());
      if(['cc','bcc'].includes(field.name)&&found.length)cc=true;
    }
    const subject=composer.querySelector('input[name="subjectbox"]')?.value.trim()||'';
    if(cc||addresses.size!==1)throw Error('Tracking requires exactly one recipient and no Cc/Bcc.');
    if(!subject||subject.length>200)throw Error('Add a subject of at most 200 characters first.');
    return {recipient:[...addresses][0],subject};
  }
  function images(body){return [...body.querySelectorAll('img')].map(img=>{let value=img.src||'';try{value=decodeURIComponent(value);}catch{}const token=/\/p\/([a-f0-9]{64})\.gif/.exec(value)?.[1];return token?{img,token}:null;}).filter(Boolean);}
  function insert(body,url){const img=document.createElement('img');img.src=url;img.width=1;img.height=1;img.alt='';img.setAttribute('data-agency-tracker','true');img.style.cssText='width:1px;height:1px;border:0;';body.append(img);body.dispatchEvent(new Event('input',{bubbles:true}));return img;}
  function same(a,b){return a&&b&&a.recipient===b.recipient&&a.subject===b.subject;}
  globalThis.AgencyCompose={BODY,send,root,metadata,images,insert,same};
})();
