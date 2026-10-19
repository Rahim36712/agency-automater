export const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
export class ApiError extends Error {constructor(service,status){super(`${service} API failed (${status}). ${[401,403].includes(status)?'Check authorization and permissions.':status===429?'Quota exhausted; retry later.':'Check connectivity and service status.'}`);this.status=status;}}
export async function requestJson(url,{method='GET',headers={},body,fetchImpl=fetch,retries=2,service='Remote',timeout=30000,onAttempt=async()=>{}}={}) {
  for(let attempt=0;;attempt++){
    let response;
    await onAttempt();
    try {response=await fetchImpl(url,{method,headers:{...headers,...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error'});}
    catch { if(attempt<retries){await wait(Math.min(500*2**attempt,5000));continue;}throw Error(`${service} network failure or timeout`); }
    if(!response.ok){if(attempt<retries && (response.status===429 || response.status>=500)){const retry=Math.min(Number(response.headers.get('retry-after'))*1000 || 500*2**attempt,30000);await wait(retry);continue;}throw new ApiError(service,response.status);}
    if(response.status===204)return {};
    try{return await response.json();}catch{throw Error(`${service} returned invalid JSON`);}
  }
}
