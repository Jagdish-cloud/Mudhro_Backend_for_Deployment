import pool from '../config/database';
import { AppError } from '../middleware/errorHandler';

export interface UserSession {
  id: number;
  userId: number;
  loginAt: Date;
  logoutAt?: Date;
  ipAddress?: string;
  userAgent?: string;
  sessionDuration?: number;
  expenseScreenVisitCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionCreateData {
  userId: number;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Create a new login session
 */
export const createSession = async (sessionData: SessionCreateData): Promise<UserSession> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `INSERT INTO user_sessions ("userId", "loginAt", "ipAddress", "userAgent", "createdAt", "updatedAt")
       VALUES ($1, CURRENT_TIMESTAMP, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        sessionData.userId,
        sessionData.ipAddress || null,
        sessionData.userAgent || null,
      ]
    );

    return mapSessionFromDb(result.rows[0]);
  } catch (error) {
    console.error('Error creating session:', error);
    throw new AppError('Failed to create session', 500);
  } finally {
    client.release();
  }
};

/**
 * Update session with logout information
 */
export const updateSessionLogout = async (
  sessionId: number,
  userId: number
): Promise<UserSession> => {
  const client = await pool.connect();

  try {
    // Get the session to calculate duration
    const sessionResult = await client.query(
      'SELECT * FROM user_sessions WHERE id = $1 AND "userId" = $2',
      [sessionId, userId]
    );

    if (sessionResult.rows.length === 0) {
      throw new AppError('Session not found', 404);
    }

    const session = sessionResult.rows[0];
    const loginAt = new Date(session.loginAt);
    const logoutAt = new Date();
    const sessionDuration = Math.floor((logoutAt.getTime() - loginAt.getTime()) / 1000); // Duration in seconds

    const result = await client.query(
      `UPDATE user_sessions 
       SET "logoutAt" = CURRENT_TIMESTAMP, 
           "sessionDuration" = $1,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2 AND "userId" = $3
       RETURNING *`,
      [sessionDuration, sessionId, userId]
    );

    return mapSessionFromDb(result.rows[0]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error updating session logout:', error);
    throw new AppError('Failed to update session', 500);
  } finally {
    client.release();
  }
};

/**
 * Get active sessions for a user (sessions without logout)
 */
export const getActiveSessions = async (userId: number): Promise<UserSession[]> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT * FROM user_sessions 
       WHERE "userId" = $1 AND "logoutAt" IS NULL 
       ORDER BY "loginAt" DESC`,
      [userId]
    );

    return result.rows.map(mapSessionFromDb);
  } catch (error) {
    console.error('Error getting active sessions:', error);
    throw new AppError('Failed to retrieve sessions', 500);
  } finally {
    client.release();
  }
};

/**
 * Get all sessions for a user
 */
export const getUserSessions = async (
  userId: number,
  limit: number = 50
): Promise<UserSession[]> => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT * FROM user_sessions 
       WHERE "userId" = $1 
       ORDER BY "loginAt" DESC 
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(mapSessionFromDb);
  } catch (error) {
    console.error('Error getting user sessions:', error);
    throw new AppError('Failed to retrieve sessions', 500);
  } finally {
    client.release();
  }
};

/**
 * Logout all active sessions for a user
 */
export const logoutAllSessions = async (userId: number): Promise<void> => {
  const client = await pool.connect();

  try {
    // Get all active sessions
    const activeSessions = await client.query(
      'SELECT id, "loginAt" FROM user_sessions WHERE "userId" = $1 AND "logoutAt" IS NULL',
      [userId]
    );

    const now = new Date();

    // Update each session
    for (const session of activeSessions.rows) {
      const loginAt = new Date(session.loginAt);
      const sessionDuration = Math.floor((now.getTime() - loginAt.getTime()) / 1000);

      await client.query(
        `UPDATE user_sessions 
         SET "logoutAt" = CURRENT_TIMESTAMP, 
             "sessionDuration" = $1,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [sessionDuration, session.id]
      );
    }
  } catch (error) {
    console.error('Error logging out all sessions:', error);
    throw new AppError('Failed to logout all sessions', 500);
  } finally {
    client.release();
  }
};

/**
 * Increment expense screen visit count for active session
 */
export const incrementExpenseScreenVisit = async (userId: number): Promise<UserSession | null> => {
  const client = await pool.connect();

  try {
    // Get the most recent active session (without logout)
    const activeSessionResult = await client.query(
      'SELECT id FROM user_sessions WHERE "userId" = $1 AND "logoutAt" IS NULL ORDER BY "loginAt" DESC LIMIT 1',
      [userId]
    );

    if (activeSessionResult.rows.length === 0) {
      // No active session found, return null
      return null;
    }

    const sessionId = activeSessionResult.rows[0].id;

    // Increment the visit count
    const result = await client.query(
      `UPDATE user_sessions 
       SET "expenseScreenVisitCount" = COALESCE("expenseScreenVisitCount", 0) + 1,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [sessionId]
    );

    return mapSessionFromDb(result.rows[0]);
  } catch (error) {
    console.error('Error incrementing expense screen visit:', error);
    throw new AppError('Failed to update expense screen visit count', 500);
  } finally {
    client.release();
  }
};

/**
 * Map database session to UserSession
 */
const mapSessionFromDb = (dbSession: any): UserSession => {
  return {
    id: dbSession.id,
    userId: dbSession.userId,
    loginAt: new Date(dbSession.loginAt),
    logoutAt: dbSession.logoutAt ? new Date(dbSession.logoutAt) : undefined,
    ipAddress: dbSession.ipAddress,
    userAgent: dbSession.userAgent,
    sessionDuration: dbSession.sessionDuration,
    expenseScreenVisitCount: dbSession.expenseScreenVisitCount || 0,
    createdAt: new Date(dbSession.createdAt),
    updatedAt: new Date(dbSession.updatedAt),
  };
};

