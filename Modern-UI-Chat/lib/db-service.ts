import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';

// MySQL connection configuration
const dbConfig = {
  host: process.env.DB_HOST || 'sql12.freesqldatabase.com',
  database: process.env.DB_NAME || 'sql12776989',
  user: process.env.DB_USER || 'sql12776989',
  password: process.env.DB_PASSWORD || '5vACdqgBj2', // Using the provided password
  port: parseInt(process.env.DB_PORT || '3306'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Create a connection pool
const pool = mysql.createPool(dbConfig);

// Interface for conversation history entries
export interface PromptHistoryEntry {
  id?: number;
  user_id: string;
  session_id: string;
  prompt: string;
  response: string;
  comments?: string;
  thumbs_feedback?: 'up' | 'down' | null;
  created_at?: Date;
}

// Interface for grouped conversation history
export interface GroupedHistory {
  today: PromptHistoryEntry[];
  yesterday: PromptHistoryEntry[];
  lastWeek: PromptHistoryEntry[];
  lastMonth: PromptHistoryEntry[];
  older: PromptHistoryEntry[];
}

/**
 * Initialize the database by creating tables if they don't exist
 */
export async function initDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // Create users table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create prompt_history table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS prompt_history (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        session_id VARCHAR(36) NOT NULL,
        prompt TEXT NOT NULL,
        response TEXT,
        comments TEXT,
        thumbs_feedback VARCHAR(5),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    
    connection.release();
    console.log('Database initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing database:', error);
    return false;
  }
}

/**
 * Create a new user or get existing user
 */
export async function getOrCreateUser(username: string): Promise<string> {
  try {
    const connection = await pool.getConnection();
    
    // Check if user exists
    const [rows] = await connection.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    
    if (Array.isArray(rows) && rows.length > 0) {
      // User exists, return ID
      connection.release();
      return (rows[0] as any).id;
    } else {
      // Create new user
      const userId = uuidv4();
      await connection.execute(
        'INSERT INTO users (id, username) VALUES (?, ?)',
        [userId, username]
      );
      
      connection.release();
      return userId;
    }
  } catch (error) {
    console.error('Error getting or creating user:', error);
    throw error;
  }
}

/**
 * Create a new conversation session
 */
export function createSession(): string {
  return uuidv4();
}

/**
 * Save a prompt to the history
 */
export async function savePrompt(
  userId: string,
  sessionId: string,
  prompt: string
): Promise<number> {
  try {
    const connection = await pool.getConnection();
    
    const [result] = await connection.execute(
      'INSERT INTO prompt_history (user_id, session_id, prompt) VALUES (?, ?, ?)',
      [userId, sessionId, prompt]
    );
    
    connection.release();
    return (result as any).insertId;
  } catch (error) {
    console.error('Error saving prompt:', error);
    throw error;
  }
}

/**
 * Update a prompt entry with the AI response
 */
export async function updatePromptWithResponse(
  promptId: number,
  response: string
): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    
    await connection.execute(
      'UPDATE prompt_history SET response = ? WHERE id = ?',
      [response, promptId]
    );
    
    connection.release();
    return true;
  } catch (error) {
    console.error('Error updating prompt with response:', error);
    return false;
  }
}

/**
 * Save user feedback for a response
 */
export async function saveFeedback(
  promptId: number,
  feedback: 'up' | 'down'
): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    
    await connection.execute(
      'UPDATE prompt_history SET thumbs_feedback = ? WHERE id = ?',
      [feedback, promptId]
    );
    
    connection.release();
    return true;
  } catch (error) {
    console.error('Error saving feedback:', error);
    return false;
  }
}

/**
 * Save a comment for a response
 */
export async function saveComment(
  promptId: number,
  comment: string
): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    
    await connection.execute(
      'UPDATE prompt_history SET comments = ? WHERE id = ?',
      [comment, promptId]
    );
    
    connection.release();
    return true;
  } catch (error) {
    console.error('Error saving comment:', error);
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
    const connection = await pool.getConnection();
    
    const [rows] = await connection.execute(
      'SELECT * FROM prompt_history WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    );
    
    connection.release();
    return rows as PromptHistoryEntry[];
  } catch (error) {
    console.error('Error getting session history:', error);
    return [];
  }
}

/**
 * Get grouped conversation history for a user
 */
export async function getPromptHistory(
  userId: string
): Promise<GroupedHistory> {
  try {
    const connection = await pool.getConnection();
    
    // Get all history for the user
    const [rows] = await connection.execute(
      `SELECT * FROM prompt_history 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );
    
    connection.release();
    
    // Group by time periods
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const lastWeek = new Date(now);
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    const lastMonth = new Date(now);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const history: GroupedHistory = {
      today: [],
      yesterday: [],
      lastWeek: [],
      lastMonth: [],
      older: []
    };
    
    (rows as PromptHistoryEntry[]).forEach(entry => {
      const createdAt = new Date(entry.created_at as Date);
      
      if (createdAt.toDateString() === now.toDateString()) {
        history.today.push(entry);
      } else if (createdAt.toDateString() === yesterday.toDateString()) {
        history.yesterday.push(entry);
      } else if (createdAt > lastWeek) {
        history.lastWeek.push(entry);
      } else if (createdAt > lastMonth) {
        history.lastMonth.push(entry);
      } else {
        history.older.push(entry);
      }
    });
    
    return history;
  } catch (error) {
    console.error('Error getting prompt history:', error);
    return {
      today: [],
      yesterday: [],
      lastWeek: [],
      lastMonth: [],
      older: []
    };
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    connection.release();
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}