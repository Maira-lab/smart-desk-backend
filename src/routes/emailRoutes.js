// src/routes/emailRoutes.js
//  UPDATED: Added Multer middleware for file attachments

const router = require('express').Router();
const emailController = require('../controllers/emailcontroller');
const authMiddleware = require('../middleware/authMiddleware');
const coordinatorController = require('../controllers/coordinatorController');

//  Get upload middleware from coordinatorController
const upload = coordinatorController.upload;

//  
// EMAIL ROUTES
//  

//  Send email (supports both JSON & FormData with file attachments)
// Usage: 
//   - JSON: POST /api/email/send with { to, subject, message, attachments? }
//   - FormData: POST /api/email/send with to, subject, message, attachment (file field)
router.post(
    '/send',
    authMiddleware.authenticate,
    upload.fields([
        { name: 'attachment', maxCount: 1 },
        { name: 'attachments', maxCount: 10 }
    ]),
    emailController.sendEmail
);

//  Send welcome email (JSON only)
router.post(
    '/welcome',
    authMiddleware.authenticate,
    emailController.sendWelcomeEmail
);

//  Send OTP email (JSON only)
router.post(
    '/otp',
    authMiddleware.authenticate,
    emailController.sendOTPEmail
);

//  Send approval email (JSON only)
router.post(
    '/approval',
    authMiddleware.authenticate,
    emailController.sendApprovalEmail
);

module.exports = router;