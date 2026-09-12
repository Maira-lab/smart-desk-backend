// src/controllers/announcementController.js
//  UPDATED WITH FILE UPLOAD SUPPORT (multer) + TARGETED NOTIFICATIONS + AUDIT LOGGING

const db = require('../config/db');
const emailService = require('../services/emailService');
const pushService = require('../services/pushService');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads/announcements');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

class AnnouncementController {
    constructor() {
        this.db = db;
    }

    //  
    // 1. SEND ANNOUNCEMENT - ✅ FIXED: Targeted + Audit Log + Better Error Handling
    //  
    async sendAnnouncement(req, res) {
        try {
            const { 
                subject, 
                message, 
                target_audience, 
                recipient_mode,
                recipient_ids
            } = req.body;
            
            const senderId = req.user?.user_id;
            const senderName = req.user?.full_name || 'Admin';

            if (!subject || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'Please provide subject and message'
                });
            }

            //  Files ko disk par save karo (multer ne already save ki hai) + URL banao
            let attachments = [];
            if (req.files && req.files.length > 0) {
                attachments = req.files.map(file => ({
                    name: file.originalname,
                    size: file.size,
                    type: file.mimetype,
                    path: path.join(uploadsDir, file.filename),  //  ABSOLUTE PATH
                    filename: file.filename,
                    url: `${req.protocol}://${req.get('host')}/uploads/announcements/${file.filename}`
                }));
                console.log(`📎 ${attachments.length} file(s) uploaded successfully`);
            }

           //      CRITICAL FIX: Nodemailer-format attachments (Buffer se — original bytes)
            const emailAttachments = attachments.map(att => ({
                filename: att.name,
                content: fs.readFileSync(att.path),
                contentType: att.type
            }));
            console.log(`📧 Email attachments ready: ${emailAttachments.length}`);

            // Determine receiver role
            let receiverRole = 'All';
            if (target_audience === 'teachers') receiverRole = 'Teacher';
            else if (target_audience === 'coordinators') receiverRole = 'Coordinator';

            // Get recipients
            let recipients = [];
            let parsedRecipientIds = [];
            
            if (recipient_mode === 'individual') {
                if (typeof recipient_ids === 'string') {
                    try {
                        parsedRecipientIds = JSON.parse(recipient_ids);
                    } catch (e) {
                        parsedRecipientIds = [];
                    }
                } else if (Array.isArray(recipient_ids)) {
                    parsedRecipientIds = recipient_ids;
                }
                
                if (parsedRecipientIds.length > 0) {
                    const placeholders = parsedRecipientIds.map(() => '?').join(',');
                    const userQuery = `SELECT user_id, email, full_name, user_role, push_token FROM users WHERE user_id IN (${placeholders}) AND status = 'Active'`;
                    recipients = await db.query(userQuery, parsedRecipientIds);
                }
            } else {
                const roleCondition = receiverRole !== 'All' ? `AND user_role = '${receiverRole}'` : '';
                const userQuery = `SELECT user_id, email, full_name, user_role, push_token FROM users WHERE status = 'Active' ${roleCondition}`;
                recipients = await db.query(userQuery);
            }

            if (recipients.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No recipients found'
                });
            }

            //  NEW: Pehli attachment ka URL (app mein 📎 button ke liye)
            const firstAttachmentUrl = attachments.length > 0 ? attachments[0].url : null;

            //  AUDIT LOG: Announcement create hone se pehle log karo
            await db.query(
                `INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                 VALUES (?, 'ANNOUNCEMENT_SENT', ?, 'Success', ?)`,
                [
                    senderId,
                    `Sent announcement "${subject}" to ${recipients.length} ${recipient_mode === 'individual' ? 'specific users' : receiverRole + 's'}`,
                    req.ip || req.connection.remoteAddress
                ]
            );

            // 1. Save notifications to database (attachment_url ke saath)
            const notifQuery = `
                INSERT INTO notifications (
                    sender_id, sender_role, receiver_id, receiver_role,
                    notification_type, title, message, attachment_url, is_pushed, is_email_sent
                ) VALUES (?, ?, ?, ?, 'Announcement', ?, ?, ?, FALSE, FALSE)
            `;

            let notifSavedCount = 0;
            for (const recipient of recipients) {
                try {
                    await db.query(notifQuery, [
                        senderId, 'Admin', 
                        recipient.user_id,  //  TARGETED: Specific user ID
                        recipient.user_role || 'All',
                        subject, 
                        message,
                        firstAttachmentUrl
                    ]);
                    notifSavedCount++;
                } catch (notifErr) {
                    console.error('⚠️ Notification save error for user', recipient.user_id, notifErr.message);
                }
            }

            // 2. Save to announcements table with file attachments
            const annQuery = `
                INSERT INTO announcements (
                    sender_id, subject, message, target_audience, 
                    recipient_mode, sent_date, attachments
                ) VALUES (?, ?, ?, ?, ?, NOW(), ?)
            `;
            const annResult = await db.query(annQuery, [
                senderId, subject, message, 
                target_audience || 'all',
                recipient_mode || 'bulk',
                attachments.length > 0 ? JSON.stringify(attachments) : null
            ]);

            // 3. Send EMAIL notifications — ✅ FIXED attachments (Buffer format)
            let emailSent = 0;
            let emailFailed = 0;
            for (const recipient of recipients) {
                if (recipient.email) {
                    try {
                        const result = await emailService.sendAnnouncementEmail({
                            to: recipient.email,
                            subject: subject,
                            message: message,
                            senderName: senderName,
                            attachments: emailAttachments
                        });
                        if (result.success) {
                            emailSent++;
                            //  Update notification record
                            await db.query(
                                `UPDATE notifications SET is_email_sent = TRUE WHERE sender_id = ? AND receiver_id = ? AND title = ? ORDER BY created_at DESC LIMIT 1`,
                                [senderId, recipient.user_id, subject]
                            );
                        } else {
                            emailFailed++;
                        }
                    } catch (emailErr) {
                        emailFailed++;
                        console.error('⚠️ Email error for', recipient.email, emailErr.message);
                    }
                }
            }

            // 4. Send PUSH notifications
            let pushSent = 0;
            let pushFailed = 0;
            for (const recipient of recipients) {
                if (recipient.push_token) {
                    try {
                        const result = await pushService.sendAnnouncementPush({
                            pushToken: recipient.push_token,
                            title: subject,
                            message: message,
                            announcementId: annResult.insertId
                        });
                        if (result.success) {
                            pushSent++;
                            //  Update notification record
                            await db.query(
                                `UPDATE notifications SET is_pushed = TRUE WHERE sender_id = ? AND receiver_id = ? AND title = ? ORDER BY created_at DESC LIMIT 1`,
                                [senderId, recipient.user_id, subject]
                            );
                        } else {
                            pushFailed++;
                        }
                    } catch (pushErr) {
                        pushFailed++;
                        console.error('⚠️ Push error:', pushErr.message);
                    }
                }
            }

            res.json({
                success: true,
                message: 'Announcement sent successfully!',
                announcement_id: annResult.insertId,
                recipients_count: recipients.length,
                notifications_saved: notifSavedCount,
                email_sent: emailSent,
                email_failed: emailFailed,
                push_sent: pushSent,
                push_failed: pushFailed,
                attachments_count: attachments.length,
                attachment_url: firstAttachmentUrl
            });

        } catch (error) {
            console.error('Send announcement error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 2. GET STAFF MEMBERS (No changes needed)
    //  
    async getStaffMembers(req, res) {
        try {
            const { role_filter, search } = req.query;

            let query = `
                SELECT 
                    user_id AS id,
                    full_name AS name,
                    email,
                    user_role AS role,
                    COALESCE(department_name, institute_name, 'Head Office') AS department,
                    push_token
                FROM users
                WHERE user_role IN ('Teacher', 'Coordinator')
                AND status = 'Active'
            `;

            const params = [];

            if (role_filter && role_filter !== 'all') {
                query += ` AND user_role = ?`;
                params.push(role_filter);
            }

            if (search) {
                query += ` AND (full_name LIKE ? OR email LIKE ? OR department_name LIKE ?)`;
                const searchPattern = `%${search}%`;
                params.push(searchPattern, searchPattern, searchPattern);
            }

            query += ` ORDER BY full_name ASC`;

            const results = await db.query(query, params);

            const staff = results.map(s => ({
                id: s.id?.toString() || s.user_id?.toString(),
                name: s.name,
                email: s.email,
                role: s.role,
                department: s.department || 'N/A',
                pushToken: s.push_token
            }));

            res.json({
                success: true,
                staff: staff,
                count: staff.length
            });

        } catch (error) {
            console.error('Get staff error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 3. GET RESPONSES (No changes needed)
    async getResponses(req, res) {
        try {
            const adminId = req.user?.user_id;
            const query = `
                SELECT
                    n.notification_id AS id,
                    u.full_name AS senderName,
                    u.user_role AS senderRole,
                    u.email AS senderEmail,
                    n.title AS subject,
                    n.message AS responseMessage,
                    DATE_FORMAT(n.created_at, '%b %d, %Y %h:%i %p') AS date,
                    n.notification_id AS originalAnnouncementId,
                    n.is_read AS isRead,
                    COALESCE(
                        n.attachment_url,
                        (SELECT nr.attachment_url FROM notification_replies nr
                          WHERE nr.notification_id = n.notification_id
                            AND nr.attachment_url IS NOT NULL
                          ORDER BY nr.reply_id DESC LIMIT 1)
                    ) AS attachmentUrl,
                    n.notification_type AS type
                FROM notifications n
                LEFT JOIN users u ON n.sender_id = u.user_id
                WHERE n.notification_type IN ('Response', 'Reply', 'Submission')
                  AND n.sender_role IN ('Coordinator', 'Teacher', 'Student')
                  AND (n.receiver_id = ? OR n.receiver_role = 'Admin')
                ORDER BY n.created_at DESC
                LIMIT 200
            `;
            const results = await db.query(query, [adminId]);
            const responses = results.map(r => ({
                ...r,
                id: r.id?.toString(),
                read: r.isRead === 1 || r.isRead === true,
                attachmentUrl: r.attachmentUrl || null,
                hasAttachment: !!r.attachmentUrl
            }));
            console.log('✅ getResponses:', responses.length, 'responses,', responses.filter(x => x.hasAttachment).length, 'with attachment');
            res.json({ success: true, responses, count: responses.length });
        } catch (error) {
            console.error('Get responses error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }
    // 4. MARK RESPONSE AS READ (No changes needed)
    //  
    async markResponseRead(req, res) {
        try {
            const { response_id } = req.params;
            const adminId = req.user?.user_id;

            await db.query(
                `UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND receiver_id = ?`,
                [response_id, adminId]
            );

            res.json({
                success: true,
                message: 'Response marked as read'
            });

        } catch (error) {
            console.error('Mark response read error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 5. REGISTER PUSH TOKEN (No changes needed)
    //  
    async registerPushToken(req, res) {
        try {
            const { push_token } = req.body;
            const userId = req.user?.user_id;

            if (!push_token) {
                return res.status(400).json({
                    success: false,
                    error: 'Push token is required'
                });
            }

            await db.query(
                `UPDATE users SET push_token = ? WHERE user_id = ?`,
                [push_token, userId]
            );

            res.json({
                success: true,
                message: 'Push token registered successfully'
            });

        } catch (error) {
            console.error('Register push token error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }
}

module.exports = new AnnouncementController();