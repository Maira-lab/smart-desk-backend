// src/routes/studentAttendanceRoutes.js
//  Student Attendance Routes

const router = require('express').Router();
const studentAttendanceController = require('../controllers/studentAttendanceController');
const { authenticate, studentOnly } = require('../middleware/authMiddleware');

//  
// STUDENT ATTENDANCE ROUTES
//  

//  Get all attendance (with period filter)
router.get(
    '/attendance',
    authenticate,
    studentOnly,
    studentAttendanceController.getAttendance
);

//  Get attendance for specific subject
router.get(
    '/attendance/subject/:classroom_id',
    authenticate,
    studentOnly,
    studentAttendanceController.getSubjectAttendance
);

//  Get attendance summary
router.get(
    '/attendance/summary',
    authenticate,
    studentOnly,
    studentAttendanceController.getAttendanceSummary
);

//  Get today's attendance status
router.get(
    '/attendance/today',
    authenticate,
    studentOnly,
    studentAttendanceController.getTodayAttendance
);

module.exports = router;