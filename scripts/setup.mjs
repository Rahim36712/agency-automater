import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { root } from '../src/config.mjs';
if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('Install Node.js 24 LTS first.');
fs.mkdirSync(path.join(root,'.data'),{recursive:true});
const envPath=path.join(root,'.env');
if (!fs.existsSync(envPath)) {
  const template=fs.readFileSync(path.join(root,'.env.example'),'utf8');
  fs.writeFileSync(envPath,template.replace('HELPER_TOKEN=','HELPER_TOKEN='+crypto.randomBytes(32).toString('hex')),{mode:0o600});
  console.log('Created .env with a private helper token. Fill in the Google and sender fields locally.');
} else console.log('.env already exists; preserved.');
console.log('Next: npm run doctor. Setup does not connect accounts or enable workflows.');
