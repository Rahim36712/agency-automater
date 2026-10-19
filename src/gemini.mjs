import fs from 'node:fs';
import path from 'node:path';
import { ApiError,requestJson,wait } from './http.mjs';
import { approvedSubjects,approvedIntroductions,approvedQuestions } from './domain.mjs';
// Standard text generation has a documented free tier (checked 2026-10-13).
export const APPROVED_GEMINI_MODELS=['gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-3.8-flash'];
const MODEL_ORDER=['gemini-3.8-flash','gemini-3.5-flash-lite','gemini-3.1-flash-lite'];
export function geminiModels(primary){const index=MODEL_ORDER.indexOf(primary);return index<0?[]:MODEL_ORDER.slice(index);}
function fallbackError(error){return error instanceof ApiError && (error.status===404 || error.status===429 || error.status>=500) || error.message==='Gemini network failure or timeout';}
export const researchSchema={type:'OBJECT',properties:{company:{type:'STRING'},country:{type:'STRING'},industry:{type:'STRING'},opportunity:{type:'STRING'},service:{type:'STRING'},confidence:{type:'STRING',enum:['low','medium','high']},observations:{type:'ARRAY',items:{type:'OBJECT',properties:{quote:{type:'STRING'},url:{type:'STRING'}},required:['quote','url']}},scoreEvidence:{type:'ARRAY',items:{type:'OBJECT',properties:{dimension:{type:'STRING',enum:['relevance','need','decisionMaker','budget','timing']},points:{type:'INTEGER'},reason:{type:'STRING'},quote:{type:'STRING'},url:{type:'STRING'}},required:['dimension','points','reason','quote','url']}}},required:['company','country','industry','opportunity','service','confidence','observations','scoreEvidence']};
export const draftSchema={type:'OBJECT',properties:{subject:{type:'STRING',enum:approvedSubjects},introduction:{type:'STRING',enum:approvedIntroductions},question:{type:'STRING',enum:approvedQuestions}},required:['subject','introduction','question']};
export const replySchema={type:'OBJECT',properties:{classification:{type:'STRING',enum:['Interested','Meeting requested','Needs more information','Not interested','Opt-out','Uncertain / manual review']},reason:{type:'STRING'}},required:['classification','reason']};
export function geminiJson(response){
  const candidate=response?.candidates?.[0];if(!candidate || candidate.finishReason!=='STOP')throw Error('Gemini response empty, blocked or truncated');
  const text=(candidate.content?.parts || []).filter(p=>!p.thought && typeof p.text==='string').map(p=>p.text).join('');
  if(!text.trim())throw Error('Gemini returned empty text');
  let result;try{result=JSON.parse(text);}catch{throw Error('Gemini returned invalid JSON');}if(!result || typeof result!=='object' || Array.isArray(result))throw Error('Gemini JSON must be an object');return result;
}
export class Gemini {
  constructor(c,store,{fetchImpl=fetch,now=Date.now}={}){this.c=c;this.store=store;this.fetch=fetchImpl;this.now=now;}
  async reserve(){
    // Count every attempt, including retries, before the request. Conservative rolling 24h budget.
    let state=this.store.get('gemini-budget',{start:Date.now(),count:0,last:0});if(Date.now()-state.start>=86400000)state={start:Date.now(),count:0,last:state.last};
    if(state.count>=this.c.geminiDaily)throw Error('Local Gemini daily cap reached; wait for the rolling 24h reset');
    await wait(Math.max(0,state.last+this.c.geminiInterval-Date.now()));state.count++;state.last=Date.now();this.store.set('gemini-budget',state);
  }
  async generate(promptName,input,schema){
    if(!this.c.geminiKey || !this.c.freeConfirmed)throw Error('Set Gemini key and confirm Free tier in .env before API use');
    if(!APPROVED_GEMINI_MODELS.includes(this.c.model))throw Error('Use an approved free-tier Gemini model: '+APPROVED_GEMINI_MODELS.join(', '));
    const prompt=fs.readFileSync(path.join(this.c.root,'prompts',promptName+'.txt'),'utf8');
    const body={systemInstruction:{parts:[{text:prompt}]},contents:[{role:'user',parts:[{text:JSON.stringify(input)}]}],generationConfig:{temperature:0.2,maxOutputTokens:3000,responseFormat:{text:{mimeType:'APPLICATION_JSON',schema:jsonSchema(schema)}}}};
    const models=geminiModels(this.c.model),health=this.store.get('gemini-model-health',{});
    for(const model of models){
      if(health[model]?.retryAt>this.now())continue;
      let result;
      try{result=await requestJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'x-goog-api-key':this.c.geminiKey},
        body,service:'Gemini',fetchImpl:this.fetch,retries:0,onAttempt:()=>this.reserve()});
      }catch(error){
        // Only availability failures move to a lower model. Authorization, local caps,
        // malformed output and blocked content must never be disguised as success.
        if(!fallbackError(error))throw error;
        health[model]={retryAt:this.now()+(error.status===404?3600000:300000),status:error.status || 'network'};
        this.store.set('gemini-model-health',health);
        this.store.event({Workflow:'gemini','Lead ID':'',Action:`Model unavailable: ${model}`,Outcome:'error',Error:`${error.status || 'network'}; lower approved models will be tried`});
        continue;
      }
      const content=geminiJson(result);
      delete health[model];this.store.set('gemini-model-health',health);this.store.set('gemini-last-model',model);
      if(model!==this.c.model)this.store.event({Workflow:'gemini','Lead ID':'',Action:`Free-tier fallback selected: ${model}`,Outcome:'success',Error:''});
      return content;
    }
    const retryAt=Math.min(...models.map(model=>health[model]?.retryAt || this.now()));
    throw Error(`Gemini is temporarily unavailable across the approved free-tier models. No AI content was produced. Try again in about ${Math.max(1,Math.ceil((retryAt-this.now())/60000))} minute(s).`);
  }
}
export function jsonSchema(schema){
  if(Array.isArray(schema))return schema.map(jsonSchema);if(!schema || typeof schema!=='object')return schema;
  return Object.fromEntries(Object.entries(schema).map(([k,v])=>[k,k==='type'&&typeof v==='string'?v.toLowerCase():jsonSchema(v)]));
}
