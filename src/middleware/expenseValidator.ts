import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
    return;
  }
  next();
};

export const validateCreateExpense = [
  body('vendorId')
    .notEmpty()
    .withMessage('Vendor ID is required')
    .isInt({ min: 1 })
    .withMessage('Vendor ID must be a valid integer'),

  body('billDate')
    .notEmpty()
    .withMessage('Bill date is required')
    .isISO8601()
    .withMessage('Bill date must be a valid date'),

  body('dueDate')
    .notEmpty()
    .withMessage('Due date is required')
    .isISO8601()
    .withMessage('Due date must be a valid date'),

  body('billNumber')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Bill number must not exceed 20 characters'),

  body('totalAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total amount must be a valid number >= 0'),

  body('taxPercentage')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Tax percentage must be a valid number >= 0'),

  body('totalInstallments')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Total installments must be a valid integer >= 1'),

  body('currentInstallment')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Current installment must be a valid integer >= 1'),

  body('additionalNotes')
    .optional()
    .trim(),

  body('items')
    .optional()
    .isArray()
    .withMessage('Items must be an array'),

  body('items.*.serviceId')
    .if(body('items').exists())
    .notEmpty()
    .withMessage('Expense service ID is required in items array')
    .isInt({ min: 1 })
    .withMessage('Expense service ID must be a valid integer'),

  body('items.*.quantity')
    .if(body('items').exists())
    .notEmpty()
    .withMessage('Quantity is required in items array')
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be a valid number > 0'),

  body('items.*.unitPrice')
    .if(body('items').exists())
    .notEmpty()
    .withMessage('Unit price is required in items array')
    .isFloat({ min: 0 })
    .withMessage('Unit price must be a valid number >= 0'),

  handleValidationErrors,
];

export const validateUpdateExpense = [
  body('vendorId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Vendor ID must be a valid integer'),

  body('billDate')
    .optional()
    .isISO8601()
    .withMessage('Bill date must be a valid date'),

  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),

  body('billNumber')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Bill number must not exceed 20 characters'),

  body('totalAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total amount must be a valid number >= 0'),

  body('taxPercentage')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Tax percentage must be a valid number >= 0'),

  body('totalInstallments')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Total installments must be a valid integer >= 1'),

  body('currentInstallment')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Current installment must be a valid integer >= 1'),

  body('additionalNotes')
    .optional()
    .trim(),

  handleValidationErrors,
];


