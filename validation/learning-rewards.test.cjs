'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const rewards = require('../services/learning-rewards.cjs');

test('retrying a failed album write awards the answer once', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const answer = { kind: 'answer', line: { origin: 'history', text: '雨が降る。' } };
  rewards.ensure(db);
  db.exec("CREATE TEMP TRIGGER reject_line BEFORE INSERT ON learning_album BEGIN SELECT RAISE(ABORT, 'album write failed'); END");
  rewards.add(db, { kind: 'practice' });
  db.exec('BEGIN');
  assert.throws(() => rewards.add(db, answer), /album write failed/);
  assert.equal(rewards.state(db).mana, 15);
  assert.equal(rewards.album(db).length, 0);
  db.exec('DROP TRIGGER reject_line');
  const retry = rewards.add(db, answer);
  assert.equal(retry.mana, 20);
  assert.equal(retry.collected, true);
  assert.equal(retry.album, 1);
  db.exec('ROLLBACK');
  assert.equal(rewards.state(db).mana, 15);
  assert.equal(rewards.album(db).length, 0);
});
