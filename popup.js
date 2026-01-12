// DOM Elements
var formatBtns = document.querySelectorAll('.format-btn');
var startSelectBtn = document.getElementById('startSelect');
var statusSection = document.getElementById('statusSection');
var statusText = document.getElementById('statusText');
var resultSection = document.getElementById('resultSection');
var resultText = document.getElementById('resultText');
var resultMeta = document.getElementById('resultMeta');
var copyBtn = document.getElementById('copyBtn');
var toast = document.getElementById('toast');
var toastText = document.getElementById('toastText');

// State
var selectedFormat = 'text';
var isSelecting = false;
var currentTabId = null;

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
  // Get current tab
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];
  currentTabId = tab.id;
  
  // Check if we can run on this page
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
    showToast('無法在此頁面使用', 'error');
    startSelectBtn.disabled = true;
    startSelectBtn.style.opacity = '0.5';
    return;
  }
  
  // Load saved format preference
  chrome.storage.local.get(['format', 'lastExtracted'], function(result) {
    if (result.format) {
      selectedFormat = result.format;
      updateFormatButtons();
    }
    
    // Show last extracted text if recent (within 30 seconds)
    if (result.lastExtracted && Date.now() - result.lastExtracted.timestamp < 30000) {
      resultSection.style.display = 'block';
      resultText.value = result.lastExtracted.text;
      var formatLabel = result.lastExtracted.format === 'markdown' ? 'Markdown' : '純文字';
      resultMeta.textContent = formatLabel + ' · ' + result.lastExtracted.text.length + ' 字元';
    }
  });
});

// Format button handlers
formatBtns.forEach(function(btn) {
  btn.addEventListener('click', function() {
    selectedFormat = btn.dataset.format;
    updateFormatButtons();
    chrome.storage.local.set({ format: selectedFormat });
  });
});

function updateFormatButtons() {
  formatBtns.forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.format === selectedFormat);
  });
}

// Inject content script
async function injectContentScript(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      css: '#bte-overlay{position:fixed!important;pointer-events:none!important;border:2px solid #6366f1!important;background:rgba(99,102,241,.15)!important;border-radius:4px!important;z-index:2147483646!important;box-shadow:0 0 0 4px rgba(99,102,241,.25)!important;display:none}'
    });
    
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    
    return true;
  } catch (error) {
    console.error('Inject failed:', error);
    return false;
  }
}

// Start selection button
startSelectBtn.addEventListener('click', async function() {
  if (!currentTabId) return;
  
  if (isSelecting) {
    try {
      await chrome.tabs.sendMessage(currentTabId, { action: 'stopSelection' });
    } catch (e) {}
    setSelectingState(false);
    return;
  }
  
  statusSection.style.display = 'block';
  statusText.textContent = '正在初始化...';
  
  var injected = await injectContentScript(currentTabId);
  
  if (!injected) {
    showToast('無法在此頁面使用', 'error');
    statusSection.style.display = 'none';
    return;
  }
  
  await new Promise(function(r) { setTimeout(r, 150); });
  
  try {
    await chrome.tabs.sendMessage(currentTabId, { 
      action: 'startSelection',
      format: selectedFormat
    });
    setSelectingState(true);
    
    // Close popup after a short delay so user can see the status
    setTimeout(function() {
      window.close();
    }, 500);
  } catch (error) {
    console.error('Start failed:', error);
    showToast('啟動失敗，請重試', 'error');
    statusSection.style.display = 'none';
  }
});

function setSelectingState(selecting) {
  isSelecting = selecting;
  
  if (selecting) {
    startSelectBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" stroke-width="2"/></svg><span>停止選擇</span>';
    startSelectBtn.classList.add('selecting');
    statusSection.style.display = 'block';
    statusText.textContent = '選擇模式已啟動，請點擊網頁區塊';
  } else {
    startSelectBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 3L19 12L12 13L9 20L5 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>開始選擇區塊</span>';
    startSelectBtn.classList.remove('selecting');
    statusSection.style.display = 'none';
  }
}

// Copy button
copyBtn.addEventListener('click', function() {
  var text = resultText.value;
  if (!text) return;
  
  navigator.clipboard.writeText(text).then(function() {
    copyBtn.classList.add('copied');
    showToast('已複製到剪貼簿');
    setTimeout(function() {
      copyBtn.classList.remove('copied');
    }, 1500);
  }).catch(function() {
    showToast('複製失敗', 'error');
  });
});

// Show toast notification
function showToast(message, type) {
  toastText.textContent = message;
  toast.style.background = type === 'error' ? '#ef4444' : '#22c55e';
  toast.classList.add('show');
  setTimeout(function() {
    toast.classList.remove('show');
  }, 2000);
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'textExtracted') {
    resultSection.style.display = 'block';
    resultText.value = message.text;
    
    var formatLabel = message.format === 'markdown' ? 'Markdown' : '純文字';
    resultMeta.textContent = formatLabel + ' · ' + message.text.length + ' 字元';
    
    showToast('文字已擷取並複製');
    setSelectingState(false);
  } else if (message.action === 'selectionCancelled') {
    setSelectingState(false);
  }
});
