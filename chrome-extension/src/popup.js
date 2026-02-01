/**
 * Margin Extension Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const loggedOutEl = document.getElementById('logged-out');
  const loggedInEl = document.getElementById('logged-in');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userNameEl = document.getElementById('user-name');
  const userAvatarEl = document.getElementById('user-avatar');
  const userTierEl = document.getElementById('user-tier');

  // Check auth status
  const auth = await chrome.runtime.sendMessage({ type: 'GET_AUTH' });
  
  if (auth && auth.user) {
    showLoggedIn(auth.user);
  } else {
    showLoggedOut();
  }

  // Login button
  loginBtn.addEventListener('click', () => {
    // Open main app for authentication
    chrome.tabs.create({
      url: 'https://your-replit-app.repl.co/login?extension=true'
    });
    window.close();
  });

  // Logout button
  logoutBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'LOGOUT' });
    showLoggedOut();
  });

  function showLoggedIn(user) {
    loggedOutEl.classList.add('hidden');
    loggedInEl.classList.add('active');
    
    userNameEl.textContent = user.username || 'User';
    userAvatarEl.textContent = (user.username || 'U')[0].toUpperCase();
    userTierEl.textContent = user.tier === 'pro' ? 'Pro' : 'Free';
  }

  function showLoggedOut() {
    loggedOutEl.classList.remove('hidden');
    loggedInEl.classList.remove('active');
  }
});
