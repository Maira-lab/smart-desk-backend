// src/routes/announcementRoutes.js
//  UPDATED WITH MULTER FILE UPLOAD SUPPORT

const express = require('express');
const router = express.Router();
const multer = require('multer'); //  NEW: For file uploads
const path = require('path'); //  NEW: For file extensions
const fs = require('fs'); //  NEW: To ensure uploads folder exists
const announcementController = require('../controllers/announcementController');
const authMiddleware = require('../middleware/authMiddleware');

//  
//  MULTER CONFIGURATION (File Upload Setup)
//  

// Ensure uploads/announcements folder exists
const uploadsDir = path.join(__dirname, '../uploads/announcements');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// File Filter (PDF, Images, Videos only)
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png', 
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];
  
  // ✅ SDK 57 FIX: Agar mimetype empty ya generic hai, toh file extension se check karo
  let mimetype = file.mimetype || '';
  
  // Agar mimetype valid hai aur allowed list mein hai
  if (mimetype && allowedTypes.includes(mimetype)) {
    cb(null, true);
    return;
  }
  
  // Agar mimetype generic/empty hai, toh original filename se extension check karo
  if (!mimetype || mimetype === 'application/octet-stream' || mimetype === '') {
    const originalName = file.originalname || '';
    const ext = originalName.split('.').pop()?.toLowerCase();
    
    const allowedExtensions = [
      'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 
      'mp4', 'mov', 'avi', 
      'doc', 'docx', 'xls', 'xlsx', 'txt'
    ];
    
    if (ext && allowedExtensions.includes(ext)) {
      console.log(`✅ File accepted via extension check: ${originalName} (ext: ${ext})`);
      cb(null, true);
      return;
    }
  }
  
  // Agar dono checks fail ho gaye
  console.warn(`⚠️ File rejected: ${file.originalname} | mimetype: ${mimetype}`);
  cb(new Error('Invalid file type. Only PDF, Images, Videos, and Documents are allowed.'), false);
};
// Initialize Multer
const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 50 * 1024 * 1024 //  50MB max file size
    },
    fileFilter: fileFilter
});

//  
// GLOBAL MIDDLEWARE
//  
// All routes require authentication and admin access
router.use(authMiddleware.authenticate);
router.use(authMiddleware.adminOnly);

//  
// ROUTES
//  

//  SEND ANNOUNCEMENT (with file upload support - up to 10 files)
router.post('/send', 
    upload.array('files', 10), // Accept up to 10 files with field name 'files'
    announcementController.sendAnnouncement
);

// Get staff members
router.get('/staff', announcementController.getStaffMembers);

// Get responses
router.get('/responses', announcementController.getResponses);

// Mark response as read
router.put('/responses/:response_id/read', announcementController.markResponseRead);

// Register push token
router.post('/register-token', announcementController.registerPushToken);

module.exports = router;