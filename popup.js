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
  const enableToggle = document.getElementById('enableToggle');
  const toggleSection = document.getElementById('toggleSection');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');

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
   * Update the toggle UI based on enabled state
   */
  function updateToggleUI(isEnabled) {
    enableToggle.checked = isEnabled;

    if (isEnabled) {
      statusIndicator.className = 'status-indicator active';
      statusText.textContent = 'Extension Enabled';
      toggleSection.classList.remove('disabled');
    } else {
      statusIndicator.className = 'status-indicator inactive';
      statusText.textContent = 'Extension Disabled';
      toggleSection.classList.add('disabled');
    }
  }

  /**
   * Handle toggle change
   */
  async function handleToggleChange() {
    const isEnabled = enableToggle.checked;

    try {
      // Save the enabled state
      await chrome.storage.sync.set({
        extensionEnabled: isEnabled
      });

      // Update UI
      updateToggleUI(isEnabled);

      // Reload the active tab to apply changes
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await chrome.tabs.reload(tab.id);
        showStatus(
          isEnabled ? 'Extension enabled! Page reloaded.' : 'Extension disabled! Page reloaded.',
          'success'
        );
      } else {
        showStatus(
          isEnabled ? 'Extension enabled! Reload page to apply.' : 'Extension disabled! Reload page to apply.',
          'success'
        );
      }
    } catch (error) {
      console.error('Error toggling extension:', error);
      showStatus('Error changing extension state', 'error');
      // Revert toggle on error
      enableToggle.checked = !isEnabled;
      updateToggleUI(!isEnabled);
    }
  }

  /**
   * Load current settings
   */
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get({
        observedObject: 'dataLayer',
        extensionEnabled: true // Default to enabled
      });

      const objectName = result.observedObject || 'dataLayer';
      observedObjectInput.value = objectName;
      currentValue.textContent = `window.${objectName}`;

      // Update toggle UI
      const isEnabled = result.extensionEnabled !== false; // Default to true if undefined
      updateToggleUI(isEnabled);
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
  enableToggle.addEventListener('change', handleToggleChange);

  // Load settings on popup open
  loadSettings();
})();
