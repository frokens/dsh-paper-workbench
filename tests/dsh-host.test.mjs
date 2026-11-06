import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectHost } from '../scripts/dsh-test-client.mjs';

function engine(request) {
  const child = spawnSync('runtime/osx-arm64/paper-docx', { input: JSON.stringify(request), encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  assert.ifError(child.error);
  const response = JSON.parse(child.stdout);
  assert.equal(response.ok, true, response.error);
  return response.result;
}

test('installed DSH Host shares durable actions without adding command messages to ordinary chat', { timeout: 30000 }, async () => {
  const rpc = await connectHost();
  await mkdir('.local/test-workspace', { recursive: true });
  const created = await rpc('session/create', { request: { cwd: resolve('.local/test-workspace') } });
  const agentId = created.sessionId;
  const action = request => rpc('paperWorkbench/userAction', { agentId, request });
  const before = await rpc('session/events', { request: { address: { kind: 'session', sessionId: agentId }, maxMessages: 20 } });
  assert.equal((await action({ action: 'read' })).paper, null);
  const fixture = engine({ action: 'fixture' });
  const imported = await action({ action: 'import', name: 'Host integration.docx', base64: fixture.base64 });
  const block = imported.paper.blocks[1], quote = 'The worker executes the operation.', from = block.text.lastIndexOf(quote);
  const request = { action: 'propose', requestId: crypto.randomUUID(), selection: { ...block.selection, quote, from, to: from + quote.length }, replacement: 'The executor runs the operation.', reason: 'Clarify execution ownership.' };
  const proposed = await action(request);
  assert.equal(proposed.paper.revision, 0);
  assert.equal(proposed.paper.candidates[0].status, 'pending');
  await assert.rejects(action({ ...request, requestId: crypto.randomUUID(), selection: { ...request.selection, quote: 'wrong source' } }), /does not match/);
  const accepted = await action({ action: 'decide', candidateId: proposed.paper.candidates[0].id, decision: 'accepted' });
  assert.equal(accepted.paper.revision, 1);
  const exported = await action({ action: 'export', tracked: true });
  const final = engine({ action: 'inspect', base64: exported.base64, revisionMode: 'accept' });
  const original = engine({ action: 'inspect', base64: exported.base64, revisionMode: 'reject' });
  assert.equal(final.blocks[1].text, accepted.paper.blocks[1].text);
  assert.equal(original.blocks[1].text, block.text);
  const reread = await action({ action: 'read' });
  assert.equal(reread.paper.decisions.length, 1);
  const after = await rpc('session/events', { request: { address: { kind: 'session', sessionId: agentId }, maxMessages: 20 } });
  assert.equal(after.cursor, before.cursor, 'Sidebar data operations must not write internal payloads into chat.');
  console.log('Validated one ordinary session, exact proposal/decision, native DOCX and unchanged chat cursor; no model call.');
});
