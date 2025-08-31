export interface AppConfig {
  geminiApiKey: string;
  todoistApiToken: string;
}

export function validateEnvironment(): AppConfig {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const todoistApiToken = process.env.TODOIST_API_TOKEN;
  
  if (!geminiApiKey) {
    console.error('❌ Missing required environment variable: GEMINI_API_KEY');
    console.log('💡 To get your Gemini API key:');
    console.log('   1. Visit https://aistudio.google.com/app/apikey');
    console.log('   2. Create a new API key');
    console.log('   3. Set it as an environment variable: export GEMINI_API_KEY="your-key-here"');
    process.exit(1);
  }

  if (!todoistApiToken) {
    console.error('❌ Missing required environment variable: TODOIST_API_TOKEN');
    console.log('💡 To get your Todoist API token:');
    console.log('   1. Visit https://todoist.com/prefs/integrations');
    console.log('   2. Scroll down to "API token" section');
    console.log('   3. Copy your API token');
    console.log('   4. Set it as an environment variable: export TODOIST_API_TOKEN="your-token-here"');
    process.exit(1);
  }

  return {
    geminiApiKey,
    todoistApiToken
  };
}

export function displayWelcome(): void {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Todoist AI Chat');
  console.log('='.repeat(60));
  console.log('Connect with your Todoist tasks using AI assistance!');
  console.log('Powered by Google Gemini and Todoist MCP');
  console.log('='.repeat(60) + '\n');
}
