import express from 'express';
import {
  createProject,
  getProjectsByUserId,
  getProjectById,
  updateProject,
  deleteProject,
} from '../services/projectService';
import {
  getClientsByProjectId,
  assignClientsToProject,
  removeClientFromProject,
} from '../services/projectClientService';
import {
  validateCreateProject,
  validateUpdateProject,
} from '../middleware/projectValidator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { decodeId, urlDecode } from '../utils/urlEncoder';

const router = express.Router();

/**
 * Helper function to decode a project ID from req.params
 * Handles both numeric IDs and encoded IDs (Hashids or base64url)
 */
const decodeProjectId = (paramId: string): number | null => {
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
        console.log(`[Project Route] Successfully decoded base64url: ${paramId} -> ${decoded}`);
      }
    } catch (error) {
      console.warn(`[Project Route] Failed to decode ID "${paramId}":`, error);
    }
  } else {
    console.log(`[Project Route] Successfully decoded Hashids: ${paramId} -> ${decoded}`);
  }
  
  return decoded;
};

/**
 * @route   POST /api/projects
 * @desc    Create a new project
 * @access  Private
 */
router.post(
  '/',
  authenticateToken,
  validateCreateProject,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const projectData = (req as any).validatedProjectData;
      projectData.userId = req.user.userId;

      const project = await createProject(projectData);

      res.status(201).json({
        success: true,
        message: 'Project created successfully',
        project,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/projects
 * @desc    Get all projects for the authenticated user
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

    const projects = await getProjectsByUserId(req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Projects retrieved successfully',
      projects,
      count: projects.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/projects/:id
 * @desc    Get a specific project by ID
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

    const projectId = decodeProjectId(req.params.id);
    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid project ID',
      });
    }

    const project = await getProjectById(projectId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Project retrieved successfully',
      project,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/projects/:id
 * @desc    Update a project
 * @access  Private
 */
router.put(
  '/:id',
  authenticateToken,
  validateUpdateProject,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const projectId = decodeProjectId(req.params.id);
      if (!projectId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid project ID',
        });
      }

      const updateData = (req as any).validatedProjectUpdateData;
      const project = await updateProject(projectId, req.user.userId, updateData);

      res.status(200).json({
        success: true,
        message: 'Project updated successfully',
        project,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/projects/:id
 * @desc    Delete a project
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

    const projectId = decodeProjectId(req.params.id);
    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid project ID',
      });
    }

    await deleteProject(projectId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper function to decode a client ID from req.params
 * Handles both numeric IDs and encoded IDs (Hashids or base64url)
 */
const decodeClientId = (paramId: string): number | null => {
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
      }
    } catch (error) {
      console.warn(`[Project Route] Failed to decode client ID "${paramId}":`, error);
    }
  }
  
  return decoded;
};

/**
 * @route   GET /api/projects/:id/clients
 * @desc    Get all clients for a project
 * @access  Private
 */
router.get(
  '/:id/clients',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const projectId = decodeProjectId(req.params.id);
      if (!projectId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid project ID',
        });
      }

      const clients = await getClientsByProjectId(projectId, req.user.userId);

      res.status(200).json({
        success: true,
        message: 'Clients retrieved successfully',
        clients,
        count: clients.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/projects/:id/clients
 * @desc    Assign clients to a project (bulk assignment - replaces all existing)
 * @access  Private
 */
router.post(
  '/:id/clients',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const projectId = decodeProjectId(req.params.id);
      if (!projectId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid project ID',
        });
      }

      const { clientIds } = req.body;

      if (!Array.isArray(clientIds)) {
        return res.status(400).json({
          success: false,
          message: 'clientIds must be an array',
        });
      }

      // Decode client IDs if they're encoded
      const decodedClientIds = clientIds.map((id: string | number) => {
        if (typeof id === 'number') {
          return id;
        }
        const decoded = decodeClientId(String(id));
        if (decoded === null) {
          throw new Error(`Invalid client ID: ${id}`);
        }
        return decoded;
      });

      await assignClientsToProject(projectId, decodedClientIds, req.user.userId);

      res.status(200).json({
        success: true,
        message: 'Clients assigned to project successfully',
      });
    } catch (error: any) {
      if (error.message && error.message.includes('Invalid client ID')) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/projects/:id/clients/:clientId
 * @desc    Remove a specific client from a project
 * @access  Private
 */
router.delete(
  '/:id/clients/:clientId',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const projectId = decodeProjectId(req.params.id);
      if (!projectId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid project ID',
        });
      }

      const clientId = decodeClientId(req.params.clientId);
      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID',
        });
      }

      await removeClientFromProject(projectId, clientId, req.user.userId);

      res.status(200).json({
        success: true,
        message: 'Client removed from project successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
