/**
 * Margin Auction Overlay - Content Script
 * Injects non-interfering decision overlay on eBay item pages
 */

(function() {
  'use strict';

  // State
  let overlayContainer = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let isExpanded = false;
  let currentData = null;
  let websocket = null;
  let reconnectTimeout = null;

  // Configuration - Update this URL to your deployed Margin app
  const CONFIG = {
    wsUrl: 'wss://workspace-tsimpson923.replit.app/ws/auction',
    defaultAnchor: 'bottom-left',
    storageKey: 'margin-overlay-settings'
  };

  // Initialize overlay
  function init() {
    if (document.getElementById('margin-overlay-container')) return;
    
    createOverlay();
    loadSettings();
    extractItemAndConnect();
  }

  // Create overlay DOM
  function createOverlay() {
    overlayContainer = document.createElement('div');
    overlayContainer.id = 'margin-overlay-container';
    overlayContainer.setAttribute('data-anchor', CONFIG.defaultAnchor);
    
    overlayContainer.innerHTML = `
      <div class="margin-overlay">
        <div class="margin-drag-handle">
          <div class="margin-drag-dots">
            <span></span>
            <span></span>
          </div>
          <div class="margin-controls">
            <button class="margin-btn margin-expand-btn" title="Expand/Collapse">⤢</button>
            <button class="margin-btn margin-dismiss-btn" title="Dismiss">✕</button>
          </div>
        </div>
        <div class="margin-content margin-collapsed">
          <div class="margin-loading">
            <div class="margin-spinner"></div>
            <span>Analyzing...</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlayContainer);
    setupEventListeners();
  }

  // Setup event listeners
  function setupEventListeners() {
    const dragHandle = overlayContainer.querySelector('.margin-drag-handle');
    const expandBtn = overlayContainer.querySelector('.margin-expand-btn');
    const dismissBtn = overlayContainer.querySelector('.margin-dismiss-btn');

    // Drag functionality
    dragHandle.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);

    // Touch support
    dragHandle.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', endDrag);

    // Controls
    expandBtn.addEventListener('click', toggleExpand);
    dismissBtn.addEventListener('click', dismissOverlay);
  }

  // Drag handlers
  function startDrag(e) {
    e.preventDefault();
    isDragging = true;
    
    const rect = overlayContainer.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    dragOffset.x = clientX - rect.left;
    dragOffset.y = clientY - rect.top;
    
    overlayContainer.style.transition = 'none';
  }

  function onDrag(e) {
    if (!isDragging) return;
    e.preventDefault();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const newX = clientX - dragOffset.x;
    const newY = clientY - dragOffset.y;
    
    // Clamp to viewport
    const rect = overlayContainer.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;
    
    overlayContainer.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
    overlayContainer.style.top = Math.max(0, Math.min(newY, maxY)) + 'px';
    overlayContainer.style.right = 'auto';
    overlayContainer.style.bottom = 'auto';
    overlayContainer.setAttribute('data-anchor', 'custom');
  }

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    overlayContainer.style.transition = '';
    saveSettings();
  }

  // Expand/collapse
  function toggleExpand() {
    isExpanded = !isExpanded;
    updateDisplay();
    saveSettings();
  }

  // Dismiss overlay
  function dismissOverlay() {
    overlayContainer.classList.add('margin-hidden');
    if (websocket) websocket.close();
    saveSettings();
  }

  // Extract eBay item ID from URL
  function extractItemId() {
    const match = window.location.pathname.match(/\/itm\/[^\/]*\/(\d+)/);
    if (match) return match[1];
    
    const altMatch = window.location.pathname.match(/\/itm\/(\d+)/);
    return altMatch ? altMatch[1] : null;
  }

  // Extract item details and connect
  function extractItemAndConnect() {
    const itemId = extractItemId();
    if (!itemId) {
      showError('Could not detect item');
      return;
    }

    // Extract price from page
    const priceEl = document.querySelector('[data-testid="x-price-primary"] .ux-textspans');
    const price = priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) : null;

    // Extract title
    const titleEl = document.querySelector('h1.x-item-title__mainTitle');
    const title = titleEl ? titleEl.textContent.trim() : '';

    // For demo: simulate decision (in production, connect to WebSocket)
    simulateDecision(itemId, title, price);
  }

  // Simulate decision (replace with real WebSocket in production)
  function simulateDecision(itemId, title, price) {
    setTimeout(() => {
      // Demo data - in production this comes from WebSocket
      const score = Math.floor(Math.random() * 100);
      const decision = score >= 70 ? 'flip' : score >= 50 ? 'caution' : 'skip';
      const maxBid = price ? price * 0.6 : 50;
      const profit = price ? price * 0.25 : 25;

      currentData = {
        decision,
        decisionText: decision === 'flip' ? 'Flip it!' : decision === 'skip' ? 'Skip it!' : 'Be cautious',
        score,
        maxBid,
        profit,
        itemId
      };

      updateDisplay();
    }, 1200);
  }

  // Connect to WebSocket (production)
  function connectWebSocket(itemId) {
    if (websocket) websocket.close();
    
    try {
      websocket = new WebSocket(`${CONFIG.wsUrl}?itemId=${itemId}`);
      
      websocket.onmessage = (event) => {
        try {
          currentData = JSON.parse(event.data);
          updateDisplay();
        } catch (e) {
          console.error('Margin: Parse error', e);
        }
      };

      websocket.onclose = () => {
        reconnectTimeout = setTimeout(() => connectWebSocket(itemId), 5000);
      };

      websocket.onerror = () => {
        showError('Connection failed');
      };
    } catch (e) {
      showError('WebSocket error');
    }
  }

  // Update overlay display
  function updateDisplay() {
    const content = overlayContainer.querySelector('.margin-content');
    
    if (!currentData) {
      content.innerHTML = `
        <div class="margin-loading">
          <div class="margin-spinner"></div>
          <span>Analyzing...</span>
        </div>
      `;
      return;
    }

    const { decision, decisionText, score, maxBid, profit } = currentData;
    const profitClass = profit >= 0 ? 'positive' : 'negative';

    if (isExpanded) {
      content.className = 'margin-content';
      content.innerHTML = `
        <div class="margin-decision ${decision}">${decisionText}</div>
        <div class="margin-details">
          <div class="margin-stat">
            <span class="margin-stat-label">Max Bid</span>
            <span class="margin-stat-value">$${maxBid.toFixed(0)}</span>
          </div>
          <div class="margin-stat">
            <span class="margin-stat-label">Est. Profit</span>
            <span class="margin-stat-value ${profitClass}">${profit >= 0 ? '+' : '-'}$${Math.abs(profit).toFixed(0)}</span>
          </div>
          <div class="margin-stat">
            <span class="margin-stat-label">Confidence</span>
            <span class="margin-stat-value">${score}</span>
          </div>
          <div class="margin-confidence-bar">
            <div class="margin-confidence-fill" style="width: ${score}%"></div>
          </div>
        </div>
      `;
    } else {
      content.className = 'margin-content margin-collapsed';
      content.innerHTML = `
        <div class="margin-decision ${decision}">${decisionText}</div>
      `;
    }
  }

  // Show error
  function showError(message) {
    const content = overlayContainer.querySelector('.margin-content');
    content.innerHTML = `<div class="margin-error">${message}</div>`;
  }

  // Load settings from storage
  function loadSettings() {
    chrome.storage.local.get(CONFIG.storageKey, (result) => {
      const settings = result[CONFIG.storageKey] || {};
      
      if (settings.hidden) {
        overlayContainer.classList.add('margin-hidden');
      }
      
      if (settings.position) {
        overlayContainer.style.left = settings.position.left;
        overlayContainer.style.top = settings.position.top;
        overlayContainer.style.right = 'auto';
        overlayContainer.style.bottom = 'auto';
        overlayContainer.setAttribute('data-anchor', 'custom');
      }
      
      if (settings.expanded !== undefined) {
        isExpanded = settings.expanded;
      }
    });
  }

  // Save settings to storage
  function saveSettings() {
    const settings = {
      hidden: overlayContainer.classList.contains('margin-hidden'),
      expanded: isExpanded,
      position: overlayContainer.getAttribute('data-anchor') === 'custom' ? {
        left: overlayContainer.style.left,
        top: overlayContainer.style.top
      } : null
    };
    
    chrome.storage.local.set({ [CONFIG.storageKey]: settings });
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
