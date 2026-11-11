'use strict';
const {normalizeBase}=require('./providers.cjs');
function cleanPreferences(value = {}) {
  const result = {};
  if (typeof value.font === 'string' && value.font.length < 100) result.font = value.font;
  if (Number.isFinite(value.size) && value.size >= 10 && value.size <= 60) result.size = value.size;
  if (value.color === '' || /^#[0-9a-f]{6}$/i.test(value.color)) result.color = value.color;
  if (typeof value.bold === 'boolean') result.bold = value.bold;
  if (typeof value.enabled === 'boolean') result.enabled = value.enabled;
  if (typeof value.transparent === 'boolean') result.transparent = value.transparent;
  if (['google', 'gpt', 'deepseek', 'bing', 'deepl'].includes(value.provider) || Object.hasOwn(require('./engines.cjs').ENGINES, value.provider)) result.provider = value.provider;
  if (typeof value.region === 'string' && /^[a-z0-9-]{0,60}$/i.test(value.region)) result.region = value.region;
  if (['free','pro'].includes(value.deeplTier)) result.deeplTier = value.deeplTier;
  if (typeof value.contextEnabled === 'boolean') result.contextEnabled = value.contextEnabled;
  if (typeof value.scriptTranslation === 'boolean') result.scriptTranslation = value.scriptTranslation;
  if (typeof value.scriptColdRun === 'boolean') result.scriptColdRun = value.scriptColdRun;
  if (['zh','en'].includes(value.learnerLanguage)) result.learnerLanguage=value.learnerLanguage;
  if (['machine','follow','local'].includes(value.reviewEngine)) result.reviewEngine=value.reviewEngine;
  if (['sudachi','unidic'].includes(value.readingEngine)) result.readingEngine=value.readingEngine;
  if (Number.isFinite(value.contextLines)) result.contextLines = Math.max(1,Math.min(8,Math.round(value.contextLines)));
  // One bad field must not discard every other saved setting.
  if (typeof value.baseUrl === 'string') try { result.baseUrl = normalizeBase(value.baseUrl); } catch {}
  if (typeof value.model === 'string' && value.model.length < 201 && !/[\r\n]/.test(value.model)) result.model = value.model.trim();
  if(typeof value.themeColor==='string'&&/^#[0-9a-f]{6}$/i.test(value.themeColor))result.themeColor=value.themeColor;
  try { Object.assign(result,require('./lookup-models.cjs').cleanLookup(value)); }
  catch { const {lookupProfiles,...rest}=value; try { Object.assign(result,require('./lookup-models.cjs').cleanLookup(rest)); } catch {} }
  return result;
}
module.exports={cleanPreferences};
