import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

export const handleValidationErrors = (
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

export const validateCreateInvoiceItem = [
  body('itemsId')
    .notEmpty()
    .withMessage('Item ID is required')
    .isInt({ min: 1 })
    .withMessage('Item ID must be a valid integer'),

  body('quantity')
    .notEmpty()
    .withMessage('Quantity is required')
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be a valid number > 0'),

  body('unitPrice')
    .notEmpty()
    .withMessage('Unit price is required')
    .isFloat({ min: 0 })
    .withMessage('Unit price must be a valid number >= 0'),

  handleValidationErrors,
];

export const validateUpdateInvoiceItem = [
  body('quantity')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be a valid number > 0'),

  body('unitPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Unit price must be a valid number >= 0'),

  handleValidationErrors,
];

