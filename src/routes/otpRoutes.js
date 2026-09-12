// src/routes/otpRoutes.js
//  FIXED - All functions imported correctly

const express = require('express');   // Express framework import karo (server banane ke liye)
const router = express.Router(); // Router object banao (routes define karne ke liye)

//  Sab functions import karein (Forgot Password + Registration)
const { 
    sendOTP, 
    verifyOTP, 
    resendOTP, 
    resetPassword,
    sendRegistrationOTP,
    verifyRegistrationOTP
} = require('../controllers/otpController');

//  
// PUBLIC ROUTES (No Authentication Required)
//  

// Forgot Password Routes (Existing)
router.post('/send', sendOTP);
router.post('/verify', verifyOTP);
router.post('/resend', resendOTP);
router.post('/reset-password', resetPassword);

// 🆕 Registration Routes (New)
router.post('/send-registration', sendRegistrationOTP);
router.post('/verify-registration', verifyRegistrationOTP);

module.exports = router;