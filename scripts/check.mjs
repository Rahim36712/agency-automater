import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from '../src/config.mjs';
let count=0;
for(const dir of ['src','scripts','tests','tracker','extension']){for(const file of fs.readdirSync(path.join(root,dir))){if(/\.(?:mjs|js)$/.test(file)){const r=spawnSync(process.execPath,['--check',path.join(root,dir,file)],{encoding:'utf8',windowsHide:true});if(r.status){console.error(r.stderr);process.exit(1);}count++;}}}
for(const file of fs.readdirSync(path.join(root,'workflows'))){const w=JSON.parse(fs.readFileSync(path.join(root,'workflows',file),'utf8'));if(w.active!==false)throw Error('Workflow must remain inactive');if(JSON.stringify(w).includes('gmail.send'))throw Error('Email sending node forbidden');}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'),'utf8'));if(manifest.manifest_version!==3||manifest.permissions.some(p=>!['storage','alarms'].includes(p)))throw Error('Unexpected extension permission');
for(const f of [manifest.background.service_worker,manifest.action.default_popup,manifest.options_page,...manifest.content_scripts.flatMap(s=>[...s.js,...s.css]),...Object.values(manifest.icons)])if(!fs.existsSync(path.join(root,'extension',f)))throw Error('Missing extension resource: '+f);
if(fs.readFileSync(path.join(root,'tracker/shared.mjs'),'utf8')!==fs.readFileSync(path.join(root,'extension/shared.mjs'),'utf8'))throw Error('Run npm run tracking:build to refresh extension shared rules');
console.log(`Syntax checked ${count} JavaScript files; workflow JSON inactive; extension manifest/resources checked.`);
