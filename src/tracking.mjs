import crypto from 'node:crypto';
import { api,pixelUrl,TRACKING_HEADERS } from '../tracker/shared.mjs';
export class Tracker {
  constructor(c,{fetchImpl=fetch}={}){this.c=c;this.fetchImpl=fetchImpl;}
  call(route,args={}){return api(this.c.trackingUrl,this.c.trackingKey,route,{...args,fetchImpl:this.fetchImpl});}
  async register(lead,stage,subject){
    const operation_id=lead['Lead ID']+':'+stage,id='agency_'+crypto.createHash('sha256').update(operation_id).digest('hex');
    const data=await this.call('/api/messages',{method:'POST',body:{id,source:'agency',recipient:lead.Email,company:lead.Company||'',subject,operation_id,lead_id:lead['Lead ID']}});
    return {id,pixelUrl:pixelUrl(this.c.trackingUrl,data.record.pixel_token)};
  }
  confirm(op){return this.call('/api/messages/'+op.trackingId,{method:'PATCH',body:{action:'confirm',confirmation:'gmail_sent_verified',sent_at:op.sentDate}});}
  async records(){let records=[],cursor=null;do{const result=await this.call('/api/messages?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));records.push(...result.records);cursor=result.next_cursor;if(records.length>10000)throw Error('Tracking history exceeds 10,000 records. Clean up old records.');}while(cursor);return records;}
}
export { TRACKING_HEADERS };
