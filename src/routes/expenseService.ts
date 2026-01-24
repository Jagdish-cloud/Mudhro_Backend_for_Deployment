import express from 'express';
import {
  createExpenseService,
  deleteExpenseService,
  getExpenseServiceById,
  getExpenseServicesByUserId,
  updateExpenseService,
} from '../services/expenseServiceCatalog';
import {
  validateCreateExpenseService,
  validateUpdateExpenseService,
} from '../middleware/expenseServiceValidator';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

router.post(
  '/',
  authenticateToken,
  validateCreateExpenseService,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const service = await createExpenseService({
        ...req.body,
        userId: req.user.userId,
      });

      res.status(201).json({
        success: true,
        message: 'Expense service created successfully',
        service,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const services = await getExpenseServicesByUserId(req.user.userId);
    res.status(200).json({
      success: true,
      message: 'Expense services retrieved successfully',
      services,
      count: services.length,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const serviceId = parseInt(req.params.id, 10);
    if (Number.isNaN(serviceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid expense service ID',
      });
    }

    const service = await getExpenseServiceById(serviceId, req.user.userId);
    res.status(200).json({
      success: true,
      service,
    });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/:id',
  authenticateToken,
  validateUpdateExpenseService,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const serviceId = parseInt(req.params.id, 10);
      if (Number.isNaN(serviceId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid expense service ID',
        });
      }

      const service = await updateExpenseService(serviceId, req.user.userId, req.body);
      res.status(200).json({
        success: true,
        message: 'Expense service updated successfully',
        service,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.delete('/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const serviceId = parseInt(req.params.id, 10);
    if (Number.isNaN(serviceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid expense service ID',
      });
    }

    await deleteExpenseService(serviceId, req.user.userId);
    res.status(200).json({
      success: true,
      message: 'Expense service deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;


