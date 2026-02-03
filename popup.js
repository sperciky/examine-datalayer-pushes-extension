/**
 * Popup Script
 * Quick access to configure the observed dataLayer object name
 */

(function() {
  'use strict';

  const form = document.getElementById('configForm');
  const observedObjectInput = document.getElementById('observedObject');
  const currentValue = document.getElementById('currentValue');
  const openOptionsButton = document.getElementById('openOptionsButton');
  const openDevToolsButton = document.getElementById('openDevToolsButton');
  const statusMessage = document.getElementById('statusMessage');

  /**
   * Show status message to user
   */
  function showStatus(message, type = 'success') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';

    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 4000);
  }

  /**
   * Load current settings
   */
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get({
        observedObject: 'dataLayer'
      });

      const objectName = result.observedObject || 'dataLayer';
      observedObjectInput.value = objectName;
      currentValue.textContent = `window.${objectName}`;
    } catch (error) {
      console.error('Error loading settings:', error);
      currentValue.textContent = 'Error loading settings';
      showStatus('Error loading settings', 'error');
    }
  }

  /**
   * Save settings and reload the active tab
   */
  async function saveSettings(event) {
    event.preventDefault();

    const observedObject = observedObjectInput.value.trim() || 'dataLayer';

    // Validate: must be a valid JavaScript identifier
    const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    if (!validIdentifier.test(observedObject)) {
      showStatus('Invalid name. Use valid JavaScript identifier.', 'error');
      return;
    }

    try {
      // Save settings
      await chrome.storage.sync.set({
        observedObject: observedObject
      });

      // Update display
      currentValue.textContent = `window.${observedObject}`;

      // Reload the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await chrome.tabs.reload(tab.id);
        showStatus(`Saved! Observing window.${observedObject}`, 'success');
      } else {
        showStatus(`Saved! Reload page to apply.`, 'success');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      showStatus('Error saving settings', 'error');
    }
  }

  /**
   * Open the full options page
   */
  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  /**
   * Inform user about DevTools
   */
  function openDevTools() {
    showStatus('Press F12 to open DevTools, then go to DataLayer tab', 'success');
  }

  // Event listeners
  form.addEventListener('submit', saveSettings);
  openOptionsButton.addEventListener('click', openOptions);
  openDevToolsButton.addEventListener('click', openDevTools);

  // Load settings on popup open
  loadSettings();
})();
