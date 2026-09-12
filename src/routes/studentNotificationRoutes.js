// src/routes/studentNotificationRoutes.js
//    Student Notifications Routes - WITH FILE UPLOAD SUPPORT

const router = require('express').Router();
const studentNotificationController = require('../controllers/studentNotificationController');
const { authenticate, studentOnly } = require('../middleware/authMiddleware');
const multer = require('multer');//      ADDED

//    Multer setup for file uploads - ✅ SDK 57 Compatible with Extension Fallback
const upload = multer({ 
    storage: multer.memoryStorage(), 
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
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
            'text/plain',
            'application/octet-stream'
        ];
        
        let mimetype = file.mimetype || '';
        
        // Agar mimetype valid hai aur allowed list mein hai
        if (mimetype && allowedTypes.includes(mimetype)) {
            cb(null, true);
            return;
        }
        
        // ✅ SDK 57 FIX: Agar mimetype empty/generic hai, toh extension se check karo
        if (!mimetype || mimetype === 'application/octet-stream' || mimetype === '') {
            const originalName = file.originalname || '';
            const ext = originalName.split('.').pop()?.toLowerCase();
            
            const allowedExtensions = [
                'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp',
                'mp4', 'mov', 'avi',
                'doc', 'docx', 'xls', 'xlsx', 'txt'
            ];
            
            if (ext && allowedExtensions.includes(ext)) {
                console.log(`✅ Student Notification: File accepted via extension: ${originalName}`);
                cb(null, true);
                return;
            }
        }
        
        console.warn(`⚠️ Student Notification: File rejected: ${file.originalname} | mimetype: ${mimetype}`);
        cb(new Error('Invalid file type. Only PDF, Images, Videos, and Documents are allowed.'), false);
    }
});

//  
// STUDENT NOTIFICATION ROUTES
//  

// Get all notifications (with filter)
router.get(
    '/notifications',
    authenticate,
    studentOnly,
    studentNotificationController.getNotifications
);

// Get notification details
router.get(
    '/notifications/:notification_id',
    authenticate,
    studentOnly,
    studentNotificationController.getNotificationDetails
);

//    Send reply to notification (WITH FILE ATTACHMENT SUPPORT)
router.post(
    '/notifications/reply',
    authenticate,
    studentOnly,
    upload.single('replyFile'),//      ADDED: File accept karega
    studentNotificationController.sendReply
);

// Mark notification as read
router.put(
    '/notifications/:notification_id/read',
    authenticate,
    studentOnly,
    studentNotificationController.markAsRead
);

// Mark all notifications as read
router.put(
    '/notifications/read-all',
    authenticate,
    studentOnly,
    studentNotificationController.markAllAsRead
);

// Get unread count
router.get(
    '/notifications/unread-count',
    authenticate,
    studentOnly,
    studentNotificationController.getUnreadCount
);

//    Submit assignment (with file upload support)
router.post(
    '/notifications/submit-assignment',
    authenticate,
    studentOnly,
    upload.single('assignmentFile'),//      File accept karega
    studentNotificationController.submitAssignment
);

module.exports = router;