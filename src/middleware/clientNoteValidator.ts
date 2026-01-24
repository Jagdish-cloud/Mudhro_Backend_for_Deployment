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

export const validateCreateClientNote = [
  body('note')
    .trim()
    .notEmpty()
    .withMessage('Note is required')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Note must be between 1 and 1000 characters'),

  handleValidationErrors,
];

export const validateUpdateClientNote = [
  body('note')
    .trim()
    .notEmpty()
    .withMessage('Note cannot be empty')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Note must be between 1 and 1000 characters'),

  handleValidationErrors,
];

