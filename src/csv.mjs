export function parseCSV(text){
  const records=[];let row=[],cell='',quoted=false;
  text=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted && text[i+1]==='"'){cell+='"';i++;}else if(quoted || !cell)quoted=!quoted;else throw Error('Malformed CSV quotes');}
    else if(!quoted && ch===','){row.push(cell);cell='';}
    else if(!quoted && (ch==='\n'||ch==='\r')){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))records.push(row);row=[];cell='';}
    else cell+=ch;
  }
  if(quoted)throw Error('Unclosed CSV quote');if(cell||row.length){row.push(cell);records.push(row);}if(!records.length)throw Error('Empty CSV');
  const headers=records.shift().map(h=>h.trim());if(!headers.includes('Website') || new Set(headers).size!==headers.length)throw Error('CSV needs unique headers including Website');
  return records.map(r=>{if(r.length!==headers.length)throw Error('CSV column count differs');return Object.fromEntries(headers.map((h,i)=>[h,r[i].trim()]));});
}
export function csvText(headers,rows=[]){return [headers,...rows.map(r=>headers.map(h=>r[h]??''))].map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';}
