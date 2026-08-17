// dashboard.js — Dynamic dashboard renderer
window.App = window.App || {};

App.dashboard = {
  async load() {
    try {
      const response = await fetch('/api/dashboard');
      if (!response.ok) throw new Error('Failed to load dashboard');
      const data = await response.json();

      this.renderMetrics(data.metrics);
      this.renderGreeting(data.user, data.organization);
      this.renderActivity(data.recentActivity);
      this.renderProgramStats(data.programs);
    } catch (error) {
      console.error('[Dashboard]', error);
      this.renderMetrics({ totalResponses: 0, activeForms: 0, pendingReviews: 0, responsesThisMonth: 0 });
    }
  },

  renderMetrics(metrics) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('metricResponses', metrics.totalResponses.toLocaleString());
    set('metricForms', metrics.activeForms.toLocaleString());
    set('metricPending', metrics.pendingReviews.toLocaleString());
    set('metricThisMonth', metrics.responsesThisMonth.toLocaleString());
  },

  renderGreeting(user, organization) {
    const name = user?.name || 'User';
    const firstName = name.split(' ')[0];
    const greeting = this.timeGreeting();
    const el = document.getElementById('dashboardGreeting');
    if (el) el.textContent = `${greeting}, ${firstName}`;
    const orgEl = document.getElementById('dashboardOrg');
    if (orgEl) orgEl.textContent = organization?.name || '';
  },

  renderActivity(activities) {
    const feed = document.getElementById('activityFeed');
    if (!feed) return;
    if (!activities || !activities.length) {
      feed.innerHTML = '<li class="activity-item activity-item--empty">No recent activity</li>';
      return;
    }
    feed.innerHTML = activities.map(a => `
      <li class="activity-item">
        <span class="activity-icon">${this.activityIcon(a.action)}</span>
        <div class="activity-detail">
          <strong>${App.ui.escapeHtml(a.action)}</strong>
          <span>${App.ui.escapeHtml(a.resourceType)}</span>
          <time>${this.relativeTime(a.timestamp)}</time>
        </div>
      </li>
    `).join('');
  },

  renderProgramStats(programs) {
    const el = document.getElementById('programStats');
    if (!el) return;
    el.textContent = `${programs?.total || 0} programs · ${programs?.active || 0} active`;
  },

  timeGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  },

  initials(name) {
    return (name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  },

  activityIcon(action) {
    const icons = {
      'CREATE': '➕',
      'UPDATE': '✏️',
      'PUBLISH': '🚀',
      'DELETE': '🗑️',
      'SIGNUP': '👤',
      'LOGIN': '🔑',
      'LOGOUT': '👋',
      'IMPORT': '📥',
      'EXPORT': '📤',
      'PASSWORD_RESET_REQUEST': '🔒',
      'PASSWORD_RESET_COMPLETE': '✅'
    };
    return icons[action?.split('_')[0]] || '📋';
  },

  relativeTime(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
};
