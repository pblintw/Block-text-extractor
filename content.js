// Block Text Extractor - Content Script

(function() {
  'use strict';

  // State
  let isSelecting = false;
  let selectedFormat = 'text';
  let highlightedElement = null;
  let overlay = null;

  // Create overlay element for highlighting
  function createOverlay() {
    if (overlay) return;
    
    overlay = document.createElement('div');
    overlay.id = 'bte-overlay';
    overlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      border: 2px solid #6366f1;
      background: rgba(99, 102, 241, 0.1);
      border-radius: 4px;
      z-index: 2147483647;
      transition: all 0.1s ease;
      box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
    `;
    document.body.appendChild(overlay);
  }

  // Remove overlay
  function removeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  // Highlight element
  function highlightElement(element) {
    if (!element || !overlay) return;
    
    const rect = element.getBoundingClientRect();
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.display = 'block';
  }

  // Hide highlight
  function hideHighlight() {
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  // Get best selectable element (avoid selecting tiny elements)
  function getBestElement(element) {
    if (!element || element === document.body || element === document.documentElement) {
      return null;
    }
    
    // Skip elements that are too small
    const rect = element.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 10) {
      return getBestElement(element.parentElement);
    }
    
    // Skip certain elements
    const skipTags = ['HTML', 'BODY', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK'];
    if (skipTags.includes(element.tagName)) {
      return null;
    }
    
    return element;
  }

  // Mouse move handler
  function onMouseMove(e) {
    if (!isSelecting) return;
    
    const element = getBestElement(e.target);
    if (element && element !== highlightedElement) {
      highlightedElement = element;
      highlightElement(element);
    }
  }

  // Mouse click handler
  function onClick(e) {
    if (!isSelecting) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const element = getBestElement(e.target);
    if (element) {
      extractText(element);
    }
    
    stopSelection();
  }

  // Keyboard handler (ESC to cancel)
  function onKeyDown(e) {
    if (!isSelecting) return;
    
    if (e.key === 'Escape') {
      stopSelection();
      chrome.runtime.sendMessage({ action: 'selectionCancelled' });
    }
  }

  // Convert HTML to Markdown
  function htmlToMarkdown(element) {
    const result = [];
    
    function processNode(node, listDepth = 0) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text.trim()) {
          result.push(text);
        }
        return;
      }
      
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      
      const tag = node.tagName.toLowerCase();
      const children = Array.from(node.childNodes);
      
      // Skip hidden elements
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return;
      }
      
      switch (tag) {
        case 'h1':
          result.push('\n# ');
          children.forEach(child => processNode(child, listDepth));
          result.push('\n\n');
          break;
          
        case 'h2':
          result.push('\n## ');
          children.forEach(child => processNode(child, listDepth));
          result.push('\n\n');
          break;
          
        case 'h3':
          result.push('\n### ');
          children.forEach(child => processNode(child, listDepth));
          result.push('\n\n');
          break;
          
        case 'h4':
          result.push('\n#### ');
          children.forEach(child => processNode(child, listDepth));
          result.push('\n\n');
          break;
          
        case 'h5':
          result.push('\n##### ');
          children.forEach(child => processNode(child, listDepth));
          result.push('\n\n');
          break;
          
        case 'h6':
          result.push('\n###### ');
          children.forEach(child => processNode(child, listDepth));
          result.push('\n\n');
          break;
          
        case 'p':
          children.forEach(child => processNode(child, listDepth));
          result.push('\n\n');
          break;
          
        case 'br':
          result.push('\n');
          break;
          
        case 'strong':
        case 'b':
          result.push('**');
          children.forEach(child => processNode(child, listDepth));
          result.push('**');
          break;
          
        case 'em':
        case 'i':
          result.push('*');
          children.forEach(child => processNode(child, listDepth));
          result.push('*');
          break;
          
        case 'u':
          result.push('<u>');
          children.forEach(child => processNode(child, listDepth));
          result.push('</u>');
          break;
          
        case 's':
        case 'strike':
        case 'del':
          result.push('~~');
          children.forEach(child => processNode(child, listDepth));
          result.push('~~');
          break;
          
        case 'code':
          if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') {
            children.forEach(child => processNode(child, listDepth));
          } else {
            result.push('`');
            children.forEach(child => processNode(child, listDepth));
            result.push('`');
          }
          break;
          
        case 'pre':
          const codeEl = node.querySelector('code');
          const lang = codeEl ? (codeEl.className.match(/language-(\w+)/) || [])[1] || '' : '';
          result.push('\n```' + lang + '\n');
          children.forEach(child => processNode(child, listDepth));
          result.push('\n```\n\n');
          break;
          
        case 'blockquote':
          result.push('\n> ');
          const bqText = [];
          children.forEach(child => {
            const tempResult = result;
            processNode(child, listDepth);
          });
          break;
          
        case 'a':
          const href = node.getAttribute('href');
          if (href && !href.startsWith('javascript:')) {
            result.push('[');
            children.forEach(child => processNode(child, listDepth));
            result.push(`](${href})`);
          } else {
            children.forEach(child => processNode(child, listDepth));
          }
          break;
          
        case 'img':
          const src = node.getAttribute('src');
          const alt = node.getAttribute('alt') || '';
          if (src) {
            result.push(`![${alt}](${src})`);
          }
          break;
          
        case 'ul':
          result.push('\n');
          children.forEach(child => processNode(child, listDepth));
          result.push('\n');
          break;
          
        case 'ol':
          result.push('\n');
          let counter = 1;
          children.forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'li') {
              const indent = '  '.repeat(listDepth);
              result.push(`${indent}${counter}. `);
              Array.from(child.childNodes).forEach(liChild => processNode(liChild, listDepth + 1));
              result.push('\n');
              counter++;
            }
          });
          result.push('\n');
          break;
          
        case 'li':
          if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'ul') {
            const indent = '  '.repeat(listDepth);
            result.push(`${indent}- `);
            children.forEach(child => processNode(child, listDepth + 1));
            result.push('\n');
          }
          break;
          
        case 'hr':
          result.push('\n---\n\n');
          break;
          
        case 'table':
          result.push('\n');
          processTable(node);
          result.push('\n');
          break;
          
        case 'div':
        case 'section':
        case 'article':
        case 'main':
        case 'aside':
        case 'header':
        case 'footer':
        case 'nav':
        case 'span':
        case 'figure':
        case 'figcaption':
          children.forEach(child => processNode(child, listDepth));
          break;
          
        case 'script':
        case 'style':
        case 'noscript':
          // Skip these elements
          break;
          
        default:
          children.forEach(child => processNode(child, listDepth));
      }
    }
    
    function processTable(table) {
      const rows = table.querySelectorAll('tr');
      if (rows.length === 0) return;
      
      rows.forEach((row, rowIndex) => {
        const cells = row.querySelectorAll('th, td');
        const cellTexts = Array.from(cells).map(cell => cell.textContent.trim().replace(/\|/g, '\\|'));
        result.push('| ' + cellTexts.join(' | ') + ' |\n');
        
        // Add header separator after first row
        if (rowIndex === 0) {
          result.push('| ' + cellTexts.map(() => '---').join(' | ') + ' |\n');
        }
      });
    }
    
    processNode(element);
    
    // Clean up the result
    let markdown = result.join('')
      .replace(/\n{3,}/g, '\n\n')  // Remove excessive newlines
      .replace(/^\n+/, '')          // Remove leading newlines
      .replace(/\n+$/, '')          // Remove trailing newlines
      .trim();
    
    return markdown;
  }

  // Extract plain text
  function extractPlainText(element) {
    // Use textContent and clean it up
    let text = element.textContent || '';
    
    // Normalize whitespace
    text = text
      .replace(/\t/g, ' ')
      .replace(/[ ]+/g, ' ')
      .replace(/\n[ ]+/g, '\n')
      .replace(/[ ]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    return text;
  }

  // Extract text from element
  function extractText(element) {
    let text;
    
    if (selectedFormat === 'markdown') {
      text = htmlToMarkdown(element);
    } else {
      text = extractPlainText(element);
    }
    
    // Send result to popup
    chrome.runtime.sendMessage({
      action: 'textExtracted',
      text: text,
      format: selectedFormat
    });
  }

  // Start selection mode
  function startSelection(format) {
    if (isSelecting) return;
    
    isSelecting = true;
    selectedFormat = format || 'text';
    
    createOverlay();
    
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    
    // Change cursor
    document.body.style.cursor = 'crosshair';
  }

  // Stop selection mode
  function stopSelection() {
    if (!isSelecting) return;
    
    isSelecting = false;
    highlightedElement = null;
    
    removeOverlay();
    
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    
    // Reset cursor
    document.body.style.cursor = '';
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'startSelection':
        startSelection(message.format);
        sendResponse({ success: true });
        break;
        
      case 'stopSelection':
        stopSelection();
        sendResponse({ success: true });
        break;
        
      case 'setFormat':
        selectedFormat = message.format;
        sendResponse({ success: true });
        break;
        
      case 'getStatus':
        sendResponse({ isSelecting: isSelecting });
        break;
    }
    
    return true;
  });

})();
