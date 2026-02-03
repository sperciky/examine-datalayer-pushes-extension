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
   * Check if the extension context is still valid
   * Must be checked before any chrome.runtime API calls
   */
  function isExtensionContextValid() {
    try {
      // Check if chrome and chrome.runtime exist
      if (!chrome || !chrome.runtime) {
        return false;
      }
      // Try to access chrome.runtime.id - if context is invalidated, this will throw
      const id = chrome.runtime.id;
      return Boolean(id);
    } catch (e) {
      return false;
    }
  }

  /**
   * Inject the page script into the page's execution context
   */
  function injectPageScript(observedObjectName) {
    // Check if extension context is valid before injecting
    if (!isExtensionContextValid()) {
      return;
    }

    try {
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
    } catch (e) {
      // Extension context invalidated - silently fail
    }
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
        // Check if extension context is still valid before attempting to send message
        if (!isExtensionContextValid()) {
          // Extension was reloaded or disabled - stop trying to send messages
          return;
        }

        // Forward to background/DevTools via chrome.runtime messaging
        try {
          // Double-check that sendMessage exists
          if (!chrome.runtime.sendMessage) {
            return;
          }

          const promise = chrome.runtime.sendMessage({
            type: event.data.type,
            data: event.data.data,
            url: window.location.href,
            frameId: window === window.top ? 0 : -1 // Simple frame detection
          });

          // Only attach .catch() if promise was returned
          if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {
              // Silently ignore errors (e.g., when DevTools is not open or context invalidated)
            });
          }
        } catch (e) {
          // Extension context invalidated during send - ignore silently
        }
      }
    });
  }

  /**
   * Initialize the content script
   */
  async function initialize() {
    // Check if extension context is valid before initialization
    if (!isExtensionContextValid()) {
      return;
    }

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
      // Extension context may have been invalidated during async operation
      // Only log if context is still valid
      if (isExtensionContextValid()) {
        console.error('[DataLayer Debugger Content Script] Initialization error:', error);
      }
    }
  }

  // Suppress "Extension context invalidated" errors globally
  // This prevents console pollution when extension is reloaded
  window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('Extension context invalidated')) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  }, true);

  // Also suppress unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && event.reason.message &&
        event.reason.message.includes('Extension context invalidated')) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  }, true);

  // Run initialization
  initialize();
})();
