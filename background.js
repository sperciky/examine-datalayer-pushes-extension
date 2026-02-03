/**
 * Background Service Worker (Manifest V3)
 * Relays messages between content scripts and DevTools panels
 *
 * Why this is needed:
 * Content scripts cannot directly communicate with DevTools panels.
 * The background service worker acts as a message relay.
 */

// Store connections from DevTools panels
const devtoolsConnections = new Map();

/**
 * Handle connections from DevTools panels
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'devtools-panel') {
    let tabId = null;

    // Listen for the INIT message containing the tab ID
    const messageListener = (message) => {
      if (message.type === 'INIT' && message.tabId) {
        tabId = message.tabId;

        // Store the connection for this tab
        if (!devtoolsConnections.has(tabId)) {
          devtoolsConnections.set(tabId, []);
        }
        devtoolsConnections.get(tabId).push(port);
      }
    };

    port.onMessage.addListener(messageListener);

    // Clean up when DevTools panel is closed
    port.onDisconnect.addListener(() => {
      if (tabId !== null) {
        const connections = devtoolsConnections.get(tabId);
        if (connections) {
          const index = connections.indexOf(port);
          if (index !== -1) {
            connections.splice(index, 1);
          }
          if (connections.length === 0) {
            devtoolsConnections.delete(tabId);
          }
        }
      }
    });
  }
});

/**
 * Handle messages from content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Forward messages from content scripts to DevTools panels
  if (sender.tab && (
    message.type === 'DATALAYER_PUSH_INTERCEPTED' ||
    message.type === 'DATALAYER_PRE_HOOK_SNAPSHOT' ||
    message.type === 'DATALAYER_DEBUGGER_INITIALIZED'
  )) {
    const tabId = sender.tab.id;
    const connections = devtoolsConnections.get(tabId);

    if (connections && connections.length > 0) {
      connections.forEach((port) => {
        try {
          port.postMessage(message);
        } catch (e) {
          // Port might be disconnected
        }
      });
    }

    // Send response to prevent "message port closed" error
    sendResponse({ received: true });
  }

  // Return true to indicate we'll send a response asynchronously
  return true;
});
