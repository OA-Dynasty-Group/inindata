const { requireAuth } = require('../lib/auth');
const { json } = require('../lib/json');

const getDashboard = requireAuth(async (req, res, data) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const totalResponses = data.submissions.length;

  const responsesThisMonth = data.submissions.filter(s => {
    const d = new Date(s.submittedAt);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;

  const activeForms = data.instruments.filter(i => i.status === 'published').length;
  const totalForms = data.instruments.length;

  const pendingReviews = data.submissions.filter(s => s.status === 'submitted').length;

  const recentActivity = [...data.auditLogs]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 5);

  const totalPrograms = data.programs.length;
  const activePrograms = data.programs.filter(p => p.status === 'active').length;

  const user = req.user;
  const words = (user.name || '').trim().split(/\s+/);
  const initials = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : (words[0] || '').toUpperCase();

  return json(res, 200, {
    organization: { name: data.organization.name, id: data.organization.id },
    user: { name: user.name, email: user.email, initials },
    metrics: {
      totalResponses,
      responsesThisMonth,
      activeForms,
      totalForms,
      pendingReviews
    },
    recentActivity,
    programs: { total: totalPrograms, active: activePrograms }
  });
});

module.exports = { getDashboard };
