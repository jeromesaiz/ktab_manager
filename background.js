/* background.js – Track tab activation counts in memory (no persistence) */
const accessCounts = {};

browser.tabs.onActivated.addListener(function(activeInfo) {
  accessCounts[activeInfo.tabId] = (accessCounts[activeInfo.tabId] || 0) + 1;
});

browser.windows.onFocusChanged.addListener(function(windowId) {
  if (windowId === browser.windows.WINDOW_ID_NONE) return;
  browser.tabs.query({ active: true, windowId: windowId }).then(function(activeTabs) {
    if (activeTabs.length > 0) {
      var tabId = activeTabs[0].id;
      accessCounts[tabId] = (accessCounts[tabId] || 0) + 1;
    }
  });
});

browser.tabs.onRemoved.addListener(function(tabId) {
  delete accessCounts[tabId];
});

browser.runtime.onMessage.addListener(function(message) {
  if (message.type === "getAccessCounts") {
    return Promise.resolve(accessCounts);
  }
});
