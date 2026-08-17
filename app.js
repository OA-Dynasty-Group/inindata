// app.js — Core application logic

const state = App.state;
const $ = App.$;
const safe = App.ui.safe;
const toast = App.ui.toast;

let saveTimer;
let routerInitialized = false;

function initRouter() {
  if (routerInitialized) return;
  App.router.init();
  routerInitialized = true;
}

function save() {
  clearTimeout(saveTimer);
  $('#draftState').textContent = 'Draft \u00B7 Saving\u2026';
  saveTimer = setTimeout(async () => {
    try {
      const response = await fetch(`/api/instruments/${state.form.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: state.form.name, sections: state.form.sections })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.errors?.[0] || result.error);
      $('#draftState').textContent = 'Draft \u00B7 Saved just now';
    } catch (error) {
      $('#draftState').textContent = 'Draft \u00B7 Changes not saved';
      toast(error.message);
    }
  }, 450);
}

function question() {
  for (const s of state.form.sections) {
    const q = s.questions.find(x => x.id === state.selectedId);
    if (q) return q;
  }
}

function fieldMarkup(q) {
  let body = '';
  if (q.type === 'singleSelect' || q.type === 'multiSelect') {
    body = q.options.map(o => `<div class="choice">${o}</div>`).join('');
  } else if (q.type === 'yesNo') {
    body = '<div class="choice">Yes</div><div class="choice">No</div>';
  } else if (q.type === 'rating') {
    body = '<div class="fake-input">\u2605 \u2605 \u2605 \u2605 \u2605</div>';
  } else {
    body = `<div class="fake-input">${q.type === 'longText' ? 'Type your answer' : 'Answer'}</div>`;
  }
  return body;
}

function render() {
  $('#formName').value = state.form.name;
  $('#formSections').innerHTML = state.form.sections.map(s =>
    `<article class="form-section"><header class="section-title"><div><h2>${s.title}</h2><p>${s.description || ''}</p></div><button class="more">\u2022\u2022\u2022</button></header>${s.questions.map(q =>
      `<div class="question-card ${q.id === state.selectedId ? 'selected' : ''}" data-id="${q.id}"><span class="question-actions">\u2022\u2022\u2022</span><label>${q.label} ${q.required ? '<span class="req">*</span>' : ''}</label>${q.help ? `<small>${q.help}</small>` : ''}${fieldMarkup(q)}</div>`
    ).join('')}</article>`
  ).join('');
  document.querySelectorAll('.question-card').forEach(el => el.onclick = () => {
    state.selectedId = el.dataset.id;
    render();
    settings();
  });
  settings();
}

function settings() {
  const q = question();
  $('#settingsEmpty').hidden = !!q;
  $('#questionSettings').hidden = !q;
  if (!q) return;
  $('#questionLabel').value = q.label;
  $('#helpText').value = q.help;
  $('#answerType').value = q.type;
  $('#requiredInput').checked = q.required;
  const fields = state.form.sections.flatMap(section => section.questions).filter(item => item.id !== q.id);
  $('#logicField').innerHTML = `<option value="">Always show</option>${fields.map(item => `<option value="${item.key}">${item.label}</option>`).join('')}`;
  $('#logicField').value = q.visibleWhen?.fieldKey || '';
  $('#logicValue').value = q.visibleWhen?.value || '';
  const hasOptions = ['singleSelect', 'multiSelect'].includes(q.type);
  $('#optionsSettings').hidden = !hasOptions;
  if (hasOptions) {
    $('#optionInputs').innerHTML = q.options.map((o, i) =>
      `<div class="option-input"><input data-option="${i}" value="${o}"><button type="button" data-remove="${i}">\u00d7</button></div>`
    ).join('');
  }
  document.querySelectorAll('[data-option]').forEach(input => input.oninput = e => {
    q.options[+e.target.dataset.option] = e.target.value;
    save();
    render();
  });
  document.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {
    q.options.splice(+b.dataset.remove, 1);
    save();
    render();
  });
}

function newQuestion(type = 'shortText') {
  const index = state.form.sections.flatMap(s => s.questions).length + 1;
  const q = {
    id: 'q-' + Date.now(),
    key: `question_${index}`,
    type,
    label: `New ${App.typeNames[type].toLowerCase()} question`,
    help: '',
    required: false,
    visibleWhen: null,
    options: ['Option 1', 'Option 2']
  };
  if (!['singleSelect', 'multiSelect'].includes(type)) q.options = [];
  state.form.sections.at(-1).questions.push(q);
  state.selectedId = q.id;
  save();
  render();
}

$('#fieldTypes').onclick = e => {
  const b = e.target.closest('button');
  if (b) newQuestion(b.dataset.type);
};

$('#addQuestion').onclick = () => newQuestion();

$('#addSection').onclick = () => {
  state.form.sections.push({
    id: 'section-' + Date.now(),
    title: `Section ${state.form.sections.length + 1}`,
    description: '',
    questions: []
  });
  save();
  render();
};

$('#formName').oninput = e => {
  state.form.name = e.target.value;
  save();
};

$('#questionLabel').oninput = e => {
  question().label = e.target.value;
  save();
  render();
};

$('#helpText').oninput = e => {
  question().help = e.target.value;
  save();
  render();
};

$('#requiredInput').onchange = e => {
  question().required = e.target.checked;
  save();
  render();
};

$('#logicField').onchange = e => {
  const q = question();
  q.visibleWhen = e.target.value ? { fieldKey: e.target.value, value: $('#logicValue').value } : null;
  save();
  render();
};

$('#logicValue').oninput = e => {
  const q = question();
  if ($('#logicField').value) {
    q.visibleWhen = { fieldKey: $('#logicField').value, value: e.target.value };
    save();
  }
};

$('#clearLogic').onclick = () => {
  question().visibleWhen = null;
  save();
  render();
};

$('#answerType').onchange = e => {
  question().type = e.target.value;
  if (['singleSelect', 'multiSelect'].includes(e.target.value) && !question().options.length) {
    question().options = ['Option 1', 'Option 2'];
  }
  save();
  render();
};

$('#addOption').onclick = () => {
  question().options.push(`Option ${question().options.length + 1}`);
  save();
  render();
};

$('#deleteQuestion').onclick = () => {
  for (const s of state.form.sections) {
    s.questions = s.questions.filter(q => q.id !== state.selectedId);
  }
  state.selectedId = null;
  save();
  render();
};

$('#publishButton').onclick = async () => {
  try {
    const response = await fetch(`/api/instruments/${state.form.id}/publish`, { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.[0] || result.error);
    $('#draftState').textContent = `Published \u00B7 Version ${result.instrument.version}`;
    toast('Form published \u2014 collection link created.');
  } catch (error) {
    toast(error.message);
  }
};

$('#previewButton').onclick = () => toast('Preview mode will open in a new collection view.');

async function loadResponses() {
  const list = $('#responseList');
  try {
    const response = await fetch(`/api/instruments/${state.form.id}/submissions`);
    const records = await response.json();
    if (!response.ok) throw new Error(records.error);
    $('#responseCount').textContent = records.length;
    list.innerHTML = records.length ? records.map(record =>
      `<div class="response-row"><div><strong>${record.id.slice(0, 8).toUpperCase()}</strong><small>Submitted ${new Date(record.submittedAt).toLocaleString()} \u00B7 Version ${record.instrumentVersion} \u00B7 ${record.answerCount} answers</small></div><span class="response-status">${record.status}</span>${record.status === 'submitted' ? `<button data-review="approved" data-id="${record.id}">Approve</button><button class="reject" data-review="rejected" data-id="${record.id}">Reject</button>` : record.status === 'approved' ? `<button data-review="locked" data-id="${record.id}">Lock</button>` : ''}</div>`
    ).join('') : '<p class="response-empty">No responses have been submitted yet.</p>';
    document.querySelectorAll('[data-review]').forEach(button => button.onclick = async () => {
      const response = await fetch(`/api/submissions/${button.dataset.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: button.dataset.review })
      });
      const result = await response.json();
      if (!response.ok) return toast(result.error);
      toast(`Response ${result.status}.`);
      loadResponses();
    });
  } catch (error) {
    list.innerHTML = `<p class="response-empty">${error.message}</p>`;
  }
}

function renderDataset() {
  const query = $('#datasetSearch').value.trim().toLowerCase();
  const records = state.activeDataset.records.filter(record =>
    !query || Object.values(record.answers).flat().join(' ').toLowerCase().includes(query)
  );
  $('#datasetHead').innerHTML = `<tr><th>RESPONSE</th><th>STATUS</th><th>SUBMITTED</th>${state.activeDataset.columns.map(column => `<th>${safe(column.label)}</th>`).join('')}</tr>`;
  $('#datasetBody').innerHTML = records.length ? records.map(record =>
    `<tr><td>${safe(record.id.slice(0, 8).toUpperCase())}</td><td><span class="record-status">${safe(record.status)}</span></td><td>${safe(new Date(record.submittedAt).toLocaleDateString())}</td>${state.activeDataset.columns.map(column => `<td>${safe(Array.isArray(record.answers[column.key]) ? record.answers[column.key].join('; ') : record.answers[column.key])}</td>`).join('')}</tr>`
  ).join('') : `<tr><td class="dataset-empty" colspan="${state.activeDataset.columns.length + 3}">No matching responses.</td></tr>`;
}

async function loadDataset() {
  try {
    const response = await fetch(`/api/instruments/${state.form.id}/dataset`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    state.activeDataset = result;
    $('#datasetName').textContent = result.name;
    $('#datasetMeta').textContent = `${result.records.length} records \u00B7 ${result.columns.length} fields`;
    $('#exportCsv').href = `/api/instruments/${state.form.id}/dataset/export`;
    renderDataset();
  } catch (error) {
    $('#datasetBody').innerHTML = `<tr><td class="dataset-empty">${safe(error.message)}</td></tr>`;
  }
}

async function loadAnalytics() {
  try {
    if (!state.activeDataset) {
      const response = await fetch(`/api/instruments/${state.form.id}/dataset`);
      state.activeDataset = await response.json();
    }
    const picker = $('#dimensionSelect');
    if (!picker.options.length) {
      picker.innerHTML = state.activeDataset.columns.map(column =>
        `<option value="${safe(column.key)}">${safe(column.label)}</option>`
      ).join('');
    }
    const response = await fetch(`/api/instruments/${state.form.id}/analytics?dimension=${encodeURIComponent(picker.value)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    $('#chartTitle').textContent = `Responses by ${result.dimension.label}`;
    $('#chartTotal').textContent = `${result.total} total responses`;
    const empty = !result.groups.length;
    $('#chartEmpty').hidden = !empty;
    $('#barChart').hidden = empty;
    const max = Math.max(...result.groups.map(group => group.value), 1);
    $('#barChart').innerHTML = result.groups.map(group =>
      `<div class="bar" style="--value:${Math.round(group.value / max * 100)}"><span>${group.value}</span><label title="${safe(group.label)}">${safe(group.label)}</label></div>`
    ).join('');
  } catch (error) {
    $('#chartTitle').textContent = error.message;
    $('#chartEmpty').hidden = false;
    $('#barChart').hidden = true;
  }
}

async function loadDashboards() {
  try {
    const response = await fetch('/api/dashboards');
    const dashboards = await response.json();
    if (!response.ok) throw new Error(dashboards.error);
    $('#dashboardList').innerHTML = dashboards.length ? dashboards.map(dashboard =>
      `<article class="dashboard-item"><strong>${safe(dashboard.name)}</strong><small>Response count by ${safe(dashboard.widgets[0].dimension)}</small></article>`
    ).join('') : '<p class="dashboard-empty">No saved dashboards yet. Create one from Analytics.</p>';
  } catch (error) {
    $('#dashboardList').innerHTML = `<p class="dashboard-empty">${safe(error.message)}</p>`;
  }
}

async function loadPrograms() {
  const list = $('#programList');
  try {
    const response = await fetch('/api/programs');
    const programs = await response.json();
    if (!response.ok) throw new Error(programs.error);
    list.innerHTML = programs.map(program =>
      `<article class="program-card"><span class="code">${safe(program.code || 'PROGRAM')}</span><h2>${safe(program.name)}</h2><p>${safe(program.description || 'No description yet.')}</p><h3>Projects \u00B7 ${program.projects.length}</h3><div class="project-list">${program.projects.map(project =>
        `<div class="project"><span>${safe(project.name)}</span><span>${safe(project.status)}</span></div>`
      ).join('')}</div><button class="add-project" data-program="${program.id}">\uff0b Add project</button></article>`
    ).join('') || '<p>No programs have been created yet.</p>';
    document.querySelectorAll('[data-program]').forEach(button => button.onclick = async () => {
      const name = window.prompt('Project name');
      if (!name?.trim()) return;
      const response = await fetch(`/api/programs/${button.dataset.program}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const result = await response.json();
      if (!response.ok) return toast(result.error);
      toast('Project created.');
      loadPrograms();
    });
  } catch (error) {
    list.textContent = error.message;
  }
}

async function loadAudit() {
  const list = $('#auditList');
  try {
    const response = await fetch('/api/audit-logs');
    const events = await response.json();
    if (!response.ok) throw new Error(events.error);
    list.innerHTML = events.length ? events.map(event =>
      `<article class="audit-row"><span class="audit-action">${safe(event.action)}</span><div class="audit-detail"><strong>${safe(event.resourceType)} \u00B7 ${safe(event.resourceId)}</strong><small>${safe(event.actor)}${event.metadata?.name ? ` \u00B7 ${safe(event.metadata.name)}` : ''}</small></div><time class="audit-time">${safe(new Date(event.timestamp).toLocaleString())}</time></article>`
    ).join('') : '<p class="audit-empty">No audit events have been recorded yet.</p>';
  } catch (error) {
    list.innerHTML = `<p class="audit-empty">${safe(error.message)}</p>`;
  }
}

async function loadReports() {
  try {
    if (!state.activeDataset) {
      const response = await fetch(`/api/instruments/${state.form.id}/dataset`);
      state.activeDataset = await response.json();
    }
    const dimension = $('#reportDimension');
    if (!dimension.options.length) {
      dimension.innerHTML = state.activeDataset.columns.map(column =>
        `<option value="${safe(column.key)}">${safe(column.label)}</option>`
      ).join('');
    }
    const response = await fetch('/api/reports');
    const reports = await response.json();
    if (!response.ok) throw new Error(reports.error);
    $('#reportList').innerHTML = reports.length ? reports.map(report =>
      `<article class="report-card"><p class="eyebrow">SAVED REPORT</p><h2>${safe(report.title)}</h2><p>${safe(report.narrative || 'No narrative added.')}</p><small>${safe(report.dimension)} \u00B7 ${safe(new Date(report.createdAt).toLocaleDateString())}</small></article>`
    ).join('') : '<p>No reports saved yet. Create your first reusable report above.</p>';
  } catch (error) {
    $('#reportList').textContent = error.message;
  }
}

async function loadUsers() {
  const list = $('#userList');
  try {
    const response = await fetch('/api/users');
    const users = await response.json();
    if (!response.ok) throw new Error(users.error);
    list.innerHTML = users.map(user =>
      `<article class="user-row"><div><strong>${safe(user.name)}</strong><small>${safe(user.email)}</small></div><span class="role-badge">${safe(user.roles[0].replaceAll('_', ' '))}</span><span class="user-status">${safe(user.status)}</span>${user.status === 'active' ? `<button data-user-status="suspended" data-user="${user.id}">Suspend</button>` : `<button data-user-status="active" data-user="${user.id}">Reactivate</button>`}</article>`
    ).join('');
    document.querySelectorAll('[data-user-status]').forEach(button => button.onclick = async () => {
      const response = await fetch(`/api/users/${button.dataset.user}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: button.dataset.userStatus })
      });
      const result = await response.json();
      if (!response.ok) return toast(result.error);
      toast('User status updated.');
      loadUsers();
    });
  } catch (error) {
    list.textContent = error.message;
  }
}

async function loadInstruments() {
  const list = $('#instrumentList');
  try {
    const response = await fetch('/api/instruments');
    const instruments = await response.json();
    if (!response.ok) throw new Error(instruments.error);
    list.innerHTML = instruments.map(item =>
      `<article class="instrument-card"><span class="status">${safe(item.status)}</span><h2>${safe(item.name)}</h2><p>${item.sections.reduce((total, section) => total + section.questions.length, 0)} questions \u00B7 Version ${item.version || 'draft'}</p><footer><small>Updated ${safe(new Date(item.updatedAt).toLocaleDateString())}</small><button data-open-instrument="${item.id}">Open builder \u2192</button></footer></article>`
    ).join('');
    document.querySelectorAll('[data-open-instrument]').forEach(button => button.onclick = async () => {
      state.form.id = button.dataset.openInstrument;
      await loadForm();
      location.hash = '#builder';
    });
  } catch (error) {
    list.textContent = error.message;
  }
}

function showPage() {
  const target = location.hash.slice(1);
  const page = document.getElementById(target);
  document.querySelectorAll('main>.page').forEach(item => item.hidden = item !== page);
  if (!page) {
    $('#dashboard').hidden = false;
    loadDashboards();
  }
  if (target === '') {
    $('#dashboard').hidden = false;
    loadDashboards();
  }
  if (target === 'forms') loadInstruments();
  if (target === 'responses') loadResponses();
  if (target === 'datasets') loadDataset();
  if (target === 'analytics') loadAnalytics();
  if (target === 'programs') loadPrograms();
  if (target === 'audit') loadAudit();
  if (target === 'reports') loadReports();
  if (target === 'users') loadUsers();
  if (target === 'password-reset') {
    App.org.showPasswordResetForm();
    return;
  }
  if (target === 'settings') {
    App.org.setupSettingsPage();
    return;
  }
}

['', 'dashboard', 'builder', 'forms', 'responses', 'datasets', 'analytics', 'programs', 'audit', 'reports', 'users', 'password-reset', 'settings'].forEach(route => {
  App.router.on(route, () => showPage());
});

document.querySelectorAll('.nav-link').forEach(a => a.addEventListener('click', () => {
  document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
  a.classList.add('active');
}));

$('#refreshResponses').onclick = loadResponses;
$('#refreshAudit').onclick = loadAudit;
$('#datasetSearch').oninput = () => state.activeDataset && renderDataset();
$('#dimensionSelect').onchange = loadAnalytics;

$('#toggleProgramForm').onclick = () => { $('#programForm').hidden = !$('#programForm').hidden; };
$('#toggleUserForm').onclick = () => { $('#userForm').hidden = !$('#userForm').hidden; };

$('#saveDashboard').onclick = async () => {
  const name = window.prompt('Name this dashboard view');
  if (!name?.trim()) return;
  try {
    const response = await fetch('/api/dashboards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, instrumentId: state.form.id, dimension: $('#dimensionSelect').value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    toast('Dashboard saved.');
  } catch (error) {
    toast(error.message);
  }
};

$('#newInstrument').onclick = async () => {
  const name = window.prompt('Name your new form');
  if (!name?.trim()) return;
  try {
    const response = await fetch('/api/instruments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    state.form = result;
    toast('Draft form created.');
    location.hash = '#builder';
  } catch (error) {
    toast(error.message);
  }
};

$('#programForm').onsubmit = async event => {
  event.preventDefault();
  try {
    const response = await fetch('/api/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: $('#programName').value,
        code: $('#programCode').value,
        description: $('#programDescription').value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    event.target.reset();
    event.target.hidden = true;
    toast('Program created.');
    loadPrograms();
  } catch (error) {
    toast(error.message);
  }
};

$('#reportForm').onsubmit = async event => {
  event.preventDefault();
  try {
    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: $('#reportTitle').value,
        instrumentId: state.form.id,
        dimension: $('#reportDimension').value,
        narrative: $('#reportNarrative').value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    event.target.reset();
    toast('Report saved.');
    loadReports();
  } catch (error) {
    toast(error.message);
  }
};

$('#userForm').onsubmit = async event => {
  event.preventDefault();
  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: $('#userName').value,
        email: $('#userEmail').value,
        role: $('#userRole').value,
        password: $('#userPassword').value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    event.target.reset();
    event.target.hidden = true;
    toast('User added.');
    loadUsers();
  } catch (error) {
    toast(error.message);
  }
};

function showImportResult(message, error = false) {
  const box = $('#importResult');
  box.innerHTML = message;
  box.hidden = false;
  box.classList.toggle('error', error);
}

$('#openImport').onclick = () => {
  const panel = $('#importPanel');
  panel.hidden = !panel.hidden;
};

$('#previewImport').onclick = async () => {
  const file = $('#csvFile').files[0];
  if (!file) return showImportResult('Choose a CSV file first.', true);
  try {
    state.importCsv = await file.text();
    const response = await fetch(`/api/instruments/${state.form.id}/dataset/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: state.importCsv })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    const mapped = result.mapping.filter(column => column.key).map(column => `${safe(column.column)} \u2192 ${safe(column.label)}`).join('<br>') || 'No columns were matched.';
    const issue = result.problems.length ? `<br><strong>${result.problems.length} row(s) need attention.</strong> Rows: ${result.problems.slice(0, 5).map(problem => problem.row).join(', ')}` : '<br><strong>All rows are valid and ready to import.</strong>';
    showImportResult(`${result.totalRows} data rows \u00B7 ${result.validRows} valid<br>${mapped}${issue}`, Boolean(result.problems.length));
    $('#confirmImport').hidden = Boolean(result.problems.length);
  } catch (error) {
    $('#confirmImport').hidden = true;
    showImportResult(safe(error.message), true);
  }
};

$('#confirmImport').onclick = async () => {
  try {
    const response = await fetch(`/api/instruments/${state.form.id}/dataset/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: state.importCsv })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    toast(`${result.imported} responses imported.`);
    $('#importPanel').hidden = true;
    $('#confirmImport').hidden = true;
    loadDataset();
  } catch (error) {
    showImportResult(safe(error.message), true);
  }
};

async function loadForm() {
  const response = await fetch(`/api/instruments/${state.form.id}`);
  if (!response.ok) throw new Error('Could not load the form definition.');
  state.form = await response.json();
  render();
}

async function boot() {
  const hash = location.hash;
  if (hash.startsWith('#reset-password/')) {
    const token = hash.replace('#reset-password/', '');
    showPasswordResetForm(token);
    return;
  }
  if (hash === '#signup') {
    $('#loginOverlay').hidden = true;
    $('#signupOverlay').hidden = false;
    return;
  }
  if (hash === '#login') {
    $('#loginOverlay').hidden = false;
    $('#signupOverlay').hidden = true;
    return;
  }
  if (hash === '#password-reset') {
    $('#loginOverlay').hidden = true;
    $('#signupOverlay').hidden = true;
    $('#passwordResetOverlay').hidden = false;
    App.org.showPasswordResetForm();
    return;
  }
  try {
    const response = await fetch('/api/me');
    if (!response.ok) throw new Error('Not signed in');
    $('#loginOverlay').hidden = true;
    $('#signupOverlay').hidden = true;
    $('#passwordResetOverlay').hidden = true;
    await loadForm();
    App.org.setup();
    initRouter();
    App.dashboard.load();
  } catch {
    $('#loginOverlay').hidden = false;
    $('#signupOverlay').hidden = true;
    $('#passwordResetOverlay').hidden = true;
    App.org.setup();
  }
}

$('#loginForm').onsubmit = async event => {
  event.preventDefault();
  const error = $('#loginError');
  error.hidden = true;
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('#loginEmail').value, password: $('#loginPassword').value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    $('#loginOverlay').hidden = true;
    await loadForm();
    initRouter();
    showPage();
  } catch (reason) {
    error.textContent = reason.message;
    error.hidden = false;
  }
};

$('#signupForm').onsubmit = async event => {
  event.preventDefault();
  const error = $('#signupError');
  error.hidden = true;
  const password = $('#signupPassword').value;
  const confirmPassword = $('#signupConfirmPassword').value;
  if (password !== confirmPassword) {
    error.textContent = 'Passwords do not match.';
    error.hidden = false;
    return;
  }
  try {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgName: $('#signupOrgName').value,
        email: $('#signupEmail').value,
        password: password,
        confirmPassword: confirmPassword
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    $('#signupOverlay').hidden = true;
    await loadForm();
    initRouter();
    showPage();
  } catch (reason) {
    error.textContent = reason.message;
    error.hidden = false;
  }
};

$('#showSignup').onclick = e => {
  e.preventDefault();
  location.hash = '#signup';
  $('#loginOverlay').hidden = true;
  $('#signupOverlay').hidden = false;
};
$('#showLogin').onclick = e => {
  e.preventDefault();
  location.hash = '#login';
  $('#loginOverlay').hidden = false;
  $('#signupOverlay').hidden = true;
};

boot();
