// Block Text Extractor - Content Script
(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__BTE_LOADED__) {
    console.log('BTE: Already loaded, skipping...');
    return;
  }
  window.__BTE_LOADED__ = true;

  // State
  let isSelecting = false;
  let selectedFormat = 'text';
  let highlightedElement = null;
  let overlay = null;
  let toast = null;

  // Create overlay element
  function createOverlay() {
    removeOverlay();
    
    overlay = document.createElement('div');
    overlay.id = 'bte-overlay';
    overlay.style.cssText = `
      position: fixed !important;
      pointer-events: none !important;
      border: 2px solid #6366f1 !important;
      background: rgba(99, 102, 241, 0.15) !important;
      border-radius: 4px !important;
      z-index: 2147483646 !important;
      box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.25) !important;
      display: none !important;
      transition: top 0.05s, left 0.05s, width 0.05s, height 0.05s !important;
    `;
    document.body.appendChild(overlay);
  }

  // Remove overlay
  function removeOverlay() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
    const existing = document.getElementById('bte-overlay');
    if (existing) existing.remove();
  }

  // Create toast notification
  function createToast() {
    removeToast();
    
    toast = document.createElement('div');
    toast.id = 'bte-toast';
    toast.style.cssText = `
      position: fixed !important;
      bottom: 24px !important;
      left: 50% !important;
      transform: translateX(-50%) translateY(100px) !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 12px 20px !important;
      background: #22c55e !important;
      color: white !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      border-radius: 8px !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
      z-index: 2147483647 !important;
      transition: transform 0.3s ease !important;
    `;
    toast.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="flex-shrink: 0;"><path d="M20 6L9 17L4 12" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span>已複製到剪貼簿！</span>';
    document.body.appendChild(toast);
  }

  // Remove toast
  function removeToast() {
    if (toast && toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
    toast = null;
    const existing = document.getElementById('bte-toast');
    if (existing) existing.remove();
  }

  // Show toast with message
  function showToast(message, isError) {
    createToast();
    toast.querySelector('span').textContent = message;
    toast.style.background = isError ? '#ef4444' : '#22c55e';
    
    requestAnimationFrame(function() {
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    setTimeout(function() {
      if (toast) {
        toast.style.transform = 'translateX(-50%) translateY(100px)';
        setTimeout(removeToast, 300);
      }
    }, 2500);
  }

  // Highlight element
  function highlightElement(element) {
    if (!element || !overlay) return;
    
    const rect = element.getBoundingClientRect();
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.display = 'block';
  }

  // Get best selectable element
  function getBestElement(target) {
    let element = target;
    
    while (element && element !== document.body && element !== document.documentElement) {
      if (element.id === 'bte-overlay' || element.id === 'bte-toast') {
        return null;
      }
      
      const tag = element.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'HTML', 'BODY'].includes(tag)) {
        return null;
      }
      
      const rect = element.getBoundingClientRect();
      if (rect.width >= 30 && rect.height >= 15) {
        return element;
      }
      
      element = element.parentElement;
    }
    
    return null;
  }

  // Convert HTML to Markdown
  function htmlToMarkdown(element) {
    const result = [];
    
    function process(node, depth) {
      depth = depth || 0;
      
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text && text.trim()) {
          result.push(text);
        }
        return;
      }
      
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      
      const tag = node.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'svg', 'path'].includes(tag)) return;
      
      try {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return;
      } catch (e) {}
      
      const children = Array.from(node.childNodes);
      
      switch (tag) {
        case 'h1': result.push('\n# '); children.forEach(function(c) { process(c, depth); }); result.push('\n\n'); break;
        case 'h2': result.push('\n## '); children.forEach(function(c) { process(c, depth); }); result.push('\n\n'); break;
        case 'h3': result.push('\n### '); children.forEach(function(c) { process(c, depth); }); result.push('\n\n'); break;
        case 'h4': result.push('\n#### '); children.forEach(function(c) { process(c, depth); }); result.push('\n\n'); break;
        case 'h5': result.push('\n##### '); children.forEach(function(c) { process(c, depth); }); result.push('\n\n'); break;
        case 'h6': result.push('\n###### '); children.forEach(function(c) { process(c, depth); }); result.push('\n\n'); break;
        
        case 'p': children.forEach(function(c) { process(c, depth); }); result.push('\n\n'); break;
        case 'br': result.push('\n'); break;
        
        case 'strong': case 'b': result.push('**'); children.forEach(function(c) { process(c, depth); }); result.push('**'); break;
        case 'em': case 'i': result.push('*'); children.forEach(function(c) { process(c, depth); }); result.push('*'); break;
        case 'del': case 's': result.push('~~'); children.forEach(function(c) { process(c, depth); }); result.push('~~'); break;
        
        case 'code':
          var parentTag = node.parentElement ? node.parentElement.tagName.toLowerCase() : '';
          if (parentTag === 'pre') {
            children.forEach(function(c) { process(c, depth); });
          } else {
            result.push('`'); children.forEach(function(c) { process(c, depth); }); result.push('`');
          }
          break;
          
        case 'pre':
          var codeEl = node.querySelector('code');
          var langMatch = codeEl ? codeEl.className.match(/language-(\w+)/) : null;
          var lang = langMatch ? langMatch[1] : '';
          result.push('\n```' + lang + '\n');
          children.forEach(function(c) { process(c, depth); });
          result.push('\n```\n\n');
          break;
          
        case 'blockquote':
          result.push('\n> ');
          children.forEach(function(c) { process(c, depth); });
          result.push('\n\n');
          break;
          
        case 'a':
          var href = node.getAttribute('href');
          if (href && !href.startsWith('javascript:')) {
            result.push('['); children.forEach(function(c) { process(c, depth); }); result.push('](' + href + ')');
          } else {
            children.forEach(function(c) { process(c, depth); });
          }
          break;
          
        case 'img':
          var src = node.getAttribute('src');
          if (src) result.push('![' + (node.getAttribute('alt') || '') + '](' + src + ')');
          break;
          
        case 'ul':
          result.push('\n');
          children.forEach(function(child) {
            if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'li') {
              result.push('  '.repeat(depth) + '- ');
              Array.from(child.childNodes).forEach(function(c) { process(c, depth + 1); });
              result.push('\n');
            }
          });
          break;
          
        case 'ol':
          result.push('\n');
          var num = 1;
          children.forEach(function(child) {
            if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'li') {
              result.push('  '.repeat(depth) + num + '. ');
              num++;
              Array.from(child.childNodes).forEach(function(c) { process(c, depth + 1); });
              result.push('\n');
            }
          });
          break;
          
        case 'hr': result.push('\n---\n\n'); break;
        
        case 'table':
          var rows = node.querySelectorAll('tr');
          rows.forEach(function(row, i) {
            var cells = Array.from(row.querySelectorAll('th, td')).map(function(c) { 
              return c.textContent.trim().replace(/\|/g, '\\|'); 
            });
            result.push('| ' + cells.join(' | ') + ' |\n');
            if (i === 0) result.push('| ' + cells.map(function() { return '---'; }).join(' | ') + ' |\n');
          });
          result.push('\n');
          break;
          
        default:
          children.forEach(function(c) { process(c, depth); });
      }
    }
    
    process(element, 0);
    return result.join('').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Extract plain text
  function extractPlainText(element) {
    return (element.innerText || element.textContent || '')
      .replace(/\t/g, ' ')
      .replace(/[ ]+/g, ' ')
      .replace(/\n[ ]+/g, '\n')
      .replace(/[ ]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Copy to clipboard
  function copyToClipboard(text) {
    return navigator.clipboard.writeText(text).then(function() {
      return true;
    }).catch(function() {
      try {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
        document.body.appendChild(textarea);
        textarea.select();
        var success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
      } catch (e) {
        return false;
      }
    });
  }

  // Extract and copy text
  function extractText(element) {
    var text = selectedFormat === 'markdown' 
      ? htmlToMarkdown(element) 
      : extractPlainText(element);
    
    if (!text) {
      showToast('沒有找到文字內容', true);
      return;
    }
    
    copyToClipboard(text).then(function(success) {
      if (success) {
        showToast('已複製 ' + text.length + ' 字元！');
        
        try {
          chrome.runtime.sendMessage({
            action: 'textExtracted',
            text: text,
            format: selectedFormat
          }).catch(function() {});
        } catch (e) {}
      } else {
        showToast('複製失敗，請重試', true);
      }
    });
  }

  // Event handlers
  function onMouseMove(e) {
    if (!isSelecting) return;
    
    var element = getBestElement(e.target);
    if (element && element !== highlightedElement) {
      highlightedElement = element;
      highlightElement(element);
    }
  }

  function onClick(e) {
    if (!isSelecting) return;
    
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    var element = getBestElement(e.target);
    if (element) {
      extractText(element);
    }
    
    stopSelection();
    return false;
  }

  function onKeyDown(e) {
    if (!isSelecting) return;
    
    if (e.key === 'Escape') {
      showToast('已取消選擇');
      stopSelection();
    }
  }

  // Start selection
  function startSelection(format) {
    if (isSelecting) stopSelection();
    
    isSelecting = true;
    selectedFormat = format || 'text';
    highlightedElement = null;
    
    createOverlay();
    
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    
    document.body.style.cursor = 'crosshair';
    
    console.log('BTE: Selection started, format:', selectedFormat);
  }

  // Stop selection
  function stopSelection() {
    isSelecting = false;
    highlightedElement = null;
    
    removeOverlay();
    
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    
    document.body.style.cursor = '';
    
    console.log('BTE: Selection stopped');
  }

  // Message listener
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log('BTE: Received message', message);
    
    switch (message.action) {
      case 'startSelection':
        startSelection(message.format);
        sendResponse({ success: true });
        break;
      case 'stopSelection':
        stopSelection();
        sendResponse({ success: true });
        break;
      case 'ping':
        sendResponse({ success: true, loaded: true });
        break;
    }
    
    return true;
  });

  console.log('BTE: Content script ready');
})();
