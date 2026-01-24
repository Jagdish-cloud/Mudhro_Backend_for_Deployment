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

export const validateCreateInvoice = [
  body('clientId')
    .notEmpty()
    .withMessage('Client ID is required')
    .isInt({ min: 1 })
    .withMessage('Client ID must be a valid integer'),

  body('invoiceDate')
    .notEmpty()
    .withMessage('Invoice date is required')
    .isISO8601()
    .withMessage('Invoice date must be a valid date'),

  body('dueDate')
    .notEmpty()
    .withMessage('Due date is required')
    .isISO8601()
    .withMessage('Due date must be a valid date'),

  body('invoiceNumber')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Invoice number must not exceed 20 characters'),

  body('subTotalAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Sub total amount must be a valid number >= 0'),

  body('gst')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('GST must be a valid percentage between 0 and 100'),

  body('totalAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total amount must be a valid number >= 0'),

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

  body('items.*.itemsId')
    .if(body('items').exists())
    .notEmpty()
    .withMessage('Item ID is required in items array')
    .isInt({ min: 1 })
    .withMessage('Item ID must be a valid integer'),

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

export const validateUpdateInvoice = [
  body('clientId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Client ID must be a valid integer'),

  body('invoiceDate')
    .optional()
    .isISO8601()
    .withMessage('Invoice date must be a valid date'),

  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),

  body('invoiceNumber')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Invoice number must not exceed 20 characters'),

  body('subTotalAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Sub total amount must be a valid number >= 0'),

  body('gst')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('GST must be a valid percentage between 0 and 100'),

  body('totalAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total amount must be a valid number >= 0'),

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

