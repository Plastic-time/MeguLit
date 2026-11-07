// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {ENGINES}=require('./engines.cjs');

// Persist ordinary settings only after the chosen provider and key have been accepted.
// Dependencies are supplied by the launcher; tests use an in-memory store only.
function saveTranslationSettings(request, {resolveOptions, service, secrets, persist}) {
  const options = resolveOptions(request);
  if (['gpt','deepseek'].includes(options.provider) || ENGINES[options.provider]?.kind === 'llm') {
    const model=String(options.model||'').trim();
    if (!model || model.length>200 || /[\r\n]/.test(model)) throw new Error('请填写有效的模型名');
  }
  if (request.apiKey && options.provider !== 'google') {
    secrets.set(options.baseUrl, request.apiKey);
    service.setKey(options.baseUrl, request.apiKey);
  }
  if (options.provider !== 'google' && !service.hasKey(options.baseUrl, options.provider)) {
    throw new Error('请填写 API Key，密钥由当前 Windows 账户加密保存');
  }
  if (request.settings) persist(request.settings);
  return options;
}

module.exports = {saveTranslationSettings};
