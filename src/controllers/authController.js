// src/controllers/authController.js
//  UPDATED WITH RESTRICTED LOGIN + ROLE DETECTION + OTP/DOMAIN + ID CARD & PROFILE PHOTO (Step 4)

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

// Database connection pool
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
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

//  "Saare functions ko ek class mein organize karta hai." 
// AUTH CONTROLLER CLASS
//  
class AuthController {
    constructor() {
        this.db = db;
        this.bcrypt = bcrypt;
        this.jwt = jwt;
        
        this.login = this.login.bind(this);
        this.register = this.register.bind(this);
        // Function ko class se attach karna
        this.checkStatus = this.checkStatus.bind(this);
        this.logout = this.logout.bind(this);
        this.forgotPassword = this.forgotPassword.bind(this);
        this.verifyResetCode = this.verifyResetCode.bind(this);
        this.resetPassword = this.resetPassword.bind(this);
        this.detectRole = this.detectRole.bind(this);
        this.updatePushToken = this.updatePushToken.bind(this);
    }

    // Database query karne ka shortcut function
    async query(sql, params = []) {
        try {
            const [rows] = await this.db.execute(sql, params);
            return rows;
        } catch (error) {
            throw error;
        }
    }

    //  
    // 1. LOGIN CONTROLLER -  RESTRICTED CHECK ADDED
    //  
    async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Please enter email and password'
                });
            }

            const results = await this.query('SELECT * FROM users WHERE email = ?', [email]);

            if (results.length === 0) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid email or password'
                });
            }

            const user = results[0];

            if (user.status === 'Pending') {
                return res.status(403).json({
                    success: false,
                    error: 'Your account is pending approval. Please wait for admin approval.'
                });
            }

            if (user.status === 'Inactive') {
                return res.status(403).json({
                    success: false,
                    error: 'Your account has been revoked. Please contact admin.'
                });
            }

            if (user.is_restricted === 1 || user.is_restricted === true || user.is_restricted === '1') {
                return res.status(403).json({
                    success: false,
                    error: '🔒 Your account has been restricted by admin. Please contact administrator for assistance.'
                });
            }

            const isMatch = await bcrypt.compare(password, user.password);

            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid email or password'
                });
            }

            await this.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [user.user_id]);

            const token = jwt.sign(
                {
                    user_id: user.user_id,
                    email: user.email,
                    role: user.user_role
                },
                process.env.JWT_SECRET || 'smart_desk_secret_key_2026',
                { expiresIn: '7d' }
            );

            const userData = {
                user_id: user.user_id,
                email: user.email,
                full_name: user.full_name,
                role: user.user_role,
                status: user.status,
                is_restricted: user.is_restricted,
                institute_name: user.institute_name,
                department_name: user.department_name,
                class_name: user.class_name,
                semester: user.semester,
                roll_no: user.roll_no,
                section: user.section
            };

            res.json({
                success: true,
                message: 'Login successful!',
                token,
                user: userData
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 2. DETECT ROLE FROM EMAIL (Real-time)
    //  
    async detectRole(req, res) {
        try {
            const { email } = req.body;

            if (!email || !email.trim()) {
                return res.json({
                    success: true,
                    exists: false,
                    role: 'student'
                });
            }

            const results = await this.query(
                'SELECT user_id, user_role, status, is_restricted FROM users WHERE email = ? LIMIT 1',
                [email.trim()]
            );

            if (results.length === 0) {
                return res.json({
                    success: true,
                    exists: false,
                    role: 'student'
                });
            }

            const user = results[0];
            const role = user.user_role.toLowerCase();

            console.log(`🔍 Role detected for ${email}: ${role} | Status: ${user.status}`);

            res.json({
                success: true,
                exists: true,
                role: role,
                status: user.status,
                isRestricted: user.is_restricted === 1 || user.is_restricted === true,
                userId: user.user_id
            });

        } catch (error) {
            console.error('❌ Detect role error:', error);
            res.json({
                success: true,
                exists: false,
                role: 'student'
            });
        }
    }

    // 3. REGISTER CONTROLLER -  STEP 4: ID CARD + PROFILE PHOTO ADDED
    // 3. REGISTER CONTROLLER - STEP 4: ID CARD + PROFILE PHOTO + VALIDATION
    async register(req, res) {
        try {
            const {
                email,
                password,
                full_name,
                user_role,
                institute_name,
                department_name,
                class_name,
                semester,
                roll_no,
                section,
                email_verified,
                email_domain_type
            } = req.body;

            //  Basic validation
            if (!email || !password || !full_name || !user_role) {
                return res.status(400).json({
                    success: false,
                    error: 'Please fill all required fields'
                });
            }

            //  PASSWORD VALIDATION: Minimum 8 characters (Letters, Digits, Special Characters allowed)
            if (!password || password.trim().length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 8 characters long (letters, numbers & special characters allowed)'
                });
            }

            //  ID CARD VALIDATION: Required for both Teacher and Student
            if (!req.files?.idCard || req.files.idCard.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'ID Card / Admission Letter is required for registration'
                });
            }

            //  Layer 2: Duplicate Email Check
            const checkEmail = await this.query('SELECT * FROM users WHERE email = ?', [email]);

            if (checkEmail.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Email already exists. Please login.'
                });
            }

           //      Hash the original password (special characters ke sath)
            const hashedPassword = await bcrypt.hash(password.trim(), 10);

            // ⭐ STEP 4: Dono uploaded files ke paths nikalo (Multer se)
            const id_card_path = req.files?.idCard ? `idcards/${req.files.idCard[0].filename}` : null;
            const profile_photo_path = req.files?.profilePhoto ? `idcards/${req.files.profilePhoto[0].filename}` : null;

            //  OTP Verified + Domain Type
            const isEmailVerified = email_verified ? 1 : 0;
            const domainType = email_domain_type || 'public';

            //  Trim all text fields
            const trimmedFullName = full_name.trim();
            const trimmedInstituteName = institute_name ? institute_name.trim() : null;
            const trimmedDepartmentName = department_name ? department_name.trim() : null;
            const trimmedClassName = class_name ? class_name.trim() : null;
            const trimmedSemester = semester ? semester.trim() : null;
            const trimmedRollNo = roll_no ? roll_no.trim() : null;
            const trimmedSection = section ? section.trim() : null;

            //  UPDATED INSERT: id_card_path + profile_photo_path columns added
            const insertQuery = `
                INSERT INTO users (
                    email, password, full_name, user_role, status, 
                    institute_name, department_name, class_name, 
                    semester, roll_no, section,
                    email_verified, email_domain_type,
                    id_card_path, profile_photo_path
                ) VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
                email.trim(),
                hashedPassword,
                trimmedFullName,
                user_role,
                trimmedInstituteName,
                trimmedDepartmentName,
                trimmedClassName,
                trimmedSemester,
                trimmedRollNo,
                trimmedSection,
                isEmailVerified,
                domainType,
                id_card_path,
                profile_photo_path
            ];

            const result = await this.query(insertQuery, values);

            console.log(`✅ User registered: ${email} | Verified: ${isEmailVerified} | Domain: ${domainType} | ID Card: ${id_card_path ? 'YES' : 'NO'} | Photo: ${profile_photo_path ? 'YES' : 'NO'}`);

            res.status(201).json({
                success: true,
                message: 'Registration successful! Your email is verified. Waiting for admin approval.',
                user_id: result.insertId
            });

        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 4. CHECK STATUS CONTROLLER
    //  
    async checkStatus(req, res) {
        try {
            const token = req.headers.authorization?.split(' ')[1];

            if (!token) {
                return res.status(401).json({
                    success: false,
                    status: 'unauthorized',
                    error: 'No token provided'
                });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'smart_desk_secret_key_2026');
            const results = await this.query('SELECT * FROM users WHERE user_id = ?', [decoded.user_id]);

            if (results.length === 0) {
                return res.status(401).json({
                    success: false,
                    status: 'unauthorized',
                    error: 'User not found'
                });
            }

            const user = results[0];

            res.json({
                success: true,
                status: user.status,
                is_restricted: user.is_restricted,
                user: {
                    user_id: user.user_id,
                    email: user.email,
                    full_name: user.full_name,
                    role: user.user_role,
                    status: user.status,
                    is_restricted: user.is_restricted
                }
            });

        } catch (error) {
            console.error('Status check error:', error);
            res.status(401).json({
                success: false,
                status: 'unauthorized',
                error: 'Invalid token'
            });
        }
    }

    //  
    // 5. LOGOUT CONTROLLER
    //  
    async logout(req, res) {
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    }

    //  
    // 6. FORGOT PASSWORD - SMART MODE
    //  
    async forgotPassword(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    error: 'Please enter your email address'
                });
            }

            const results = await this.query('SELECT * FROM users WHERE email = ?', [email]);
            
            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Email not found in our system'
                });
            }

            const user = results[0];

            const verificationCode = crypto.randomInt(100000, 999999).toString();
            const expiryTime = new Date(Date.now() + 10 * 60 * 1000);
            await this.query(
                'UPDATE users SET reset_code = ?, reset_code_expiry = ? WHERE user_id = ?',
                [verificationCode, expiryTime, user.user_id]
            );

            const recipientEmail = process.env.SMTP_USER;

            await transporter.sendMail({
                from: process.env.SMTP_FROM || `"Smart Desk" <${process.env.SMTP_USER}>`,
                to: recipientEmail,
                subject: `🔐 Password Reset Code for ${user.full_name || 'User'}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="background: linear-gradient(135deg, #3B82F6, #1D4ED8); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                            <h1 style="color: white; margin: 0;">Smart Desk</h1>
                            <p style="color: #DBEAFE; margin: 5px 0 0 0;">Password Reset Request</p>
                        </div>
                        
                        <div style="background: #F9FAFB; padding: 30px; border-radius: 0 0 10px 10px;">
                            <p style="color: #1F2937;">Hello <strong>${user.full_name || 'User'}</strong>,</p>
                            <p style="color: #4B5563;">A password reset was requested for the account: <strong>${email}</strong></p>
                            <p style="color: #4B5563;">Use the following verification code:</p>
                            
                            <div style="background: white; padding: 25px; text-align: center; margin: 25px 0; border-radius: 10px; border: 2px dashed #3B82F6;">
                                <h1 style="color: #1E40AF; letter-spacing: 10px; margin: 0; font-size: 36px;">${verificationCode}</h1>
                            </div>
                            
                            <p style="color: #EF4444; font-weight: bold;">⏰ This code will expire in 10 minutes.</p>
                            <p style="color: #6B7280; font-size: 13px; margin-top: 20px;">If you didn't request this, please ignore this email.</p>
                        </div>
                    </div>
                `
            });

            console.log('\n' + '='.repeat(60));
            console.log('📧 FORGOT PASSWORD - CODE SENT SUCCESSFULLY');
            console.log('='.repeat(60));
            console.log(`👤 Account Email:    ${email}`);
            console.log(`📨 Code Sent To:     ${recipientEmail}`);
            console.log(`🔑 Verification Code: ${verificationCode}`);
            console.log(`⏰ Expires in:       10 minutes`);
            console.log('='.repeat(60) + '\n');

            res.json({
                success: true,
                message: `Verification code sent to ${recipientEmail}`,
                debugCode: verificationCode
            });

        } catch (error) {
            console.error('❌ Forgot password error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to send verification code. Please try again.'
            });
        }
    }

    //  
    // 7. VERIFY RESET CODE
    //  
    async verifyResetCode(req, res) {
        try {
            const { email, code } = req.body;

            if (!email || !code) {
                return res.status(400).json({
                    success: false,
                    error: 'Please enter email and verification code'
                });
            }

            const results = await this.query(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const user = results[0];

            if (user.reset_code !== code) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid verification code'
                });
            }

            if (new Date() > new Date(user.reset_code_expiry)) {
                return res.status(400).json({
                    success: false,
                    error: 'Verification code has expired. Please request a new one.'
                });
            }

            res.json({
                success: true,
                message: 'Code verified successfully'
            });

        } catch (error) {
            console.error('❌ Verify code error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify code'
            });
        }
    }

    //  NEW: Push Token Save Karein
async updatePushToken(req, res) {
    try {
        const userId = req.user?.user_id;
        const { pushToken } = req.body;

        if (!userId || !pushToken) {
            return res.status(400).json({ success: false, error: 'Missing pushToken' });
        }

        await db.query('UPDATE users SET push_token = ? WHERE user_id = ?', [pushToken, userId]);
        console.log(`✅ Push token saved for user ${userId}`);

        res.json({ success: true, message: 'Push token saved successfully' });
    } catch (error) {
        console.error('Update push token error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}
    //  
    // 8. RESET PASSWORD
    //  
    async resetPassword(req, res) {
        try {
            const { email, code, newPassword } = req.body;

            if (!email || !code || !newPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'Please provide all required fields'
                });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 8 characters (letters, numbers & special characters allowed)'
                });
            }

            const results = await this.query(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const user = results[0];

            if (user.reset_code !== code) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid verification code'
                });
            }

            if (new Date() > new Date(user.reset_code_expiry)) {
                return res.status(400).json({
                    success: false,
                    error: 'Code has expired. Please request a new one.'
                });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);

            await this.query(
                'UPDATE users SET password = ?, reset_code = NULL, reset_code_expiry = NULL WHERE user_id = ?',
                [hashedPassword, user.user_id]
            );

            console.log(`✅ Password reset successful for ${email}`);

            res.json({
                success: true,
                message: 'Password reset successful! You can now login with your new password.'
            });

        } catch (error) {
            console.error('❌ Reset password error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to reset password'
            });
        }
    }
}

module.exports = new AuthController();