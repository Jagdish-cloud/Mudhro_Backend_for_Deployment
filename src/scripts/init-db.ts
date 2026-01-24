import pool from '../config/database';
import fs from 'fs';
import path from 'path';

/**
 * Initialize database schema
 * Run this script once to set up the database tables
 */
const initializeDatabase = async () => {
  const client = await pool.connect();
  
  try {
    console.log('📊 Initializing database schema...');
    
    // Read SQL schema file
    // Using process.cwd() since we're in dist/scripts after compilation
    const schemaPath = path.join(process.cwd(), 'src/config/db-schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
    
    // Execute schema
    await client.query(schemaSQL);
    
    console.log('✅ Database schema initialized successfully');
    console.log('✅ Users table created');
    console.log('✅ Indexes created');
    console.log('✅ Triggers created');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

// Run initialization
initializeDatabase()
  .then(() => {
    console.log('🎉 Database initialization complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Database initialization failed:', error);
    process.exit(1);
  });

