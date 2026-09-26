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

// Domain Validation Helper
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

// Professional Anti-Spam OTP Email Builder (Multipart Text + Semantic HTML + Delivery Headers)
function buildOTPEmailPayload({ to, otp, purpose, recipientName, expiryMinutes = 5 }) {
    const isTestingMode = process.env.EMAIL_TESTING_MODE === 'true' || process.env.EMAIL_TESTING_MODE === '1';
    const recipientEmail = isTestingMode ? process.env.SMTP_USER : to;
    const nameGreeting = recipientName ? ` ${recipientName}` : '';

    const subject = `${otp} is your Smart Desk verification code`;

    const text = `Smart Desk Academic Management Portal\n`
        + `=======================================\n\n`
        + `Hello${nameGreeting},\n\n`
        + `Your verification code for ${purpose} is:\n\n`
        + `    ${otp}\n\n`
        + `This code will expire in ${expiryMinutes} minutes.\n\n`
        + `For security reasons, please do not share this code with anyone.\n`
        + `If you did not request this verification code, please ignore this email.\n\n`
        + `Best regards,\n`
        + `Smart Desk Academic Administration\n`
        + `Portal: https://smartdeskpk.work`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${otp} - Smart Desk Verification Code</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:40px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                    <!-- Brand Banner -->
                    <tr>
                        <td style="background-color:#0f172a;padding:26px 32px;border-bottom:3px solid #4f46e5;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td>
                                        <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Smart Desk</div>
                                        <div style="font-size:12px;color:#94a3b8;margin-top:2px;">Academic Management Portal</div>
                                    </td>
                                    <td align="right">
                                        <span style="font-size:11px;font-weight:600;color:#a5b4fc;background-color:#1e1b4b;padding:4px 10px;border-radius:20px;border:1px solid #3730a3;">Security Verification</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding:32px 32px 24px 32px;">
                            <div style="font-size:16px;font-weight:600;color:#0f172a;margin-bottom:12px;">Hello${nameGreeting},</div>
                            <p style="font-size:14px;line-height:22px;color:#475569;margin:0 0 20px 0;">
                                A request was made to verify your email address (<strong>${to}</strong>) for <strong>${purpose}</strong>. Please enter the verification code below to complete the verification:
                            </p>

                            <!-- Modern Verification Code Box -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
                                <tr>
                                    <td align="center" style="background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:24px 16px;">
                                        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">Single-Use Security Code</div>
                                        <div style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:800;letter-spacing:12px;color:#1e40af;margin:0;padding-left:12px;">${otp}</div>
                                        <div style="font-size:12px;font-weight:500;color:#dc2626;margin-top:10px;">Valid for ${expiryMinutes} minutes</div>
                                    </td>
                                </tr>
                            </table>

                            <p style="font-size:13px;line-height:20px;color:#64748b;margin:0 0 16px 0;">
                                <strong>Security Notice:</strong> Smart Desk administration and faculty will never request your verification code or password. If you did not initiate this request, you can safely disregard this email.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
                            <div style="font-size:12px;color:#64748b;margin-bottom:4px;">
                                Smart Desk Academic Portal • <a href="https://smartdeskpk.work" style="color:#4f46e5;text-decoration:none;font-weight:500;">smartdeskpk.work</a>
                            </div>
                            <div style="font-size:11px;color:#94a3b8;">
                                Automated transactional notification. Please do not reply directly to this address.
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    return {
        from: process.env.SMTP_FROM || `"Smart Desk" <${process.env.SMTP_USER}>`,
        replyTo: `"Smart Desk Support" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject,
        text,
        html,
        headers: {
            'X-Priority': '1',
            'X-MSMail-Priority': 'High',
            'Importance': 'High',
            'X-Mailer': 'SmartDesk Academic Portal Verification System',
            'Auto-Submitted': 'auto-generated',
            'X-Auto-Response-Suppress': 'All',
            'Precedence': 'bulk'
        }
    };
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

        const mailPayload = buildOTPEmailPayload({
            to: email,
            otp,
            purpose: 'Password Reset',
            recipientName: user.full_name || 'User',
            expiryMinutes: 5
        });

        await transporter.sendMail(mailPayload);

        console.log(`📧 Forgot Password OTP for ${email}: ${otp} (sent to ${mailPayload.to})`);

        res.json({
            success: true,
            message: `OTP sent to ${mailPayload.to}`,
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

        const mailPayload = buildOTPEmailPayload({
            to: email,
            otp,
            purpose: 'Password Reset',
            recipientName: user.full_name || 'User',
            expiryMinutes: 5
        });

        await transporter.sendMail(mailPayload);

        console.log(`📧 Resend OTP for ${email}: ${otp} (sent to ${mailPayload.to})`);
        res.json({ success: true, message: `New OTP sent to ${mailPayload.to}`, debugOTP: otp });
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

        const mailPayload = buildOTPEmailPayload({
            to: email,
            otp,
            purpose: 'New Account Registration',
            recipientName: '',
            expiryMinutes: 5
        });

        await transporter.sendMail(mailPayload);

        console.log('\n' + '='.repeat(60));
        console.log('🎓 REGISTRATION OTP SENT');
        console.log('='.repeat(60));
        console.log(`📧 Email:        ${email}`);
        console.log(`🌐 Domain Type:  ${domainCheck.type} (${domainCheck.message})`);
        console.log(`🔑 OTP:          ${otp}`);
        console.log(`📨 Sent To:      ${mailPayload.to}`);
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