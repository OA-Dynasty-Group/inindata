// app-state.js — Centralized state for the Fieldwork client
window.App = window.App || {};

App.state = {
  form: { id: 'instrument-community-needs', name: 'Community needs assessment', sections: [] },
  selectedId: null,
  activeDataset: null,
  importCsv: '',
  currentDateRange: '30',
  currentChartType: 'bar',
  lastAggregation: null,
  lastTrendData: null,
  passwordResetStep: 'email',
  passwordResetToken: null,
  currentUser: null
};

App.typeNames = {
  shortText: 'Short text',
  longText: 'Long text',
  number: 'Number',
  singleSelect: 'Single select',
  multiSelect: 'Multi-select',
  yesNo: 'Yes / No',
  date: 'Date',
  rating: 'Rating'
};

// Shorthand DOM selector
App.$ = (s) => document.querySelector(s);
