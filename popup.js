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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Load saved format preference
  chrome.storage.local.get(['format'], (result) => {
    if (result.format) {
      selectedFormat = result.format;
      updateFormatButtons();
    }
  });

  // Check if already in selection mode
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not loaded, ignore
        return;
      }
      if (response && response.isSelecting) {
        setSelectingState(true);
      }
    });
  });
});

// Format button handlers
formatBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    selectedFormat = btn.dataset.format;
    updateFormatButtons();
    chrome.storage.local.set({ format: selectedFormat });
    
    // Notify content script of format change
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { 
        action: 'setFormat', 
        format: selectedFormat 
      });
    });
  });
});

function updateFormatButtons() {
  formatBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.format === selectedFormat);
  });
}

// Start selection button
startSelectBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (isSelecting) {
      // Stop selection mode
      chrome.tabs.sendMessage(tabs[0].id, { action: 'stopSelection' });
      setSelectingState(false);
    } else {
      // Start selection mode
      chrome.tabs.sendMessage(tabs[0].id, { 
        action: 'startSelection',
        format: selectedFormat
      }, (response) => {
        if (chrome.runtime.lastError) {
          showToast('請重新整理頁面後再試', 'error');
          return;
        }
        setSelectingState(true);
      });
    }
  });
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
    statusText.textContent = '選擇模式已啟動';
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
    const wordCount = message.text.trim().split(/\s+/).filter(w => w).length;
    const formatLabel = message.format === 'markdown' ? 'Markdown' : '純文字';
    resultMeta.textContent = `${formatLabel} · ${charCount} 字元 · ${wordCount} 詞`;
    
    // Auto copy to clipboard
    navigator.clipboard.writeText(message.text).then(() => {
      showToast('文字已擷取並複製');
    });
    
    // Reset selection state
    setSelectingState(false);
  } else if (message.action === 'selectionCancelled') {
    setSelectingState(false);
    statusText.textContent = '選擇已取消';
    setTimeout(() => {
      statusSection.style.display = 'none';
    }, 1000);
  }
});
