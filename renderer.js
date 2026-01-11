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
    
    // Display screenshot
    screenshotPreview.src = screenshot;
    screenshotPreview.onerror = () => {
      console.error('Failed to load screenshot image');
      addMessage('ai', '❌ Failed to display screenshot. Please try again.');
      currentScreenshot = null;
      screenshotContainer.classList.add('hidden');
    };
    
    screenshotContainer.classList.remove('hidden');
    
    // Enable input
    queryInput.disabled = false;
    sendBtn.disabled = false;
    
    // Clear welcome message if exists
    const welcomeMsg = chatContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
      welcomeMsg.remove();
    }
    
    addMessage('ai', '📸 Screenshot captured!');
    
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
    addMessage('ai', `❌ Failed to capture screenshot: ${error.message}`);
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
    queryInput.disabled = true;
    sendBtn.disabled = true;
    loading.classList.remove('hidden');
    
    // Professional, intelligent prompt for auto-analysis
    const intelligentPrompt = `Analyze this screenshot professionally and intelligently:

1. First, identify what type of content this is (code, error message, UI/interface, document, MCQ question, diagram, etc.)

2. Based on the content type, provide the most relevant and actionable information:
   - If it's a MULTIPLE CHOICE QUESTION (MCQ):
     * Clearly state: "ANSWER: [Option Letter]" at the very beginning
     * Then provide a brief, clear explanation of WHY that's the correct answer
     * Keep it concise and focused on the key concept
   
   - If it's CODE: Identify the language, explain what it does, and note any issues or improvements
   - If it's an ERROR: Explain what the error means and suggest how to fix it
   - If it's a UI/INTERFACE: Describe the main functionality and purpose
   - If it's a DOCUMENT/TEXT: Summarize the key points concisely
   - If it's a QUESTION: Provide a direct, professional answer
   - If it's a DIAGRAM/CHART: Explain what it represents and key insights

3. Be concise, professional, and focus on what matters most.
4. Use simple formatting - avoid excessive markdown.

Provide your analysis in a clear, structured format.`;
    
    const response = await ipcRenderer.invoke('analyze-screenshot', {
      image: currentScreenshot,
      query: intelligentPrompt
    });
    
    if (response) {
      addMessage('ai', response);
    } else {
      addMessage('ai', '❌ No response from AI. Please try again.');
    }
    
  } catch (error) {
    console.error('Auto-analyze error:', error);
    const errorMessage = error.message || 'Unknown error occurred';
    addMessage('ai', `❌ Error: ${errorMessage}`);
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
  queryInput.value = '';
  queryInput.disabled = true;
  sendBtn.disabled = true;
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
    queryInput.disabled = true;
    sendBtn.disabled = true;
    
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
      addMessage('ai', '❌ No response from AI. Please try again.');
    }
    
  } catch (error) {
    console.error('Query error:', error);
    const errorMessage = error.message || 'Unknown error occurred';
    addMessage('ai', `❌ Error: ${errorMessage}`);
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
