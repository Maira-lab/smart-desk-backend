// src/routes/studentTodayClassRoutes.js
//  Student Today's Classes Routes

const router = require('express').Router();
const studentTodayClassController = require('../controllers/studentTodayClassController');
const { authenticate, studentOnly } = require('../middleware/authMiddleware');

//  
// STUDENT TODAY'S CLASSES ROUTES
//  

//  Get today's classes (with filter)
router.get(
    '/today-classes',
    authenticate,
    studentOnly,
    studentTodayClassController.getTodayClasses
);

//  Get class details
router.get(
    '/today-classes/:class_id',
    authenticate,
    studentOnly,
    studentTodayClassController.getClassDetails
);

//  Get weekly schedule
router.get(
    '/weekly-schedule',
    authenticate,
    studentOnly,
    studentTodayClassController.getWeeklySchedule
);

//  Get attendance status for today
router.get(
    '/today-attendance',
    authenticate,
    studentOnly,
    studentTodayClassController.getAttendanceStatus
);

//  Get class summary stats
router.get(
    '/class-summary',
    authenticate,
    studentOnly,
    studentTodayClassController.getClassSummary
);

module.exports = router;