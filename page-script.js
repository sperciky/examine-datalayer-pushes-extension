/**
 * DataLayer Push Interceptor
 * Runs in page context (not content script context) to intercept push calls
 * to configurable global array objects.
 *
 * Context Isolation:
 * This script must run in the page's execution context, not the isolated
 * content script context, because we need to intercept the actual window
 * object properties that the page's JavaScript modifies.
 *
 * Early Injection:
 * Must be injected at document_start before any page scripts run to catch
 * early dataLayer pushes and survive object reassignments.
 *
 * Reassignment Detection:
 * Uses Object.defineProperty with getter/setter to detect and survive
 * reassignments like: window.dataLayer = []
 */

(function() {
  'use strict';

  // Get the observed object name from the script's data attribute
  // Injected by content script
  const observedObjectName = document.currentScript?.dataset?.observedObject || 'dataLayer';

  // Store original Array.prototype.push to ensure we can always call it
  const originalArrayPush = Array.prototype.push;

  /**
   * Parse error stack to extract file, line, and column information
   * Intelligently skips Chrome extension frames to find the actual page code
   */
  function parseStackTrace(stack) {
    if (!stack) return null;

    const lines = stack.split('\n');
    let immediateCallerIndex = -1;
    let immediateCallerInfo = null;
    let pageCallerIndex = -1;
    let pageCallerInfo = null;
    let hasExtensionFrames = false;

    // Skip first line (Error message) and second line (our wrapper function)
    // Parse all frames to find both immediate caller and first page caller
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];

      // Match Chrome/Edge format: "at functionName (file:line:column)"
      // or "at file:line:column"
      const chromeMatch = line.match(/at\s+(?:.*?\s+\()?(.+?):(\d+):(\d+)\)?$/);
      const firefoxMatch = line.match(/^.*?@(.+?):(\d+):(\d+)$/);

      const match = chromeMatch || firefoxMatch;
      if (!match) continue;

      const fileUrl = match[1];
      const lineNum = parseInt(match[2], 10);
      const colNum = parseInt(match[3], 10);

      const frameInfo = {
        file: fileUrl,
        line: lineNum,
        column: colNum,
        stackLineIndex: i,
        fullStack: stack
      };

      // Store the immediate caller (first valid frame)
      if (immediateCallerIndex === -1) {
        immediateCallerIndex = i;
        immediateCallerInfo = frameInfo;
      }

      // Check if this is a Chrome extension URL
      const isExtension = fileUrl.startsWith('chrome-extension://') ||
                          fileUrl.startsWith('moz-extension://') ||
                          fileUrl.startsWith('webkit-extension://');

      if (isExtension) {
        hasExtensionFrames = true;
      }

      // Store the first non-extension frame (actual page code)
      if (!isExtension && pageCallerIndex === -1) {
        pageCallerIndex = i;
        pageCallerInfo = frameInfo;
        break; // Found what we're looking for
      }
    }

    // Prefer page caller over extension caller
    const callerInfo = pageCallerInfo || immediateCallerInfo;

    if (!callerInfo) {
      return {
        file: 'unknown',
        line: 0,
        column: 0,
        stackLineIndex: 2,
        fullStack: stack,
        hasExtensionFrames: false
      };
    }

    return {
      file: callerInfo.file,
      line: callerInfo.line,
      column: callerInfo.column,
      stackLineIndex: callerInfo.stackLineIndex,
      fullStack: stack,
      hasExtensionFrames: hasExtensionFrames,
      // Include immediate caller if different (for transparency)
      immediateCaller: immediateCallerInfo !== pageCallerInfo ? {
        file: immediateCallerInfo?.file,
        line: immediateCallerInfo?.line,
        column: immediateCallerInfo?.column
      } : null
    };
  }

  /**
   * Create an intercepting push wrapper
   */
  function createPushInterceptor(objectName, originalPush) {
    return function(...args) {
      // Capture stack trace immediately
      const stack = new Error().stack;
      // Remove "Error" prefix to clean up the stack trace
      const cleanStack = stack.replace(/^Error\n/, '');
      const stackInfo = parseStackTrace(cleanStack);

      // Prepare message payload
      const payload = {
        type: 'DATALAYER_PUSH_INTERCEPTED',
        data: {
          objectName: objectName,
          timestamp: Date.now(),
          arguments: args.map(arg => {
            try {
              // Deep clone to avoid reference issues
              return JSON.parse(JSON.stringify(arg));
            } catch (e) {
              // Handle non-serializable objects
              return String(arg);
            }
          }),
          stackTrace: stackInfo
        }
      };

      // Send to content script via postMessage
      window.postMessage(payload, '*');

      // Call original push method and return its result
      return originalPush.apply(this, args);
    };
  }

  /**
   * Capture existing array entries before interception
   */
  function capturePreHookEntries(objectName, array) {
    if (!Array.isArray(array) || array.length === 0) {
      return;
    }

    const payload = {
      type: 'DATALAYER_PRE_HOOK_SNAPSHOT',
      data: {
        objectName: objectName,
        timestamp: Date.now(),
        entries: array.map(entry => {
          try {
            return JSON.parse(JSON.stringify(entry));
          } catch (e) {
            return String(entry);
          }
        })
      }
    };

    window.postMessage(payload, '*');
  }

  /**
   * Apply interception to an array object
   */
  function interceptArray(objectName, array) {
    if (!array || !Array.isArray(array)) {
      return;
    }

    // Capture pre-existing entries
    capturePreHookEntries(objectName, array);

    // Override push method with our interceptor
    const originalPush = array.push;
    array.push = createPushInterceptor(objectName, originalPush);

    // Mark as intercepted to avoid double-interception
    array.__dataLayerDebuggerIntercepted = true;
  }

  /**
   * Setup interception on the target object
   * Uses Object.defineProperty to survive reassignments
   */
  function setupInterception(objectName) {
    let internalValue = window[objectName];

    // If the object exists and is an array, intercept it immediately
    if (Array.isArray(internalValue) && !internalValue.__dataLayerDebuggerIntercepted) {
      interceptArray(objectName, internalValue);
    } else if (!internalValue) {
      // Initialize as empty array if it doesn't exist
      internalValue = [];
      interceptArray(objectName, internalValue);
    }

    // Use Object.defineProperty to detect and handle reassignments
    // This ensures our interception survives: window.dataLayer = []
    try {
      Object.defineProperty(window, objectName, {
        get() {
          return internalValue;
        },
        set(newValue) {
          // Object is being reassigned
          if (Array.isArray(newValue)) {
            // If not already intercepted, intercept the new array
            if (!newValue.__dataLayerDebuggerIntercepted) {
              interceptArray(objectName, newValue);
            }
            internalValue = newValue;
          } else {
            // Not an array, just store the value
            internalValue = newValue;
          }
        },
        configurable: true, // Allow reconfiguration if needed
        enumerable: true
      });
    } catch (e) {
      // If defineProperty fails (e.g., property already defined), log it
      console.warn(`[DataLayer Debugger] Could not define property ${objectName}:`, e);

      // Fallback: try to intercept the existing object anyway
      if (Array.isArray(window[objectName]) && !window[objectName].__dataLayerDebuggerIntercepted) {
        interceptArray(objectName, window[objectName]);
      }
    }
  }

  /**
   * Monitor for late initialization
   * Some scripts might define the object after our initial setup
   */
  function monitorLateInitialization(objectName) {
    // Check periodically if the object was created without triggering our setter
    const checkInterval = setInterval(() => {
      const obj = window[objectName];
      if (Array.isArray(obj) && !obj.__dataLayerDebuggerIntercepted) {
        interceptArray(objectName, obj);
      }
    }, 100);

    // Stop monitoring after 10 seconds (page should be loaded by then)
    setTimeout(() => clearInterval(checkInterval), 10000);
  }

  // Initialize interception
  try {
    setupInterception(observedObjectName);
    monitorLateInitialization(observedObjectName);

    // Signal successful initialization
    window.postMessage({
      type: 'DATALAYER_DEBUGGER_INITIALIZED',
      data: {
        objectName: observedObjectName,
        timestamp: Date.now()
      }
    }, '*');
  } catch (error) {
    console.error('[DataLayer Debugger] Initialization error:', error);
  }
})();
