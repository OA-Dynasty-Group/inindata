// ui-helpers.js — Shared UI utilities
window.App = window.App || {};

App.ui = {
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // HTML-escape shorthand (matching existing `safe` function)
  safe: (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c])),

  // Show a toast notification (works with existing #toast element)
  toast(message) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = message;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2600);
  }
};

// Also expose `safe` and `toast` as globals for backward compatibility
window.safe = App.ui.safe;
window.toast = App.ui.toast;
