// src/routes/coordinatorRoutes.js
const express = require('express');
const router = express.Router();
const coordinatorController = require('../controllers/coordinatorController');
const authMiddleware = require('../middleware/authMiddleware');

//  NEW: Get upload middleware from coordinatorController
const upload = coordinatorController.upload;

//  
// ALL ROUTES REQUIRE AUTHENTICATION + COORDINATOR ROLE
//  

//  
// 1. DASHBOARD & STATS
//  
router.get('/stats', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getStats
);

//  
// 2. VIEW APPROVED ACCOUNTS
//  
router.get('/approved-accounts', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getApprovedAccounts
);

router.get('/user-details/:user_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getUserDetails
);

router.get('/approval-stats', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getApprovalStats
);

//  
// 3. SEMESTER MANAGEMENT
//  
router.get('/semesters', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getSemesters
);

router.post('/semesters', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.createSemester
);

router.put('/semesters/:semester_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.updateSemester
);

router.delete('/semesters/:semester_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.deleteSemester
);

//  
// 4. CLASS MANAGEMENT
//  
router.get('/all-classes', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getClasses
);

router.post('/all-classes', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.createClass
);

router.put('/all-classes/:class_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.updateClass
);

router.delete('/all-classes/:class_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.deleteClass
);

//  
// 5. TIMETABLE
//  
router.get('/timetable', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getTimetable
);

//  
// 6. ASSIGN CLASSES
//  
router.get('/teachers', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getTeachers
);

router.get('/assignable-classes', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getAssignableClasses
);

router.put('/assign-class/:class_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.assignTeacher
);

router.put('/unassign-class/:class_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.unassignTeacher
);

router.get('/class-details/:class_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getClassDetails
);

//  
// 7. ASSIGNED CLASSES
//  
router.get('/assigned-classes', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getAssignedClasses
);

//  
// 8. ENROLL STUDENTS
//  
router.get('/approved-students', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getApprovedStudents
);

router.get('/class-enrollments/:class_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getEnrolledStudents
);

router.post('/enroll-students/:class_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.enrollStudents
);

router.put('/enrollment-status/:class_id/:student_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.updateEnrollmentStatus
);

router.put('/promote-class/:class_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.promoteClass
);

//  
// 9. PERFORMANCE REPORTS
//  
router.get('/performance-reports', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getPerformanceReports
);

router.get('/performance-report/:report_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getPerformanceReportDetails
);

router.get('/reports/download/:report_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.downloadPerformanceReport
);

//  
// 10. COORDINATOR REPORTS
//  

// Get all report requests for coordinator
router.get('/report-requests', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getReportRequests
);

// Submit a report
router.post('/reports/submit', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.submitReport
);

// Get submitted reports
router.get('/submitted-reports', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getSubmittedReports
);

//  
// 11. VIEW NOTIFICATIONS
//  

// Get all notifications (admin, teacher, student)
router.get('/notifications', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getAlerts
);

// Get admin notifications only
router.get('/notifications/admin', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getAdminNotifications
);

// Get teacher messages only
router.get('/notifications/teachers', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getTeacherMessages
);

// Get student messages only
router.get('/notifications/students', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getStudentMessages
);

// Mark notification as read
router.put('/notifications/read/:notification_id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.markNotificationRead
);

// Mark all notifications as read
router.put('/notifications/read-all', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.markAllNotificationsRead
);

// Get notification counts by category
router.get('/notifications/counts', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getNotificationCounts
);

//  NEW: Get replies for a specific notification
router.get('/notifications/:notification_id/replies', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getNotificationReplies
);

//  NEW: Reply to a notification
//    Reply with file attachment support
router.post('/notifications/:notification_id/reply', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly,
    upload.single('attachment'),  //    Multer middleware
    coordinatorController.replyToNotification
);

//  
// 12. SEND NOTIFICATION (Coordinator Send Notification)
//  

// Get recipients by type (teacher, student, admin)
router.get('/recipients', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getRecipients
);

//  FIXED: Send notification to a single recipient WITH FILE ATTACHMENT
router.post('/notifications/send', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly,
    upload.single('attachment'),  //  Multer middleware - 'attachment' field name
    coordinatorController.sendNotification
);

//  FIXED: Send bulk notification to multiple recipients WITH FILE ATTACHMENT
router.post('/notifications/send-bulk', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly,
    upload.single('attachment'),  //  Multer middleware
    coordinatorController.sendBulkNotification
);

// ⚠️ OPTIONAL: Old separate upload route (backwards compatibility ke liye)
// Agar frontend pehle is route ko use kar raha tha toh rakh sakte hain
// Lekin naya pattern direct attachment use karta hai
router.post('/upload-attachment', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly,
    upload.single('file'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No file uploaded'
                });
            }
            
            // Save file to disk
            const fs = require('fs');
            const path = require('path');
            const uploadDir = path.join(__dirname, '../uploads/attachments');
            
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const fileName = uniqueSuffix + '-' + req.file.originalname;
            const filePath = path.join(uploadDir, fileName);
            
            fs.writeFileSync(filePath, req.file.buffer);
            
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const fileUrl = `${baseUrl}/uploads/attachments/${fileName}`;
            
            res.json({
                success: true,
                message: 'File uploaded successfully',
                fileUrl: fileUrl,
                fileName: req.file.originalname,
                fileSize: req.file.size
            });
        } catch (error) {
            console.error('Upload attachment error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Upload failed'
            });
        }
    }
);

//  
// 13. NOTIFICATION HISTORY & STATS (NEW)
//  

// Get notification history with pagination
router.get('/notifications/history', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getNotificationHistory
);

// Get notification statistics
router.get('/notifications/stats', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getNotificationStats
);

//  
//    DELETE NOTIFICATION
router.delete('/notifications/:id', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.deleteNotification
);
// 14. PROFILE
//  
router.get('/profile', 
    authMiddleware.authenticate, 
    authMiddleware.coordinatorOnly, 
    coordinatorController.getProfile
);

module.exports = router;