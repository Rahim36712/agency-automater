import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export class Store {
  constructor(directory) {
    fs.mkdirSync(directory,{recursive:true});this.db=new DatabaseSync(path.join(directory,'journal.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS suppression(email TEXT PRIMARY KEY,reason TEXT NOT NULL,date TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations(key TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,task TEXT NOT NULL,status TEXT NOT NULL,result TEXT,created TEXT NOT NULL);
    `);
    this.db.prepare("UPDATE jobs SET status='interrupted' WHERE status='running'").run();
  }
  close(){this.db.close();}
  get(key,fallback=null){const r=this.db.prepare('SELECT value FROM kv WHERE key=?').get(key);return r?JSON.parse(r.value):fallback;}
  set(key,value){this.db.prepare('INSERT OR REPLACE INTO kv VALUES(?,?)').run(key,JSON.stringify(value));}
  suppress(email,reason){this.db.prepare('INSERT OR IGNORE INTO suppression VALUES(?,?,?)').run(email.toLowerCase(),reason,new Date().toISOString());}
  suppression(){return this.db.prepare('SELECT email AS Email,reason AS Reason,date AS "Suppression Date" FROM suppression').all();}
  operation(key){const r=this.db.prepare('SELECT data FROM operations WHERE key=?').get(key);return r?JSON.parse(r.data):null;}
  operations(){return this.db.prepare('SELECT data FROM operations').all().map(r=>JSON.parse(r.data));}
  saveOperation(op){this.db.prepare('INSERT OR REPLACE INTO operations VALUES(?,?)').run(op.key,JSON.stringify(op));}
  beginOperation(lead,stage,email){
    const key=`${lead}:${stage}`;if(this.operation(key))throw Error('Outreach operation already exists');
    const reference='ag-'+crypto.randomUUID();const op={key,lead,stage,email,reference,messageId:`<${reference}@agency-automation.local>`,createdAt:new Date().toISOString(),state:'prepared'};
    this.db.prepare('INSERT INTO operations VALUES(?,?)').run(key,JSON.stringify(op));return op;
  }
  message(id){const r=this.db.prepare('SELECT data FROM messages WHERE id=?').get(id);return r?JSON.parse(r.data):null;}
  saveMessage(id,data){this.db.prepare('INSERT OR REPLACE INTO messages VALUES(?,?)').run(id,JSON.stringify(data));}
  event(data){const row={'Event ID':data['Event ID'] || crypto.randomUUID(),Timestamp:new Date().toISOString(),...data};this.db.prepare('INSERT OR IGNORE INTO events VALUES(?,?)').run(row['Event ID'],JSON.stringify(row));return row;}
  events(){return this.db.prepare('SELECT data FROM events ORDER BY rowid').all().map(r=>JSON.parse(r.data));}
  job(task){const id=crypto.randomUUID();this.db.prepare('INSERT INTO jobs VALUES(?,?,?,NULL,?)').run(id,task,'queued',new Date().toISOString());return id;}
  jobStatus(id){return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);}
  nextJob(){return this.db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY rowid LIMIT 1").get();}
  finishJob(id,status,result){this.db.prepare('UPDATE jobs SET status=?,result=? WHERE id=?').run(status,JSON.stringify(result),id);}
}
