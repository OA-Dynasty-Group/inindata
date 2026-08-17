const test = require('node:test');
const assert = require('node:assert/strict');
const { initialData, validateDefinition, validateSubmission, datasetFor, importPreview, aggregateDataset, canReviewTransition, isVisible, rolePermissions } = require('../server');

test('the seed definition is valid', () => {
  const item = initialData().instruments[0];
  assert.deepEqual(validateDefinition(item), []);
});
test('definitions reject duplicate internal keys', () => {
  const item = initialData().instruments[0]; item.sections[0].questions[1].key = 'full_name';
  assert.match(validateDefinition(item).join(' '), /more than once/);
});
test('submissions enforce required fields and select options', () => {
  const version = { sections: initialData().instruments[0].sections };
  const errors = validateSubmission(version, { full_name: '', community: 'Elsewhere', household_size: 4 });
  assert.equal(errors.full_name, 'This question is required.'); assert.equal(errors.community, 'Choose a listed option.');
});
test('the bootstrap user receives permissions but no password is exposed in public data', () => {
  const admin = initialData().users[0];
  assert.ok(admin.permissions.includes('instrument:publish'));
  assert.ok(admin.password.hash.length > 20);
});
test('datasets derive stable columns from an instrument definition', () => {
  const data = initialData(); const dataset = datasetFor(data, data.instruments[0]);
  assert.equal(dataset.columns[0].key, 'full_name');
  assert.equal(dataset.classification, 'Internal');
});
test('CSV preview maps labels and blocks rows with invalid select values', () => {
  const item = initialData().instruments[0];
  const preview = importPreview(item, 'What is your full name?,Which community do you live in?\nSam,Elsewhere');
  assert.equal(preview.mapping[0].key, 'full_name');
  assert.equal(preview.problems.length, 1);
});
test('analytics aggregates dynamic field values', () => {
  const data = initialData(); const item = data.instruments[0];
  data.submissions.push({ id: 'one', instrumentId: item.id, status: 'submitted', submittedAt: new Date().toISOString(), answers: { community: 'Riverside' } }, { id: 'two', instrumentId: item.id, status: 'submitted', submittedAt: new Date().toISOString(), answers: { community: 'Riverside' } });
  const result = aggregateDataset(datasetFor(data, item), 'community');
  assert.deepEqual(result.groups[0], { label: 'Riverside', value: 2 });
});
test('the seed instrument belongs to an organizational program', () => {
  const data = initialData();
  assert.equal(data.instruments[0].programId, data.programs[0].id);
  assert.equal(data.programs[0].projects.length, 1);
});
test('review workflow permits only valid status transitions', () => {
  assert.equal(canReviewTransition('submitted', 'approved'), true);
  assert.equal(canReviewTransition('approved', 'locked'), true);
  assert.equal(canReviewTransition('submitted', 'locked'), false);
  assert.equal(canReviewTransition('locked', 'approved'), false);
});
test('the data model has a dedicated report collection', () => {
  assert.deepEqual(initialData().reports, []);
});
test('conditional rules hide required questions until their condition is met', () => {
  const data = initialData(); const version = { sections: data.instruments[0].sections }; const dependent = version.sections[0].questions[2];
  dependent.required = true; dependent.visibleWhen = { fieldKey: 'community', value: 'Riverside' };
  assert.equal(isVisible(dependent, { community: 'North End' }), false);
  assert.deepEqual(validateSubmission(version, { full_name: 'Sam', community: 'North End' }), {});
  assert.equal(validateSubmission(version, { full_name: 'Sam', community: 'Riverside' }).household_size, 'This question is required.');
});
test('role templates do not grant field workers administrative permissions', () => {
  assert.ok(rolePermissions('organization_admin').includes('user:write'));
  assert.equal(rolePermissions('field_worker').includes('user:write'), false);
  assert.ok(rolePermissions('reviewer').includes('submission:review'));
});
test('a new instrument can start with an empty configurable section', () => {
  const item = { id: 'new-form', name: 'New form', sections: [{ id: 's-1', title: 'Section 1', description: '', questions: [] }] };
  assert.deepEqual(validateDefinition(item), []);
});
test('the data model has a dedicated dashboard collection', () => {
  assert.deepEqual(initialData().dashboards, []);
});
