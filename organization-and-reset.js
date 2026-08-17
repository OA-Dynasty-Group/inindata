// Organization and password reset management
// This file handles Phase 3 flows: organization management and password reset

App.org = {};

App.state.passwordResetStep = 'email';
App.state.passwordResetToken = null;

async function loadOrganization() {
  try {
    const response = await fetch('/api/organization');
    const org = await response.json();
    if (!response.ok) throw new Error(org.error);

    App.$('#organizationNameDisplay').innerHTML = `<p>${escapeHtml(org.name)}</p>`;
    App.$('#organizationName').value = org.name;

    const usersResponse = await fetch('/api/users');
    const users = await usersResponse.json();
    App.$('#memberCount').innerHTML = `<strong>${users.length}</strong> team members`;
  } catch (error) {
    App.$('#organizationDisplay').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  }
}

function showPasswordResetForm(token) {
  App.$('#loginOverlay').hidden = true;
  App.$('#signupOverlay').hidden = true;
  App.$('#passwordResetOverlay').hidden = false;

  if (token) {
    App.state.passwordResetToken = token;
    App.state.passwordResetStep = 'reset';
    App.$('#resetTitle').textContent = 'Set your new password';
    App.$('#resetDescription').textContent = 'Enter your new password below.';
    App.$('#resetEmailLabel').hidden = true;
    App.$('#resetTokenLabel').hidden = true;
    App.$('#resetPasswordLabel').hidden = false;
    App.$('#resetPasswordConfirmLabel').hidden = false;
    App.$('#resetPassword').value = '';
    App.$('#resetPasswordConfirm').value = '';
    App.$('#resetButton').textContent = 'Reset password';
    App.$('#resetButton').onclick = null;
    App.$('#resetError').hidden = true;
    App.$('#resetPassword').focus();
  } else {
    App.state.passwordResetToken = null;
    App.state.passwordResetStep = 'email';
    App.$('#resetTitle').textContent = 'Reset your password';
    App.$('#resetDescription').textContent = 'Enter your email to receive a password reset link.';
    App.$('#resetEmailLabel').hidden = false;
    App.$('#resetTokenLabel').hidden = true;
    App.$('#resetPasswordLabel').hidden = true;
    App.$('#resetPasswordConfirmLabel').hidden = true;
    App.$('#resetButton').textContent = 'Send reset link';
    App.$('#resetButton').onclick = null;
    App.$('#resetError').hidden = true;
    App.$('#passwordResetForm').reset();
    App.$('#resetEmail').focus();
  }
}

function showLoginForm() {
  App.$('#passwordResetOverlay').hidden = true;
  App.$('#signupOverlay').hidden = true;
  App.$('#loginOverlay').hidden = false;
  App.$('#loginEmail').focus();
}

function setupOrgPage() {
  App.$('#organizationForm').onsubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch('/api/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: App.$('#organizationName').value })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      App.$('#organizationForm').hidden = true;
      App.$('#organizationDisplay').hidden = false;
      toast('Organization name updated.');
      loadOrganization();
    } catch (error) {
      toast(error.message);
    }
  };

  App.$('#editOrganization').onclick = () => {
    App.$('#organizationDisplay').hidden = true;
    App.$('#organizationForm').hidden = false;
    App.$('#organizationName').focus();
  };

  App.$('#passwordResetForm').onsubmit = async (event) => {
    event.preventDefault();
    const error = App.$('#resetError');
    error.hidden = true;

    try {
      if (App.state.passwordResetStep === 'email') {
        const email = App.$('#resetEmail').value.trim();
        if (!email) throw new Error('Enter your email address.');

        const response = await fetch('/api/auth/password-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error);

        App.$('#resetTitle').textContent = 'Check your email';
        App.$('#resetDescription').textContent = 'We\'ve sent a password reset link to your email. Click the link or enter the reset code below.';
        App.$('#resetEmailLabel').hidden = true;
        App.$('#resetTokenLabel').hidden = false;
        App.$('#resetPasswordLabel').hidden = false;
        App.$('#resetPasswordConfirmLabel').hidden = false;
        App.$('#resetButton').textContent = 'Reset password';

        App.state.passwordResetStep = 'reset';
        error.textContent = 'Check your email for the reset link. If you don\'t see it, check your spam folder.';
        error.hidden = false;
        error.className = 'login-info';
      } else if (App.state.passwordResetStep === 'reset') {
        const token = App.state.passwordResetToken || App.$('#resetToken').value.trim();
        const password = App.$('#resetPassword').value;
        const confirm = App.$('#resetPasswordConfirm').value;

        if (!token) throw new Error('Enter the reset code from your email.');
        if (password.length < 12) throw new Error('Password must be at least 12 characters.');
        if (password !== confirm) throw new Error('Passwords do not match.');

        const response = await fetch('/api/auth/password-reset/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error);

        App.$('#resetTitle').textContent = 'Password reset successful!';
        App.$('#resetDescription').textContent = 'Your password has been updated. You can now sign in with your new password.';
        App.$('#passwordResetForm').reset();
        App.$('#resetButton').textContent = 'Return to sign in';
        App.$('#resetButton').onclick = () => showLoginForm();
        App.state.passwordResetToken = null;
      }
    } catch (reason) {
      error.textContent = reason.message;
      error.hidden = false;
      error.className = 'login-error';
    }
  };

  const loginLinks = document.querySelectorAll('a[href="#password-reset"]');
  loginLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showPasswordResetForm();
      location.hash = '#password-reset';
    });
  });
}

App.org.loadOrganization = loadOrganization;
App.org.showPasswordResetForm = showPasswordResetForm;
App.org.showLoginForm = showLoginForm;
App.org.setupSettingsPage = function() {
  const target = location.hash.slice(1);
  if (target === 'settings') {
    loadOrganization();
  }
};
App.org.setup = setupOrgPage;
