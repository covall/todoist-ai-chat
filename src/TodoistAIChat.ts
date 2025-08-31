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
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      }
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
      this.mcpTransport = new StreamableHTTPClientTransport(
        new URL('https://ai.todoist.net/mcp'),
        {
          requestInit: {
            headers: {
              'Authorization': `Bearer ${this.config.todoistApiToken}`,
              'Content-Type': 'application/json'
            }
          }
        }
      );

      this.mcpClient = new Client({
        name: 'todoist-ai-chat',
        version: '1.0.0'
      });

      await this.mcpClient.connect(this.mcpTransport);
      
      // Get available tools from the MCP server
      const toolsResult = await this.mcpClient.listTools();
      this.availableTools = toolsResult.tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema
      }));

      console.log(`✅ Connected to Todoist MCP server with ${this.availableTools.length} tools available`);
      console.log(`📋 Available tools: ${this.availableTools.map(t => t.name).join(', ')}`);
      
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
        // Ignore cleanup errors
      }
    }
    if (this.mcpTransport) {
      try {
        await this.mcpTransport.close();
      } catch (e) {
        // Ignore cleanup errors  
      }
    }
    
    // Re-establish connection
    await this.ensureMCPConnection();
  }

  private setupConsoleInterface(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '💬 You: '
    });
  }

  async startChat(): Promise<void> {
    if (!this.rl || !this.model || !this.mcpClient) {
      throw new Error('Application not properly initialized');
    }

    console.log('🎯 Chat started! You can now ask questions about your Todoist tasks or request new tasks.');
    console.log('📝 Examples:');
    console.log('   - "What tasks do I have today?"');
    console.log('   - "Create a task to buy groceries tomorrow"');
    console.log('   - "Show me my overdue tasks"');
    console.log('   - Type "exit" to quit\n');

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

      try {
        await this.processUserInput(userInput);
      } catch (error) {
        console.error('❌ Error processing your request:', error);
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
      const functionDeclarations = this.availableTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: this.cleanSchemaForGemini(tool.inputSchema)
      }));

      // Create a model with function calling enabled
      const modelWithTools = this.geminiAI!.getGenerativeModel({
        model: 'gemini-1.5-flash',
        tools: [{ functionDeclarations }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 2048,
        }
      });

      // Create system instruction
      const systemInstruction = this.createSystemPrompt();
      
      // Start a chat session with the model
      const chat = modelWithTools.startChat({
        systemInstruction: {
          role: 'system',
          parts: [{ text: systemInstruction }]
        }
      });

      // Send the user's message
      const result = await chat.sendMessage(userInput);
      
      // Handle the response, which may include function calls
      await this.handleModelResponse(result, chat);

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

  private async callToolWithRetry(toolName: string, args: any, maxRetries: number = 2): Promise<any> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (!this.mcpClient) {
          throw new Error('MCP client not initialized');
        }
        
        const result = await this.mcpClient.callTool({
          name: toolName,
          arguments: args
        });
        
        return result;
      } catch (error: any) {
        const isConnectionError = error.message?.includes('No transport found for sessionId') || 
                                 error.message?.includes('HTTP 404') ||
                                 error.message?.includes('connection');
        
        if (isConnectionError && attempt < maxRetries) {
          console.log(`⚠️  Connection lost, attempting to reconnect (attempt ${attempt + 1}/${maxRetries + 1})...`);
          
          try {
            await this.reconnectMCP();
            console.log('✅ Reconnection successful, retrying tool call...');
            continue; // Retry with new connection
          } catch (reconnectError) {
            console.error('❌ Failed to reconnect:', reconnectError);
            if (attempt === maxRetries) {
              throw new Error(`Failed to execute ${toolName} after ${maxRetries + 1} attempts: ${error.message}`);
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
    const toolDescriptions = this.availableTools.map(tool => 
      `- ${tool.name}: ${tool.description}`
    ).join('\n');

    return `You are an AI assistant connected to a user's Todoist account via MCP (Model Context Protocol). 
You can help the user manage their tasks by reading their existing tasks and creating new ones.

Available tools:
${toolDescriptions}

When the user asks about their tasks or wants to create/modify tasks, you should use the appropriate MCP tools to fulfill their request. 
Always be helpful and proactive in suggesting actions based on their requests.

If you need to use a tool, please indicate which tool you want to use and with what parameters. 
Format your tool requests clearly so they can be executed.

Be conversational and friendly while being efficient and accurate with task management.`;
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
          const toolResult = await this.callToolWithRetry(functionCall.name, functionCall.args || {});
          
          functionResponses.push({
            name: functionCall.name,
            response: {
              content: toolResult.content
            }
          });
          
        } catch (error) {
          console.error(`❌ Error executing tool ${functionCall.name}:`, error);
          functionResponses.push({
            name: functionCall.name,
            response: {
              content: `Error: ${error}`
            }
          });
        }
      }
      
      // Send function results back to the model for a final response
      const followUpResult = await chat.sendMessage([{
        functionResponse: {
          name: functionResponses[0].name,
          response: functionResponses[0].response
        }
      }]);
      
      console.log('🤖 AI:', followUpResult.response.text());
    } else {
      // No function calls, just display the text response
      console.log('🤖 AI:', response.text());
    }
  }

  async cleanup(): Promise<void> {
    if (this.mcpClient) {
      await this.mcpClient.close();
    }
    if (this.rl) {
      this.rl.close();
    }
  }
}
