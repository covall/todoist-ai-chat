import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export class TodoistMCPTransport implements Transport {
  private url: string;
  private token: string;
  private onMessage?: (message: any) => void;
  private onClose?: () => void;
  private onError?: (error: Error) => void;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  setMessageHandler(handler: (message: any) => void): void {
    this.onMessage = handler;
  }

  setCloseHandler(handler: () => void): void {
    this.onClose = handler;
  }

  setErrorHandler(handler: (error: Error) => void): void {
    this.onError = handler;
  }

  async start(): Promise<void> {
    // For HTTP-based MCP, we don't need to "start" a persistent connection
    console.log('🔗 HTTP MCP transport ready');
  }

  async send(message: any): Promise<void> {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const responseData = await response.json();
      
      if (this.onMessage) {
        this.onMessage(responseData);
      }
    } catch (error) {
      if (this.onError) {
        this.onError(error as Error);
      }
    }
  }

  async close(): Promise<void> {
    if (this.onClose) {
      this.onClose();
    }
  }
}
