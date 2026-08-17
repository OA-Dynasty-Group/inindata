// Organization and password reset management
// This file handles Phase 3 flows: organization management and password reset

/**
 * Load and display organization settings
 */
async function loadOrganization() {
  try {
    const response = await fetch('/api/organization');
    const org = await response.json();
    if (!response.ok) throw new Error(org.error);
    
    document.getElementById('organizationNameDisplay').innerHTML = `<p>${escapeHtml(org.name)}</p>`;
    document.getElementById('organizationName').value = org.name;
    
    // Load member count
    const usersResponse = await fetch('/api/users');
    const users = await usersResponse.json();
    document.getElementById('memberCount').innerHTML = `<strong>${users.length}</strong> team members`;
  } catch (error) {
    document.getElementById('organizationDisplay').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  }
}

/**
 * Save organization settings
 */
document.getElementById('organizationForm').onsubmit = async (event) => {
  event.preventDefault();
  try {
    const response = await fetch('/api/organization', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: document.getElementById('organizationName').value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    document.getElementById('organizationForm').hidden = true;
    document.getElementById('organizationDisplay').hidden = false;
    toast('Organization name updated.');
    loadOrganization();
  } catch (error) {
    toast(error.message);
  }
};

document.getElementById('editOrganization').onclick = () => {
  document.getElementById('organizationDisplay').hidden = true;
  document.getElementById('organizationForm').hidden = false;
  document.getElementById('organizationName').focus();
};

/**
 * Password reset flow
 */
let passwordResetStep = 'email'; // email -> confirm -> reset

function showPasswordResetForm() {
  document.getElementById('loginOverlay').hidden = true;
  document.getElementById('passwordResetOverlay').hidden = false;
  document.getElementById('resetEmail').focus();
}

function showLoginForm() {
  document.getElementById('passwordResetOverlay').hidden = true;
  document.getElementById('loginOverlay').hidden = false;
  document.getElementById('loginEmail').focus();
}

/**
 * Handle password reset form submission
 */
document.getElementById('passwordResetForm').onsubmit = async (event) => {
  event.preventDefault();
  const error = document.getElementById('resetError');
  error.hidden = true;

  try {
    if (passwordResetStep === 'email') {
      // Step 1: Request password reset
      const email = document.getElementById('resetEmail').value.trim();
      if (!email) throw new Error('Enter your email address.');

      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      document.getElementById('resetTitle').textContent = 'Check your email';
      document.getElementById('resetDescription').textContent = 'We\'ve sent a password reset link to your email. Click the link or enter the reset code below.';
      document.getElementById('resetEmailLabel').hidden = true;
      document.getElementById('resetTokenLabel').hidden = false;
      document.getElementById('resetPasswordLabel').hidden = false;
      document.getElementById('resetPasswordConfirmLabel').hidden = false;
      document.getElementById('resetButton').textContent = 'Reset password';
      
      passwordResetStep = 'reset';
      error.textContent = 'Check your email for the reset link. If you don\'t see it, check your spam folder.';
      error.hidden = false;
      error.className = 'login-info';
    } else if (passwordResetStep === 'reset') {
      // Step 2: Confirm password reset
      const token = document.getElementById('resetToken').value.trim();
      const password = document.getElementById('resetPassword').value;
      const confirm = document.getElementById('resetPasswordConfirm').value;

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

      // Success
      document.getElementById('resetTitle').textContent = 'Password reset successful!';
      document.getElementById('resetDescription').textContent = 'Your password has been updated. You can now sign in with your new password.';
      document.getElementById('resetForm').reset();
      document.getElementById('resetButton').textContent = 'Return to sign in';
      document.getElementById('resetButton').onclick = () => showLoginForm();
    }
  } catch (reason) {
    error.textContent = reason.message;
    error.hidden = false;
    error.className = 'login-error';
  }
};

/**
 * Handle browser back button for password reset
 */
window.addEventListener('hashchange', () => {
  if (location.hash === '#password-reset') {
    passwordResetStep = 'email';
    document.getElementById('resetTitle').textContent = 'Reset your password';
    document.getElementById('resetDescription').textContent = 'Enter your email to receive a password reset link.';
    document.getElementById('resetEmailLabel').hidden = false;
    document.getElementById('resetTokenLabel').hidden = true;
    document.getElementById('resetPasswordLabel').hidden = true;
    document.getElementById('resetPasswordConfirmLabel').hidden = true;
    document.getElementById('resetButton').textContent = 'Send reset link';
    document.getElementById('resetButton').onclick = null;
    document.getElementById('resetError').hidden = true;
    document.getElementById('passwordResetForm').reset();
    showPasswordResetForm();
  } else if (location.hash === '#login' || location.hash === '') {
    showLoginForm();
  }
});

/**
 * Settings page loader
 */
async function showSettingsPage() {
  const target = location.hash.slice(1);
  if (target === 'settings') {
    loadOrganization();
  }
}

window.addEventListener('hashchange', showSettingsPage);

/**
 * Utility: escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize password reset links
document.addEventListener('DOMContentLoaded', () => {
  const loginLinks = document.querySelectorAll('a[href="#password-reset"]');
  loginLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showPasswordResetForm();
      location.hash = '#password-reset';
    });
  });
});
