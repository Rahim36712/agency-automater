import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { root,loadEnv } from '../src/config.mjs';
loadEnv();const file=path.join(root,'.env');if(!fs.existsSync(file))throw Error('Run npm run setup first.');
if(process.env.TRACKING_ADMIN_TOKEN&&!/^[a-f0-9]{64}$/.test(process.env.TRACKING_ADMIN_TOKEN))throw Error('TRACKING_ADMIN_TOKEN must be a 64-character hex key.');
let content=fs.readFileSync(file,'utf8');
const values={TRACKING_ENABLED:'false',TRACKING_URL:'',TRACKING_ADMIN_TOKEN:process.env.TRACKING_ADMIN_TOKEN||crypto.randomBytes(32).toString('hex'),CLOUDFLARE_ACCOUNT_ID:'',CLOUDFLARE_API_TOKEN:'',CLOUDFLARE_FREE_CONFIRMED:'false',TRACKING_WORKER_NAME:'agency-mail-tracker'};
for(const [key,value]of Object.entries(values)){const re=new RegExp('^'+key+'=.*$','m');if(re.test(content)){if(key==='TRACKING_ADMIN_TOKEN'&&!process.env.TRACKING_ADMIN_TOKEN)content=content.replace(re,key+'='+value);}else content+='\n'+key+'='+value;}
fs.writeFileSync(file,content.trimEnd()+'\n',{mode:0o600});console.log('Private tracker settings prepared in .env. No key printed. Tracking stays disabled until you enable it.');
