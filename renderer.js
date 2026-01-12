const { ipcRenderer } = require('electron');

// DOM Elements
const minimizedView = document.getElementById('minimized-view');
const expandedView = document.getElementById('expanded-view');
const expandBtn = document.getElementById('expand-btn');
const minimizeBtn = document.getElementById('minimize-btn');
const closeBtn = document.getElementById('close-btn');
const autoAnalyzeBtn = document.getElementById('auto-analyze-btn');
const screenshotBtn = document.getElementById('screenshot-btn');
const queryInput = document.getElementById('query-input');
const sendBtn = document.getElementById('send-btn');
const chatContainer = document.getElementById('chat-container');
const screenshotContainer = document.getElementById('screenshot-container');
const screenshotPreview = document.getElementById('screenshot-preview');
const clearScreenshotBtn = document.getElementById('clear-screenshot');
const loading = document.getElementById('loading');

// State
let currentScreenshot = null;
let isProcessing = false;
let autoAnalyze = true; // Auto-analyze enabled by default

// Toggle window state
expandBtn.addEventListener('click', () => {
  ipcRenderer.send('toggle-window');
});

minimizeBtn.addEventListener('click', () => {
  ipcRenderer.send('toggle-window');
});

// Handle window state changes
ipcRenderer.on('window-state-changed', (event, isMinimized) => {
  if (isMinimized) {
    minimizedView.classList.remove('hidden');
    expandedView.classList.add('hidden');
    
    // Enable click-through for the window, but not for the icon
    ipcRenderer.send('set-ignore-mouse-events', true);
  } else {
    minimizedView.classList.add('hidden');
    expandedView.classList.remove('hidden');
    
    // Disable click-through when expanded
    ipcRenderer.send('set-ignore-mouse-events', false);
  }
});

// Make icon clickable when minimized
const iconButton = document.querySelector('.icon-button');
iconButton.addEventListener('mouseenter', () => {
  ipcRenderer.send('set-ignore-mouse-events', false);
});

iconButton.addEventListener('mouseleave', () => {
  // Only re-enable click-through if minimized
  if (!minimizedView.classList.contains('hidden')) {
    ipcRenderer.send('set-ignore-mouse-events', true);
  }
});

// Close app
closeBtn.addEventListener('click', () => {
  ipcRenderer.send('quit-app');
});

// Toggle auto-analyze mode
autoAnalyzeBtn.addEventListener('click', () => {
  autoAnalyze = !autoAnalyze;
  
  if (autoAnalyze) {
    autoAnalyzeBtn.style.background = 'rgba(34, 197, 94, 0.3)';
    autoAnalyzeBtn.title = 'Auto-Analyze Enabled';
    addMessage('ai', '✅ Auto-analyze enabled! Screenshots will be automatically described.');
  } else {
    autoAnalyzeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    autoAnalyzeBtn.title = 'Toggle Auto-Analyze';
    addMessage('ai', '⏸️ Auto-analyze disabled. You can ask custom questions.');
  }
});

// Capture screenshot
screenshotBtn.addEventListener('click', async () => {
  if (isProcessing) return;
  
  try {
    isProcessing = true;
    screenshotBtn.disabled = true;
    screenshotBtn.style.opacity = '0.5';
    
    const screenshot = await ipcRenderer.invoke('capture-screenshot');
    
    if (!screenshot) {
      throw new Error('Failed to capture screenshot');
    }
    
    currentScreenshot = screenshot;
    
    // Display screenshot - HIDDEN AS REQUESTED
    // screenshotPreview.src = screenshot;
    currentScreenshot = screenshot;
    // Don't show the container
    // screenshotContainer.classList.remove('hidden');
    
    // Enable input
    queryInput.disabled = false;
    sendBtn.disabled = false;
    
    // Clear welcome message if exists
    const welcomeMsg = chatContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
      welcomeMsg.remove();
    }
    
    addMessage('ai', 'Capture processed.'); 
    
    // Auto-analyze if enabled
    if (autoAnalyze) {
      // Automatically analyze the screenshot
      setTimeout(() => {
        analyzeScreenshotAuto();
      }, 500);
    } else {
      queryInput.focus();
    }
    
  } catch (error) {
    console.error('Screenshot error:', error);
    addMessage('ai', `Error: ${error.message}`);
  } finally {
    isProcessing = false;
    screenshotBtn.disabled = false;
    screenshotBtn.style.opacity = '1';
  }
});

// Auto-analyze screenshot
async function analyzeScreenshotAuto() {
  if (isProcessing || !currentScreenshot) return;
  
  try {
    isProcessing = true;
    // queryInput.disabled = true; // REMOVED
    // sendBtn.disabled = true;    // REMOVED
    loading.classList.remove('hidden');
    
    // Professional, intelligent prompt for auto-analysis
    const intelligentPrompt = `Analyze this screenshot professionally:

1. Identify content type (MCQ, code, text, etc.)

2. Provide the answer/explanation directly.
   - For MCQs: Start with "ANSWER: [Letter]" then explain briefly.
   - For Questions: Answer directly.

3. IMPORTANT: Do NOT use emojis, special icons, or markdown formatting like bold/italics unless necessary. Keep it plain text.
4. Be concise.`;
    
    const response = await ipcRenderer.invoke('analyze-screenshot', {
      image: currentScreenshot,
      query: intelligentPrompt
    });
    
    if (response) {
      addMessage('ai', response);
    } else {
      addMessage('ai', 'No response from AI. Please try again.');
    }
    
  } catch (error) {
    console.error('Auto-analyze error:', error);
    const errorMessage = error.message || 'Unknown error occurred';
    addMessage('ai', `Error: ${errorMessage}`);
  } finally {
    isProcessing = false;
    loading.classList.add('hidden');
    
    if (currentScreenshot) {
      queryInput.disabled = false;
      sendBtn.disabled = false;
    }
  }
}

// Clear screenshot
clearScreenshotBtn.addEventListener('click', () => {
  currentScreenshot = null;
  screenshotContainer.classList.add('hidden');
  screenshotPreview.src = '';
  // queryInput.value = '';  // Optional: keep query or clear it? User didn't ask to clear it, but it makes sense.
  // queryInput.disabled = false; // KEEP ENABLED
  // sendBtn.disabled = false;    // KEEP ENABLED
});

// Send query
sendBtn.addEventListener('click', () => {
  sendQuery();
});

queryInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !sendBtn.disabled && !isProcessing) {
    sendQuery();
  }
});

async function sendQuery() {
  if (isProcessing) return;
  
  const query = queryInput.value.trim();
  
  if (!query && !currentScreenshot) return;
  
  try {
    isProcessing = true;
    
    // Add user message
    if (query) {
      addMessage('user', query);
    }
    
    // Clear input
    queryInput.value = '';
    // queryInput.disabled = true; // REMOVED
    // sendBtn.disabled = true;    // REMOVED
    
    // Show loading
    loading.classList.remove('hidden');
    
    let response;
    
    if (currentScreenshot) {
      // Analyze screenshot with query
      response = await ipcRenderer.invoke('analyze-screenshot', {
        image: currentScreenshot,
        query: query || 'What do you see in this screenshot? Describe it in detail.'
      });
    } else {
      // Simple chat
      response = await ipcRenderer.invoke('chat', query);
    }
    
    // Add AI response
    if (response) {
      addMessage('ai', response);
    } else {
      addMessage('ai', 'No response from AI. Please try again.');
    }
    
  } catch (error) {
    console.error('Query error:', error);
    const errorMessage = error.message || 'Unknown error occurred';
    addMessage('ai', `Error: ${errorMessage}`);
  } finally {
    isProcessing = false;
    loading.classList.add('hidden');
    
    // Re-enable input if screenshot exists
    if (currentScreenshot) {
      queryInput.disabled = false;
      sendBtn.disabled = false;
      queryInput.focus();
    }
  }
}

function addMessage(type, content) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  
  // Convert markdown to HTML for better formatting
  let formattedContent = content
    // Bold text: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic text: *text* or _text_
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Code blocks: `code`
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Line breaks
    .replace(/\n/g, '<br>');
  
  contentDiv.innerHTML = formattedContent;
  
  messageDiv.appendChild(contentDiv);
  chatContainer.appendChild(messageDiv);
  
  // Scroll to bottom smoothly
  setTimeout(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }, 100);
}

// Initialize in minimized state
window.addEventListener('DOMContentLoaded', () => {
  minimizedView.classList.remove('hidden');
  expandedView.classList.add('hidden');
  
  // Set initial auto-analyze button state
  if (autoAnalyze) {
    autoAnalyzeBtn.style.background = 'rgba(34, 197, 94, 0.3)';
    autoAnalyzeBtn.title = 'Auto-Analyze Enabled';
  }
  
  // Make minimized icon draggable
  setupDraggableIcon();
});

// Draggable icon functionality
let isDragging = false;
let hasMoved = false;
let dragStartX = 0;
let dragStartY = 0;

function setupDraggableIcon() {
  const iconButton = document.querySelector('.icon-button');
  
  iconButton.addEventListener('mousedown', (e) => {
    isDragging = true;
    hasMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    
    // Disable click-through immediately when starting drag
    ipcRenderer.send('set-ignore-mouse-events', false);
    
    iconButton.style.cursor = 'grabbing';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;
    
    // Very low threshold for better responsiveness
    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
      hasMoved = true;
      
      // Update position via IPC
      ipcRenderer.send('drag-icon', { 
        deltaX: deltaX, 
        deltaY: deltaY 
      });
    }
  });
  
  document.addEventListener('mouseup', (e) => {
    if (isDragging) {
      const wasDragging = hasMoved;
      
      isDragging = false;
      iconButton.style.cursor = 'grab';
      
      if (wasDragging) {
        // Finalize drag position
        ipcRenderer.send('drag-icon-end');
        // Re-enable click-through after drag
        setTimeout(() => {
          if (!minimizedView.classList.contains('hidden')) {
            ipcRenderer.send('set-ignore-mouse-events', true);
          }
        }, 100);
      } else {
        // Click to expand
        setTimeout(() => {
          ipcRenderer.send('toggle-window');
        }, 10);
      }
      
      hasMoved = false;
    }
  });
  
  // Set initial cursor
  iconButton.style.cursor = 'grab';
}

// Prevent drag and drop
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// Click outside to minimize (when expanded)
document.addEventListener('click', (e) => {
  // Check if click is outside the expanded view
  if (!expandedView.classList.contains('hidden')) {
    const rect = expandedView.getBoundingClientRect();
    const clickX = e.clientX;
    const clickY = e.clientY;
    
    // If click is outside the expanded view bounds
    if (clickX < rect.left || clickX > rect.right || 
        clickY < rect.top || clickY > rect.bottom) {
      ipcRenderer.send('toggle-window');
    }
  }
});
