import { AppConfig } from './config';

export interface TodoistTask {
  id: string;
  content: string;
  description: string;
  is_completed: boolean;
  created_at: string;
  due?: {
    date: string;
    is_recurring: boolean;
    datetime?: string;
    string: string;
    timezone?: string;
  };
  priority: number;
  project_id: string;
  labels: string[];
  order: number;
  comment_count: number;
  url: string;
}

export interface TodoistProject {
  id: string;
  name: string;
  color: string;
  parent_id?: string;
  order: number;
  comment_count: number;
  is_shared: boolean;
  is_favorite: boolean;
  is_inbox_project: boolean;
  is_team_inbox: boolean;
  view_style: string;
  url: string;
}

export class TodoistRestClient {
  private apiToken: string;
  private baseUrl = 'https://api.todoist.com/rest/v2';

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Todoist API error ${response.status}: ${errorText}`);
    }

    // Handle empty responses (like for DELETE requests)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    return null;
  }

  async getTasks(filter?: string): Promise<TodoistTask[]> {
    const params = new URLSearchParams();
    if (filter) {
      params.append('filter', filter);
    }
    
    const endpoint = `/tasks${params.toString() ? '?' + params.toString() : ''}`;
    return await this.makeRequest(endpoint);
  }

  async getProjects(): Promise<TodoistProject[]> {
    return await this.makeRequest('/projects');
  }

  async createTask(data: {
    content: string;
    description?: string;
    project_id?: string;
    due_string?: string;
    due_date?: string;
    due_datetime?: string;
    priority?: number;
    labels?: string[];
  }): Promise<TodoistTask> {
    return await this.makeRequest('/tasks', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateTask(taskId: string, data: Partial<{
    content: string;
    description: string;
    due_string: string;
    due_date: string;
    due_datetime: string;
    priority: number;
    labels: string[];
  }>): Promise<TodoistTask> {
    return await this.makeRequest(`/tasks/${taskId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async closeTask(taskId: string): Promise<void> {
    await this.makeRequest(`/tasks/${taskId}/close`, {
      method: 'POST'
    });
  }

  async reopenTask(taskId: string): Promise<void> {
    await this.makeRequest(`/tasks/${taskId}/reopen`, {
      method: 'POST'
    });
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.makeRequest(`/tasks/${taskId}`, {
      method: 'DELETE'
    });
  }

  // Test the connection
  async testConnection(): Promise<boolean> {
    try {
      await this.getProjects();
      return true;
    } catch (error) {
      return false;
    }
  }
}
