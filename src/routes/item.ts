import express from 'express';
import {
  createItem,
  getItemsByUserId,
  getItemById,
  updateItem,
  deleteItem,
} from '../services/itemService';
import { validateCreateItem, validateUpdateItem } from '../middleware/itemValidator';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

/**
 * @route   POST /api/items
 * @desc    Create a new item
 * @access  Private
 */
router.post(
  '/',
  authenticateToken,
  validateCreateItem,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const itemData = {
        ...req.body,
        userId: req.user.userId,
      };

      const item = await createItem(itemData);

      res.status(201).json({
        success: true,
        message: 'Item created successfully',
        item,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/items
 * @desc    Get all items for the authenticated user
 * @access  Private
 */
router.get('/', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const items = await getItemsByUserId(req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Items retrieved successfully',
      items,
      count: items.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/items/:id
 * @desc    Get a specific item by ID
 * @access  Private
 */
router.get('/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item ID',
      });
    }

    const item = await getItemById(itemId, req.user.userId);

    res.status(200).json({
      success: true,
      item,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/items/:id
 * @desc    Update an item
 * @access  Private
 */
router.put(
  '/:id',
  authenticateToken,
  validateUpdateItem,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const itemId = parseInt(req.params.id, 10);
      if (isNaN(itemId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item ID',
        });
      }

      const item = await updateItem(itemId, req.user.userId, req.body);

      res.status(200).json({
        success: true,
        message: 'Item updated successfully',
        item,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/items/:id
 * @desc    Delete an item
 * @access  Private
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item ID',
      });
    }

    await deleteItem(itemId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Item deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;

