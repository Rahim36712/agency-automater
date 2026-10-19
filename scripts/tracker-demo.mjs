import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { root } from '../src/config.mjs';
import { LocalDB } from '../tracker/local-db.mjs';
const dir=path.join(root,'.data','tracker-dev');fs.mkdirSync(dir,{recursive:true});const DB=new LocalDB(path.join(dir,'local.sqlite'));
const ids=['demo_owned_agency_001','demo_owned_business_002','demo_owned_draft_003'];
try{
  for(const id of ids)DB.db.prepare('DELETE FROM tracked_messages WHERE id=?').run(id);
  if(!process.argv.includes('--clear')){
    const now=Date.now();for(let i=0;i<ids.length;i++){
      const sent=i===2?null:new Date(now-(i+1)*3600000).toISOString(),signal=i===0?new Date(now-1200000).toISOString():null;
      DB.db.prepare('INSERT INTO tracked_messages(id,pixel_token,recipient,subject,company,source,created_at,sent_at,arm_at,confirmation,state,first_fetch,last_fetch,image_requests) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(ids[i],crypto.randomBytes(32).toString('hex'),['partner@owned.example','hello@owned-business.example','test@owned.example'][i],['Demo · Development partnership','Demo · Python automation introduction','Demo · Draft awaiting your review'][i],['Owned Test Agency','Owned Test Business','Owned Account'][i],i===1?'agency':'extension',new Date(now-(i+2)*3600000).toISOString(),sent,sent?new Date(now-(i+1)*3600000+45000).toISOString():null,sent?'manual':'',sent?'confirmed':'draft',signal,signal,i===0?2:0);
    }
    console.log('Three clearly labelled synthetic records added to the isolated LOCAL preview. No emails sent or fetched.');
  }else console.log('Only the three synthetic local demo records were removed.');
}finally{DB.close();}
