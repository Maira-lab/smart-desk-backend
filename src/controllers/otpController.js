// src/controllers/otpController.js
//  MERGED VERSION - Forgot Password + Registration OTP + Domain Validation
const bcrypt = require('bcryptjs');  // Password ko hash (encrypt) karna
const mysql = require('mysql2/promise');  // Database se connect karna
const nodemailer = require('nodemailer');  //  Email bhejna (OTP, reset code)
require('dotenv').config();  // .env file se variables load karna

//  Database connection pool
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smart_desk',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

//  Gmail SMTP Transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    family: 4,  // ← YEH LINE ADD KAREIN (IPv4 force - IPv6 block fix)
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false
    }
});

//  In-memory OTP store
const otpStore = new Map();

//  Helper function
async function query(sql, params = []) {
    const [rows] = await db.execute(sql, params);
    return rows;
}

//  Domain Validation Helper
function validateEmailDomain(email) {
    if (!email || !email.includes('@')) return { valid: false, type: null, error: 'Invalid email format' };
    const domain = email.split('@')[1].toLowerCase();
    
    const INSTITUTE_DOMAINS = ['smartdesk.com', 'smartdesk.edu', 'university.edu', 'edu.pk'];
    const ALLOWED_PUBLIC = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];
    
    if (INSTITUTE_DOMAINS.includes(domain)) {
        return { valid: true, type: 'institute', message: '✅ Official Institute Email Detected' };
    }
    if (ALLOWED_PUBLIC.includes(domain)) {
        return { valid: true, type: 'public', message: '⚠️ Public Email (Admin will manually review)' };
    }
    return { valid: false, type: null, error: '❌ Domain not allowed. Use institute email or gmail/yahoo/outlook.' };
}

//  
// 1. SEND OTP (For Forgot Password) - UNCHANGED
//  
const sendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'Please enter your email' });

        const results = await query('SELECT * FROM users WHERE email = ?', [email]);
        if (results.length === 0) return res.status(404).json({ success: false, error: 'Email not found.' });

        const user = results[0];
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        otpStore.set(`forgot_${email}`, {
            otp, expiresAt: Date.now() + 5 * 60 * 1000, verified: false
        });

        //   .env se testing mode check karein
            const isTestingMode = process.env.EMAIL_TESTING_MODE === 'true' || process.env.EMAIL_TESTING_MODE === '1';
            const recipientEmail = isTestingMode ? process.env.SMTP_USER : email;

            await transporter.sendMail({
                from: process.env.SMTP_FROM || `"Smart Desk" <${process.env.SMTP_USER}>`,
                to: recipientEmail,
            subject: `🔐 OTP Code for ${user.full_name || 'User'}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #F59E0B, #D97706); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                        <h1 style="color: white; margin: 0;">Smart Desk</h1>
                        <p style="color: #FEF3C7; margin: 5px 0 0 0;">OTP Verification</p>
                    </div>
                    <div style="background: #F9FAFB; padding: 30px; border-radius: 0 0 10px 10px;">
                        <p>Hello <strong>${user.full_name || 'User'}</strong>,</p>
                        <p>Your OTP code is:</p>
                        <div style="background: white; padding: 25px; text-align: center; margin: 25px 0; border-radius: 10px; border: 2px dashed #F59E0B;">
                            <h1 style="color: #B45309; letter-spacing: 10px; margin: 0; font-size: 36px;">${otp}</h1>
                        </div>
                        <p style="color: #EF4444; font-weight: bold;">⏰ Expires in 5 minutes.</p>
                    </div>
                </div>
            `
        });

        console.log(`📧 Forgot Password OTP for ${email}: ${otp} (sent to ${recipientEmail})`);

        res.json({
            success: true,
            message: `OTP sent to ${recipientEmail}`,
            debugOTP: otp,
            email: email
        });
    } catch (error) {
        console.error('❌ Send OTP error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

//  
// 2. VERIFY OTP (For Forgot Password) - UNCHANGED
//  
const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ success: false, error: 'Please provide email and OTP' });

        const stored = otpStore.get(`forgot_${email}`);
        if (!stored) return res.status(400).json({ success: false, error: 'No OTP found. Please request a new code.' });
        if (Date.now() > stored.expiresAt) {
            otpStore.delete(`forgot_${email}`);
            return res.status(400).json({ success: false, error: 'OTP expired.' });
        }
        if (stored.otp !== otp) return res.status(400).json({ success: false, error: 'Invalid OTP.' });

        otpStore.set(`forgot_${email}`, { ...stored, verified: true });
        res.json({ success: true, message: 'OTP verified successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

//  
// 3. RESET PASSWORD - UNCHANGED
//  
const resetPassword = async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        if (!email || !newPassword) return res.status(400).json({ success: false, error: 'Email and password required' });
        if (newPassword.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters (letters, numbers & special characters allowed)' });

        const stored = otpStore.get(`forgot_${email}`);
        if (!stored || !stored.verified) return res.status(400).json({ success: false, error: 'Please verify email first' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);
        otpStore.delete(`forgot_${email}`);

        res.json({ success: true, message: 'Password reset successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

//  
// 4. RESEND OTP - UNCHANGED
//  
const resendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'Email required' });

        const results = await query('SELECT * FROM users WHERE email = ?', [email]);
        if (results.length === 0) return res.status(404).json({ success: false, error: 'Email not found' });

        const user = results[0];
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        otpStore.set(`forgot_${email}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000, verified: false });

//   .env se testing mode check karein
        const isTestingMode = process.env.EMAIL_TESTING_MODE === 'true' || process.env.EMAIL_TESTING_MODE === '1';
        const recipientEmail = isTestingMode ? process.env.SMTP_USER : email;

        await transporter.sendMail({
            from: process.env.SMTP_FROM || `"Smart Desk" <${process.env.SMTP_USER}>`,
            to: recipientEmail,
            subject: `🔐 New OTP Code`,
            html: `<div style="font-family: Arial; padding: 20px;"><h1>New OTP: ${otp}</h1><p>Expires in 5 minutes.</p></div>`
        });

        console.log(`📧 Resend OTP for ${email}: ${otp}`);
        res.json({ success: true, message: `New OTP sent`, debugOTP: otp });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

//  
// 5. 🆕 SEND REGISTRATION OTP (New User Signup)
//  
const sendRegistrationOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

        //  Layer 3: Domain Validation
        const domainCheck = validateEmailDomain(email);
        if (!domainCheck.valid) {
            return res.status(400).json({ success: false, error: domainCheck.error });
        }

        //  Layer 2: Duplicate Email Check
        const existing = await query('SELECT user_id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, error: 'Email already registered. Please login.' });
        }

        //  Layer 1: Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore.set(`register_${email}`, {
            otp, expiresAt: Date.now() + 5 * 60 * 1000, verified: false, domainType: domainCheck.type
        });

        //   .env se testing mode check karein
        const isTestingMode = process.env.EMAIL_TESTING_MODE === 'true' || process.env.EMAIL_TESTING_MODE === '1';
        const recipientEmail = isTestingMode ? process.env.SMTP_USER : email;

        await transporter.sendMail({
            from: process.env.SMTP_FROM || `"Smart Desk" <${process.env.SMTP_USER}>`,
            to: recipientEmail,
            subject: '🎓 Smart Desk - Registration Verification',
            html: `
                <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #7C3AED, #6D28D9); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                        <h1 style="color: white; margin: 0;">📖 Smart Desk</h1>
                        <p style="color: #DDD6FE; margin: 5px 0 0 0;">Registration Verification</p>
                    </div>
                    <div style="background: #F9FAFB; padding: 30px; border-radius: 0 0 10px 10px;">
                        <p style="color: #1F2937;">Hello,</p>
                        <p style="color: #4B5563;">You're registering with: <strong>${email}</strong></p>
                        <p style="color: #4B5563;"><strong>${domainCheck.message}</strong></p>
                        <div style="background: white; padding: 25px; text-align: center; margin: 25px 0; border-radius: 10px; border: 2px dashed #7C3AED;">
                            <h1 style="color: #7C3AED; letter-spacing: 10px; margin: 0; font-size: 36px;">${otp}</h1>
                        </div>
                        <p style="color: #EF4444; font-weight: bold;">⏰ This OTP expires in 5 minutes.</p>
                    </div>
                </div>
            `
        });

        console.log('\n' + '='.repeat(60));
        console.log('🎓 REGISTRATION OTP SENT');
        console.log('='.repeat(60));
        console.log(`📧 Email:        ${email}`);
        console.log(`🌐 Domain Type:  ${domainCheck.type} (${domainCheck.message})`);
        console.log(`🔑 OTP:          ${otp}`);
        console.log(`📨 Sent To:      ${recipientEmail} ${isTestingMode ? '(TESTING MODE)' : '(PRODUCTION MODE)'}`);
        console.log('='.repeat(60) + '\n');

        res.json({
            success: true,
            message: 'Registration OTP sent',
            domainType: domainCheck.type,
            domainMessage: domainCheck.message,
            debugOTP: otp
        });
    } catch (error) {
        console.error('❌ Registration OTP error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

//  
// 6. 🆕 VERIFY REGISTRATION OTP
//  
const verifyRegistrationOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ success: false, error: 'Email and OTP required' });

        const stored = otpStore.get(`register_${email}`);
        if (!stored) return res.status(400).json({ success: false, error: 'No OTP found. Please request a new code.' });
        if (Date.now() > stored.expiresAt) {
            otpStore.delete(`register_${email}`);
            return res.status(400).json({ success: false, error: 'OTP expired.' });
        }
        if (stored.otp !== otp) return res.status(400).json({ success: false, error: 'Invalid OTP.' });

        otpStore.set(`register_${email}`, { ...stored, verified: true });

        console.log(`✅ Registration OTP verified for: ${email}`);

        res.json({
            success: true,
            verified: true,
            domainType: stored.domainType,
            message: 'Email verified successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

//  
// EXPORT ALL FUNCTIONS
//  
module.exports = {
    // Forgot Password (Existing)
    sendOTP,
    verifyOTP,
    resetPassword,
    resendOTP,
    // Registration (New)
    sendRegistrationOTP,
    verifyRegistrationOTP
};