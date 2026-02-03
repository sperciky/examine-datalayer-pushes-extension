/**
 * Options Page Script
 * Handles saving and loading extension settings
 */

(function() {
  'use strict';

  const form = document.getElementById('optionsForm');
  const observedObjectInput = document.getElementById('observedObject');
  const resetButton = document.getElementById('resetButton');
  const statusMessage = document.getElementById('statusMessage');

  /**
   * Show status message to user
   */
  function showStatus(message, type = 'success') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';

    // Hide after 5 seconds
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 5000);
  }

  /**
   * Load saved settings from chrome.storage
   */
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get({
        observedObject: 'dataLayer'
      });

      observedObjectInput.value = result.observedObject || 'dataLayer';
    } catch (error) {
      console.error('Error loading settings:', error);
      showStatus('Error loading settings', 'error');
    }
  }

  /**
   * Save settings to chrome.storage
   */
  async function saveSettings(event) {
    event.preventDefault();

    const observedObject = observedObjectInput.value.trim() || 'dataLayer';

    // Basic validation: ensure it's a valid JavaScript identifier
    const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    if (!validIdentifier.test(observedObject)) {
      showStatus('Invalid object name. Must be a valid JavaScript identifier.', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({
        observedObject: observedObject
      });

      showStatus(
        `Settings saved! Observing: window.${observedObject}. Please reload your pages for changes to take effect.`,
        'success'
      );
    } catch (error) {
      console.error('Error saving settings:', error);
      showStatus('Error saving settings', 'error');
    }
  }

  /**
   * Reset settings to default
   */
  async function resetSettings() {
    try {
      await chrome.storage.sync.set({
        observedObject: 'dataLayer'
      });

      observedObjectInput.value = 'dataLayer';
      showStatus('Settings reset to default (dataLayer)', 'info');
    } catch (error) {
      console.error('Error resetting settings:', error);
      showStatus('Error resetting settings', 'error');
    }
  }

  // Event listeners
  form.addEventListener('submit', saveSettings);
  resetButton.addEventListener('click', resetSettings);

  // Load settings on page load
  loadSettings();
})();
