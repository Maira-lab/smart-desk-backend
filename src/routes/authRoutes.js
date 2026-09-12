// src/routes/authRoutes.js
//  UPDATED WITH FORGOT PASSWORD + REAL-TIME ROLE DETECTION + DUAL FILE UPLOAD (ID Card + Profile Photo)

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// Multer import kiya  (file upload ke liye)
const multer = require('multer');
// Path module import kiya (file paths handle karne ke liye)
const path = require('path');
// File System module import kiya (folders create karne ke liye)
const fs = require('fs');

//  Multer setup - uploads/idcards folder
const uploadDir = path.join(__dirname, '../uploads/idcards');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// PUBLIC ROUTES (No Authentication Required)
//  
router.post('/login', authController.login.bind(authController));

//  UPDATED: ID Card REQUIRED, Profile Photo OPTIONAL
router.post('/register', 
    (req, res, next) => {
        upload.fields([
            { name: 'idCard', maxCount: 1 },
            { name: 'profilePhoto', maxCount: 1 }
        ])(req, res, (err) => {
            if (err) {
                return res.status(400).json({
                    success: false,
                    error: 'File upload error: ' + err.message
                });
            }
            
            //  Check if ID Card is present
            if (!req.files?.idCard || req.files.idCard.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'ID Card / Admission Letter is required for registration'
                });
            }
            
            next();
        });
    },
    authController.register.bind(authController)
);

//  NEW: DETECT ROLE FROM EMAIL (Real-time - No auth required)
router.post('/detect-role', authController.detectRole.bind(authController));

//  FORGOT PASSWORD ROUTES (Public - User is not logged in yet)
router.post('/forgot-password', authController.forgotPassword.bind(authController));
router.post('/verify-reset-code', authController.verifyResetCode.bind(authController));
router.post('/reset-password', authController.resetPassword.bind(authController));
// Push token upload endpoint
router.post('/update-push-token', authMiddleware.authenticate, authController.updatePushToken.bind(authController));

//  
// PROTECTED ROUTES (Authentication Required)
//  
router.get('/status', authMiddleware.authenticate, authController.checkStatus.bind(authController));
router.post('/logout', authMiddleware.authenticate, authController.logout.bind(authController));

module.exports = router;