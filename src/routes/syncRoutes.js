// smart-desk-backend/src/routes/syncRoutes.js
const router = require('express').Router();
const syncController = require('../controllers/syncController');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');

//    Multer setup with 10MB limit
const upload = multer({ 
    storage: multer.memoryStorage(), 
    limits: { fileSize: 10 * 1024 * 1024 } 
});

//    All sync routes (authenticated)
router.use(authMiddleware.authenticate);

// ============================================
// CORE SYNC ROUTES
// ============================================

// POST - Sync attendance
router.post('/attendance', syncController.syncAttendance);

// POST - Sync marks
router.post('/marks', syncController.syncMarks);

// POST - Sync notification (✅ with attachment support)
router.post('/notification', upload.single('attachment'), syncController.syncNotification);

// ============================================
//    NEW: ACADEMIC & PERFORMANCE SYNC ROUTES
// ============================================

// POST - Sync academic report
router.post('/academic-report', syncController.syncAcademicReport);

// POST - Sync class performance
router.post('/class-performance', syncController.syncClassPerformance);

// POST - Sync class assignment
router.post('/class-assignment', syncController.syncClassAssignment);

// ============================================
// BULK & MANAGEMENT ROUTES
// ============================================

//    FIX: Added upload.single('attachment') here too, just in case offline sync uses bulk endpoint
router.post('/bulk', upload.single('attachment'), syncController.bulkSync);

// GET - Sync status
router.get('/status', syncController.getSyncStatus);

// GET - Sync history
router.get('/history', syncController.getSyncHistory);

// DELETE - Clear sync data
router.delete('/clear', syncController.clearSyncData);

module.exports = router;