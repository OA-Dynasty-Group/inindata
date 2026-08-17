// client-router.js — Single hash router
window.App = window.App || {};

App.router = {
  _routes: {},

  // Register a route handler
  on(pattern, handler) {
    this._routes[pattern] = handler;
  },

  // Get current hash (without #)
  current() {
    return location.hash.slice(1) || '';
  },

  // Navigate to a hash
  go(hash) {
    location.hash = hash;
  },

  // Dispatch current route
  dispatch() {
    const hash = this.current();

    // Check for exact match first
    if (this._routes[hash]) {
      this._routes[hash](hash);
      return;
    }

    // Check for pattern matches (e.g., 'builder/:id')
    for (const [pattern, handler] of Object.entries(this._routes)) {
      const patternParts = pattern.split('/');
      const hashParts = hash.split('/');
      if (patternParts.length !== hashParts.length) continue;

      const params = {};
      let match = true;
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
          params[patternParts[i].slice(1)] = hashParts[i];
        } else if (patternParts[i] !== hashParts[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        handler(hash, params);
        return;
      }
    }

    // Default: show dashboard
    if (this._routes['']) {
      this._routes['']('');
    }
  },

  // Initialize the router
  init() {
    window.addEventListener('hashchange', () => this.dispatch());
    this.dispatch();
  }
};
