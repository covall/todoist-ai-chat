import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as readline from 'readline';
import { AppConfig } from './config';

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export class TodoistAIChat {
  private mcpClient: Client | null = null;
  private mcpTransport: StreamableHTTPClientTransport | null = null;
  private geminiAI: GoogleGenerativeAI | null = null;
  private model: any = null;
  private rl: readline.Interface | null = null;
  private availableTools: MCPTool[] = [];
  private config: AppConfig;
  private isProcessingRequest = false;
  // Add conversation context storage
  private conversationHistory: Array<{ role: 'user' | 'model'; parts: any[] }> = [];
  private currentChat: any = null;

  constructor(config: AppConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log('🔧 Initializing components...');

    // Initialize Gemini AI
    await this.initializeGemini();

    // Initialize MCP connection to Todoist
    await this.initializeMCP();

    // Setup console interface
    this.setupConsoleInterface();

    console.log('✅ Initialization complete!\n');
  }

  private async initializeGemini(): Promise<void> {
    this.geminiAI = new GoogleGenerativeAI(this.config.geminiApiKey);
    this.model = this.geminiAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      },
    });

    console.log('✅ Gemini AI initialized');
  }

  private async initializeMCP(): Promise<void> {
    await this.ensureMCPConnection();
  }

  private async ensureMCPConnection(): Promise<void> {
    try {
      console.log('🔗 Connecting to Todoist MCP server with personal access token...');

      // Create fresh transport and client
      this.mcpTransport = new StreamableHTTPClientTransport(new URL('https://ai.todoist.net/mcp'), {
        requestInit: {
          headers: {
            Authorization: `Bearer ${this.config.todoistApiToken}`,
            'Content-Type': 'application/json',
          },
        },
      });

      this.mcpClient = new Client({
        name: 'todoist-ai-chat',
        version: '1.0.0',
      });

      await this.mcpClient.connect(this.mcpTransport);

      // Get available tools from the MCP server
      const toolsResult = await this.mcpClient.listTools();
      this.availableTools = toolsResult.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema,
      }));

      console.log(
        `✅ Connected to Todoist MCP server with ${this.availableTools.length} tools available`
      );
      console.log(`📋 Available tools: ${this.availableTools.map((t) => t.name).join(', ')}`);
    } catch (error) {
      console.error('❌ Failed to connect to Todoist MCP server:', error);
      console.log('💡 Make sure you have internet access and the Todoist MCP server is available.');
      throw error;
    }
  }

  private async reconnectMCP(): Promise<void> {
    console.log('🔄 Reconnecting to Todoist MCP server...');

    // Clean up existing connection
    if (this.mcpClient) {
      try {
        await this.mcpClient.close();
      } catch (e) {
        console.warn('⚠️  Warning: Failed to close MCP client during reconnection:', e);
      }
    }
    if (this.mcpTransport) {
      try {
        await this.mcpTransport.close();
      } catch (e) {
        console.warn('⚠️  Warning: Failed to close MCP transport during reconnection:', e);
      }
    }

    // Re-establish connection
    await this.ensureMCPConnection();
  }

  private setupConsoleInterface(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '💬 You: ',
    });
  }

  async startChat(): Promise<void> {
    if (!this.rl || !this.model || !this.mcpClient) {
      throw new Error('Application not properly initialized');
    }

    // Additional validation to ensure objects are in valid state
    if (!this.geminiAI || !this.mcpTransport) {
      throw new Error('Core components not properly initialized');
    }

    // Validate that we have tools available
    if (this.availableTools.length === 0) {
      throw new Error('No MCP tools available - connection may be invalid');
    }

    console.log(
      '🎯 Chat started! You can now ask questions about your Todoist tasks or request new tasks.'
    );
    console.log('📝 Examples:');
    console.log('   - "What tasks do I have today?"');
    console.log('   - "Create a task to buy groceries tomorrow"');
    console.log('   - "Show me my overdue tasks"');
    console.log('   - Type "exit" to quit');
    console.log('   - Type "history" to see conversation history');
    console.log('   - Type "clear" to clear conversation history');
    console.log('   - Type "test" to test task finding functionality\n');

    this.rl.prompt();

    this.rl.on('line', async (input: string) => {
      const userInput = input.trim();

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        console.log('👋 Goodbye!');
        this.rl?.close();
        process.exit(0);
      }

      if (userInput === '') {
        this.rl?.prompt();
        return;
      }

      // Handle utility commands
      if (userInput.toLowerCase() === 'history') {
        console.log('\n📚 Conversation History:');
        console.log(this.getConversationContext());
        console.log(); // Empty line for readability
        this.rl?.prompt();
        return;
      }

      if (userInput.toLowerCase() === 'clear') {
        this.clearConversationHistory();
        this.rl?.prompt();
        return;
      }

      if (userInput.toLowerCase() === 'test') {
        await this.testTaskFinding();
        this.rl?.prompt();
        return;
      }

      // Prevent concurrent requests
      if (this.isProcessingRequest) {
        console.log('⏳ Please wait, processing previous request...');
        this.rl?.prompt();
        return;
      }

      try {
        this.isProcessingRequest = true;
        await this.processUserInput(userInput);
      } catch (error) {
        console.error('❌ Error processing your request:', error);
      } finally {
        this.isProcessingRequest = false;
      }

      this.rl?.prompt();
    });

    this.rl.on('close', () => {
      console.log('\n👋 Goodbye!');
      process.exit(0);
    });
  }

  private async processUserInput(userInput: string): Promise<void> {
    console.log('🤖 AI: Processing your request...\n');

    try {
      // Convert MCP tools to Gemini function declarations
      const functionDeclarations = this.availableTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: this.cleanSchemaForGemini(tool.inputSchema),
      }));

      // Create a model with function calling enabled
      const modelWithTools = this.geminiAI!.getGenerativeModel({
        model: 'gemini-2.5-flash',
        tools: [{ functionDeclarations }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 2048,
        },
      });

      // Create system instruction
      const systemInstruction = this.createSystemPrompt();

      // Initialize chat session only once if it doesn't exist
      if (!this.currentChat) {
        this.currentChat = modelWithTools.startChat({
          systemInstruction: {
            role: 'system',
            parts: [{ text: systemInstruction }],
          },
        });
      }

      // Add user message to conversation history
      this.conversationHistory.push({
        role: 'user',
        parts: [{ text: userInput }],
      });

      // Send the user's message
      const result = await this.currentChat.sendMessage(userInput);

      // Debug: Check if we got a valid response
      const responseText = result.response.text();
      if (responseText && responseText.trim()) {
        // Add AI response to conversation history
        this.conversationHistory.push({
          role: 'model',
          parts: [{ text: responseText }],
        });
      } else {
        console.log('⚠️  Warning: Empty initial response from AI');
        console.log('🔍 Debug: Initial response object:', JSON.stringify(result.response, null, 2));
      }

      // Handle the response, which may include function calls
      await this.handleModelResponse(result, this.currentChat);
    } catch (error) {
      console.error('❌ Error communicating with Gemini:', error);
    }
  }

  private cleanSchemaForGemini(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    // Create a copy of the schema
    const cleaned = { ...schema };

    // Remove JSON Schema properties that Gemini doesn't understand
    delete cleaned.$schema;
    delete cleaned.additionalProperties;

    // Recursively clean nested objects
    if (cleaned.properties) {
      const cleanedProperties: any = {};
      for (const [key, value] of Object.entries(cleaned.properties)) {
        cleanedProperties[key] = this.cleanSchemaForGemini(value);
      }
      cleaned.properties = cleanedProperties;
    }

    // Clean items if it exists (for arrays)
    if (cleaned.items) {
      cleaned.items = this.cleanSchemaForGemini(cleaned.items);
    }

    return cleaned;
  }

  private async callToolWithRetry(
    toolName: string,
    args: any,
    maxRetries: number = 2
  ): Promise<any> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (!this.mcpClient) {
          throw new Error('MCP client not initialized');
        }

        const result = await this.mcpClient.callTool({
          name: toolName,
          arguments: args,
        });

        return result;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isConnectionError =
          errorMessage.includes('No transport found for sessionId') ||
          errorMessage.includes('HTTP 404') ||
          errorMessage.includes('connection');

        if (isConnectionError && attempt < maxRetries) {
          console.log(
            `⚠️  Connection lost, attempting to reconnect (attempt ${attempt + 1}/${
              maxRetries + 1
            })...`
          );

          try {
            await this.reconnectMCP();
            console.log('✅ Reconnection successful, retrying tool call...');
            continue; // Retry with new connection
          } catch (reconnectError) {
            console.error('❌ Failed to reconnect:', reconnectError);
            if (attempt === maxRetries) {
              throw new Error(
                `Failed to execute ${toolName} after ${maxRetries + 1} attempts: ${errorMessage}`
              );
            }
          }
        } else {
          throw error; // Re-throw non-connection errors or if max retries reached
        }
      }
    }

    throw new Error(`Failed to execute ${toolName} after ${maxRetries + 1} attempts`);
  }

  private createSystemPrompt(): string {
    const toolDescriptions = this.availableTools
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join('\n');

    // Get current date information
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    return `You are an AI assistant connected to a user's Todoist account via MCP (Model Context Protocol).

AVAILABLE TOOLS:
${toolDescriptions}

CRITICAL RULES - YOU MUST FOLLOW THESE EXACTLY:
1. NEVER use a tool called "date" - it does not exist
2. For date-related queries, ALWAYS use "find-tasks-by-date" tool
3. The "find-tasks-by-date" tool accepts startDate as:
   - "today" (literal string)
   - "overdue" (literal string)
   - YYYY-MM-DD format (e.g., "${todayStr}")
4. When user asks about "tomorrow", calculate tomorrow's date and use YYYY-MM-DD format
5. When user asks about "next week", calculate date 7 days from now and use YYYY-MM-DD format

IMPORTANT: You MUST know the current date to calculate relative dates correctly.
- Current date: ${todayStr}
- Tomorrow: ${tomorrowStr}
- Next week: ${nextWeekStr}
- Yesterday: ${yesterdayStr}

EXAMPLES OF CORRECT TOOL USAGE:
- "What tasks do I have today?" → Use find-tasks-by-date with startDate: "today"
- "What tasks do I have tomorrow?" → Use find-tasks-by-date with startDate: "${tomorrowStr}"
- "Show me overdue tasks" → Use find-tasks-by-date with startDate: "overdue"
- "Tasks for next week" → Use find-tasks-by-date with startDate: "${nextWeekStr}"

When users ask about the current date or relative dates, provide the actual calculated dates in your responses.

Be helpful and conversational while managing tasks efficiently.`;
  }

  private async handleModelResponse(result: any, chat: any): Promise<void> {
    const response = result.response;

    // Check if the model wants to call functions
    const functionCalls = response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      console.log('🔧 AI is using tools to help with your request...');

      // Execute each function call
      const functionResponses = [];

      for (const functionCall of functionCalls) {
        try {
          console.log(`🛠️  Executing: ${functionCall.name}`);

          // Execute the MCP tool with retry logic
          const toolResult = await this.callToolWithRetry(
            functionCall.name,
            functionCall.args || {}
          );

          functionResponses.push({
            name: functionCall.name,
            response: {
              content: toolResult.content,
            },
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ Error executing tool ${functionCall.name}:`, errorMessage);
          functionResponses.push({
            name: functionCall.name,
            response: {
              content: `Error: ${errorMessage}`,
            },
          });
        }
      }

      // Send function results back to the model for a final response
      const followUpResult = await chat.sendMessage([
        {
          functionResponse: {
            name: functionResponses[0].name,
            response: functionResponses[0].response,
          },
        },
      ]);

      // Update conversation history with the final AI response
      const followUpText = followUpResult.response.text();
      if (followUpText && followUpText.trim()) {
        this.conversationHistory.push({
          role: 'model',
          parts: [{ text: followUpText }],
        });
        console.log('🤖 AI:', followUpText);
      } else {
        console.log('🤖 AI: [Empty response received]');
      }
    } else {
      // No function calls, just display the text response
      const responseText = response.text();
      if (responseText && responseText.trim()) {
        console.log('🤖 AI:', responseText);
      } else {
        console.log('🤖 AI: [Empty response received]');
        console.log('🔍 Debug: Response object:', JSON.stringify(response, null, 2));
      }
    }
  }

  // Add method to get conversation context
  getConversationContext(): string {
    if (this.conversationHistory.length === 0) {
      return 'No conversation history yet.';
    }

    return this.conversationHistory
      .map((msg, index) => {
        const role = msg.role === 'user' ? 'You' : 'AI';
        const content = msg.parts[0]?.text || 'No content';
        return `${index + 1}. ${role}: ${content}`;
      })
      .join('\n\n');
  }

  // Add method to clear conversation history
  clearConversationHistory(): void {
    this.conversationHistory = [];
    this.currentChat = null;
    console.log('🗑️  Conversation history cleared!');
  }

  async cleanup(): Promise<void> {
    try {
      if (this.mcpClient) {
        await this.mcpClient.close();
        console.log('✅ MCP client closed successfully');
      }
    } catch (error) {
      console.error('❌ Error closing MCP client:', error);
    }

    try {
      if (this.rl) {
        this.rl.close();
        console.log('✅ Readline interface closed successfully');
      }
    } catch (error) {
      console.error('❌ Error closing readline interface:', error);
    }
  }

  // Test method to debug task finding
  async testTaskFinding(): Promise<void> {
    console.log('🧪 Testing task finding with different date formats...');

    try {
      // Test 1: Find tasks for today using "today"
      console.log('\n📅 Test 1: Finding tasks for "today"');
      const todayResult = await this.callToolWithRetry('find-tasks-by-date', {
        startDate: 'today',
        limit: 10,
      });
      console.log('✅ Today result:', JSON.stringify(todayResult, null, 2));

      // Test 2: Find tasks for today using YYYY-MM-DD format
      const todayDate = new Date().toISOString().split('T')[0];
      console.log(`\n📅 Test 2: Finding tasks for "${todayDate}"`);
      const todayDateResult = await this.callToolWithRetry('find-tasks-by-date', {
        startDate: todayDate,
        limit: 10,
      });
      console.log('✅ Today date result:', JSON.stringify(todayDateResult, null, 2));

      // Test 3: Find tasks for tomorrow using YYYY-MM-DD format
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = tomorrow.toISOString().split('T')[0];
      console.log(`\n📅 Test 3: Finding tasks for "${tomorrowDate}"`);
      const tomorrowResult = await this.callToolWithRetry('find-tasks-by-date', {
        startDate: tomorrowDate,
        limit: 10,
      });
      console.log('✅ Tomorrow result:', JSON.stringify(tomorrowResult, null, 2));

      // Test 4: Try using find-tasks with search text
      console.log('\n🔍 Test 4: Using find-tasks with search');
      const searchResult = await this.callToolWithRetry('find-tasks', {
        searchText: 'due:today',
        limit: 10,
      });
      console.log('✅ Search result:', JSON.stringify(searchResult, null, 2));

      // Test 5: Check for overdue tasks
      console.log('\n⏰ Test 5: Checking for overdue tasks');
      const overdueResult = await this.callToolWithRetry('find-tasks-by-date', {
        startDate: 'overdue',
        limit: 10,
      });
      console.log('✅ Overdue result:', JSON.stringify(overdueResult, null, 2));

      // Test 6: Try with expanded date range (7 days)
      console.log(`\n📅 Test 6: Finding tasks for "${todayDate}" with 7-day range`);
      const weekResult = await this.callToolWithRetry('find-tasks-by-date', {
        startDate: todayDate,
        daysCount: 7,
        limit: 10,
      });
      console.log('✅ Week result:', JSON.stringify(weekResult, null, 2));

      // Test 7: Try to find any tasks at all (no filters)
      console.log('\n🔍 Test 7: Finding any tasks (no filters)');
      const anyTasksResult = await this.callToolWithRetry('find-tasks', {
        limit: 10,
      });
      console.log('✅ Any tasks result:', JSON.stringify(anyTasksResult, null, 2));

      // Test 8: Try with broader search
      console.log('\n🔍 Test 8: Broader search for tasks');
      const broaderResult = await this.callToolWithRetry('find-tasks', {
        searchText: 'task',
        limit: 10,
      });
      console.log('✅ Broader search result:', JSON.stringify(broaderResult, null, 2));
    } catch (error) {
      console.error('❌ Error during testing:', error);
    }
  }
}
