/**
 * DevTools Panel Script
 * Displays intercepted push events in the DevTools panel
 */

(function() {
  'use strict';

  // UI Elements
  const content = document.getElementById('content');
  const emptyState = document.getElementById('emptyState');
  const clearButton = document.getElementById('clearButton');
  const filterInput = document.getElementById('filterInput');
  const logCount = document.getElementById('logCount');
  const persistCheckbox = document.getElementById('persistCheckbox');

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

      const stackLines = (log.stackTrace.fullStack || '').split('\n')
        .map((line, i) => {
          // Highlight the actual page caller
          const isHighlight = i === highlightIndex;

          // Check if this line contains an extension URL
          const isExtensionFrame = line.includes('chrome-extension://') ||
                                   line.includes('moz-extension://') ||
                                   line.includes('webkit-extension://');

          const frameClass = isExtensionFrame ? 'extension-frame' : 'page-frame';

          return `<div class="stack-line ${isHighlight ? 'stack-highlight' : ''} ${frameClass}" title="${isExtensionFrame ? 'Browser extension frame' : 'Page code frame'}">${escapeHtml(line)}</div>`;
        })
        .join('');

      stackSection.innerHTML = `
        <div class="section-title">📚 Full Call Stack</div>
        <div class="stack-trace">${stackLines}</div>
      `;
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
    // Clear content except empty state
    while (content.firstChild && content.firstChild !== emptyState) {
      content.removeChild(content.firstChild);
    }

    const filteredLogs = logs.filter(matchesFilter);

    if (filteredLogs.length === 0) {
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
      emptyState.style.display = 'none';

      // Render logs in reverse order (newest first)
      for (let i = filteredLogs.length - 1; i >= 0; i--) {
        const logEntry = createLogEntry(filteredLogs[i], i);
        content.appendChild(logEntry);
      }
    }

    // Update count
    logCount.textContent = `${logs.length} event${logs.length !== 1 ? 's' : ''}`;
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
    render();
  }

  /**
   * Clear all logs
   */
  function clearLogs() {
    logs = [];
    currentUrl = ''; // Reset URL tracking for fresh start
    render();
  }

  /**
   * Handle filter input
   */
  function handleFilter() {
    currentFilter = filterInput.value.trim();
    render();
  }

  /**
   * Setup message listener for intercepted events
   */
  function setupMessageListener() {
    // Create a connection to the background page
    const backgroundPageConnection = chrome.runtime.connect({
      name: 'devtools-panel'
    });

    // Send the tab ID to the background page
    backgroundPageConnection.postMessage({
      type: 'INIT',
      tabId: chrome.devtools.inspectedWindow.tabId
    });

    // Listen for messages from the background page
    backgroundPageConnection.onMessage.addListener((message) => {
      if (message.type === 'DATALAYER_PUSH_INTERCEPTED') {
        addLog('regular', message.data, message.url);
      } else if (message.type === 'DATALAYER_PRE_HOOK_SNAPSHOT') {
        addLog('pre-hook', message.data, message.url);
      }
    });
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
  clearButton.addEventListener('click', clearLogs);
  filterInput.addEventListener('input', handleFilter);
  persistCheckbox.addEventListener('change', handlePersistChange);

  // Initialize
  async function initialize() {
    // Load persist preference
    await loadPersistPreference();

    // Setup message listeners
    try {
      setupMessageListener();
    } catch (e) {
      // Fallback to direct listener if connection approach fails
      setupDirectListener();
    }

    // Initial render
    render();
  }

  initialize();
})();
