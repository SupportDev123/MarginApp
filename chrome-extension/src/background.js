/**
 * Margin Auction Overlay - Background Service Worker
 * Handles authentication and WebSocket coordination
 */

// Configuration - Update this URL to your deployed Margin app
const CONFIG = {
  apiBase: 'https://workspace-tsimpson923.replit.app',
  storageKey: 'margin-auth'
};

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_AUTH':
      getAuthToken().then(sendResponse);
      return true;
    
    case 'SET_AUTH':
      setAuthToken(message.token).then(sendResponse);
      return true;
    
    case 'LOGOUT':
      clearAuth().then(sendResponse);
      return true;
    
    case 'ANALYZE_ITEM':
      analyzeItem(message.itemId, message.url).then(sendResponse);
      return true;
  }
});

// Get stored auth token
async function getAuthToken() {
  const result = await chrome.storage.local.get(CONFIG.storageKey);
  return result[CONFIG.storageKey] || null;
}

// Set auth token
async function setAuthToken(token) {
  await chrome.storage.local.set({ [CONFIG.storageKey]: token });
  return { success: true };
}

// Clear auth
async function clearAuth() {
  await chrome.storage.local.remove(CONFIG.storageKey);
  return { success: true };
}

// Analyze item via API
async function analyzeItem(itemId, url) {
  const auth = await getAuthToken();
  
  if (!auth) {
    return { error: 'Not authenticated' };
  }
  
  try {
    const response = await fetch(`${CONFIG.apiBase}/api/items/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.token}`
      },
      body: JSON.stringify({ url })
    });
    
    if (!response.ok) {
      throw new Error('Analysis failed');
    }
    
    return await response.json();
  } catch (error) {
    return { error: error.message };
  }
}

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open onboarding page
    chrome.tabs.create({
      url: `${CONFIG.apiBase}/extension-setup`
    });
  }
});
