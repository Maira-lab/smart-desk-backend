// src/routes/studentAcademicReportRoutes.js
//  Student Academic Reports Routes

const router = require('express').Router();
const studentAcademicReportController = require('../controllers/studentAcademicReportController');
const { authenticate, studentOnly } = require('../middleware/authMiddleware');

//  
// STUDENT ACADEMIC REPORTS ROUTES
//  

//  Get all reports (with period filter)
router.get(
    '/academic-reports',
    authenticate,
    studentOnly,
    studentAcademicReportController.getReports
);

//  Get report details
router.get(
    '/academic-reports/:report_id',
    authenticate,
    studentOnly,
    studentAcademicReportController.getReportDetails
);

//  Download report (PDF/Excel)
router.get(
    '/academic-reports/:report_id/download',
    authenticate,
    studentOnly,
    studentAcademicReportController.downloadReport
);

//  Get report statistics
router.get(
    '/academic-reports/stats',
    authenticate,
    studentOnly,
    studentAcademicReportController.getReportStats
);

module.exports = router;