import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonRepository } from '../apps/desktop/main/adapters/json-repository';
import { Store } from '../packages/core/store';
test('atomic persistence survives restart, serializes updates, recovers backup', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-test-'));
  const repository = new JsonRepository(directory);
  const store = new Store((await repository.load()).state, repository);
  await Promise.all([store.update(s => { s.preferences.muted = true; }), store.update(s => { s.preferences.reduceMotion = true; })]);
  const recovered = (await new JsonRepository(directory).load()).state;
  assert.equal(recovered.revision, 2); assert.equal(recovered.preferences.muted, true); assert.equal(recovered.preferences.reduceMotion, true);
  await fs.writeFile(path.join(directory, 'state.json'), 'interrupted');
  const backup = await repository.load(); assert.equal(backup.state.revision, 1); assert.match(backup.notice!, /Recovered/);
});
test('unknown schema versions and unrecoverable corruption are preserved', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dopamigo-test-'));
  const repository = new JsonRepository(directory);
  await fs.writeFile(path.join(directory, 'state.json'), '{"version":99}');
  await assert.rejects(repository.load(), /Unsupported/);
  await fs.writeFile(path.join(directory, 'state.json'), 'damaged');
  await assert.rejects(repository.load(), /preserved/);
});
