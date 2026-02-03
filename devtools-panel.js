/**
 * DevTools Panel Script
 * Displays intercepted push events in the DevTools panel
 */

console.log('[DevTools Panel] Script starting to load...');

(function() {
  'use strict';

  console.log('[DevTools Panel] IIFE started');

  try {

  // IMMEDIATELY add a visible banner to confirm script is loading
  const loadBanner = document.createElement('div');
  loadBanner.id = 'loadBanner';
  loadBanner.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: #4caf50; color: white; padding: 8px; text-align: center; font-weight: bold; z-index: 9999; font-size: 12px;';
  loadBanner.textContent = `✓ Script Loaded: ${new Date().toLocaleTimeString()}`;
  document.body.insertBefore(loadBanner, document.body.firstChild);

  // Remove banner after 3 seconds
  setTimeout(() => {
    if (loadBanner && loadBanner.parentNode) {
      loadBanner.parentNode.removeChild(loadBanner);
    }
  }, 3000);

  // UI Elements
  console.log('[DevTools Panel] Getting UI elements...');
  const content = document.getElementById('content');
  const emptyState = document.getElementById('emptyState');
  const clearButton = document.getElementById('clearButton');
  const filterInput = document.getElementById('filterInput');
  const logCount = document.getElementById('logCount');
  const persistCheckbox = document.getElementById('persistCheckbox');
  const versionBadge = document.getElementById('versionBadge');
  const connectionStatus = document.getElementById('connectionStatus');

  console.log('[DevTools Panel] UI elements:', {
    content: !!content,
    emptyState: !!emptyState,
    clearButton: !!clearButton,
    filterInput: !!filterInput,
    logCount: !!logCount,
    persistCheckbox: !!persistCheckbox,
    versionBadge: !!versionBadge,
    connectionStatus: !!connectionStatus
  });

  // Update version badge to show script loaded successfully
  if (versionBadge) {
    const loadTime = new Date().toLocaleTimeString();
    versionBadge.textContent = `Loaded: ${loadTime}`;
    versionBadge.title = `Script loaded at ${loadTime}`;
    console.log('[DevTools Panel] Version badge updated:', loadTime);
  }

  // State
  let logs = [];
  let currentFilter = '';
  let currentUrl = '';
  let persistData = false;

  /**
   * Format timestamp to readable string
   */
  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  }

  /**
   * Extract event name from push arguments
   */
  function getEventName(args) {
    if (!args || args.length === 0) return null;

    const firstArg = args[0];
    if (typeof firstArg === 'object' && firstArg !== null) {
      // Common patterns: { event: 'name' } or { 0: 'name' }
      if (firstArg.event) return firstArg.event;
      if (firstArg[0]) return firstArg[0];

      // Try to find any property that might be an event name
      const keys = Object.keys(firstArg);
      if (keys.length > 0) {
        return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
      }
    }

    return String(firstArg).substring(0, 50);
  }

  /**
   * Format source information
   */
  function formatSource(stackInfo) {
    if (!stackInfo || !stackInfo.file) {
      return 'unknown';
    }

    // Extract just the filename from full path
    const filename = stackInfo.file.split('/').pop().split('?')[0];
    return `${filename}:${stackInfo.line}:${stackInfo.column}`;
  }

  /**
   * Create HTML for a log entry
   */
  function createLogEntry(log, index) {
    const eventName = getEventName(log.arguments);
    const sourceInfo = formatSource(log.stackTrace);
    const timestamp = formatTimestamp(log.timestamp);
    const isPreHook = log.type === 'pre-hook';

    const entryDiv = document.createElement('div');
    entryDiv.className = `log-entry ${isPreHook ? 'pre-hook' : 'regular'}`;
    entryDiv.dataset.index = index;

    // Header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'log-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'log-header-left';

    // Get full file path for title
    const fullPath = log.stackTrace?.file || 'unknown';
    const hasExtensions = log.stackTrace?.hasExtensionFrames || false;

    // Check if this log is from a different URL (when persisting)
    const isDifferentUrl = persistData && log.url && log.url !== currentUrl;
    const urlBadge = isDifferentUrl
      ? `<span class="url-badge different-url" title="${escapeHtml(log.url)}">${escapeHtml(getShortenedUrl(log.url))}</span>`
      : '';

    headerLeft.innerHTML = `
      <span class="expand-icon">▶</span>
      <span class="object-name">${log.objectName}</span>
      ${eventName ? `<span class="event-name">${eventName}</span>` : ''}
      ${isPreHook ? '<span class="pre-hook-badge">Pre-Hook</span>' : ''}
      ${hasExtensions && !isPreHook ? '<span class="extension-badge" title="Push went through browser extensions">Via Extension</span>' : ''}
      ${urlBadge}
    `;

    const headerRight = document.createElement('div');
    headerRight.className = 'log-header-right';

    // Only show source-info for regular pushes (not pre-hook)
    if (!isPreHook) {
      headerRight.innerHTML = `
        <span class="source-info" title="Click to see full stack trace&#10;&#10;Full path: ${escapeHtml(fullPath)}">${escapeHtml(sourceInfo)}</span>
        <span class="timestamp">${timestamp}</span>
      `;
    } else {
      headerRight.innerHTML = `
        <span class="timestamp">${timestamp}</span>
      `;
    }

    headerDiv.appendChild(headerLeft);
    headerDiv.appendChild(headerRight);

    // Body (initially hidden)
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'log-body';

    // Caller information section (prominent, only for regular pushes)
    if (!isPreHook && log.stackTrace && log.stackTrace.file) {
      const callerSection = document.createElement('div');
      callerSection.className = 'section';

      // Check if there's an intermediate extension caller
      const immediateCaller = log.stackTrace.immediateCaller;
      let callerHTML = `<div class="section-title">📍 Called From (Page Code)</div>`;

      // Show intermediate extension caller if present
      if (immediateCaller) {
        callerHTML += `
          <div class="intermediate-caller">
            <div class="intermediate-caller-label">⚠️ Via Extension:</div>
            ${escapeHtml(immediateCaller.file)}:${immediateCaller.line}:${immediateCaller.column}
          </div>
        `;
        callerHTML += `<div class="section-title" style="margin-top: 12px;">📍 Original Source (Page Code)</div>`;
      }

      callerHTML += `
        <div class="caller-badge" title="${escapeHtml(log.stackTrace.file)}">${escapeHtml(log.stackTrace.file)}:${log.stackTrace.line}:${log.stackTrace.column}</div>
      `;

      callerSection.innerHTML = callerHTML;
      bodyDiv.appendChild(callerSection);
    }

    // Arguments section
    const argsSection = document.createElement('div');
    argsSection.className = 'section';
    argsSection.innerHTML = `
      <div class="section-title">${isPreHook ? 'Pre-Hook Entries' : 'Pushed Data'}</div>
      <div class="code-block">${JSON.stringify(log.arguments, null, 2)}</div>
    `;
    bodyDiv.appendChild(argsSection);

    // Stack trace section (only for regular pushes)
    if (!isPreHook && log.stackTrace) {
      const stackSection = document.createElement('div');
      stackSection.className = 'section';

      // Use the stackLineIndex from parsed stack info for accurate highlighting
      const highlightIndex = log.stackTrace.stackLineIndex || 2;

      // Create stack section with title
      const stackTitle = document.createElement('div');
      stackTitle.className = 'section-title';
      stackTitle.textContent = '📚 Full Call Stack';
      stackSection.appendChild(stackTitle);

      // Create stack trace container
      const stackTraceContainer = document.createElement('div');
      stackTraceContainer.className = 'stack-trace';

      // Create clickable stack lines
      (log.stackTrace.fullStack || '').split('\n').forEach((line, i) => {
        if (line.trim()) {
          // Highlight the actual page caller
          const isHighlight = i === highlightIndex;

          // Check if this line contains an extension URL
          const isExtensionFrame = line.includes('chrome-extension://') ||
                                   line.includes('moz-extension://') ||
                                   line.includes('webkit-extension://');

          const stackLineElement = makeStackLineClickable(line, isHighlight, isExtensionFrame);
          stackTraceContainer.appendChild(stackLineElement);
        }
      });

      stackSection.appendChild(stackTraceContainer);
      bodyDiv.appendChild(stackSection);
    }

    entryDiv.appendChild(headerDiv);
    entryDiv.appendChild(bodyDiv);

    // Toggle expand/collapse on header click
    headerDiv.addEventListener('click', () => {
      entryDiv.classList.toggle('expanded');
    });

    return entryDiv;
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Parse a stack trace line to extract URL, line, and column
   * Returns {url, line, column, text} or null if can't parse
   */
  function parseStackLine(line) {
    // Match patterns like:
    // at functionName (https://example.com/file.js:123:45)
    // at https://example.com/file.js:123:45
    const match = line.match(/(?:at\s+)?(?:.*?\s+)?\(?([^\s)]+):(\d+):(\d+)\)?/);
    if (match) {
      return {
        url: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        text: line.trim()
      };
    }
    return null;
  }

  /**
   * Make a stack trace line clickable
   */
  function makeStackLineClickable(line, isHighlight, isExtensionFrame) {
    const parsed = parseStackLine(line);

    const frameClass = isExtensionFrame ? 'extension-frame' : 'page-frame';
    const highlightClass = isHighlight ? 'stack-highlight' : '';
    const title = isExtensionFrame
      ? 'Browser extension frame'
      : `Click to open in Sources at line ${parsed?.line}, column ${parsed?.column}`;

    if (parsed && !isExtensionFrame) {
      // Create a clickable line
      const div = document.createElement('div');
      div.className = `stack-line ${highlightClass} ${frameClass} clickable-stack`;
      div.title = title;
      div.textContent = line;
      div.style.cursor = 'pointer';
      div.style.textDecoration = 'none';

      // Add hover effect
      div.addEventListener('mouseenter', () => {
        div.style.textDecoration = 'underline';
      });
      div.addEventListener('mouseleave', () => {
        div.style.textDecoration = 'none';
      });

      // Handle click to open in DevTools Sources panel
      div.addEventListener('click', (e) => {
        e.stopPropagation();

        try {
          // Open the resource in Sources panel at exact line AND column
          // Both lineNumber and columnNumber are 0-based, so subtract 1
          chrome.devtools.panels.openResource(
            parsed.url,
            parsed.line - 1,
            parsed.column - 1,
            () => {
              if (chrome.runtime.lastError) {
                console.warn('[DevTools Panel] Could not open resource:', chrome.runtime.lastError.message);
              } else {
                console.log(`[DevTools Panel] Opened ${parsed.url} at line ${parsed.line}, column ${parsed.column}`);
              }
            }
          );
        } catch (error) {
          console.error('[DevTools Panel] Error opening resource:', error);
        }
      });

      return div;
    } else {
      // Non-clickable line (extension frame or unparseable)
      const div = document.createElement('div');
      div.className = `stack-line ${highlightClass} ${frameClass}`;
      div.title = title;
      div.textContent = line;
      return div;
    }
  }

  /**
   * Check if log matches current filter
   */
  function matchesFilter(log) {
    if (!currentFilter) return true;

    const eventName = getEventName(log.arguments);
    const filterLower = currentFilter.toLowerCase();

    return (
      eventName?.toLowerCase().includes(filterLower) ||
      log.objectName.toLowerCase().includes(filterLower) ||
      JSON.stringify(log.arguments).toLowerCase().includes(filterLower)
    );
  }

  /**
   * Render all logs to the UI
   */
  function render() {
    console.log('[DevTools Panel] render() called');
    console.log('[DevTools Panel] Total logs:', logs.length);
    console.log('[DevTools Panel] Current filter:', currentFilter);

    // Clear all log entries (keep only emptyState)
    const children = Array.from(content.children);
    console.log('[DevTools Panel] Total children before clear:', children.length);

    let removedCount = 0;
    children.forEach(child => {
      if (child !== emptyState) {
        console.log('[DevTools Panel] Removing child:', child.className);
        content.removeChild(child);
        removedCount++;
      }
    });
    console.log('[DevTools Panel] Removed', removedCount, 'children');
    console.log('[DevTools Panel] Remaining children:', content.children.length);

    const filteredLogs = logs.filter(matchesFilter);
    console.log('[DevTools Panel] Filtered logs:', filteredLogs.length);

    if (filteredLogs.length === 0) {
      console.log('[DevTools Panel] Showing empty state');
      emptyState.style.display = 'block';
      if (logs.length > 0 && currentFilter) {
        emptyState.innerHTML = `
          <div class="empty-state-icon">🔍</div>
          <h3>No Matching Events</h3>
          <p>No events match your filter criteria.</p>
        `;
      } else {
        emptyState.innerHTML = `
          <div class="empty-state-icon">📊</div>
          <h3>No DataLayer Events Yet</h3>
          <p>Push events will appear here as they occur on the page.</p>
        `;
      }
    } else {
      console.log('[DevTools Panel] Hiding empty state and rendering', filteredLogs.length, 'logs');
      emptyState.style.display = 'none';

      // Render logs with NEWEST FIRST (latest logs at top)
      // Iterate forwards, inserting each entry right after emptyState
      // This pushes older entries down, keeping newest at top
      for (let i = 0; i < filteredLogs.length; i++) {
        const logEntry = createLogEntry(filteredLogs[i], i);
        // Insert right after emptyState - each insertion pushes previous entries down
        if (emptyState.nextSibling) {
          content.insertBefore(logEntry, emptyState.nextSibling);
        } else {
          content.appendChild(logEntry);
        }
      }
      console.log('[DevTools Panel] Finished rendering. Total children now:', content.children.length);
    }

    // Update count
    logCount.textContent = `${logs.length} event${logs.length !== 1 ? 's' : ''}`;
    console.log('[DevTools Panel] Updated count to:', logs.length);
  }

  /**
   * Check if URL changed and handle accordingly
   */
  function checkUrlChange(newUrl) {
    if (!newUrl) return;

    // First log or URL hasn't been set yet
    if (!currentUrl) {
      currentUrl = newUrl;
      return;
    }

    // URL changed
    if (currentUrl !== newUrl) {
      // If persist is not enabled, clear logs
      if (!persistData) {
        logs = [];
      }
      currentUrl = newUrl;
    }
  }

  /**
   * Get shortened URL for display
   */
  function getShortenedUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + urlObj.pathname.substring(0, 30);
    } catch (e) {
      return url.substring(0, 40);
    }
  }

  /**
   * Add a new log entry
   */
  function addLog(type, data, url) {
    console.log('[DevTools Panel] addLog() called. Type:', type, 'URL:', url);

    // Check if we need to clear logs due to URL change
    checkUrlChange(url);

    const log = {
      type: type,
      objectName: data.objectName,
      timestamp: data.timestamp,
      arguments: type === 'pre-hook' ? data.entries : data.arguments,
      stackTrace: data.stackTrace || null,
      url: url || currentUrl // Store URL with each log
    };

    logs.push(log);
    console.log('[DevTools Panel] Log added. Total logs now:', logs.length);
    render();
  }

  /**
   * Clear all logs
   */
  function clearLogs() {
    console.log('[DevTools Panel] ========== CLEAR BUTTON CLICKED ==========');
    console.log('[DevTools Panel] Logs before clear:', logs.length);
    console.log('[DevTools Panel] Content children before clear:', content.children.length);

    // Clear the logs array
    logs = [];
    currentUrl = ''; // Reset URL tracking for fresh start
    currentFilter = ''; // Reset filter

    console.log('[DevTools Panel] Logs after clear:', logs.length);
    console.log('[DevTools Panel] Current URL reset to:', currentUrl);
    console.log('[DevTools Panel] Current filter reset to:', currentFilter);

    // Clear filter input
    if (filterInput) {
      filterInput.value = '';
    }

    console.log('[DevTools Panel] Calling render()...');
    render();
    console.log('[DevTools Panel] ========== CLEAR COMPLETE ==========');
  }

  /**
   * Handle filter input
   */
  function handleFilter() {
    currentFilter = filterInput.value.trim();
    render();
  }

  /**
   * Update connection status badge
   */
  function updateConnectionStatus(status) {
    if (!connectionStatus) return;

    switch (status) {
      case 'connected':
        connectionStatus.textContent = '● Connected';
        connectionStatus.style.background = '#34a853';
        connectionStatus.style.color = 'white';
        connectionStatus.title = 'Connected to background script';
        break;
      case 'connecting':
        connectionStatus.textContent = '○ Connecting...';
        connectionStatus.style.background = '#ffa726';
        connectionStatus.style.color = 'white';
        connectionStatus.title = 'Establishing connection...';
        break;
      case 'disconnected':
        connectionStatus.textContent = '○ Disconnected';
        connectionStatus.style.background = '#ea4335';
        connectionStatus.style.color = 'white';
        connectionStatus.title = 'Connection lost, will reconnect...';
        break;
      default:
        connectionStatus.textContent = '○ Unknown';
        connectionStatus.style.background = '#999';
        connectionStatus.style.color = 'white';
    }
  }

  /**
   * Setup message listener for intercepted events
   */
  let backgroundPageConnection = null;
  let reconnectTimeout = null;

  function setupMessageListener() {
    // Clear any existing reconnect timeout
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    console.log('[DevTools Panel] Creating connection to background script...');
    updateConnectionStatus('connecting');

    // Create a connection to the background page
    backgroundPageConnection = chrome.runtime.connect({
      name: 'devtools-panel'
    });

    // Send the tab ID to the background page
    backgroundPageConnection.postMessage({
      type: 'INIT',
      tabId: chrome.devtools.inspectedWindow.tabId
    });

    console.log('[DevTools Panel] Connection established, sent INIT message');
    updateConnectionStatus('connected');

    // Listen for messages from the background page
    backgroundPageConnection.onMessage.addListener((message) => {
      console.log('[DevTools Panel] Received message:', message.type);
      if (message.type === 'DATALAYER_PUSH_INTERCEPTED') {
        addLog('regular', message.data, message.url);
      } else if (message.type === 'DATALAYER_PRE_HOOK_SNAPSHOT') {
        addLog('pre-hook', message.data, message.url);
      }
    });

    // Handle disconnection and automatically reconnect
    backgroundPageConnection.onDisconnect.addListener(() => {
      console.warn('[DevTools Panel] Connection disconnected');
      updateConnectionStatus('disconnected');
      backgroundPageConnection = null;

      // Reconnect after a short delay to allow the new page to fully load
      // This gives the new content script time to inject and be ready
      const delay = 500;
      console.log(`[DevTools Panel] Reconnecting in ${delay}ms...`);
      updateConnectionStatus('connecting');

      reconnectTimeout = setTimeout(() => {
        try {
          console.log('[DevTools Panel] Attempting reconnection now...');
          setupMessageListener();
        } catch (e) {
          console.error('[DevTools Panel] Reconnection failed:', e);
          updateConnectionStatus('disconnected');
        }
      }, delay);
    });
  }

  /**
   * Setup page navigation listener to handle page changes
   */
  function setupNavigationListener() {
    if (chrome.devtools.network && chrome.devtools.network.onNavigated) {
      chrome.devtools.network.onNavigated.addListener((url) => {
        console.log('[DevTools Panel] Page navigated to:', url);
        console.log('[DevTools Panel] Persist data enabled:', persistData);

        // If persist data is disabled, clear logs on navigation
        if (!persistData) {
          console.log('[DevTools Panel] Persist data disabled, clearing logs...');
          logs = [];
          currentUrl = url;
          render();
        } else {
          console.log('[DevTools Panel] Persist data enabled, keeping logs across navigation');
        }

        // Reconnect to ensure we're receiving messages from the new page
        if (backgroundPageConnection) {
          console.log('[DevTools Panel] Reconnecting after navigation...');
          try {
            backgroundPageConnection.disconnect();
          } catch (e) {
            // Connection might already be disconnected
            console.log('[DevTools Panel] Disconnect error (expected if already disconnected):', e.message);
          }
          // setupMessageListener will be called by the onDisconnect handler
        } else {
          console.warn('[DevTools Panel] No background connection found, setting up new connection...');
          setupMessageListener();
        }
      });
      console.log('[DevTools Panel] Navigation listener setup complete');
    } else {
      console.warn('[DevTools Panel] chrome.devtools.network.onNavigated not available');
    }
  }

  /**
   * Setup event listeners for content script messages
   * (Alternative approach if background page relay is not used)
   */
  function setupDirectListener() {
    chrome.runtime.onMessage.addListener((message, sender) => {
      // Only process messages from the inspected tab
      if (sender.tab && sender.tab.id === chrome.devtools.inspectedWindow.tabId) {
        if (message.type === 'DATALAYER_PUSH_INTERCEPTED') {
          addLog('regular', message.data, message.url);
        } else if (message.type === 'DATALAYER_PRE_HOOK_SNAPSHOT') {
          addLog('pre-hook', message.data, message.url);
        }
      }
    });
  }

  /**
   * Load persist data preference
   */
  async function loadPersistPreference() {
    try {
      const result = await chrome.storage.local.get({ persistData: false });
      persistData = result.persistData;
      persistCheckbox.checked = persistData;
    } catch (e) {
      // Ignore errors, default to false
    }
  }

  /**
   * Handle persist checkbox change
   */
  async function handlePersistChange() {
    persistData = persistCheckbox.checked;
    try {
      await chrome.storage.local.set({ persistData: persistData });
    } catch (e) {
      // Ignore errors
    }
  }

  // Event listeners
  console.log('[DevTools Panel] Attaching event listeners...');

  if (clearButton) {
    clearButton.addEventListener('click', clearLogs);
    console.log('[DevTools Panel] Clear button listener attached');
  } else {
    console.error('[DevTools Panel] clearButton not found!');
  }

  if (filterInput) {
    filterInput.addEventListener('input', handleFilter);
    console.log('[DevTools Panel] Filter input listener attached');
  } else {
    console.error('[DevTools Panel] filterInput not found!');
  }

  if (persistCheckbox) {
    persistCheckbox.addEventListener('change', handlePersistChange);
    console.log('[DevTools Panel] Persist checkbox listener attached');
  } else {
    console.error('[DevTools Panel] persistCheckbox not found!');
  }

  // Initialize
  async function initialize() {
    console.log('[DevTools Panel] initialize() called');

    // Load persist preference
    console.log('[DevTools Panel] Loading persist preference...');
    await loadPersistPreference();

    // Setup navigation listener to handle page changes
    console.log('[DevTools Panel] Setting up navigation listener...');
    setupNavigationListener();

    // Setup message listeners
    console.log('[DevTools Panel] Setting up message listeners...');
    try {
      setupMessageListener();
      console.log('[DevTools Panel] setupMessageListener() succeeded');
    } catch (e) {
      console.log('[DevTools Panel] setupMessageListener() failed, using fallback');
      // Fallback to direct listener if connection approach fails
      setupDirectListener();
    }

    // Initial render
    console.log('[DevTools Panel] Calling initial render...');
    render();
    console.log('[DevTools Panel] Initialization complete');
  }

  console.log('[DevTools Panel] Calling initialize()...');
  initialize();
  console.log('[DevTools Panel] After initialize() call');

  } catch (error) {
    console.error('[DevTools Panel] FATAL ERROR:', error);
    console.error('[DevTools Panel] Stack trace:', error.stack);
  }
})();

console.log('[DevTools Panel] Script finished loading');
