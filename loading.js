// loading.js — Loading state helpers
window.App = window.App || {};

App.loading = {
  // Show loading skeleton in a container
  skeleton(container, rows = 3) {
    container.innerHTML = Array.from({ length: rows }, () =>
      '<div class="skeleton-row"><div class="skeleton-line skeleton-w60"></div><div class="skeleton-line skeleton-w40"></div></div>'
    ).join('');
  },

  // Show error state
  error(container, message) {
    container.innerHTML = `<div class="empty-state"><p class="empty-state__title">Something went wrong</p><p class="empty-state__desc">${App.ui.escapeHtml(message)}</p></div>`;
  },

  // Show empty state
  empty(container, title = 'Nothing here yet', desc = '') {
    container.innerHTML = `<div class="empty-state"><p class="empty-state__title">${App.ui.escapeHtml(title)}</p>${desc ? `<p class="empty-state__desc">${App.ui.escapeHtml(desc)}</p>` : ''}</div>`;
  },

  // Show loading spinner (inline)
  spinner() {
    return '<span class="spinner"></span>';
  }
};
