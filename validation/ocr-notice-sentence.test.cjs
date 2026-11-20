'use strict';
/* 2026-11-21 (owner, STEINS;GATE: the tutorial 「【フォーントリガー】ボタンで携帯電話を呼び出して、…」 over the game's button legend; log 21:32:19
   「ocr line refused (a title or menu screen)」): a whole Japanese sentence among other rows is a notice to read and translate; a title or
   menu (START / LOAD / CONFIG, short labels) is still refused. */
const test = require('node:test'), assert = require('node:assert/strict');
const { HookNative } = require('../core/hook-native.cjs');
const refused = (text, others) => HookNative.prototype.ocrLineRefused.call({ ocr: { lastText: '', said: new Map() }, lastSource: '', engineDialog: false }, { text, others, rows: [{ x: 10, y: 10, w: 600, h: 30 }], sh: 720 }, Date.now());
test('the tutorial sentence of the log is taken', () => {
  assert.equal(refused('-。,ー【フーントリガー】ボタン【電話レンジ(仮)】に電話をかけましよう。で携帯', 5), '');
  assert.equal(refused('ボタン設定はシステムメニューのHELPで確認できます。', 4), '');
});
test('a title or menu screen is still refused', () => {
  assert.equal(refused('はじめから', 4), 'a title or menu screen');
  assert.equal(refused('項目選択スキップ', 3), 'a title or menu screen');
});
