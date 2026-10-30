import assert from 'node:assert/strict'
import test from 'node:test'
import { inject } from '../index.js'

test('host bundle declares every context service it reads directly', () => {
  // Regression: reading a context service without declaring it makes the whole
  // bundle fail activation with `cannot get property ... without inject`.
  assert.deepEqual(inject, ['scheduleCore', 'connection', 'scheduleCommands', 'timer'])
})
