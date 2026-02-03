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
  console.log('[Background] Connection attempt, port name:', port.name);

  if (port.name === 'devtools-panel') {
    let tabId = null;

    // Listen for the INIT message containing the tab ID
    const messageListener = (message) => {
      console.log('[Background] Received message from DevTools panel:', message.type);

      if (message.type === 'INIT' && message.tabId) {
        tabId = message.tabId;
        console.log('[Background] Registering DevTools connection for tab:', tabId);

        // Store the connection for this tab
        if (!devtoolsConnections.has(tabId)) {
          devtoolsConnections.set(tabId, []);
        }
        devtoolsConnections.get(tabId).push(port);

        console.log('[Background] Total connections for tab', tabId, ':', devtoolsConnections.get(tabId).length);
        console.log('[Background] All registered tabs:', Array.from(devtoolsConnections.keys()));
      }
    };

    port.onMessage.addListener(messageListener);

    // Clean up when DevTools panel is closed
    port.onDisconnect.addListener(() => {
      console.log('[Background] DevTools panel disconnected for tab:', tabId);

      if (tabId !== null) {
        const connections = devtoolsConnections.get(tabId);
        if (connections) {
          const index = connections.indexOf(port);
          if (index !== -1) {
            connections.splice(index, 1);
            console.log('[Background] Removed connection. Remaining for tab', tabId, ':', connections.length);
          }
          if (connections.length === 0) {
            devtoolsConnections.delete(tabId);
            console.log('[Background] No more connections for tab', tabId, ', removed from map');
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
  console.log('[Background] Received message:', message.type, 'from tab:', sender.tab?.id);

  // Forward messages from content scripts to DevTools panels
  if (sender.tab && (
    message.type === 'DATALAYER_PUSH_INTERCEPTED' ||
    message.type === 'DATALAYER_PRE_HOOK_SNAPSHOT' ||
    message.type === 'DATALAYER_DEBUGGER_INITIALIZED'
  )) {
    const tabId = sender.tab.id;
    const connections = devtoolsConnections.get(tabId);

    console.log('[Background] Looking for connections for tab:', tabId);
    console.log('[Background] Found connections:', connections ? connections.length : 0);

    if (connections && connections.length > 0) {
      connections.forEach((port, index) => {
        try {
          console.log('[Background] Sending to DevTools connection', index + 1, 'of', connections.length);
          port.postMessage(message);
          console.log('[Background] Successfully sent to connection', index + 1);
        } catch (e) {
          console.error('[Background] Failed to send to connection', index + 1, ':', e);
        }
      });
    } else {
      console.warn('[Background] No DevTools connections found for tab', tabId);
      console.warn('[Background] Available tabs with connections:', Array.from(devtoolsConnections.keys()));
    }

    // Send response to prevent "message port closed" error
    sendResponse({ received: true });
  }

  // Return true to indicate we'll send a response asynchronously
  return true;
});
