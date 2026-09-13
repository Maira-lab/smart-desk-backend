// src/routes/studentRoutes.js
const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/stats', authMiddleware.authenticate, authMiddleware.studentOnly, studentController.getStats);
router.get('/profile', authMiddleware.authenticate, authMiddleware.studentOnly, studentController.getProfile);
router.get('/reports', authMiddleware.authenticate, authMiddleware.studentOnly, studentController.getAcademicReports);

router.delete('/notifications/:id', authMiddleware.authenticate, authMiddleware.studentOnly, studentController.deleteNotification);

router.get('/attendance', authMiddleware.authenticate, studentController.getAttendance);
router.get('/notifications', authMiddleware.authenticate, authMiddleware.studentOnly, studentController.getNotifications);
router.put('/notifications/:notification_id/read', authMiddleware.authenticate, authMiddleware.studentOnly, studentController.markNotificationRead);
router.get('/classes', authMiddleware.authenticate, authMiddleware.studentOnly, studentController.getTodaysClasses);
router.get('/attendance/summary', authMiddleware.authenticate, authMiddleware.studentOnly, studentController.getAttendanceSummary);

module.exports = router;