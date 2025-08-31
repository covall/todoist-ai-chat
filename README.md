# Todoist AI Chat

A console application that connects Google Gemini AI to your Todoist data via the Model Context Protocol (MCP). Chat with an AI assistant that can read your tasks, create new ones, and help you manage your Todoist workspace naturally.

## Features

- 🤖 **AI-Powered Task Management**: Chat naturally with Gemini AI about your Todoist tasks
- 📋 **Real Todoist Integration**: Direct connection to your Todoist data via official MCP server
- 💬 **Interactive Console**: Simple, friendly command-line interface
- 🔧 **Function Calling**: AI can execute Todoist operations automatically based on your requests

## Prerequisites

1. **Todoist Account**: You need an active Todoist account
2. **Google Gemini API Key**: Get one from [Google AI Studio](https://aistudio.google.com/app/apikey)
3. **Node.js**: Version 18 or higher

## Setup

1. **Clone and install dependencies**:
   ```bash
   cd todoist-ai-chat
   npm install
   ```

2. **Set up your Gemini API key**:
   ```bash
   export GEMINI_API_KEY="your-gemini-api-key-here"
   ```
   
   Or add it to your shell profile (`.zshrc`, `.bashrc`, etc.):
   ```bash
   echo 'export GEMINI_API_KEY="your-gemini-api-key-here"' >> ~/.zshrc
   source ~/.zshrc
   ```

3. **Build the application**:
   ```bash
   npm run build
   ```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## Example Interactions

Once the app is running, you can interact with it like this:

```
💬 You: What tasks do I have today?
🤖 AI: Let me check your tasks for today...
🔧 AI is using tools to help with your request...
🛠️  Executing: get_tasks
🤖 AI: You have 3 tasks due today:
1. "Finish quarterly report" (High priority)
2. "Call dentist for appointment" 
3. "Buy groceries for dinner"

💬 You: Create a task to review the quarterly report tomorrow
🤖 AI: I'll create that task for you...
🔧 AI is using tools to help with your request...
🛠️  Executing: create_task
🤖 AI: ✅ Created task "Review quarterly report" due tomorrow!
```

## How It Works

1. **MCP Connection**: The app connects to Todoist's official MCP server at `https://ai.todoist.net/mcp`
2. **OAuth Authentication**: First-time setup will guide you through Todoist OAuth (handled by the MCP server)
3. **AI Integration**: Gemini AI receives your requests and uses available Todoist tools to fulfill them
4. **Real-time Interaction**: Changes are made directly to your Todoist account

## Available Commands

- Ask about tasks: "What's on my agenda?", "Show me overdue items"
- Create tasks: "Add a task to call mom tomorrow", "Create a high-priority task for the meeting"
- Update tasks: "Mark the grocery task as complete", "Change the due date for the report"
- General management: "What projects do I have?", "Show me my productivity stats"

Type `exit` or `quit` to close the application.

## Troubleshooting

### "GEMINI_API_KEY environment variable is required"
- Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- Make sure it's properly exported in your shell

### "Failed to connect to Todoist MCP server"
- Check your internet connection
- Ensure you can access https://ai.todoist.net/mcp
- Try running manually: `npx -y mcp-remote https://ai.todoist.net/mcp`

### OAuth Issues
- The first run will prompt you to authenticate with Todoist
- Follow the OAuth flow in your browser
- Make sure you're logged into the correct Todoist account

## Development

### Project Structure
```
src/
├── index.ts          # Main entry point
├── TodoistAIChat.ts  # Core application logic
└── config.ts         # Configuration and utilities
```

### Scripts
- `npm run dev`: Run in development mode with ts-node
- `npm run build`: Compile TypeScript to JavaScript
- `npm start`: Run the compiled application
- `npm run type-check`: Check TypeScript types without compilation

## Contributing

This is a sample implementation. Feel free to extend it with:
- Better error handling
- Support for more AI models
- Additional MCP servers
- Enhanced UI/UX
- Configuration file support

## License

MIT
