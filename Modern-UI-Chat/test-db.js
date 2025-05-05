const mysql = require('mysql2/promise');

async function testConnection() {
  const dbConfig = {
    host: 'sql12.freesqldatabase.com',
    database: 'sql12776989',
    user: 'sql12776989',
    password: '5vACdqgBj2',
    port: 3306
  };

  try {
    console.log('Attempting to connect to MySQL database...');
    const connection = await mysql.createConnection(dbConfig);
    console.log('Connection successful!');
    
    console.log('Testing database initialization...');
    
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
    
    console.log('Tables created successfully!');
    
    // Close the connection
    await connection.end();
    console.log('Connection closed.');
  } catch (error) {
    console.error('Error:', error);
  }
}

testConnection();