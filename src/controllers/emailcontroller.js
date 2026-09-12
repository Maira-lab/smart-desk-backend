// src/controllers/emailController.js
//  UPDATED: FormData Support + Better Attachment Handling + Audit Logging

const db = require('../config/db');
const emailService = require('../services/emailService');
const path = require('path');
const fs = require('fs');

class EmailController {
    //  
    // SEND EMAIL - For All Roles (Admin, Teacher, Coordinator)
    //  FIXED: Supports both JSON & FormData (with file uploads)
    //  
    async sendEmail(req, res) {
        try {
            const userId = req.user?.user_id;
            const userRole = req.user?.user_role;
            const userName = req.user?.full_name || 'User';

            //  Get data from either req.body (JSON) or FormData
            const { 
                to, 
                subject, 
                message, 
                recipientName 
            } = req.body;

            //  Validation
            if (!to || !subject || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'Please provide to, subject and message'
                });
            }

            //  Handle attachments from FormData (req.files) or JSON (req.body.attachments)
            let formattedAttachments = [];
            
            // Case 1: FormData with file uploads (req.files or req.file)
            if (req.file) {
                // Single file
                formattedAttachments.push({
                    filename: req.file.originalname,
                    content: req.file.buffer,
                    contentType: req.file.mimetype
                });
            } else if (req.files && Array.isArray(req.files)) {
                // Multiple files
                formattedAttachments = req.files.map(file => ({
                    filename: file.originalname,
                    content: file.buffer,
                    contentType: file.mimetype
                }));
            } else if (req.files && req.files.attachments) {
                // Multer array field named 'attachments'
                formattedAttachments = req.files.attachments.map(file => ({
                    filename: file.originalname,
                    content: file.buffer,
                    contentType: file.mimetype
                }));
            }
            
            // Case 2: JSON body with attachments array (URLs or base64)
            if (req.body.attachments && Array.isArray(req.body.attachments)) {
                req.body.attachments.forEach(att => {
                    if (att.content && att.filename) {
                        // Already formatted (base64 or buffer)
                        formattedAttachments.push({
                            filename: att.filename,
                            content: att.content,
                            contentType: att.contentType || 'application/octet-stream'
                        });
                    } else if (att.url) {
                        // URL-based attachment (save for future reference)
                        formattedAttachments.push({
                            filename: att.filename || path.basename(att.url),
                            path: att.url,
                            contentType: att.contentType || 'application/octet-stream'
                        });
                    }
                });
            }

            console.log(`📧 Sending email to ${to} with ${formattedAttachments.length} attachment(s)`);

            //  Send email using emailService
            const result = await emailService.sendAnnouncementEmail({
                to,
                subject,
                message,
                senderName: `${userName} (${userRole})`,
                attachments: formattedAttachments
            });

            //  Log to audit with attachment info
            const attachmentInfo = formattedAttachments.length > 0 
                ? ` with ${formattedAttachments.length} attachment(s): ${formattedAttachments.map(a => a.filename).join(', ')}`
                : '';

            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'EMAIL_SENT', ?, ?, ?)
            `, [
                userId, 
                `Email sent to ${to}: ${subject}${attachmentInfo}`,
                result.success ? 'Success' : 'Failed',
                req.ip || req.connection?.remoteAddress || 'unknown'
            ]);

            //  Cleanup: Save uploaded files to disk for reference (optional)
            if (formattedAttachments.length > 0 && (req.file || req.files)) {
                try {
                    const uploadDir = path.join(__dirname, '../uploads/emails');
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }

                    const filesToSave = req.file ? [req.file] : 
                                       Array.isArray(req.files) ? req.files : 
                                       req.files.attachments || [];
                    
                    filesToSave.forEach(file => {
                        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                        const fileName = uniqueSuffix + '-' + file.originalname;
                        const filePath = path.join(uploadDir, fileName);
                        fs.writeFileSync(filePath, file.buffer);
                    });
                } catch (saveError) {
                    console.warn('⚠️ Could not save email attachments to disk:', saveError.message);
                }
            }

            res.json({
                success: true,
                message: `Email sent to ${to} successfully!`,
                attachmentsCount: formattedAttachments.length,
                result
            });

        } catch (error) {
            console.error('❌ Send email error:', error);
            
            // Log failure to audit
            try {
                await db.query(`
                    INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                    VALUES (?, 'EMAIL_SENT_FAILED', ?, 'Failed', ?)
                `, [
                    req.user?.user_id || null,
                    `Failed to send email to ${req.body.to}: ${error.message}`,
                    req.ip || req.connection?.remoteAddress || 'unknown'
                ]);
            } catch (auditError) {
                console.error('Audit log error:', auditError.message);
            }

            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // SEND WELCOME EMAIL
    //  
    async sendWelcomeEmail(req, res) {
        try {
            const { to, name, role } = req.body;

            if (!to || !name) {
                return res.status(400).json({
                    success: false,
                    error: 'Please provide to and name'
                });
            }

            const result = await emailService.sendWelcomeEmail({
                to,
                name,
                role: role || 'User'
            });

            //  Audit log
            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'WELCOME_EMAIL_SENT', ?, ?, ?)
            `, [
                req.user?.user_id || null,
                `Welcome email sent to ${to} (${name}) as ${role || 'User'}`,
                result.success ? 'Success' : 'Failed',
                req.ip || req.connection?.remoteAddress || 'unknown'
            ]);

            res.json({
                success: true,
                message: `Welcome email sent to ${to}`,
                result
            });

        } catch (error) {
            console.error('Send welcome email error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // SEND OTP EMAIL
    //  
    async sendOTPEmail(req, res) {
        try {
            const { to, otp } = req.body;

            if (!to || !otp) {
                return res.status(400).json({
                    success: false,
                    error: 'Please provide to and otp'
                });
            }

            const result = await emailService.sendOTPEmail({ to, otp });

            //  Audit log (don't log OTP value for security)
            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'OTP_SENT', ?, ?, ?)
            `, [
                req.user?.user_id || null,
                `OTP sent to ${to}`,
                result.success ? 'Success' : 'Failed',
                req.ip || req.connection?.remoteAddress || 'unknown'
            ]);

            res.json({
                success: true,
                message: `OTP sent to ${to}`,
                result
            });

        } catch (error) {
            console.error('Send OTP email error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // SEND APPROVAL EMAIL
    //  
    async sendApprovalEmail(req, res) {
        try {
            const { to, name, status, reason } = req.body;

            if (!to || !name || !status) {
                return res.status(400).json({
                    success: false,
                    error: 'Please provide to, name and status'
                });
            }

            const result = await emailService.sendApprovalEmail({
                to,
                name,
                status,
                reason
            });

            //  Audit log
            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'APPROVAL_EMAIL_SENT', ?, ?, ?)
            `, [
                req.user?.user_id || null,
                `Approval email (${status}) sent to ${to} (${name})${reason ? ': ' + reason : ''}`,
                result.success ? 'Success' : 'Failed',
                req.ip || req.connection?.remoteAddress || 'unknown'
            ]);

            res.json({
                success: true,
                message: `Approval email sent to ${to}`,
                result
            });

        } catch (error) {
            console.error('Send approval email error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }
}

module.exports = new EmailController();