// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {normalizeBase,resolveOptions}=require('./providers.cjs');
const presets={deepseek:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},gemini:{baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',model:''},gpt:{baseUrl:'https://api.openai.com/v1',model:'gpt-4.1-mini'}};
function cleanLookup(value={}){const provider=['local','follow','deepseek','gemini','gpt'].includes(value.lookupProvider)?value.lookupProvider:'local',profiles={};for(const [name,preset]of Object.entries(presets)){const input=value.lookupProfiles?.[name]||{};let baseUrl=name==='gpt'&&typeof input.baseUrl==='string'?normalizeBase(input.baseUrl):preset.baseUrl;let model=typeof input.model==='string'&&input.model.length<201&&!/[\r\n]/.test(input.model)?input.model.trim():preset.model;profiles[name]={baseUrl,model};}return {lookupProvider:provider,lookupProfiles:profiles};}
function lookupOptions(settings,main={}){const value=cleanLookup(settings);if(value.lookupProvider==='local')return null;if(value.lookupProvider==='follow')return resolveOptions(main);const p=value.lookupProfiles[value.lookupProvider];return resolveOptions({...main,provider:value.lookupProvider==='deepseek'?'deepseek':'gpt',baseUrl:p.baseUrl,model:p.model});}
module.exports={cleanLookup,lookupOptions,presets};
