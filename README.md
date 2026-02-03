# DataLayer Push Debugger

A production-ready Chrome Extension (Manifest V3) for debugging and intercepting pushes to configurable global array objects like `window.dataLayer`, `window.dataLayerHG`, or any custom array object.

## Features

- **Configurable Object Monitoring**: Track any global array object (default: `dataLayer`)
- **Comprehensive Interception**: Captures pushed data, source file, line/column, and full call stack
- **Resilient Design**: Survives object reassignments, late initialization, and `.push()` redefinitions
- **DevTools Integration**: Beautiful, filterable DevTools panel for viewing intercepted events
- **Pre-Hook Snapshots**: Captures existing array entries before interception begins
- **Production-Ready**: Clean code, no external dependencies, handles hostile page environments

## Installation

### From Source

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the extension directory

## Usage

### 1. Configure the Observed Object

1. Right-click the extension icon and select "Options" (or go to `chrome://extensions/` and click "Details" → "Extension options")
2. Enter the name of the global object you want to observe (e.g., `dataLayerHG`, `gtmDataLayer`)
3. Click "Save Settings"
4. Reload your page for changes to take effect

**Default:** If no object name is specified, the extension defaults to observing `dataLayer`.

### 2. View Intercepted Events

1. Open Chrome DevTools (F12 or Right-click → Inspect)
2. Navigate to the "DataLayer" panel
3. Interact with your website to trigger dataLayer pushes
4. Events will appear in real-time in the panel

### 3. Inspect Event Details

- Click on any event to expand and view:
  - **Pushed Data**: Full JSON representation of the pushed arguments
  - **Call Stack**: Complete stack trace showing where the push originated
  - **Source Information**: File, line, and column number

### 4. Filter Events

Use the filter input in the toolbar to search events by:
- Event name
- Object name
- Any content in the pushed data

### 5. Clear Logs

Click the "Clear" button in the toolbar to remove all logged events.

## Architecture

### File Structure

```
├── manifest.json              # Manifest V3 configuration
├── background.js              # Service worker for message relay
├── content-script.js          # Injector (runs in isolated context)
├── page-script.js             # Interceptor (runs in page context)
├── options.html               # Settings page UI
├── options.js                 # Settings page logic
├── devtools.html              # DevTools entry point
├── devtools.js                # DevTools panel registration
├── devtools-panel.html        # DevTools panel UI
├── devtools-panel.js          # DevTools panel logic
└── README.md                  # This file
```

### Context Isolation

The extension operates across three isolated contexts:

1. **Content Script Context** (`content-script.js`)
   - Isolated from page JavaScript
   - Retrieves configuration from `chrome.storage`
   - Injects page script into page context
   - Relays messages from page to background

2. **Page Context** (`page-script.js`)
   - Runs in the actual page's JavaScript context
   - Has access to real `window` object
   - Intercepts array push methods
   - Sends messages via `window.postMessage`

3. **DevTools Context** (`devtools-panel.js`)
   - Isolated DevTools panel
   - Receives messages via background service worker
   - Displays intercepted events

### Why Early Injection Matters

The extension injects at `document_start` (before any page scripts run) because:

1. **Catch Early Pushes**: Many analytics tools push events immediately during page load
2. **Survive Reassignments**: By setting up interception early, we can use `Object.defineProperty` to detect and handle object reassignments like `window.dataLayer = []`
3. **Prevent Race Conditions**: Ensures our interception is in place before third-party scripts initialize

### Reassignment Detection

The extension uses `Object.defineProperty` with custom getter/setter to:

1. Detect when `window[objectName]` is reassigned
2. Automatically re-apply interception to the new array
3. Survive hostile code that attempts to reset the object

```javascript
Object.defineProperty(window, objectName, {
  get() { return internalValue; },
  set(newValue) {
    if (Array.isArray(newValue) && !newValue.__intercepted) {
      interceptArray(objectName, newValue);
    }
    internalValue = newValue;
  }
});
```

### Late Initialization Handling

Some pages define `dataLayer` after initial page load. The extension:

1. Initializes an empty array if the object doesn't exist
2. Monitors for late initialization via periodic checks
3. Applies interception when the object is created

## Technical Details

### Manifest V3 Compliance

- Uses service worker instead of background page
- Uses `chrome.storage.sync` for settings persistence
- Properly declares `host_permissions` and `web_accessible_resources`
- No remotely hosted code

### No External Dependencies

The extension is built with vanilla JavaScript, HTML, and CSS. No frameworks, libraries, or build tools required.

### Security Considerations

- Does not break page execution
- Handles CSP (Content Security Policy) restrictions
- Safely handles non-serializable objects in push data
- Escapes HTML to prevent XSS in DevTools panel
- Validates settings input to prevent code injection

### Performance

- Minimal overhead: Interception wrapper is lightweight
- Efficient message passing: Only sends data when DevTools is open
- Smart filtering: Client-side filtering for fast search
- No polling: Event-driven architecture

## Testing Scenarios

The extension has been designed to handle:

1. **Object Reassignment**
   ```javascript
   window.dataLayer = [];
   window.dataLayer.push({ event: 'test' }); // Still intercepted
   ```

2. **Late Initialization**
   ```javascript
   // Extension initializes empty array
   setTimeout(() => {
     window.dataLayer = [];
     window.dataLayer.push({ event: 'delayed' }); // Intercepted
   }, 5000);
   ```

3. **Push Method Redefinition**
   ```javascript
   window.dataLayer.push = function() { /* custom */ };
   // Extension re-applies interception
   ```

4. **Pre-Existing Entries**
   ```javascript
   window.dataLayer = [{ event: 'existing' }];
   // Extension snapshots as "pre-hook" entry
   ```

5. **Multiple Frames**
   - Extension runs in all frames (`all_frames: true`)
   - Each frame is isolated and tracked separately

## Troubleshooting

### Events Not Appearing

1. Ensure DevTools is open (extension only captures when DevTools is active)
2. Check that the correct object name is configured in Options
3. Reload the page after changing settings
4. Verify the object exists: Open Console and type `window.dataLayer`

### "Refused to execute inline script" Error

This is normal if the page has a strict CSP. The extension injects via `<script src>` which respects CSP policies. The interception should still work.

### Extension Not Loading

1. Verify all files are present in the extension directory
2. Check `chrome://extensions/` for error messages
3. Ensure Chrome version supports Manifest V3 (Chrome 88+)

## Browser Compatibility

- Chrome 88+ (Manifest V3 support)
- Edge 88+ (Chromium-based)
- Other Chromium-based browsers with Manifest V3 support

## Development

### Code Quality Standards

- Production-ready code (not a demo)
- Comprehensive inline comments explaining "why" not "what"
- No clever hacks; favor correctness and debuggability
- Defensive coding for hostile page environments

### Future Enhancements

Potential improvements (not implemented):

- Multi-object observation (comma-separated list)
- Export logs to JSON/CSV
- Real-time push notifications
- Integration with Google Tag Manager debugging
- Custom event highlighting rules

## License

This extension is provided as-is for debugging and development purposes.

## Contributing

This is a complete, production-ready implementation. Contributions welcome for bug fixes and feature enhancements.

## Credits

Built following Chrome Extension Manifest V3 best practices and security guidelines.
