#!/usr/bin/env node

import { TodoistAIChat } from './TodoistAIChat';
import { validateEnvironment, displayWelcome } from './config';

async function main() {
  try {
    // Validate environment variables
    const config = validateEnvironment();

    // Display welcome message
    displayWelcome();

    // Initialize and start the chat application
    const chat = new TodoistAIChat(config);
    chatInstance = chat; // Store reference for graceful shutdown
    await chat.initialize();
    await chat.startChat();
  } catch (error) {
    console.error('❌ Failed to start the application:', error);

    if (error instanceof Error) {
      if (error.message.includes('GEMINI_API_KEY')) {
        console.log('\n📚 Need help getting started?');
        console.log('This app requires a Gemini API key to function.');
      } else if (error.message.includes('MCP')) {
        console.log('\n📚 Troubleshooting MCP connection:');
        console.log('1. Check your internet connection');
        console.log('2. Ensure you can access https://ai.todoist.net/mcp');
        console.log('3. Try running: npx -y mcp-remote https://ai.todoist.net/mcp');
      }
    }

    process.exit(1);
  }
}

// Handle graceful shutdown
let chatInstance: TodoistAIChat | null = null;

process.on('SIGINT', async () => {
  console.log('\n\n👋 Shutting down gracefully...');
  if (chatInstance) {
    await chatInstance.cleanup();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n👋 Shutting down gracefully...');
  if (chatInstance) {
    await chatInstance.cleanup();
  }
  process.exit(0);
});

if (require.main === module) {
  main().catch(console.error);
}
