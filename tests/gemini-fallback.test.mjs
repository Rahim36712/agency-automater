import test from 'node:test';
import assert from 'node:assert/strict';
import { Gemini,draftSchema,geminiModels } from '../src/gemini.mjs';
import { harness,c,content } from './fixtures.mjs';

const settings={...c,geminiDaily:20,geminiInterval:1,geminiKey:'private-mock-key',freeConfirmed:true,model:'gemini-3.8-flash'};
const success=()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(content)}]}}]});
const modelFrom=url=>url.match(/models\/([^:]+):/)[1];

test('overload then quota exhaustion falls through lower models with identical structured requests',async t=>{
  const h=harness(t),calls=[],bodies=[];
  const g=new Gemini(settings,h.store,{fetchImpl:async(url,options)=>{
    calls.push(modelFrom(url));bodies.push(JSON.parse(options.body));
    return calls.length===1?new Response('private-mock-key',{status:503}):calls.length===2?new Response('{}',{status:429}):success();
  }});
  assert.deepEqual(await g.generate('email-drafting',{company:'Owned test'},draftSchema),content);
  assert.deepEqual(calls,['gemini-3.8-flash','gemini-3.5-flash-lite','gemini-3.1-flash-lite']);
  assert.deepEqual(bodies[0],bodies[1]);assert.deepEqual(bodies[1],bodies[2]);
  assert.equal(h.store.get('gemini-budget').count,3);
  assert.equal(h.store.get('gemini-last-model'),'gemini-3.1-flash-lite');
  assert.ok(!JSON.stringify(h.store.events()).includes('private-mock-key'));
  assert.equal(h.store.events().at(-1).Outcome,'success');
});

test('cooldown survives a new client and preferred model is probed again after recovery time',async t=>{
  const h=harness(t),calls=[];let now=Date.now(),primaryFailed=false;
  const options={now:()=>now,fetchImpl:async url=>{const model=modelFrom(url);calls.push(model);if(!primaryFailed){primaryFailed=true;return new Response('{}',{status:503});}return success();}};
  await new Gemini(settings,h.store,options).generate('email-drafting',{},draftSchema);
  await new Gemini(settings,h.store,options).generate('email-drafting',{},draftSchema);
  assert.deepEqual(calls,['gemini-3.8-flash','gemini-3.5-flash-lite','gemini-3.5-flash-lite']);
  now+=300001;
  await new Gemini(settings,h.store,options).generate('email-drafting',{},draftSchema);
  assert.equal(calls.at(-1),'gemini-3.8-flash');
  assert.equal(h.store.get('gemini-model-health')['gemini-3.8-flash'],undefined);
});

test('all unavailable models produce a clear bounded failure and subsequent calls respect cooldown',async t=>{
  const h=harness(t);let calls=0;
  const g=new Gemini(settings,h.store,{fetchImpl:async()=>{calls++;return new Response('sensitive-provider-body',{status:503});}});
  for(let i=0;i<2;i++)await assert.rejects(()=>g.generate('email-drafting',{},draftSchema),error=>error.message.includes('No AI content was produced')&&!error.message.includes('503')&&!error.message.includes('sensitive'));
  assert.equal(calls,3);assert.equal(h.store.get('gemini-budget').count,3);
});

test('model switching cannot bypass the global persisted daily cap',async t=>{
  const h=harness(t);let calls=0;
  const g=new Gemini({...settings,geminiDaily:2},h.store,{fetchImpl:async()=>{calls++;return new Response('{}',{status:503});}});
  await assert.rejects(()=>g.generate('email-drafting',{},draftSchema),/daily cap/);
  assert.equal(calls,2);assert.equal(h.store.get('gemini-budget').count,2);
  assert.equal(h.store.get('gemini-model-health')['gemini-3.1-flash-lite'],undefined);
});

test('bad input and authorization errors never trigger model switching',async t=>{
  for(const status of [400,401,403]){
    const h=harness(t);let calls=0;
    const g=new Gemini(settings,h.store,{fetchImpl:async()=>{calls++;return new Response('private-mock-key',{status});}});
    await assert.rejects(()=>g.generate('email-drafting',{},draftSchema),error=>error.status===status&&!error.message.includes('private-mock-key'));
    assert.equal(calls,1);assert.equal(h.store.get('gemini-model-health'),null);
  }
});

test('blocked, malformed and invalid JSON responses cannot be hidden by fallback',async t=>{
  for(const response of [()=>Response.json({candidates:[{finishReason:'SAFETY'}]}),()=>new Response('not JSON'),()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'invalid JSON'}]}}]})]){
    const h=harness(t);let calls=0;
    const g=new Gemini(settings,h.store,{fetchImpl:async()=>{calls++;return response();}});
    await assert.rejects(()=>g.generate('email-drafting',{},draftSchema),/blocked|invalid JSON/);
    assert.equal(calls,1);
  }
});

test('network failures and missing models can fall back, with missing-model cooldown longer',async t=>{
  const h=harness(t);let calls=0;
  const now=Date.now();const g=new Gemini(settings,h.store,{now:()=>now,fetchImpl:async()=>{calls++;if(calls===1)throw Error('private network detail');return calls===2?new Response('{}',{status:404}):success();}});
  assert.deepEqual(await g.generate('email-drafting',{},draftSchema),content);
  const health=h.store.get('gemini-model-health');
  assert.equal(health['gemini-3.8-flash'].retryAt,now+300000);
  assert.equal(health['gemini-3.5-flash-lite'].retryAt,now+3600000);
  assert.ok(!JSON.stringify(h.store.events()).includes('private network detail'));
});

test('a configured lower model never escalates to a higher or unknown model',async t=>{
  assert.deepEqual(geminiModels('gemini-3.5-flash-lite'),['gemini-3.5-flash-lite','gemini-3.1-flash-lite']);
  assert.deepEqual(geminiModels('gemini-3.1-flash-lite'),['gemini-3.1-flash-lite']);
  assert.deepEqual(geminiModels('unknown-paid-model'),[]);
  const h=harness(t),calls=[];
  const g=new Gemini({...settings,model:'gemini-3.5-flash-lite'},h.store,{fetchImpl:async url=>{calls.push(modelFrom(url));return new Response('{}',{status:429});}});
  await assert.rejects(()=>g.generate('email-drafting',{},draftSchema),/temporarily unavailable/);
  assert.deepEqual(calls,['gemini-3.5-flash-lite','gemini-3.1-flash-lite']);
});

test('an all-model outage creates no Gmail draft or outreach intent',async t=>{
  const h=harness(t);h.engine.gemini=new Gemini(settings,h.store,{fetchImpl:async()=>new Response('{}',{status:503})});
  await h.engine.run('drafts');
  assert.equal(h.creates,0);assert.equal(h.store.operations().length,0);
  assert.match(h.crm.tabs.LEADS[0]['Last Error'],/No AI content was produced/);
});

test('the connection test reports the real selected fallback model without creating mail',async t=>{
  const h=harness(t);let calls=0;
  h.engine.gemini=new Gemini(settings,h.store,{fetchImpl:async()=>++calls===1?new Response('{}',{status:503}):success()});
  const result=await h.engine.run('gemini-test');
  assert.deepEqual(result,{...content,model:'gemini-3.5-flash-lite'});
  assert.equal(h.creates,0);assert.equal(h.store.operations().length,0);
});
