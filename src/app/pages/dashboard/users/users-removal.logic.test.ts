import test from 'node:test';
import assert from 'node:assert/strict';
import {
  displayInitials,
  displayName,
  hardDeleteHint,
  hardDeleteMatches,
  hardDeletePhrase,
  removalBlocked,
  removalDialog,
} from './users-removal.logic.ts';

const named = { _id: 'u1', firstname: 'Ada', lastname: 'Lovelace', email: 'Ada@Example.com', role: 'viewer' };
const blank = { _id: 'u2', firstname: ' ', lastname: '', email: '', role: 'viewer' };

test('blank accounts render as (no name) and confirm with DELETE', () => {
  assert.equal(displayName(blank), '(no name)');
  assert.equal(displayName({ firstname: null, lastname: null }), '(no name)');
  assert.equal(displayInitials(blank), '?');
  assert.equal(displayName(named), 'Ada Lovelace');
  assert.equal(displayInitials(named), 'AL');
  assert.equal(hardDeletePhrase(blank), 'DELETE');
  assert.equal(hardDeletePhrase(named), 'Ada@Example.com');
  assert.equal(hardDeleteMatches(blank, 'DELETE'), true);
  assert.equal(hardDeleteMatches(blank, 'delete'), false);
  assert.equal(hardDeleteMatches(named, 'ada@example.com'), true);
  assert.equal(hardDeleteMatches(named, 'DELETE'), false);
  assert.match(hardDeleteHint(blank), /DELETE/);
  assert.match(hardDeleteHint(named), /Ada@Example.com/);
});

test('dialogs use the Table Tennis Tube remove, restore, and delete wording', () => {
  const soft = removalDialog('soft', named);
  assert.equal(soft.title, 'Remove user');
  assert.equal(soft.confirm, 'Remove');
  assert.match(soft.body, /Removed tab/);
  assert.match(soft.body, /Ada Lovelace/);

  const blankSoft = removalDialog('soft', blank);
  assert.match(blankSoft.body, /\(no name\)/);

  const restore = removalDialog('restore', named);
  assert.equal(restore.title, 'Restore user');
  assert.equal(restore.confirm, 'Restore');
  assert.match(restore.body, /sign in again/);

  const hard = removalDialog('hard', blank);
  assert.equal(hard.title, 'Delete from database');
  assert.equal(hard.confirm, 'Delete permanently');
  assert.match(hard.body, /cannot be undone/);
  assert.match(hard.body, /\(no name\)/);
});

test('owners and the signed-in user cannot be removed', () => {
  assert.equal(removalBlocked(named, 'other', 'arul007rajmathy@gmail.com'), false);
  assert.equal(removalBlocked({ ...named, role: 'owner' }, 'other', 'arul007rajmathy@gmail.com'), true);
  assert.equal(removalBlocked(named, 'u1', 'arul007rajmathy@gmail.com'), true);
  assert.equal(
    removalBlocked(
      { _id: 'me', email: 'Arul007rajmathy@gmail.com', role: 'viewer' },
      'other',
      'arul007rajmathy@gmail.com',
    ),
    true,
  );
});
