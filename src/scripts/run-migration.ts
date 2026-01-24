import pool from '../config/database';
import fs from 'fs';
import path from 'path';

/**
 * Run database migration
 * This script applies the latest migration to update the database schema
 */
const runMigration = async () => {
  const client = await pool.connect();
  
  try {
    console.log('📊 Running database migration...');
    
    // Read migration SQL file
    const migrationPath = path.join(process.cwd(), 'src/config/migration-2025-12-02.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    // Execute migration
    await client.query(migrationSQL);
    
    console.log('✅ Database migration completed successfully');
    console.log('✅ Added currency column to invoices table');
    console.log('✅ Added expenseScreenVisitCount column to user_sessions table');
    console.log('✅ Created client_documents table');
    console.log('✅ Created vendor_documents table');
  } catch (error) {
    console.error('❌ Error running migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

// Run migration
runMigration()
  .then(() => {
    console.log('🎉 Migration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });

