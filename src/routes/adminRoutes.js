// src/routes/adminRoutes.js
//    UPDATED: Fixed multiple file uploads + Added Staff & Responses routes

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');

//    FIXED: Multer memory storage (Multiple files handle karne ke liye)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max per file
});

// ==========================================
// 1. DASHBOARD STATISTICS
// ==========================================
router.get('/stats', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.getStats
);

// ==========================================
// 2. USER MANAGEMENT
// ==========================================
router.get('/users', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.getAllUsers
);

router.put('/revoke/:user_id', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.revokeUser
);

router.delete('/delete/:user_id', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.deleteUser
);

// ==========================================
// 3. PENDING APPROVALS
// ==========================================
router.get('/pending', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.getPendingApprovals
);

router.put('/approve/:user_id', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.approveUser
);

router.put('/reject/:user_id', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.rejectUser
);

router.put('/recover/:user_id', 
    authMiddleware.authenticate,
    authMiddleware.adminOnly, 
    adminController.recoverAccount);

// ==========================================
// 4. REVOKED USERS MANAGEMENT
// ==========================================
router.get('/revoked', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.getRevokedUsers
);

router.put('/restore/:user_id', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.restoreUser
);

router.delete('/permanent-delete/:user_id', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.permanentlyDeleteUser
);

router.post('/bulk-delete', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.bulkPermanentlyDeleteUsers
);

// ==========================================
// 5. COORDINATOR MANAGEMENT
// ==========================================
router.post('/coordinator', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.createCoordinator
);

router.get('/coordinators', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.getCoordinators
);

// ==========================================
// 6. ANNOUNCEMENTS (✅ CRITICAL FIXES HERE)
// ==========================================

//    CHANGE 1: 'single' ki jagah 'array' use kiya hai, aur route name '/announcements/send' rakha hai (Frontend match karne ke liye)
router.post('/announcements/send', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    upload.array('files', 5), // Frontend 'files' ke naam se array bhejta hai
    adminController.makeAnnouncement
);

//    CHANGE 2: Naya route add kiya hai (Recipient picker ke liye)
router.get('/announcements/staff', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.getStaff
);

//    CHANGE 3: Naya route add kiya hai (Admin portal mein responses dikhane ke liye)
router.get('/announcements/responses', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.getResponses
);

router.delete('/announcements/responses/:id',
    authMiddleware.authenticate,
    authMiddleware.adminOnly,
    adminController.deleteResponse);

// ==========================================
// 7. DEPARTMENT REPORTS
// ==========================================
router.get('/departments', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.getDepartments
);

router.get('/department-reports', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.getDepartmentReports
);

// ==========================================
// 8. REPORT REQUESTS
// ==========================================
router.post('/request-report', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.requestReport
);

router.get('/received-reports', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.getReceivedReports
);

router.get('/report-details/:report_id', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.getReportDetails
);

router.get('/download-report/:report_id', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.downloadReport
);

router.delete('/delete-report/:report_id', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.deleteReport
);

// ==========================================
// 9. DIRECT MESSAGE
// ==========================================
router.post('/direct-message', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.sendDirectMessage
);

// ==========================================
// 10. INSTITUTIONS MANAGEMENT
// ==========================================
router.get('/institutions', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.getInstitutions
);

router.post('/institutions', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.createInstitution
);

router.post('/institute-admin', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.createInstituteAdmin
);

// ==========================================
// 11. USER MONITORING & ACTIVITY
// ==========================================
router.get('/monitor', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.monitorUsers
);

router.get('/activity/:user_id', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.getUserActivity
);

// ==========================================
// 12. USER RESTRICTION MANAGEMENT
// ==========================================
router.put('/restrict/:user_id', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.restrictUser
);

router.get('/stats/users', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.getUserStats
);

// ==========================================
// 13. BULK USER ACTIONS
// ==========================================
router.post('/bulk-restrict', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.bulkRestrictUsers
);


router.post('/bulk-unrestrict', 
    authMiddleware.authenticate, 
    authMiddleware.adminOnly, 
    adminController.bulkUnrestrictUsers
);

module.exports = router;