// Background Service Worker
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'textExtracted') {
    // Save to storage
    chrome.storage.local.set({ 
      lastExtracted: {
        text: message.text,
        format: message.format,
        timestamp: Date.now()
      }
    });
    sendResponse({ success: true });
  }
  return true;
});

console.log('BTE: Background service worker ready');
