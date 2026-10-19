import { ARM_DELAY_MS,VERSION,validId,registration } from './shared.mjs';
const GIF=Uint8Array.from([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59]);
const publicColumns='id,recipient,subject,company,source,operation_id,lead_id,created_at,sent_at,arm_at,confirmation,state,first_fetch,last_fetch,image_requests';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function authorized(request,env){
  const supplied=request.headers.get('authorization')||'';
  if(!/^Bearer [a-f0-9]{64}$/.test(supplied)||!/^[a-f0-9]{64}$/.test(env.ADMIN_HASH||''))return false;
  const actual=await hash(supplied.slice(7));let difference=0;for(let i=0;i<64;i++)difference|=actual.charCodeAt(i)^env.ADMIN_HASH.charCodeAt(i);return difference===0;
}
async function body(request){
  if(Number(request.headers.get('content-length')||0)>8192)throw Error('Request too large');
  const reader=request.body?.getReader();if(!reader)return {};let size=0,parts=[];
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw Error('Request too large');}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
function image(){return new Response(GIF,{headers:{'Content-Type':'image/gif','Cache-Control':'no-store, no-cache, must-revalidate, private','Pragma':'no-cache','Expires':'0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
function retention(env){const n=Number(env.RETENTION_DAYS||90);return Number.isInteger(n)&&n>=7&&n<=365?n:90;}
export async function cleanup(env,now=Date.now()){return env.DB.prepare('DELETE FROM tracked_messages WHERE created_at < ?').bind(new Date(now-retention(env)*86400000).toISOString()).run();}
export async function handle(request,env,now=Date.now()){
  const u=new URL(request.url),path=u.pathname,at=new Date(now).toISOString();
  const match=/^\/p\/([a-f0-9]{64})\.gif$/.exec(path);
  if(path.startsWith('/p/')){
    if(request.method==='GET'&&match&&!/bot|crawler|spider|scanner|preview/i.test(request.headers.get('user-agent')||'')){
      try{await env.DB.prepare("UPDATE tracked_messages SET first_fetch=COALESCE(first_fetch,?),last_fetch=?,image_requests=image_requests+1 WHERE pixel_token=? AND state='confirmed' AND arm_at<=? AND created_at>=?").bind(at,at,match[1],at,new Date(now-retention(env)*86400000).toISOString()).run();}catch{/* Always return the image. A storage outage is not an opening signal. */}
    }
    if(request.method==='HEAD')return new Response(null,{headers:{'Content-Type':'image/gif','Cache-Control':'no-store'}});
    return image();
  }
  if(path==='/health'&&request.method==='GET')return json({ok:true,version:VERSION});
  if(!path.startsWith('/api/'))return json({error:'Not found'},404);
  if(!await authorized(request,env))return json({error:'Unauthorized'},401);
  try{
    if(path==='/api/messages'&&request.method==='POST'){
      const data=registration(await body(request));
      const token=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
      await env.DB.prepare('INSERT OR IGNORE INTO tracked_messages(id,pixel_token,recipient,subject,company,source,operation_id,lead_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(data.id,token,data.recipient,data.subject,data.company,data.source,data.operation_id,data.lead_id,at).run();
      const saved=await env.DB.prepare('SELECT * FROM tracked_messages WHERE id=?').bind(data.id).first();
      if(!saved||['recipient','subject','source','operation_id','lead_id'].some(k=>saved[k]!==data[k]))return json({error:'Identifier conflict'},409);
      return json({record:saved,pixel_url:u.origin+'/p/'+saved.pixel_token+'.gif'});
    }
    if(path==='/api/messages'&&request.method==='GET'){
      const size=Math.min(100,Math.max(1,Number(u.searchParams.get('limit'))||50));let values=[],where='';
      if(u.searchParams.get('cursor')){let cursor;try{cursor=JSON.parse(atob(u.searchParams.get('cursor')));}catch{return json({error:'Invalid cursor'},400);}if(!Array.isArray(cursor)||cursor.length!==2||typeof cursor[0]!=='string'||!validId(cursor[1]))return json({error:'Invalid cursor'},400);where='WHERE (created_at < ? OR (created_at = ? AND id < ?))';values=[cursor[0],cursor[0],cursor[1]];}
      const rows=(await env.DB.prepare(`SELECT ${publicColumns} FROM tracked_messages ${where} ORDER BY created_at DESC,id DESC LIMIT ?`).bind(...values,size+1).all()).results;
      const more=rows.length>size;const records=rows.slice(0,size),last=records.at(-1);
      return json({records,next_cursor:more?btoa(JSON.stringify([last.created_at,last.id])):null});
    }
    const entry=/^\/api\/messages\/([a-zA-Z0-9_-]{16,100})$/.exec(path);
    if(entry){
      const id=entry[1],existing=await env.DB.prepare(`SELECT ${publicColumns} FROM tracked_messages WHERE id=?`).bind(id).first();if(!existing)return json({error:'Not found'},404);
      if(request.method==='DELETE'){await env.DB.prepare('DELETE FROM tracked_messages WHERE id=?').bind(id).run();return json({deleted:true});}
      if(request.method==='PATCH'){
        const data=await body(request);
        if(data.action==='confirm'){
          if(['cancelled','disabled'].includes(existing.state))return json({error:'Tracking stopped'},409);
          if(!['gmail_ui','gmail_sent_verified','manual'].includes(data.confirmation))throw Error('Missing send confirmation type');
          const sent=Date.parse(data.sent_at||at);if(!Number.isFinite(sent)||sent>now+60000||sent<Date.parse(existing.created_at)-60000)throw Error('Invalid send date');
          // Idempotent: repeat confirmations never shift the original arm time.
          await env.DB.prepare("UPDATE tracked_messages SET state='confirmed',sent_at=?,arm_at=?,confirmation=? WHERE id=? AND state='draft'").bind(new Date(sent).toISOString(),new Date(now+ARM_DELAY_MS).toISOString(),data.confirmation,id).run();
        }else if(['cancel','disable'].includes(data.action))await env.DB.prepare('UPDATE tracked_messages SET state=? WHERE id=?').bind(data.action==='cancel'?'cancelled':'disabled',id).run();
        else throw Error('Unknown action');
        return json({record:await env.DB.prepare(`SELECT ${publicColumns} FROM tracked_messages WHERE id=?`).bind(id).first()});
      }
    }
    if(path==='/api/cleanup'&&request.method==='POST'){await cleanup(env,now);return json({cleaned:true,retention_days:retention(env)});}
    return json({error:'Not found'},404);
  }catch(e){return json({error:'Invalid request or unavailable storage'},e instanceof SyntaxError?400:400);}
}
export default {fetch(request,env){return handle(request,env);},async scheduled(_event,env){await cleanup(env);}};
