// DOM Elements
const formatBtns = document.querySelectorAll('.format-btn');
const startSelectBtn = document.getElementById('startSelect');
const statusSection = document.getElementById('statusSection');
const statusText = document.getElementById('statusText');
const resultSection = document.getElementById('resultSection');
const resultText = document.getElementById('resultText');
const resultMeta = document.getElementById('resultMeta');
const copyBtn = document.getElementById('copyBtn');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toastText');

// State
let selectedFormat = 'text';
let isSelecting = false;
let currentTabId = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;
  
  // Check if we can run on this page
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
    showToast('無法在此頁面使用', 'error');
    startSelectBtn.disabled = true;
    startSelectBtn.style.opacity = '0.5';
    return;
  }
  
  // Load saved format preference
  chrome.storage.local.get(['format'], (result) => {
    if (result.format) {
      selectedFormat = result.format;
      updateFormatButtons();
    }
  });
});

// Format button handlers
formatBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    selectedFormat = btn.dataset.format;
    updateFormatButtons();
    chrome.storage.local.set({ format: selectedFormat });
  });
});

function updateFormatButtons() {
  formatBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.format === selectedFormat);
  });
}

// Inject content script and CSS
async function injectContentScript(tabId) {
  try {
    // Inject CSS first
    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      css: `
        #bte-overlay {
          position: fixed !important;
          pointer-events: none !important;
          border: 2px solid #6366f1 !important;
          background: rgba(99, 102, 241, 0.1) !important;
          border-radius: 4px !important;
          z-index: 2147483647 !important;
          transition: all 0.1s ease !important;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2) !important;
          display: none;
        }
      `
    });
    
    // Inject main script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    
    return true;
  } catch (error) {
    console.error('Failed to inject script:', error);
    return false;
  }
}

// Start selection button
startSelectBtn.addEventListener('click', async () => {
  if (!currentTabId) return;
  
  if (isSelecting) {
    // Stop selection mode
    try {
      await chrome.tabs.sendMessage(currentTabId, { action: 'stopSelection' });
    } catch (e) {
      // Ignore errors
    }
    setSelectingState(false);
  } else {
    // Inject script and start selection
    statusSection.style.display = 'block';
    statusText.textContent = '正在初始化...';
    
    const injected = await injectContentScript(currentTabId);
    
    if (!injected) {
      showToast('無法在此頁面使用', 'error');
      statusSection.style.display = 'none';
      return;
    }
    
    // Small delay to ensure script is ready
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      await chrome.tabs.sendMessage(currentTabId, { 
        action: 'startSelection',
        format: selectedFormat
      });
      setSelectingState(true);
    } catch (error) {
      console.error('Failed to start selection:', error);
      showToast('啟動失敗，請重試', 'error');
      statusSection.style.display = 'none';
    }
  }
});

function setSelectingState(selecting) {
  isSelecting = selecting;
  
  if (selecting) {
    startSelectBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" stroke-width="2"/>
      </svg>
      <span>停止選擇</span>
    `;
    startSelectBtn.classList.add('selecting');
    statusSection.style.display = 'block';
    statusText.textContent = '選擇模式已啟動，請點擊網頁區塊';
  } else {
    startSelectBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3L19 12L12 13L9 20L5 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>開始選擇區塊</span>
    `;
    startSelectBtn.classList.remove('selecting');
    statusSection.style.display = 'none';
  }
}

// Copy button
copyBtn.addEventListener('click', () => {
  const text = resultText.value;
  if (!text) return;
  
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.classList.add('copied');
    showToast('已複製到剪貼簿');
    setTimeout(() => {
      copyBtn.classList.remove('copied');
    }, 1500);
  }).catch(err => {
    showToast('複製失敗', 'error');
  });
});

// Show toast notification
function showToast(message, type = 'success') {
  toastText.textContent = message;
  toast.style.background = type === 'error' ? '#ef4444' : '#22c55e';
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'textExtracted') {
    // Show result
    resultSection.style.display = 'block';
    resultText.value = message.text;
    
    // Show meta info
    const charCount = message.text.length;
    const formatLabel = message.format === 'markdown' ? 'Markdown' : '純文字';
    resultMeta.textContent = `${formatLabel} · ${charCount} 字元`;
    
    // Auto copy to clipboard
    navigator.clipboard.writeText(message.text).then(() => {
      showToast('文字已擷取並複製');
    }).catch(() => {
      showToast('已擷取，請手動複製', 'error');
    });
    
    // Reset selection state
    setSelectingState(false);
  } else if (message.action === 'selectionCancelled') {
    setSelectingState(false);
  }
});
