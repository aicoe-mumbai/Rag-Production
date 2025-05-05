import { NextRequest, NextResponse } from 'next/server';
import {
  initDatabase,
  getOrCreateUser,
  createSession,
  savePrompt,
  updatePromptWithResponse,
  saveFeedback,
  saveComment,
  getSessionHistory,
  getPromptHistory
} from '@/lib/db-service';

// Initialize database on server start
initDatabase().catch(error => {
  console.error('Failed to initialize database:', error);
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const userId = searchParams.get('userId');
    const sessionId = searchParams.get('sessionId');
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    if (action === 'getSessionHistory' && sessionId) {
      const history = await getSessionHistory(sessionId);
      return NextResponse.json({ history });
    } else if (action === 'getPromptHistory') {
      const history = await getPromptHistory(userId);
      return NextResponse.json({ history });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in GET /api/conversation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, username, userId, sessionId, prompt, response, promptId, feedback, comment } = body;
    
    if (action === 'getOrCreateUser' && username) {
      const userId = await getOrCreateUser(username);
      return NextResponse.json({ userId });
    } else if (action === 'createSession') {
      const newSessionId = createSession();
      return NextResponse.json({ sessionId: newSessionId });
    } else if (action === 'savePrompt' && userId && sessionId && prompt) {
      const newPromptId = await savePrompt(userId, sessionId, prompt);
      return NextResponse.json({ promptId: newPromptId });
    } else if (action === 'updatePromptWithResponse' && promptId && response) {
      const success = await updatePromptWithResponse(promptId, response);
      return NextResponse.json({ success });
    } else if (action === 'saveFeedback' && promptId && feedback) {
      const success = await saveFeedback(promptId, feedback);
      return NextResponse.json({ success });
    } else if (action === 'saveComment' && promptId && comment) {
      const success = await saveComment(promptId, comment);
      return NextResponse.json({ success });
    } else {
      return NextResponse.json({ error: 'Invalid action or missing parameters' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in POST /api/conversation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}