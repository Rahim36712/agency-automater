import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { root } from '../src/config.mjs';
import { LocalDB } from '../tracker/local-db.mjs';
import { handle,hash } from '../tracker/worker.mjs';
const dir=path.join(root,'.data','tracker-dev');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'admin-key.txt');if(!fs.existsSync(file))fs.writeFileSync(file,crypto.randomBytes(32).toString('hex'),{mode:0o600});const key=fs.readFileSync(file,'utf8').trim(),DB=new LocalDB(path.join(dir,'local.sqlite')),env={DB,ADMIN_HASH:await hash(key),RETENTION_DAYS:'90'};
const port=8788,origin='http://127.0.0.1:'+port;
const server=http.createServer(async(req,res)=>{
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)|| (req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)&&!/^chrome-extension:\/\/[a-z]{32}$/.test(req.headers.origin))){res.writeHead(403);res.end();return;}
  try{
    let input='',size=0;for await(const b of req){size+=b.length;if(size>8192){res.writeHead(413);res.end();return;}input+=b;}
    const target=new URL(req.url,origin);
    const extensionOrigin=/^chrome-extension:\/\/[a-z]{32}$/.test(req.headers.origin||'');
    if(!target.pathname.startsWith('/p/')&&!extensionOrigin&&['cross-site','same-site'].includes(req.headers['sec-fetch-site'])){res.writeHead(403);res.end();return;}
    if(target.pathname==='/preview'||target.pathname.startsWith('/extension/')){
      let name=target.pathname==='/preview'?'dashboard.html':target.pathname.slice('/extension/'.length);if(!/^(?:[a-z-]+\.(?:html|js|mjs|css)|icons\/(?:16|32|48|128)\.png)$/.test(name)){res.writeHead(404);res.end();return;}
      const full=path.join(root,'extension',name);if(!fs.existsSync(full)){res.writeHead(404);res.end();return;}
      let data=fs.readFileSync(full);if(name.endsWith('.html'))data=Buffer.from(data.toString().replace('<head>','<head><base href="/extension/"><script src="/preview-shim.js"></script>').replace(/(<main[^>]*>)/,'$1<p style="font-size:12px;background:#fff4df;padding:12px;border-radius:9px;color:#755729">LOCAL PREVIEW · Synthetic demo records, when present, are not real Gmail activity. Install the extension for Gmail controls.</p>'));
      const ext=path.extname(name);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png'})[ext], 'Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'self'; frame-ancestors 'none'"});res.end(data);return;
    }
    if(target.pathname==='/preview-shim.js'){
      // This is a loopback-only preview, not an installed Chrome extension.
      const script=`window.chrome={runtime:{getURL:n=>'/extension/'+n,sendMessage:async m=>{try{if(m.type==='STATUS')return {ok:true,value:{configured:true,origin:${JSON.stringify(origin)}}};if(m.type==='SETTINGS')return {ok:true,value:{origin:${JSON.stringify(origin)},configured:true,notifications:false}};if(m.type==='LIST'){const r=await fetch('/api/messages?limit=100'+(m.cursor?'&cursor='+encodeURIComponent(m.cursor):''),{headers:{Authorization:'Bearer '+${JSON.stringify(key)}}});return {ok:true,value:await r.json()};}throw Error('Preview only. Install the Chrome extension to use controls.');}catch(e){return {ok:false,error:e.message};}}},tabs:{create:({url})=>window.open(url)},permissions:{request:async()=>false}};`;
      res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff'});res.end(script);return;
    }
    const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:input}:{} )}),result=await handle(request,env);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Local tracker failure');}
});
server.listen(port,'127.0.0.1',()=>console.log('Local tracker: '+origin+'. Dashboard preview: '+origin+'/preview. Private local key: .data/tracker-dev/admin-key.txt. Loopback images cannot track external recipients.'));
server.on('error',e=>{DB.close();console.error(e.message);process.exit(1);});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{DB.close();process.exit(0);}));
