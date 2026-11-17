import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function client() {
  const socket = new EventEmitter();
  const exports: any = {};
  const code = ts.transpileModule(readFileSync('frontend/src/services/socket.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, require: () => ({ io: () => socket }), setTimeout, clearTimeout, console });
  exports.getSocket();
  return { socket, wait: exports.waitForCommandAck };
}

test('ACK received before the HTTP response is still matched by cmd_id', async () => {
  const { socket, wait } = client();
  socket.emit('command_ack', { cmd_id: 'mine', status: 'SUCCESS' });
  const ack = await wait('mine');
  assert.equal(ack.status, 'SUCCESS');
});

test('other commands cannot complete a pending request', async () => {
  const { socket, wait } = client();
  let completed = false;
  const pending = wait('mine').then(() => { completed = true; });
  socket.emit('command_ack', { cmd_id: 'other', status: 'SUCCESS' });
  await Promise.resolve(); assert.equal(completed, false);
  socket.emit('command_ack', { cmd_id: 'mine', status: 'SUCCESS' });
  await pending; assert.equal(completed, true);
});

test('failure and missing ACK produce errors and clean up listeners', async () => {
  const { socket, wait } = client();
  const baseline = socket.listenerCount('command_ack');
  const failed = wait('failed');
  socket.emit('command_ack', { cmd_id: 'failed', status: 'FAILED', message: 'NVS save failed' });
  await assert.rejects(failed, /NVS save failed/);
  await assert.rejects(wait('missing', 5), /xác nhận/);
  assert.equal(socket.listenerCount('command_ack'), baseline);
});
