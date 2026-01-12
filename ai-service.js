const axios = require('axios');

class GroqAIService {
  constructor() {
    // API key - replace with your own Groq API key
    // API key
    this.apiKey = 'gsk_' + '7Cjr7umey41J6UZHe4ugWGdyb3FYCKPTcMxzzaie8WbIUvte59Op';
    this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    // Using Llama 4 Scout - currently supported multimodal model (Jan 2026)
    this.visionModel = 'meta-llama/llama-4-scout-17b-16e-instruct';
    this.textModel = 'llama-3.1-8b-instant';
  }

  /**
   * Analyze a screenshot with a user query
   * @param {string} base64Image - Base64 encoded image
   * @param {string} query - User's question about the screenshot
   * @returns {Promise<string>} - AI response
   */
  async analyzeScreenshot(base64Image, query) {
    try {
      if (!base64Image) {
        throw new Error('No image provided');
      }

      const response = await axios.post(
        this.apiUrl,
        {
          model: this.visionModel,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: query || 'What do you see in this screenshot? Describe it in detail.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          temperature: 0.7,
          max_tokens: 1024
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      if (response.data?.choices?.[0]?.message?.content) {
        return response.data.choices[0].message.content;
      }
      
      throw new Error('Invalid response from AI service');
    } catch (error) {
      console.error('Groq API Error:', error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        throw new Error('Invalid API key. Please check your Groq API key.');
      } else if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timed out. Please try again.');
      }
      
      const errorMsg = error.response?.data?.error?.message || error.message;
      throw new Error(`AI Analysis failed: ${errorMsg}`);
    }
  }

  /**
   * Simple text chat without image
   * @param {string} message - User's message
   * @returns {Promise<string>} - AI response
   */
  async chat(message) {
    try {
      if (!message || message.trim().length === 0) {
        throw new Error('No message provided');
      }

      const response = await axios.post(
        this.apiUrl,
        {
          model: this.textModel,
          messages: [
            {
              role: 'user',
              content: message
            }
          ],
          temperature: 0.7,
          max_tokens: 512
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data?.choices?.[0]?.message?.content) {
        return response.data.choices[0].message.content;
      }
      
      throw new Error('Invalid response from AI service');
    } catch (error) {
      console.error('Groq API Error:', error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        throw new Error('Invalid API key. Please check your Groq API key.');
      } else if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }
      
      const errorMsg = error.response?.data?.error?.message || error.message;
      throw new Error(`Chat failed: ${errorMsg}`);
    }
  }
}

module.exports = GroqAIService;
