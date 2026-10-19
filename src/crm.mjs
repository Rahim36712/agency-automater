import { TRACKING_HEADERS } from '../tracker/shared.mjs';
export const HEADERS={
  LEADS:['Lead ID','Company','Website','Country','Contact Name','Contact Role','Email','Industry','Business Description','Verified Observations','Source URLs','Possible IT Opportunity','Recommended Service','Confidence','Score Inputs','Score Reviewed','Delivery Confirmed','Lead Score','Category','Score Explanation','Lead Status','Research Allowed','Contact Verified','Outreach Approved','Follow-up Allowed','Researched Date','Created Date','Last Error'],
  OUTREACH:['Operation ID','Lead ID','Email','Draft ID','Gmail Thread ID','Sent Message ID','Sent Date','Stage','Next Follow-up Date','Reply Status','Draft Status','Follow-up Allowed','Reference','Message-ID','Created Date'],
  SUPPRESSION:['Email','Reason','Suppression Date'],
  'ACTIVITY LOG':['Event ID','Timestamp','Workflow','Lead ID','Action','Outcome','Error'],
  REPORTS:['Date','New Leads Researched','Qualified Leads','Drafts Awaiting Review','Emails Actually Sent','Interested Responses','Follow-ups Due','Meetings Needing Attention','Workflow Errors'],
  TRACKING:TRACKING_HEADERS
};
export const KEYS={LEADS:'Lead ID',OUTREACH:'Operation ID',SUPPRESSION:'Email','ACTIVITY LOG':'Event ID',REPORTS:'Date',TRACKING:'Tracking ID'};
export function column(index){let s='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
export class CRM {
  constructor(google,id){if(!/^[a-zA-Z0-9_-]+$/.test(id || ''))throw Error('Set GOOGLE_SHEET_ID in .env');this.google=google;this.id=id;}
  async rows(tab){
    if(!HEADERS[tab])throw Error('Unknown CRM tab');
    const result=await this.google.call('sheets',`/spreadsheets/${this.id}/values/`+encodeURIComponent(`'${tab}'!A:${column(HEADERS[tab].length-1)}`));
    const values=result.values || [];
    if(JSON.stringify(values[0])!==JSON.stringify(HEADERS[tab]))throw Error(`CRM headers differ on ${tab}. Import templates/crm-template.xlsx and preserve row 1.`);
    return values.slice(1).map((r,i)=>({...Object.fromEntries(HEADERS[tab].map((h,j)=>[h,r[j] ?? ''])),_row:i+2})).filter(r=>r[KEYS[tab]] || (tab==='LEADS' && r.Website));
  }
  async upsert(tab,record){
    const key=KEYS[tab];if(!record[key])throw Error('CRM unique key missing');
    const rows=await this.rows(tab);const matches=rows.filter(r=>r[key]===record[key]);if(matches.length>1)throw Error(`Duplicate CRM keys on ${tab}; resolve manually`);
    const existing=matches[0],merged={...existing,...record};const values=[HEADERS[tab].map(h=>merged[h] ?? '')];
    const range=`'${tab}'!A${existing?existing._row:rows.reduce((m,r)=>Math.max(m,r._row),1)+1}:${column(HEADERS[tab].length-1)}${existing?existing._row:rows.reduce((m,r)=>Math.max(m,r._row),1)+1}`;
    // An explicit row PUT is idempotent on retries. Single helper writer owns updates.
    await this.google.call('sheets',`/spreadsheets/${this.id}/values/`+encodeURIComponent(range)+'?valueInputOption=RAW',{method:'PUT',body:{range,majorDimension:'ROWS',values}});
    return merged;
  }
  async updateInput(row,record){
    const range=`'LEADS'!A${row._row}:${column(HEADERS.LEADS.length-1)}${row._row}`;
    const fresh=await this.rows('LEADS');const target=fresh.find(r=>r._row===row._row);
    if(!target || target.Website!==row.Website)throw Error('Lead row moved during intake; retry');
    await this.google.call('sheets',`/spreadsheets/${this.id}/values/`+encodeURIComponent(range)+'?valueInputOption=RAW',{method:'PUT',body:{range,values:[HEADERS.LEADS.map(h=>record[h] ?? target[h] ?? '')]}});
  }
  async check({tracking=false}={}){const summary={};for(const tab of Object.keys(HEADERS).filter(t=>tracking||t!=='TRACKING'))summary[tab]=(await this.rows(tab)).length;return summary;}
}
