/**
 * Content Script
 * Runs in isolated content script context, NOT page context.
 *
 * Responsibilities:
 * 1. Retrieve the configured object name from chrome.storage
 * 2. Inject page-script.js into the page's execution context
 * 3. Relay messages from page context to DevTools panel via chrome.runtime
 *
 * Context Isolation:
 * Content scripts cannot directly access page JavaScript variables.
 * We must inject a <script> tag to run code in the page context.
 * This is the only way to intercept actual page-level window.dataLayer.
 */

(function() {
  'use strict';

  /**
   * Inject the page script into the page's execution context
   */
  function injectPageScript(observedObjectName) {
    // Create a script element
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page-script.js');

    // Pass configuration via data attribute
    script.dataset.observedObject = observedObjectName;

    // Inject as early as possible
    // Use document.documentElement to inject even before <head> is parsed
    (document.head || document.documentElement).appendChild(script);

    // Remove script tag after execution to keep DOM clean
    script.onload = () => {
      script.remove();
    };
  }

  /**
   * Listen for messages from page context and forward to DevTools
   */
  function setupMessageRelay() {
    window.addEventListener('message', (event) => {
      // Only accept messages from same window
      if (event.source !== window) {
        return;
      }

      // Filter for our specific message types
      if (event.data.type && (
        event.data.type === 'DATALAYER_PUSH_INTERCEPTED' ||
        event.data.type === 'DATALAYER_PRE_HOOK_SNAPSHOT' ||
        event.data.type === 'DATALAYER_DEBUGGER_INITIALIZED'
      )) {
        // Forward to background/DevTools via chrome.runtime messaging
        chrome.runtime.sendMessage({
          type: event.data.type,
          data: event.data.data,
          url: window.location.href,
          frameId: window === window.top ? 0 : -1 // Simple frame detection
        }).catch(() => {
          // Silently ignore errors (e.g., when DevTools is not open)
        });
      }
    });
  }

  /**
   * Initialize the content script
   */
  async function initialize() {
    try {
      // Retrieve the configured object name from storage
      const result = await chrome.storage.sync.get({
        observedObject: 'dataLayer' // Default value
      });

      const observedObjectName = result.observedObject || 'dataLayer';

      // Setup message relay before injection to catch all messages
      setupMessageRelay();

      // Inject the page script with the configuration
      injectPageScript(observedObjectName);

    } catch (error) {
      console.error('[DataLayer Debugger Content Script] Initialization error:', error);
    }
  }

  // Run initialization
  initialize();
})();
