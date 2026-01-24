import { Request, Response, NextFunction } from 'express';
import { ProjectCreateData, ProjectUpdateData } from '../types/project';
import { AppError } from './errorHandler';

/**
 * Validate project creation data
 */
export const validateCreateProject = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { name, description, startDate, endDate, status, budget } = req.body;

  // Validate name (required)
  if (!name || typeof name !== 'string') {
    throw new AppError('Project name is required and must be a string', 400);
  }

  if (name.trim().length < 2 || name.trim().length > 255) {
    throw new AppError(
      'Project name must be between 2 and 255 characters',
      400
    );
  }

  // Validate description (optional)
  if (description !== undefined && typeof description !== 'string') {
    throw new AppError('Description must be a string', 400);
  }

  // Validate startDate (optional)
  if (startDate !== undefined && startDate !== null) {
    if (typeof startDate !== 'string') {
      throw new AppError('Start date must be a string', 400);
    }
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      throw new AppError('Invalid start date format', 400);
    }
  }

  // Validate endDate (optional)
  if (endDate !== undefined && endDate !== null) {
    if (typeof endDate !== 'string') {
      throw new AppError('End date must be a string', 400);
    }
    const end = new Date(endDate);
    if (isNaN(end.getTime())) {
      throw new AppError('Invalid end date format', 400);
    }

    // Validate that endDate is after startDate if both are provided
    if (startDate) {
      const start = new Date(startDate);
      if (end < start) {
        throw new AppError('End date must be after start date', 400);
      }
    }
  }

  // Validate status (optional, must be valid enum value)
  if (status !== undefined) {
    const validStatuses = ['active', 'completed', 'on-hold', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new AppError(
        `Status must be one of: ${validStatuses.join(', ')}`,
        400
      );
    }
  }

  // Validate budget (optional, must be non-negative)
  if (budget !== undefined && budget !== null) {
    const budgetNum = parseFloat(budget);
    if (isNaN(budgetNum) || budgetNum < 0) {
      throw new AppError('Budget must be a non-negative number', 400);
    }
  }

  // Create validated data object
  const validatedData: ProjectCreateData = {
    name: name.trim(),
    description: description?.trim() || undefined,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    status: status || 'active',
    budget: budget !== undefined && budget !== null ? parseFloat(budget) : undefined,
    userId: (req as any).user?.userId || 0, // Will be set by auth middleware
  };

  (req as any).validatedProjectData = validatedData;
  next();
};

/**
 * Validate project update data
 */
export const validateUpdateProject = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { name, description, startDate, endDate, status, budget } = req.body;

  const updateData: ProjectUpdateData = {};

  // Validate name (optional)
  if (name !== undefined) {
    if (typeof name !== 'string') {
      throw new AppError('Project name must be a string', 400);
    }
    if (name.trim().length < 2 || name.trim().length > 255) {
      throw new AppError(
        'Project name must be between 2 and 255 characters',
        400
      );
    }
    updateData.name = name.trim();
  }

  // Validate description (optional)
  if (description !== undefined) {
    if (description !== null && typeof description !== 'string') {
      throw new AppError('Description must be a string or null', 400);
    }
    updateData.description = description?.trim() || undefined;
  }

  // Validate startDate (optional)
  if (startDate !== undefined) {
    if (startDate !== null) {
      if (typeof startDate !== 'string') {
        throw new AppError('Start date must be a string', 400);
      }
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        throw new AppError('Invalid start date format', 400);
      }
      updateData.startDate = start;
    } else {
      updateData.startDate = null;
    }
  }

  // Validate endDate (optional)
  if (endDate !== undefined) {
    if (endDate !== null) {
      if (typeof endDate !== 'string') {
        throw new AppError('End date must be a string', 400);
      }
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        throw new AppError('Invalid end date format', 400);
      }
      updateData.endDate = end;

      // Validate that endDate is after startDate if both are provided
      const currentStartDate = startDate !== undefined 
        ? (startDate ? new Date(startDate) : null)
        : undefined;
      
      if (currentStartDate && end < currentStartDate) {
        throw new AppError('End date must be after start date', 400);
      }
    } else {
      updateData.endDate = null;
    }
  }

  // Validate status (optional)
  if (status !== undefined) {
    const validStatuses = ['active', 'completed', 'on-hold', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new AppError(
        `Status must be one of: ${validStatuses.join(', ')}`,
        400
      );
    }
    updateData.status = status;
  }

  // Validate budget (optional)
  if (budget !== undefined) {
    if (budget !== null) {
      const budgetNum = parseFloat(budget);
      if (isNaN(budgetNum) || budgetNum < 0) {
        throw new AppError('Budget must be a non-negative number', 400);
      }
      updateData.budget = budgetNum;
    } else {
      updateData.budget = null;
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new AppError('At least one field must be provided for update', 400);
  }

  (req as any).validatedProjectUpdateData = updateData;
  next();
};
