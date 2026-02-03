/**
 * DevTools Entry Point
 * Creates the DataLayer panel in Chrome DevTools
 */

chrome.devtools.panels.create(
  'DataLayer',
  '', // icon path (empty for now)
  'devtools-panel.html',
  function(panel) {
    // Panel created
  }
);
