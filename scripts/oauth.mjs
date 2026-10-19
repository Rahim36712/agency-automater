import http from 'node:http';
import crypto from 'node:crypto';
import { config } from '../src/config.mjs';
import { GOOGLE_SCOPES,writeTokens } from '../src/google.mjs';
const c=config();if(!c.clientId || !c.clientSecret)throw Error('Enter the Desktop app OAuth client ID and secret in .env locally. See docs/google-setup.md.');
const state=crypto.randomBytes(32).toString('hex'),verifier=crypto.randomBytes(48).toString('base64url'),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
let redirect,consumed=false;
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,redirect);
  if(req.method!=='GET'||url.pathname!=='/oauth2callback'||url.searchParams.get('state')!==state||consumed){res.writeHead(400);res.end('Invalid authorization callback');return;}
  consumed=true;
  try{
    if(url.searchParams.has('error') || !url.searchParams.get('code'))throw Error('Authorization denied.');
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:url.searchParams.get('code'),client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:redirect,grant_type:'authorization_code',code_verifier:verifier}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('Google token exchange failed. Check your Desktop app OAuth settings.');
    const tokens=await response.json();if(!tokens.access_token || !tokens.refresh_token)throw Error('Offline token missing. Revoke this app access and authorize again with consent.');
    if(GOOGLE_SCOPES.some(scope=>!String(tokens.scope || '').split(' ').includes(scope)))throw Error('Required Google permission was not granted. Authorize all requested scopes.');
    writeTokens(c.dataDir,{...tokens,expires_at:Date.now()+tokens.expires_in*1000});res.end('Google connected. Close this tab and return to the terminal.');console.log('Authorization saved privately in .data. No emails sent.');
  }catch(e){res.writeHead(400);res.end('Authorization failed. See terminal.');console.error(e.message);process.exitCode=1;}
  finally{clearTimeout(timer);server.close();}
});
const timer=setTimeout(()=>{console.error('Authorization timed out after five minutes. Run npm run auth again.');server.close();process.exitCode=1;},300000);
server.listen(0,'127.0.0.1',()=>{redirect=`http://127.0.0.1:${server.address().port}/oauth2callback`;const params=new URLSearchParams({client_id:c.clientId,redirect_uri:redirect,response_type:'code',scope:GOOGLE_SCOPES.join(' '),state,access_type:'offline',prompt:'consent',code_challenge:challenge,code_challenge_method:'S256'});console.log('Open this URL in your browser and authorize your own Gmail account:\nhttps://accounts.google.com/o/oauth2/v2/auth?'+params);});
