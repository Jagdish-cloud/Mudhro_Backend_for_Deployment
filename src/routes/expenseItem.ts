import express, { Response, NextFunction } from 'express';
import {
  createExpenseItem,
  deleteExpenseItem,
  getExpenseItemById,
  getExpenseItemsByExpenseId,
  updateExpenseItem,
} from '../services/expenseItemService';
import {
  validateCreateExpenseItem,
  validateUpdateExpenseItem,
} from '../middleware/expenseItemValidator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { decodeId, urlDecode } from '../utils/urlEncoder';

const router = express.Router();

/**
 * Helper function to decode an ID from req.params
 * Handles both numeric IDs and encoded IDs (Hashids or base64url)
 */
const decodeIdParam = (paramId: string): number | null => {
  if (!paramId || typeof paramId !== 'string') {
    return null;
  }
  
  // If it's already a number, return it
  if (/^\d+$/.test(paramId)) {
    return parseInt(paramId, 10);
  }
  
  // Try Hashids decoding first
  let decoded = decodeId(paramId);
  
  // If Hashids decoding fails, try base64url decoding (frontend encoding)
  if (decoded === null) {
    try {
      const base64Decoded = urlDecode(paramId);
      const numericId = parseInt(base64Decoded, 10);
      if (!isNaN(numericId) && numericId > 0) {
        decoded = numericId;
        console.log(`[ExpenseItem Route] Successfully decoded base64url: ${paramId} -> ${decoded}`);
      }
    } catch (error) {
      console.warn(`[ExpenseItem Route] Failed to decode ID "${paramId}":`, error);
    }
  } else {
    console.log(`[ExpenseItem Route] Successfully decoded Hashids: ${paramId} -> ${decoded}`);
  }
  
  return decoded;
};

router.post(
  '/:expenseId/items',
  authenticateToken,
  validateCreateExpenseItem,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const expenseId = decodeIdParam(req.params.expenseId);
      if (expenseId === null || expenseId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid expense ID',
        });
      }

      const expenseItem = await createExpenseItem({
        ...req.body,
        expenseId,
        userId: req.user.userId,
      });

      res.status(201).json({
        success: true,
        message: 'Expense item added successfully',
        expenseItem,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/:expenseId/items', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const expenseId = decodeIdParam(req.params.expenseId);
    if (expenseId === null || expenseId <= 0) {
      console.warn(`[ExpenseItem Route] Invalid expense ID: ${req.params.expenseId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid expense ID',
      });
    }

    console.log(`[ExpenseItem Route] Fetching expense items for expense ${expenseId}, user ${req.user.userId}`);
    const expenseItems = await getExpenseItemsByExpenseId(expenseId, req.user.userId);
    console.log(`[ExpenseItem Route] Found ${expenseItems.length} expense items`);

    res.status(200).json({
      success: true,
      message: 'Expense items retrieved successfully',
      expenseItems,
      count: expenseItems.length,
    });
  } catch (error) {
    next(error);
  }
});

export const expenseItemStandaloneRouter = express.Router();

expenseItemStandaloneRouter.get('/:id', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const expenseItemId = decodeIdParam(req.params.id);
    if (expenseItemId === null || expenseItemId <= 0) {
      console.warn(`[ExpenseItem Route] Invalid expense item ID: ${req.params.id}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid expense item ID',
      });
    }

    console.log(`[ExpenseItem Route] Fetching expense item ${expenseItemId} for user ${req.user.userId}`);
    const expenseItem = await getExpenseItemById(expenseItemId, req.user.userId);
    console.log(`[ExpenseItem Route] Expense item found: ${expenseItem.id}`);

    res.status(200).json({
      success: true,
      expenseItem,
    });
  } catch (error) {
    next(error);
  }
});

expenseItemStandaloneRouter.put(
  '/:id',
  authenticateToken,
  validateUpdateExpenseItem,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const expenseItemId = decodeIdParam(req.params.id);
      if (expenseItemId === null || expenseItemId <= 0) {
        console.warn(`[ExpenseItem Route] Invalid expense item ID: ${req.params.id}`);
        return res.status(400).json({
          success: false,
          message: 'Invalid expense item ID',
        });
      }

      console.log(`[ExpenseItem Route] Updating expense item ${expenseItemId} for user ${req.user.userId}`);
      const expenseItem = await updateExpenseItem(
        expenseItemId,
        req.user.userId,
        req.body
      );
      console.log(`[ExpenseItem Route] Expense item updated: ${expenseItem.id}`);

      res.status(200).json({
        success: true,
        message: 'Expense item updated successfully',
        expenseItem,
      });
    } catch (error) {
      next(error);
    }
  }
);

expenseItemStandaloneRouter.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const expenseItemId = decodeIdParam(req.params.id);
    if (expenseItemId === null || expenseItemId <= 0) {
      console.warn(`[ExpenseItem Route] Invalid expense item ID: ${req.params.id}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid expense item ID',
      });
    }

    console.log(`[ExpenseItem Route] Deleting expense item ${expenseItemId} for user ${req.user.userId}`);
    await deleteExpenseItem(expenseItemId, req.user.userId);
    console.log(`[ExpenseItem Route] Expense item deleted: ${expenseItemId}`);

    res.status(200).json({
      success: true,
      message: 'Expense item deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;


