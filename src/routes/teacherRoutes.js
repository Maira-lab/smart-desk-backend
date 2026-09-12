// src/routes/teacherRoutes.js
const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');
const authMiddleware = require('../middleware/authMiddleware');
 
// TEACHER ROUTES
 
// Dashboard & Profile
router.get('/stats', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.getStats);
router.get('/profile', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.getProfile);

// My Classes Routes
router.get('/classes', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.getMyClasses);
router.get('/my-assigned-classes', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.getMyAssignedClasses);
router.get('/my-classes/:notification_id', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.getAssignmentNotification);
router.get('/class-students/:class_id', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.getClassStudents);

// Attendance Routes (Complete)
router.get('/attendance/:classroom_id', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.getStudentsForAttendance);
router.get('/attendance/students/:classroom_id', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.getClassStudentsForAttendance);
router.get('/attendance/records/:classroom_id', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.getAttendanceRecords);
router.get('/attendance/summary', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.getAttendanceSummary);
router.post('/attendance', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.markAttendance);
router.post('/attendance/bulk', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.markBulkAttendance);

// Class Performance Routes
router.get('/performance/classes', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.getAssignedClassesForPerformance);
router.get('/performance/students/:class_id', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.getClassStudentsPerformance);
router.post('/performance/report', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.saveClassPerformanceReport);
router.get('/performance/report/:class_id', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.getClassPerformanceReport);
router.get('/performance/report/:class_id/download', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.downloadClassPerformanceReport);

// Notification Routes (Existing)
router.get('/notifications', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.getNotifications);
router.post('/notifications', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.sendNotification);

//  
// VIEW NOTIFICATIONS - COMPLETE MODULE
//  

// Get all notifications with filter (paginated)
router.get('/view-notifications', 
    authMiddleware.authenticate, 
    authMiddleware.teacherOnly, 
    teacherController.getTeacherNotifications
);

// Get single notification by ID
router.get('/view-notifications/:id', 
    authMiddleware.authenticate, 
    authMiddleware.teacherOnly, 
    teacherController.getTeacherNotificationById
);

// Mark notification as read
router.post('/view-notifications/:id/read', 
    authMiddleware.authenticate, 
    authMiddleware.teacherOnly, 
    teacherController.markTeacherNotificationRead
);

//    UPDATED: Reply to notification - WITH FILE ATTACHMENT SUPPORT
router.post('/view-notifications/reply', 
    authMiddleware.authenticate, 
    authMiddleware.teacherOnly,
    teacherController.upload.single('attachment'),  //    ADDED: Multer middleware for file upload
    teacherController.replyToTeacherNotification
);

// Get unread notification count
router.get('/view-notifications/unread/count', 
    authMiddleware.authenticate, 
    authMiddleware.teacherOnly, 
    teacherController.getTeacherUnreadCount
);

// Get notification statistics
router.get('/view-notifications/stats/summary', 
    authMiddleware.authenticate, 
    authMiddleware.teacherOnly, 
    teacherController.getTeacherNotificationStats
);

//  
// SEND NOTIFICATION ROUTES
//  

// NEW: Get all active coordinators (for Send Notification screen)
router.get('/coordinators', 
    authMiddleware.authenticate, 
    authMiddleware.teacherOnly, 
    teacherController.getCoordinatorsList
);

// FIXED: Send notification to single recipient (student/coordinator) - WITH FILE UPLOAD
router.post(
    '/notifications/send',
    authMiddleware.authenticate,
    authMiddleware.teacherOnly,
    teacherController.upload.single('attachment'),
    teacherController.sendTeacherNotification
);

// FIXED: Send bulk notification to students in a class - WITH FILE UPLOAD
router.post(
    '/notifications/send-bulk',
    authMiddleware.authenticate,
    authMiddleware.teacherOnly,
    teacherController.upload.single('attachment'),
    teacherController.sendBulkTeacherNotification
);

// ACADEMIC REPORT ROUTES
router.get('/assigned-classes-performance', 
    authMiddleware.authenticate, 
    authMiddleware.teacherOnly, 
    teacherController.getAssignedClassesForPerformance
);

router.get(
    '/report/classes',
    authMiddleware.authenticate,
    authMiddleware.teacherOnly,
    teacherController.getTeacherClassesForReport
);

router.get(
    '/report/student/:student_id/class/:class_id',
    authMiddleware.authenticate,
    authMiddleware.teacherOnly,
    teacherController.getStudentForReport
);

router.post(
    '/report/save',
    authMiddleware.authenticate,
    authMiddleware.teacherOnly,
    teacherController.saveAcademicReport
);

router.get(
    '/report/:student_id/:class_id/:period',
    authMiddleware.authenticate,
    authMiddleware.teacherOnly,
    teacherController.getAcademicReport
);

//    DELETE NOTIFICATION - Both paths for frontend compatibility
router.delete('/notifications/:id', 
    authMiddleware.authenticate, 
    authMiddleware.teacherOnly, 
    teacherController.deleteNotification
);

//    ADDED: Delete notification via /view-notifications path (frontend uses this)
router.delete('/view-notifications/:id', 
    authMiddleware.authenticate, 
    authMiddleware.teacherOnly, 
    teacherController.deleteNotification
);

// Download academic report (PDF/Excel)
router.get(
    '/report/download/:student_id/:class_id/:period',
    authMiddleware.authenticate,
    authMiddleware.teacherOnly,
    teacherController.downloadAcademicReport
);

//  
// LEGACY REPORT ROUTE
//  
router.post('/reports/generate', authMiddleware.authenticate, authMiddleware.teacherOnly, teacherController.generateReport);

module.exports = router;