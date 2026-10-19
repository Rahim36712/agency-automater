import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
export class LocalDB {
  constructor(file=':memory:'){this.db=new DatabaseSync(file);this.db.exec(fs.readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));}
  prepare(sql){const db=this.db;let values=[];return {bind(...args){values=args;return this;},async first(column){const row=db.prepare(sql).get(...values)||null;return column?row?.[column]||null:row;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){const result=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes)}};}};}
  close(){this.db.close();}
}
