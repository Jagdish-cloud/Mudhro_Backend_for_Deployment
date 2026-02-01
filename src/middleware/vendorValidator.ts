import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

export const handleVendorValidationErrors = (
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

export const validateCreateVendor = [
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Vendor name is required')
    .isLength({ min: 2, max: 255 })
    .withMessage('Vendor name must be between 2 and 255 characters'),

  body('email')
    .optional()
    .trim()
    .custom((value) => {
      // If email is provided, it must be valid
      if (value && value.length > 0) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          throw new Error('Please provide a valid email address');
        }
      }
      return true;
    }),

  body('organization')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Organization must not exceed 255 characters'),

  body('mobileNumber')
    .optional()
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Please provide a valid mobile number'),

  body('gstin')
    .optional()
    .trim()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Please provide a valid GSTIN'),

  body('pan')
    .optional()
    .trim()
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .withMessage('Please provide a valid PAN'),

  handleVendorValidationErrors,
];

export const validateUpdateVendor = [
  body('fullName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Vendor name cannot be empty')
    .isLength({ min: 2, max: 255 })
    .withMessage('Vendor name must be between 2 and 255 characters'),

  body('email')
    .optional()
    .trim()
    .custom((value) => {
      // If email is provided, it must be valid
      if (value && value.length > 0) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          throw new Error('Please provide a valid email address');
        }
      }
      return true;
    }),

  body('organization')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Organization must not exceed 255 characters'),

  body('mobileNumber')
    .optional()
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Please provide a valid mobile number'),

  body('gstin')
    .optional()
    .trim()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Please provide a valid GSTIN'),

  body('pan')
    .optional()
    .trim()
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .withMessage('Please provide a valid PAN'),

  handleVendorValidationErrors,
];


