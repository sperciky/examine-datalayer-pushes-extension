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

  // State
  let logs = [];
  let currentFilter = '';

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

    headerLeft.innerHTML = `
      <span class="expand-icon">▶</span>
      <span class="object-name">${log.objectName}</span>
      ${eventName ? `<span class="event-name">${eventName}</span>` : ''}
      ${isPreHook ? '<span class="pre-hook-badge">Pre-Hook</span>' : ''}
    `;

    const headerRight = document.createElement('div');
    headerRight.className = 'log-header-right';
    headerRight.innerHTML = `
      <span class="source-info" title="${log.stackTrace?.file || 'unknown'}">${sourceInfo}</span>
      <span class="timestamp">${timestamp}</span>
    `;

    headerDiv.appendChild(headerLeft);
    headerDiv.appendChild(headerRight);

    // Body (initially hidden)
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'log-body';

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

      const stackLines = (log.stackTrace.fullStack || '').split('\n')
        .map((line, i) => {
          // Highlight the actual caller (skip Error and wrapper lines)
          const isHighlight = i === 2;
          return `<div class="stack-line ${isHighlight ? 'stack-highlight' : ''}">${escapeHtml(line)}</div>`;
        })
        .join('');

      stackSection.innerHTML = `
        <div class="section-title">Call Stack</div>
        <div class="stack-trace">${stackLines}</div>
      `;
      bodyDiv.appendChild(stackSection);

      // Source info section
      const infoSection = document.createElement('div');
      infoSection.className = 'section';
      infoSection.innerHTML = `
        <div class="section-title">Source Information</div>
        <div class="info-grid">
          <span class="info-label">File:</span>
          <span class="info-value">${log.stackTrace.file || 'unknown'}</span>
          <span class="info-label">Line:</span>
          <span class="info-value">${log.stackTrace.line || 0}</span>
          <span class="info-label">Column:</span>
          <span class="info-value">${log.stackTrace.column || 0}</span>
        </div>
      `;
      bodyDiv.appendChild(infoSection);
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
   * Add a new log entry
   */
  function addLog(type, data) {
    const log = {
      type: type,
      objectName: data.objectName,
      timestamp: data.timestamp,
      arguments: type === 'pre-hook' ? data.entries : data.arguments,
      stackTrace: data.stackTrace || null
    };

    logs.push(log);
    render();
  }

  /**
   * Clear all logs
   */
  function clearLogs() {
    logs = [];
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
        addLog('regular', message.data);
      } else if (message.type === 'DATALAYER_PRE_HOOK_SNAPSHOT') {
        addLog('pre-hook', message.data);
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
          addLog('regular', message.data);
        } else if (message.type === 'DATALAYER_PRE_HOOK_SNAPSHOT') {
          addLog('pre-hook', message.data);
        }
      }
    });
  }

  // Event listeners
  clearButton.addEventListener('click', clearLogs);
  filterInput.addEventListener('input', handleFilter);

  // Initialize
  try {
    setupMessageListener();
  } catch (e) {
    // Fallback to direct listener if connection approach fails
    setupDirectListener();
  }

  render();
})();
