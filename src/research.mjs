import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import { canonicalWebsite,cleanText } from './domain.mjs';
export function publicIP(ip){
  if(net.isIP(ip)===4){const a=ip.split('.').map(Number);return !(
    a[0]===0 || a[0]===10 || a[0]===127 || a[0]>=224 || (a[0]===169&&a[1]===254) || (a[0]===172&&a[1]>=16&&a[1]<=31) || (a[0]===192&&(a[1]===168 || a[1]===0 || a[1]===2)) || (a[0]===100&&a[1]>=64&&a[1]<=127) || (a[0]===198&&(a[1]===18||a[1]===19||a[1]===51)) || (a[0]===203&&a[1]===0&&a[2]===113));}
  if(net.isIP(ip)===6){return /^[23][0-9a-f]{3}:/i.test(ip) && !/^(?:2001:(?:db8|0)|2002:)/i.test(ip);}return false;
}
export async function safeFetch(url,{lookup=dns.lookup,limit=200000,redirects=0,site=canonicalWebsite(url)}={}){
  const u=new URL(url);if(u.protocol!=='https:' || canonicalWebsite(u.href)!==site || u.username || u.password || u.port)throw Error('Research only allows HTTPS on the approved company domain');
  if(/(^|\.)(linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com)$/.test(u.hostname))throw Error('This source is not permitted for automated research');
  const addresses=await lookup(u.hostname,{all:true});if(!addresses.length || addresses.some(a=>!publicIP(a.address)))throw Error('Research blocked a private or reserved network address');
  const chosen=addresses[0];
  const response=await new Promise((resolve,reject)=>{
    const req=https.request(u,{headers:{'User-Agent':'AgencyResearchBot/1.0 (manual approved research)','Accept':'text/html,text/plain'},lookup:(_h,options,cb)=>options.all?cb(null,[chosen]):cb(null,chosen.address,chosen.family)},res=>{
      let chunks=[],size=0;res.on('data',b=>{size+=b.length;if(size>limit){res.destroy();reject(Error('Research page exceeds size limit'));}else chunks.push(b);});
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString('utf8')}));res.on('error',()=>reject(Error('Research response interrupted')));
    });req.setTimeout(15000,()=>req.destroy(Error('Research timeout')));req.on('error',()=>reject(Error('Research network failure')));req.end();
  });
  if(response.status>=300&&response.status<400){if(redirects>=3 || !response.headers.location)throw Error('Research redirect limit');return safeFetch(new URL(response.headers.location,u).href,{lookup,limit,redirects:redirects+1,site});}
  return {...response,url:u.href};
}
export function robotsAllowed(text,pathname,agent='agencyresearchbot'){
  const groups=[];let group=null,hasRules=false;
  for(const line of text.split(/\r?\n/)){const [key,...rest]=line.split('#')[0].split(':');const value=rest.join(':').trim();if(!key)continue;
    if(key.trim().toLowerCase()==='user-agent'){if(!group || hasRules){group={agents:[],rules:[]};groups.push(group);hasRules=false;}group.agents.push(value.toLowerCase());}
    else if(group && ['allow','disallow'].includes(key.trim().toLowerCase())){hasRules=true;if(value)group.rules.push({allow:key.trim().toLowerCase()==='allow',path:value});}}
  const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&agent.includes(a)));const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
  const rules=selected.flatMap(g=>g.rules).filter(r=>{const end=r.path.endsWith('$');const pattern=r.path.replace(/\$$/,'').split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');return new RegExp('^'+pattern+(end?'$':'')).test(pathname);}).sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));
  return !rules.length || rules[0].allow;
}
export function htmlText(html){return cleanText(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g,s=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[s])).replace(/&#(x[0-9a-f]+|\d+);/gi,(_s,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return v<=0x10ffff?String.fromCodePoint(v):' ';}));}
export async function researchPages(website,{fetchPage=safeFetch}={}){
  const site=canonicalWebsite(website);const robots=await fetchPage(site+'/robots.txt');if(robots.status!==200 && robots.status!==404)throw Error('Could not verify robots permission');
  const pages=[];
  for(const route of ['/','/about','/contact']){
    if(robots.status===200&&!robotsAllowed(robots.text,route))continue;
    const r=await fetchPage(site+route);if(r.status!==200)continue;
    if(robots.status===200&&!robotsAllowed(robots.text,new URL(r.url).pathname))continue;
    if(!String(r.headers['content-type'] || '').match(/text\/(?:html|plain)/))continue;
    const text=htmlText(r.text).slice(0,18000);if(text.length<50)continue;
    const visibleEmails=[...text.matchAll(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}/gi)].map(m=>m[0].toLowerCase());
    const mailto=[...r.text.matchAll(/href\s*=\s*["']mailto:([^"'?\s]+)/gi)].map(m=>m[1].toLowerCase());
    pages.push({url:r.url,text,publicEmails:[...new Set([...visibleEmails,...mailto])]});
  }
  if(!pages.length)throw Error('Missing accessible permitted company evidence');return pages;
}
