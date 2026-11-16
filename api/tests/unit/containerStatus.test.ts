// Unit tests for the shared container status rules (#213). Pure — no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isOpenContainer, canCancelFullCase, canCancelSspMaster, containerStatusLabel,
  PRQ_STATUS_FILTERS, isContainerStatus,
} from '../../../shared/containerStatus.js';

test('open = AVAILABLE or PRINTED only', () => {
  assert.equal(isOpenContainer('AVAILABLE'), true);
  assert.equal(isOpenContainer('PRINTED'), true);
  for (const s of ['PULLED', 'PACKED', 'CANCELED', 'DIVERTED', 'PURGED', 'VERIFIED']) assert.equal(isOpenContainer(s), false);
});

test('"Verified" is stored as PULLED', () => {
  assert.equal(PRQ_STATUS_FILTERS.VERIFIED, 'PULLED');
  assert.equal(containerStatusLabel('PULLED'), 'VERIFIED');
  assert.equal(containerStatusLabel('PRINTED'), 'PRINTED');
  assert.equal(isContainerStatus('VERIFIED'), false);
});

test('cancel eligibility per type', () => {
  assert.equal(canCancelFullCase('AVAILABLE'), true);
  assert.equal(canCancelFullCase('PULLED'), true);
  assert.equal(canCancelFullCase('PRINTED'), false);
  assert.equal(canCancelFullCase('DIVERTED'), false);
  assert.equal(canCancelSspMaster('PRINTED'), true);
  assert.equal(canCancelSspMaster('PARTIALLY_PACKED'), true);
  assert.equal(canCancelSspMaster('PACKED'), false);
});
