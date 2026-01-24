import express from 'express';
import multer from 'multer';
import { getUserById, updateUser } from '../services/userService';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { incrementExpenseScreenVisit } from '../services/sessionService';
import { AppError } from '../middleware/errorHandler';
import BlobStorageService, { FileType } from '../services/blobStorageService';

const router = express.Router();

// Allowed image MIME types
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  // Check MIME type
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(new AppError('Only image files (JPEG, PNG, GIF, WebP) are allowed for logo uploads', 400));
    return;
  }

  // Check file extension (using string methods instead of path)
  const fileName = file.originalname.toLowerCase();
  const hasValidExtension = ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));
  if (!hasValidExtension) {
    cb(new AppError('Invalid file extension. Only image files are allowed', 400));
    return;
  }

  // Additional security: Check for potentially dangerous filenames
  const dangerousPatterns = /\.\.|\.exe|\.sh|\.bat|\.cmd|\.php|\.js$/i;
  if (dangerousPatterns.test(file.originalname)) {
    cb(new AppError('Invalid filename. Potentially dangerous file detected', 400));
    return;
  }

  cb(null, true);
};

/**
 * @route   GET /api/user/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const user = await getUserById(req.user.userId);

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/user/track-expense-visit
 * @desc    Track expense screen visit
 * @access  Private
 */
router.post('/track-expense-visit', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const session = await incrementExpenseScreenVisit(req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Expense screen visit tracked',
      session,
    });
  } catch (error) {
    next(error);
  }
});

// Use memory storage for Azure Blob uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max (matching registration)
    files: 1, // Only one file
    fieldSize: 10 * 1024 * 1024, // 10MB max field size
  },
  fileFilter,
});

/**
 * @route   PUT /api/user/profile
 * @desc    Update current user profile
 * @access  Private
 */
// Logo is optional - can be uploaded or updated later
// upload.single() handles optional files - req.file will be undefined if no file is provided
router.put('/profile', authenticateToken, upload.single('logo'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Get current user to check for existing logo
    const currentUser = await getUserById(req.user.userId);
    let oldLogoPath: string | null = null;

    const updateData: any = {};
    
    if (req.body.fullName) updateData.fullName = req.body.fullName;
    if (req.body.email) updateData.email = req.body.email;
    if (req.body.country !== undefined) updateData.country = req.body.country || null;
    if (req.body.mobileNumber !== undefined) updateData.mobileNumber = req.body.mobileNumber || null;
    if (req.body.gstin !== undefined) updateData.gstin = req.body.gstin || null;
    if (req.body.pan !== undefined) updateData.pan = req.body.pan || null;
    if (req.body.currency) updateData.currency = req.body.currency;

    // Handle logo file upload or removal
    if (req.file) {
      // Generate unique filename with timestamp
      const fileExtension = req.file.originalname.split('.').pop() || 
        (req.file.mimetype === 'image/jpeg' ? 'jpg' :
         req.file.mimetype === 'image/png' ? 'png' :
         req.file.mimetype === 'image/gif' ? 'gif' :
         req.file.mimetype === 'image/webp' ? 'webp' : 'jpg');
      const baseName = req.file.originalname.replace(/\.[^/.]+$/, '') || 'logo';
      const uniqueFileName = `${baseName}_${Date.now()}.${fileExtension}`;
      
      // Upload logo to Azure Blob Storage
      const blobPath = await BlobStorageService.uploadFile(
        req.file.buffer,
        uniqueFileName,
        FileType.LOGO,
        req.user.userId,
        req.file.mimetype
      );
      updateData.logo = blobPath;
      
      // Store old logo path for deletion after successful update
      if (currentUser.logo && currentUser.logo.startsWith('Logos/')) {
        oldLogoPath = currentUser.logo;
      }
    } else if (req.body.logo === 'null' || req.body.logo === null) {
      // Explicitly remove logo
      updateData.logo = null;
      
      // Store old logo path for deletion
      if (currentUser.logo && currentUser.logo.startsWith('Logos/')) {
        oldLogoPath = currentUser.logo;
      }
    }

    const user = await updateUser(req.user.userId, updateData);

    // Delete old logo file from Azure Blob Storage if it exists and was replaced/removed
    if (oldLogoPath) {
      try {
        await BlobStorageService.deleteFile(oldLogoPath);
      } catch (deleteError) {
        // Log but don't fail the request if file deletion fails
        console.warn('Failed to delete old logo file from Azure Blob:', deleteError);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

