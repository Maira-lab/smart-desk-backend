// src/controllers/studentNotificationController.js
//    FIXED: Targeted notification delivery + ATTACHMENT URL SUPPORT + REPLY FILE UPLOAD

const db = require('../config/db');
const path = require('path'); //  ADDED
const fs = require('fs');     //  ADDED
const pushService = require('../services/pushService'); //  NEW

class StudentNotificationController {
    constructor() {
        this.db = db;
        this.pushService = pushService;
    }

    //  
    // 1. GET ALL NOTIFICATIONS FOR STUDENT -  FIXED: Targeted + Attachment
    //  
    async getNotifications(req, res) {
        try {
            const studentId = req.user?.user_id;
            const { filter = 'all' } = req.query;

            if (!studentId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            let query = `
                SELECT 
                    n.notification_id AS id,
                    u.full_name AS sender,
                    u.email AS senderEmail,
                    u.user_role AS senderRole,
                    n.title AS subject,
                    n.message,
                    n.attachment_url AS attachmentUrl,
                    DATE_FORMAT(n.created_at, '%b %d, %Y') AS date,
                    n.notification_type AS type,
                    n.is_read AS isRead,
                    n.is_pushed AS hasPush,
                    n.created_at AS timestamp,
                    CASE 
                        WHEN n.notification_type = 'Assignment' THEN DATE_FORMAT(DATE_ADD(n.created_at, INTERVAL 7 DAY), '%b %d, %Y')
                        ELSE NULL
                    END AS deadline
                FROM notifications n
                JOIN users u ON n.sender_id = u.user_id
                WHERE (n.receiver_id = ? OR (n.receiver_id IS NULL AND (n.receiver_role = 'All' OR n.receiver_role = 'Student')))
                AND n.sender_role IN ('Admin', 'Coordinator', 'Teacher')
            `;

            const params = [studentId];

            if (filter === 'coordinator') {
                query += ` AND n.sender_role = 'Coordinator'`;
            } else if (filter === 'teacher') {
                query += ` AND n.sender_role = 'Teacher'`;
            } else if (filter === 'admin') {
                query += ` AND n.sender_role = 'Admin'`;
            }

            query += ` ORDER BY n.created_at DESC LIMIT 50`;

            const results = await db.query(query, params);

            const notifications = results.map(n => ({
                id: n.id?.toString(),
                sender: n.sender || 'Unknown',
                senderEmail: n.senderEmail || 'N/A',
                senderRole: n.senderRole?.toLowerCase() || 'teacher',
                subject: n.subject || 'No Subject',
                message: n.message || 'No message',
                attachmentUrl: n.attachmentUrl || null,
                hasAttachment: !!n.attachmentUrl,
                date: n.date || new Date().toLocaleDateString(),
                type: n.type?.toLowerCase() || 'announcement',
                read: n.isRead === 1,
                isRead: n.isRead === 1,
                deadline: n.deadline || undefined,
                timestamp: n.timestamp
            }));

            const unreadQuery = `
                SELECT COUNT(*) AS unread
                FROM notifications
                WHERE (receiver_id = ? OR (receiver_id IS NULL AND (receiver_role = 'All' OR receiver_role = 'Student')))
                AND is_read = FALSE
                AND sender_role IN ('Admin', 'Coordinator', 'Teacher')
            `;
            const unreadResult = await db.query(unreadQuery, [studentId]);

            res.json({
                success: true,
                notifications: notifications,
                count: notifications.length,
                unreadCount: unreadResult[0]?.unread || 0
            });

        } catch (error) {
            console.error('Get notifications error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 2. GET NOTIFICATION DETAILS - ✅ FIXED: Targeted + Attachment
    //  
    async getNotificationDetails(req, res) {
        try {
            const { notification_id } = req.params;
            const studentId = req.user?.user_id;

            if (!notification_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Notification ID is required'
                });
            }

            const query = `
                SELECT 
                    n.notification_id AS id,
                    u.full_name AS sender,
                    u.email AS senderEmail,
                    u.user_role AS senderRole,
                    n.title AS subject,
                    n.message,
                    n.attachment_url AS attachmentUrl,
                    DATE_FORMAT(n.created_at, '%b %d, %Y') AS date,
                    n.notification_type AS type,
                    n.is_read AS isRead,
                    n.is_pushed AS hasPush,
                    n.created_at AS timestamp,
                    CASE 
                        WHEN n.notification_type = 'Assignment' THEN DATE_FORMAT(DATE_ADD(n.created_at, INTERVAL 7 DAY), '%b %d, %Y')
                        ELSE NULL
                    END AS deadline
                FROM notifications n
                JOIN users u ON n.sender_id = u.user_id
                WHERE n.notification_id = ? 
                AND (n.receiver_id = ? OR (n.receiver_id IS NULL AND (n.receiver_role = 'All' OR n.receiver_role = 'Student')))
            `;

            const results = await db.query(query, [notification_id, studentId]);

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Notification not found'
                });
            }

            const n = results[0];
            const notification = {
                id: n.id?.toString(),
                sender: n.sender || 'Unknown',
                senderEmail: n.senderEmail || 'N/A',
                senderRole: n.senderRole?.toLowerCase() || 'teacher',
                subject: n.subject || 'No Subject',
                message: n.message || 'No message',
                attachmentUrl: n.attachmentUrl || null,
                hasAttachment: !!n.attachmentUrl,
                date: n.date || new Date().toLocaleDateString(),
                type: n.type?.toLowerCase() || 'announcement',
                read: n.isRead === 1,
                isRead: n.isRead === 1,
                deadline: n.deadline || undefined,
                timestamp: n.timestamp
            };

            if (!notification.read) {
                await db.query(
                    'UPDATE notifications SET is_read = TRUE WHERE notification_id = ?',
                    [notification_id]
                );
                notification.read = true;
                notification.isRead = true;
            }

            res.json({
                success: true,
                notification: notification
            });

        } catch (error) {
            console.error('Get notification details error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 3. SEND REPLY TO NOTIFICATION - ✅ WITH FILE ATTACHMENT SUPPORT (PDF, Image, Video)
    //  
    async sendReply(req, res) {
        try {
            const { notification_id, reply_message, sendPush = 'true' } = req.body;
            const studentId = req.user?.user_id;
            const studentName = req.user?.full_name || 'Student';
            const replyFile = req.file;//      Multer se file aayegi

           //      Message YA file — dono mein se kuch toh hona chahiye
            if (!notification_id || ((!reply_message || !reply_message.trim()) && !replyFile)) {
                return res.status(400).json({
                    success: false,
                    error: 'Notification ID and reply message (or file) are required'
                });
            }

            const notifQuery = `
                SELECT n.sender_id, n.sender_role, n.title, n.receiver_role
                FROM notifications n
                WHERE n.notification_id = ?
            `;
            const notifResult = await db.query(notifQuery, [notification_id]);

            if (notifResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Notification not found'
                });
            }

            const original = notifResult[0];

           //      FILE SAVE KARO (uploads/replies folder mein)
            let savedFileUrl = null;
            if (replyFile) {
                try {
                    const uploadDir = path.join(__dirname, '../uploads/replies');
                    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

                    const safeName = Date.now() + '-' + String(replyFile.originalname).replace(/[^a-zA-Z0-9.\-]/g, '_');
                    fs.writeFileSync(path.join(uploadDir, safeName), replyFile.buffer);
                    savedFileUrl = `${req.protocol}://${req.get('host')}/uploads/replies/${safeName}`;
                } catch (fileErr) {
                    console.error('⚠️ Reply file save error:', fileErr.message);
                }
            }

           //      INSERT with attachment_url column
            const insertQuery = `
                INSERT INTO notifications (
                    sender_id, sender_role, receiver_id, receiver_role,
                    notification_type, title, message, attachment_url, is_read, is_pushed
                ) VALUES (?, 'Student', ?, ?, 'Response', ?, ?, ?, FALSE, FALSE)
            `;

            const replyTitle = `Re: ${original.title || 'Notification Reply'}`;
            const replyMessage = `Reply from ${studentName}:\n\n${reply_message ? reply_message.trim() : '📎 Attachment sent'}`;

            const result = await db.query(insertQuery, [
                studentId,
                original.sender_id,
                original.sender_role,
                replyTitle,
                replyMessage,
                savedFileUrl
            ]);

            // ✅ PUSH NOTIFICATION TO ORIGINAL SENDER (Teacher/Admin/Coordinator)
            try {
                const senderToken = await db.query(
                    'SELECT push_token, full_name FROM users WHERE user_id = ?',
                    [original.sender_id]
                );
                if (senderToken.length > 0 && senderToken[0].push_token) {
                    const pushResult = await pushService.sendAnnouncementPush({
                        pushToken: senderToken[0].push_token,
                        title: `💬 Reply from ${studentName}`,
                        message: reply_message 
                            ? reply_message.trim().substring(0, 100) 
                            : '📎 Attachment sent',
                        announcementId: result.insertId
                    });
                    if (pushResult && pushResult.success) {
                        await db.query(
                            'UPDATE notifications SET is_pushed = TRUE WHERE notification_id = ?',
                            [result.insertId]
                        );
                        console.log(`📱✅ Reply push sent to ${senderToken[0].full_name}`);
                    }
                } else {
                    console.log(`📱⚠️ No push token for ${original.sender_role} ${original.sender_id}`);
                }
            } catch (pushErr) {
                console.error('⚠️ Reply push error:', pushErr.message);
            }

            res.json({
                success: true,
                message: 'Reply sent successfully!',
                reply_id: result.insertId,
                hasAttachment: !!savedFileUrl,
                attachmentUrl: savedFileUrl
            });

        } catch (error) {
            console.error('Send reply error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 4. MARK NOTIFICATION AS READ - ✅ FIXED
    //  
    async markAsRead(req, res) {
        try {
            const { notification_id } = req.params;
            const studentId = req.user?.user_id;

            if (!notification_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Notification ID is required'
                });
            }

            const result = await db.query(
                'UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND receiver_id = ?',
                [notification_id, studentId]
            );

            if (result.affectedRows === 0) {
                await db.query(
                    `UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND receiver_id IS NULL AND (receiver_role = 'All' OR receiver_role = 'Student')`,
                    [notification_id]
                );
            }

            res.json({
                success: true,
                message: 'Notification marked as read'
            });

        } catch (error) {
            console.error('Mark as read error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 5. MARK ALL NOTIFICATIONS AS READ - ✅ FIXED
    //  
    async markAllAsRead(req, res) {
        try {
            const studentId = req.user?.user_id;

            await db.query(
                `UPDATE notifications SET is_read = TRUE WHERE (receiver_id = ? OR (receiver_id IS NULL AND (receiver_role = 'All' OR receiver_role = 'Student'))) AND is_read = FALSE`,
                [studentId]
            );

            res.json({
                success: true,
                message: 'All notifications marked as read'
            });

        } catch (error) {
            console.error('Mark all as read error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 6. GET UNREAD COUNT - ✅ FIXED: Targeted
    //  
    async getUnreadCount(req, res) {
        try {
            const studentId = req.user?.user_id;

            const query = `
                SELECT COUNT(*) AS unread
                FROM notifications
                WHERE (receiver_id = ? OR (receiver_id IS NULL AND (receiver_role = 'All' OR receiver_role = 'Student')))
                AND is_read = FALSE
                AND sender_role IN ('Admin', 'Coordinator', 'Teacher')
            `;

            const results = await db.query(query, [studentId]);

            res.json({
                success: true,
                unread: results[0]?.unread || 0
            });

        } catch (error) {
            console.error('Get unread count error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 7. SUBMIT ASSIGNMENT - ✅ WITH FILE UPLOAD SUPPORT
    //  
    async submitAssignment(req, res) {
        try {
            const { notification_id, notes, sendPush = 'true' } = req.body;
            const studentId = req.user?.user_id;
            const studentName = req.user?.full_name || 'Student';
            const assignmentFile = req.file;//      File from multer

            if (!notification_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Notification ID is required'
                });
            }

            const notifQuery = `
                SELECT n.sender_id, n.sender_role, n.title
                FROM notifications n
                WHERE n.notification_id = ? 
                AND n.notification_type = 'Assignment'
            `;
            const notifResult = await db.query(notifQuery, [notification_id]);

            if (notifResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Assignment not found'
                });
            }

            const assignment = notifResult[0];

           //      Save file if uploaded
            let savedFileUrl = null;
            if (assignmentFile) {
                try {
                    const uploadDir = path.join(__dirname, '../uploads/assignments');
                    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

                    const safeName = Date.now() + '-' + String(assignmentFile.originalname).replace(/[^a-zA-Z0-9.\-]/g, '_');
                    fs.writeFileSync(path.join(uploadDir, safeName), assignmentFile.buffer);
                    savedFileUrl = `${req.protocol}://${req.get('host')}/uploads/assignments/${safeName}`;
                } catch (fileErr) {
                    console.error('⚠️ File save error:', fileErr.message);
                }
            }

            const insertQuery = `
                INSERT INTO notifications (
                    sender_id, sender_role, receiver_id, receiver_role,
                    notification_type, title, message, attachment_url, is_read, is_pushed
                ) VALUES (?, 'Student', ?, 'Teacher', 'Submission', ?, ?, ?, FALSE, FALSE)
            `;

            const submissionTitle = `📝 Assignment Submitted: ${assignment.title}`;
            const submissionMessage = `Student: ${studentName}\n\nAssignment: ${assignment.title}\n\n${notes ? `Notes: ${notes}` : 'No additional notes.'}${savedFileUrl ? '\n\n📎 File attached' : ''}`;

            const subResult = await db.query(insertQuery, [
                studentId,
                assignment.sender_id,
                submissionTitle,
                submissionMessage,
                savedFileUrl
            ]);

            // ✅ PUSH NOTIFICATION TO TEACHER (Assignment creator)
            try {
                const teacherToken = await db.query(
                    'SELECT push_token, full_name FROM users WHERE user_id = ?',
                    [assignment.sender_id]
                );
                if (teacherToken.length > 0 && teacherToken[0].push_token) {
                    const pushResult = await pushService.sendAnnouncementPush({
                        pushToken: teacherToken[0].push_token,
                        title: `📝 Assignment Submitted: ${studentName}`,
                        message: `Assignment: ${assignment.title}${savedFileUrl ? ' (📎 File attached)' : ''}`,
                        announcementId: subResult.insertId
                    });
                    if (pushResult && pushResult.success) {
                        await db.query(
                            'UPDATE notifications SET is_pushed = TRUE WHERE notification_id = ?',
                            [subResult.insertId]
                        );
                        console.log(`📱✅ Assignment submit push sent to ${teacherToken[0].full_name}`);
                    }
                } else {
                    console.log(`📱⚠️ No push token for teacher ${assignment.sender_id}`);
                }
            } catch (pushErr) {
                console.error('⚠️ Assignment push error:', pushErr.message);
            }

            res.json({
                success: true,
                message: 'Assignment submitted successfully!',
                hasAttachment: !!savedFileUrl,
                attachmentUrl: savedFileUrl
            });

        } catch (error) {
            console.error('Submit assignment error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }
}

module.exports = new StudentNotificationController();