import { PromptHistoryEntry } from './db-service';

/**
 * Save a user prompt to the database
 */
export async function saveUserPrompt(
  userId: string,
  sessionId: string,
  prompt: string
): Promise<number | null> {
  try {
    const response = await fetch('/api/conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'savePrompt',
        userId,
        sessionId,
        prompt,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to save prompt');
    }

    const data = await response.json();
    return data.promptId;
  } catch (error) {
    console.error('Error saving user prompt:', error);
    return null;
  }
}

/**
 * Update a prompt entry with the AI response
 */
export async function saveAIResponse(
  promptId: number,
  response: string
): Promise<boolean> {
  try {
    const apiResponse = await fetch('/api/conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'updatePromptWithResponse',
        promptId,
        response,
      }),
    });

    if (!apiResponse.ok) {
      throw new Error('Failed to save AI response');
    }

    const data = await apiResponse.json();
    return data.success;
  } catch (error) {
    console.error('Error saving AI response:', error);
    return false;
  }
}

/**
 * Save user feedback for a response
 */
export async function saveFeedback(
  promptId: number,
  isPositive: boolean
): Promise<boolean> {
  try {
    const feedback = isPositive ? 'up' : 'down';
    
    const response = await fetch('/api/conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'saveFeedback',
        promptId,
        feedback,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to save feedback');
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error saving feedback:', error);
    return false;
  }
}

/**
 * Get conversation history for a specific session
 */
export async function getSessionHistory(
  sessionId: string
): Promise<PromptHistoryEntry[]> {
  try {
    const response = await fetch(`/api/conversation?action=getSessionHistory&sessionId=${sessionId}`);

    if (!response.ok) {
      throw new Error('Failed to get session history');
    }

    const data = await response.json();
    return data.history;
  } catch (error) {
    console.error('Error getting session history:', error);
    return [];
  }
}

/**
 * Convert database history entries to chat messages
 */
export function convertHistoryToMessages(history: PromptHistoryEntry[]) {
  return history.flatMap(entry => {
    const messages = [];
    
    // Add user message
    messages.push({
      id: `user-${entry.id}`,
      content: entry.prompt,
      type: 'user' as const,
      completed: true,
      dbId: entry.id,
    });
    
    // Add AI response if it exists
    if (entry.response) {
      messages.push({
        id: `system-${entry.id}`,
        content: entry.response,
        type: 'system' as const,
        completed: true,
        dbId: entry.id,
        feedback: entry.thumbs_feedback as 'up' | 'down' | undefined,
      });
    }
    
    return messages;
  });
}