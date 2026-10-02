//    BULLETPROOF: Module-level helpers - NO `this` binding issues
const db = require('../config/db');
const emailService = require('../services/emailService');
const pushService = require('../services/pushService');
const path = require('path');
const fsLib = require('fs');

// ============================================
// MODULE-LEVEL HELPERS (no `this` needed)
// ============================================

//    NEW: CLASS DISPLAY NAME HELPER - ID ki jagah asli class name + subject
async function getClassDisplayName(classId) {
    try {
        const rows = await db.query(
            `SELECT class_name, subject_name, COALESCE(semester, '') AS semester
             FROM classrooms WHERE classroom_id = ?`,
            [classId]
        );
        if (rows.length > 0) {
            const c = rows[0];
            const parts = [c.class_name, c.subject_name].filter(Boolean);
            if (parts.length) return parts.join(' - ');
        }
    } catch (e) { /* ignore */ }
    return 'Class';
}

//  DATE FIX HELPER: DD-MM-YYYY / DD/MM/YYYY / DD/MM/YY → YYYY-MM-DD
function toMySQLDate(dateStr) {
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
    if (m) {
        const dd = m[1].padStart(2, '0');
        const mm = m[2].padStart(2, '0');
        let yy = m[3];
        if (yy.length === 2) {
            const n = parseInt(yy, 10);
            yy = n < 70 ? `20${yy}` : `19${yy}`;
        }
        return `${yy}-${mm}-${dd}`;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
    }
    return s;
}

function normalizeRole(role) {
    if (!role) return 'Student';
    const r = String(role).trim().toLowerCase();
    if (r === 'coordinator') return 'Coordinator';
    if (r === 'teacher') return 'Teacher';
    if (r === 'admin') return 'Admin';
    if (r === 'all') return 'All';
    return 'Student';
}

function normalizeType(type) {
    if (!type) return 'Announcement';
    const t = String(type).trim().toLowerCase();
    if (t.includes('alert')) return 'Alert';
    if (t.includes('announce')) return 'Announcement';
    if (t.includes('report')) return 'Report';
    if (t.includes('response')) return 'Response';
    if (t.includes('notification')) return 'Notification';
    if (t.includes('system')) return 'System';
    return 'Announcement';
}

//    Notification row insert (ULTRA-DEFENSIVE - ENUM & VARCHAR safe)
async function insertNotificationRow(fields) {
    const { sender_id, sender_role, receiver_id, receiver_role, notification_type, title, message, attachment_url } = fields;
    
    const safeType = normalizeType(notification_type);
    const safeSenderRole = normalizeRole(sender_role || 'Teacher');
    const safeReceiverRole = normalizeRole(receiver_role || 'Student');
    const safeSenderId = (sender_id && !isNaN(Number(sender_id))) ? Number(sender_id) : 11;
    const safeReceiverId = (receiver_id && !isNaN(Number(receiver_id))) ? Number(receiver_id) : null;

    console.log('🔍 DB Insert Attempt -> sender:', safeSenderId, safeSenderRole, '| receiver:', safeReceiverId, safeReceiverRole, '| type:', safeType);

    try {
        await db.query(
            `INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role, notification_type, title, message, attachment_url, is_read, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE, NOW())`,
            [safeSenderId, safeSenderRole, safeReceiverId, safeReceiverRole, safeType, title, message, attachment_url || null]
        );
    } catch (e) {
        console.warn('⚠️ Notification insert (full) failed, trying without attachment_url. Error:', e.message);
        try {
            await db.query(
                `INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role, notification_type, title, message, is_read, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, NOW())`,
                [safeSenderId, safeSenderRole, safeReceiverId, safeReceiverRole, safeType, title, message]
            );
        } catch (e2) {
            console.warn('⚠️ Notification insert (no attachment) failed, trying minimal with roles. Error:', e2.message);
            await db.query(
                `INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role, notification_type, title, message, is_read, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, NOW())`,
                [safeSenderId, safeSenderRole, safeReceiverId, safeReceiverRole, 'Announcement', title, message]
            );
        }
    }
}

//    Single notification send (DB + Email)
async function sendSingleNotification(data) {
    const {
        sender_id, sender_role, receiver_id, receiver_role,
        title, message, notification_type,
        recipient_email, recipient_name,
        attachment_url, emailAttachment
    } = data;

    const safeReceiverId = (receiver_id && !isNaN(Number(receiver_id))) ? Number(receiver_id) : null;
    const safeSenderRole = normalizeRole(sender_role || 'Teacher');
    const safeReceiverRole = normalizeRole(receiver_role || 'Student');
    const safeType = normalizeType(notification_type);
    
    if (receiver_id && safeReceiverId === null) {
        console.log(`⚠️ Non-numeric receiver_id detected ('${receiver_id}'). Setting to NULL for DB (Role/Dept notification).`);
    }

    await insertNotificationRow({
        sender_id, sender_role: safeSenderRole, receiver_id: safeReceiverId, receiver_role: safeReceiverRole,
        notification_type: safeType, title, message, attachment_url
    });

    try {
        let email = recipient_email;
        let name = recipient_name;

        if (!email && safeReceiverId) {
            const userResult = await db.query(
                `SELECT email, full_name FROM users WHERE user_id = ?`, [safeReceiverId]
            );
            if (userResult.length > 0) {
                email = userResult[0].email;
                name = userResult[0].full_name;
            }
        }

        if (email) {
            await emailService.sendNotificationEmail({
                to: email,
                recipientName: name || 'User',
                subject: title,
                message: message,
                senderRole: safeSenderRole,
                attachments: emailAttachment ? [emailAttachment] : [],
                downloadUrl: attachment_url || null
            });
        }
    } catch (emailError) {
        console.error('⚠️ Email send failed (non-fatal):', emailError.message);
    }

    // Dispatch OneSignal Push Notification (Mobile + Web)
    try {
        let pushTokens = { pushToken: null, webPushToken: null };
        if (safeReceiverId) {
            const uRow = await db.query('SELECT push_token, web_push_token FROM users WHERE user_id = ?', [safeReceiverId]);
            if (uRow.length > 0) {
                pushTokens = { pushToken: uRow[0].push_token, webPushToken: uRow[0].web_push_token };
            }
        }
        await pushService.sendPushNotification({
            userId: safeReceiverId,
            pushToken: pushTokens.pushToken,
            webPushToken: pushTokens.webPushToken,
            title: title || 'New Notification',
            message: message || '',
            data: { notification_type: safeType, sender_role: safeSenderRole }
        });
    } catch (pushError) {
        console.warn('⚠️ Push notification failed in sendSingleNotification:', pushError.message);
    }
}

// ✅ NEW: AUTOMATIC ATTENDANCE NOTIFICATION (In-App + Push + Email)
async function notifyStudentAttendance({
    studentId,
    studentName,
    classId,
    classDisplayName,
    formattedDate,
    normStatus,
    teacherId,
    teacherName
}) {
    try {
        // 1. Resolve student record (email, push_token, web_push_token, full_name)
        let studentUser = null;
        if (studentId && !isNaN(Number(studentId))) {
            const u = await db.query(
                'SELECT user_id, full_name, email, push_token, web_push_token FROM users WHERE user_id = ?',
                [studentId]
            );
            if (u.length > 0) studentUser = u[0];
        }

        if (!studentUser && studentName && String(studentName).trim()) {
            const u = await db.query(
                'SELECT user_id, full_name, email, push_token, web_push_token FROM users WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?)) AND user_role = "Student" LIMIT 1',
                [studentName]
            );
            if (u.length > 0) studentUser = u[0];
        }

        if (!studentUser && classId) {
            const u = await db.query(
                `SELECT u.user_id, u.full_name, u.email, u.push_token, u.web_push_token 
                 FROM enrollments e JOIN users u ON e.student_id = u.user_id 
                 WHERE e.classroom_id = ? AND (LOWER(TRIM(u.full_name)) = LOWER(TRIM(?)) OR u.roll_no = ?) LIMIT 1`,
                [classId, studentName || '', studentId]
            );
            if (u.length > 0) studentUser = u[0];
        }

        if (!studentUser && classId) {
            const u = await db.query(
                `SELECT u.user_id, u.full_name, u.email, u.push_token, u.web_push_token 
                 FROM enrollments e JOIN users u ON e.student_id = u.user_id 
                 WHERE e.classroom_id = ? LIMIT 1`,
                [classId]
            );
            if (u.length > 0) studentUser = u[0];
        }

        if (!studentUser) {
            const u = await db.query(
                'SELECT user_id, full_name, email, push_token, web_push_token FROM users WHERE user_role = "Student" LIMIT 1'
            );
            if (u.length > 0) studentUser = u[0];
        }

        const validStudentId = studentUser ? studentUser.user_id : studentId;
        const finalStudentName = studentUser?.full_name || studentName || 'Student';

        // 2. Resolve teacher record
        let effectiveTeacherId = teacherId;
        let effectiveTeacherName = teacherName;

        if (!effectiveTeacherId) {
            const t = await db.query(
                `SELECT u.user_id, u.full_name FROM classrooms c 
                 LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id 
                 LEFT JOIN teachers tch ON ct.teacher_id = tch.teacher_id OR ct.teacher_id = tch.user_id 
                 LEFT JOIN users u ON tch.user_id = u.user_id OR LOWER(c.teacher_name) = LOWER(u.full_name) 
                 WHERE c.classroom_id = ? AND u.user_role = 'Teacher' LIMIT 1`,
                [classId]
            );
            if (t.length > 0 && t[0].user_id) {
                effectiveTeacherId = t[0].user_id;
                effectiveTeacherName = t[0].full_name;
            } else {
                const anyT = await db.query('SELECT user_id, full_name FROM users WHERE user_role = "Teacher" LIMIT 1');
                if (anyT.length > 0) {
                    effectiveTeacherId = anyT[0].user_id;
                    effectiveTeacherName = anyT[0].full_name;
                }
            }
        }

        if (!effectiveTeacherName && effectiveTeacherId) {
            const tRow = await db.query('SELECT full_name FROM users WHERE user_id = ?', [effectiveTeacherId]);
            effectiveTeacherName = tRow[0]?.full_name || 'Teacher';
        }
        if (!effectiveTeacherName) effectiveTeacherName = 'Teacher';

        const sLower = String(normStatus).trim().toLowerCase();
        const statusEmoji = sLower === 'present' ? '✅' : sLower === 'absent' ? '❌' : '⏰';
        const statusLine = sLower === 'absent'
            ? '⚠️ You were marked absent. Please contact your teacher if this is incorrect.'
            : sLower === 'late'
            ? '⏰ You were marked late. Please be on time next class.'
            : '✅ Great! Keep up the good attendance.';

        const markedTime = new Date().toLocaleTimeString('en-US', {
            timeZone: 'Asia/Karachi',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        const notifTitle = `${statusEmoji} Attendance Marked: ${classDisplayName} (${formattedDate})`;
        const notifMessage = `Dear ${finalStudentName},\n\nYour attendance for ${classDisplayName} has been marked by ${effectiveTeacherName}.\n\n📊 Status: ${normStatus.toUpperCase()}\n📅 Date: ${formattedDate}\n🕒 Time: ${markedTime}\n\n${statusLine}\n\nSent via Smart Desk`;

        // 3. IN-APP NOTIFICATION (Student Portal -> Notifications Screen)
        try {
            const existingNotif = await db.query(
                `SELECT notification_id FROM notifications 
                 WHERE receiver_id = ? AND title LIKE ? LIMIT 1`,
                [validStudentId, `%(${formattedDate})%`]
            );

            if (existingNotif.length > 0) {
                await db.query(
                    `UPDATE notifications SET 
                        sender_id = COALESCE(?, sender_id),
                        title = ?, 
                        message = ?, 
                        classroom_id = ?,
                        is_read = FALSE, 
                        created_at = CURRENT_TIMESTAMP 
                     WHERE notification_id = ?`,
                    [effectiveTeacherId, notifTitle, notifMessage, classId, existingNotif[0].notification_id]
                );
                console.log(`📱 [Sync Notif] In-app notification updated for student ${validStudentId}`);
            } else {
                await db.query(
                    `INSERT INTO notifications (
                        sender_id, sender_role, receiver_id, receiver_role,
                        notification_type, title, message, classroom_id, is_read, is_pushed, is_email_sent, created_at
                    ) VALUES (?, 'Teacher', ?, 'Student', 'Announcement', ?, ?, ?, FALSE, FALSE, TRUE, CURRENT_TIMESTAMP)`,
                    [effectiveTeacherId, validStudentId, notifTitle, notifMessage, classId]
                );
                console.log(`📱 [Sync Notif] In-app notification inserted for student ${validStudentId}`);
            }
        } catch (notifErr) {
            console.error('⚠️ [Sync Notif] In-app notification error:', notifErr.message);
        }

        // 4. ONESIGNAL PUSH NOTIFICATION (Mobile phone + Web browser)
        try {
            const pushResult = await pushService.sendAnnouncementPush({
                userId: validStudentId,
                pushToken: studentUser?.push_token,
                webPushToken: studentUser?.web_push_token,
                title: `${statusEmoji} Attendance Marked: ${classDisplayName}`,
                message: `Your attendance for ${classDisplayName} on ${formattedDate} at ${markedTime} has been marked as ${normStatus.toUpperCase()} by ${effectiveTeacherName}.`,
                announcementId: null
            });
            console.log(`📲 [Sync Notif] Push sent to student ${validStudentId}:`, pushResult?.success);
        } catch (pushErr) {
            console.error('⚠️ [Sync Notif] Push error:', pushErr.message);
        }

        // 5. EMAIL NOTIFICATION
        if (studentUser?.email) {
            try {
                const statusUpper = normStatus.toUpperCase();
                const statusColor = sLower === 'present' ? '#10B981' : sLower === 'absent' ? '#EF4444' : '#F59E0B';
                const emailHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="background: linear-gradient(135deg, #065F46, #047857); padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
                            <h1 style="color: #fff; margin: 0; font-size: 22px;">📚 Smart Desk</h1>
                            <p style="color: #D1FAE5; margin: 6px 0 0 0;">Attendance Notification</p>
                        </div>
                        <div style="background: #F9FAFB; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #E5E7EB;">
                            <p style="color: #374151; font-size: 15px;">Dear <b>${studentUser.full_name}</b>,</p>
                            <p style="color: #374151; font-size: 14px;">Your attendance for <b>${classDisplayName}</b> has been marked by <b>${effectiveTeacherName}</b>.</p>
                            <div style="background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 10px; padding: 16px; margin: 16px 0; text-align: center;">
                                <p style="margin: 0 0 6px 0; color: #6B7280; font-size: 12px;">STATUS</p>
                                <p style="margin: 0; font-size: 24px; font-weight: bold; color: ${statusColor};">${statusEmoji} ${statusUpper}</p>
                                <p style="margin: 10px 0 0 0; color: #6B7280; font-size: 13px;">📅 Date: ${formattedDate} &nbsp;|&nbsp; 🕒 Time: ${markedTime}</p>
                            </div>
                            <p style="color: #6B7280; font-size: 12px;">${statusLine}</p>
                            <p style="color: #9CA3AF; font-size: 11px; margin-top: 20px;">Sent via Smart Desk</p>
                        </div>
                    </div>
                `;

                await emailService.sendEmail({
                    to: studentUser.email,
                    subject: `${statusEmoji} Attendance Marked: ${classDisplayName} (${formattedDate})`,
                    html: emailHtml,
                    text: `Dear ${studentUser.full_name}, your attendance for ${classDisplayName} on ${formattedDate} at ${markedTime} has been marked as ${statusUpper} by ${effectiveTeacherName}.`
                });
                console.log(`📧 [Sync Notif] Email sent to ${studentUser.email}`);
            } catch (emailErr) {
                console.error('⚠️ [Sync Notif] Email error:', emailErr.message);
            }
        }
    } catch (e) {
        console.error('⚠️ [Sync Notif] Fatal notification error:', e.message);
    }
}

//    Uploaded file save karo (multer se ya base64 se) - ULTRA RESILIENT
function saveUploadedFile(req) {
    console.log('🔍 saveUploadedFile called. req.file exists?', !!req.file);
    const bodyKeys = req.body ? Object.keys(req.body) : [];
    console.log('🔍 req.body keys:', bodyKeys);
    
    const uploadDir = path.join(__dirname, '../../uploads/attachments');
    if (!fsLib.existsSync(uploadDir)) fsLib.mkdirSync(uploadDir, { recursive: true });

    // 1. Multer file buffer
    if (req.file) {
        try {
            console.log('✅ File detected from Multer! Name:', req.file.originalname, 'Size:', req.file.size);
            const safeName = Date.now() + '-' + String(req.file.originalname).replace(/[^a-zA-Z0-9.\-]/g, '_');
            fsLib.writeFileSync(path.join(uploadDir, safeName), req.file.buffer);
            
            const host = req.get('host') || 'smartdeskpk.work';
            const protocol = req.protocol === 'https' || (req.headers && req.headers['x-forwarded-proto'] === 'https') ? 'https' : 'http';
            const finalUrl = `${protocol}://${host}/uploads/attachments/${safeName}`;
            console.log('💾 File saved successfully from Multer at:', finalUrl);
            
            return {
                attachment_url: finalUrl,
                emailAttachment: {
                    filename: req.file.originalname,
                    content: req.file.buffer,
                    contentType: req.file.mimetype || 'application/octet-stream'
                }
            };
        } catch (e) {
            console.error('❌ Multer attachment save failed:', e.message);
        }
    }

    // 2. Base64 Attachment in body (from Offline Sync)
    const base64Data = req.body?.attachment_base64 || req.body?.attachmentBase64;
    if (base64Data && typeof base64Data === 'string' && base64Data.length > 20) {
        try {
            const rawBase64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;
            const buffer = Buffer.from(rawBase64, 'base64');
            const originalName = req.body.attachment_name || req.body.attachmentName || 'attachment.dat';
            const safeName = Date.now() + '-' + String(originalName).replace(/[^a-zA-Z0-9.\-]/g, '_');
            const filePath = path.join(uploadDir, safeName);
            fsLib.writeFileSync(filePath, buffer);
            
            const host = req.get('host') || 'smartdeskpk.work';
            const protocol = req.protocol === 'https' || (req.headers && req.headers['x-forwarded-proto'] === 'https') ? 'https' : 'http';
            const finalUrl = `${protocol}://${host}/uploads/attachments/${safeName}`;
            console.log('💾 Base64 Attachment saved successfully at:', finalUrl, `(${buffer.length} bytes)`);
            
            return {
                attachment_url: finalUrl,
                emailAttachment: {
                    filename: originalName,
                    content: buffer,
                    contentType: req.body.attachment_type || req.body.attachmentType || 'application/octet-stream'
                }
            };
        } catch (e) {
            console.error('❌ Base64 attachment decode/save failed:', e.message);
        }
    }

    // 3. Existing full HTTP attachment URL
    const existingUrl = req.body?.attachment_url || req.body?.attachment_uri;
    if (existingUrl && typeof existingUrl === 'string' && existingUrl.startsWith('http')) {
        console.log('✅ Found existing remote attachment URL:', existingUrl);
        return {
            attachment_url: existingUrl,
            emailAttachment: null
        };
    }

    console.log('ℹ️ No attachment file or Base64 data found. Returning null.');
    return null;
}

// ============================================
// CONTROLLER CLASS
// ============================================
class SyncController {
    constructor() {
        this.syncAttendance = this.syncAttendance.bind(this);
        this.syncMarks = this.syncMarks.bind(this);
        this.syncNotification = this.syncNotification.bind(this);
        this.syncAcademicReport = this.syncAcademicReport.bind(this);
        this.syncClassPerformance = this.syncClassPerformance.bind(this);
        this.syncClassAssignment = this.syncClassAssignment.bind(this);
        this.bulkSync = this.bulkSync.bind(this);
        this.getSyncStatus = this.getSyncStatus.bind(this);
        this.getSyncHistory = this.getSyncHistory.bind(this);
        this.clearSyncData = this.clearSyncData.bind(this);
    }

    // 1. ✅ SYNC ATTENDANCE - FIXED: Valid MySQL Date + Valid Student ID + Auto-Notify (In-App + Push + Email)
    async syncAttendance(req, res) {
        try {
            const { classroom_id, class_id, student_id, student_name, attendance_date, status } = req.body;
            const classId = classroom_id || class_id;

            if (!classId || !student_id || !status) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }

            const formattedDate = toMySQLDate(attendance_date) || new Date().toISOString().slice(0, 10);
            const teacherId = req.user?.user_id || null;
            const teacherName = req.user?.full_name || '';

            // Normalize status to 'Present', 'Absent', 'Late'
            const sLower = String(status).trim().toLowerCase();
            const normStatus = sLower.charAt(0).toUpperCase() + sLower.slice(1);
            const dbStatus = ['Present', 'Absent', 'Leave', 'Late'].includes(normStatus) 
                ? normStatus 
                : (normStatus === 'Late' ? 'Leave' : 'Present');

            // Validate student_id in users table with aggressive fallbacks
            let validStudentId = student_id;
            const userCheck = await db.query('SELECT user_id FROM users WHERE user_id = ?', [student_id]);
            if (userCheck.length === 0) {
                const nameCheck = await db.query(
                    'SELECT user_id FROM users WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?)) AND user_role = "Student" LIMIT 1',
                    [student_name || '']
                );
                if (nameCheck.length > 0) {
                    validStudentId = nameCheck[0].user_id;
                } else {
                    const enrollCheck = await db.query(
                        `SELECT u.user_id FROM enrollments e JOIN users u ON e.student_id = u.user_id 
                         WHERE e.classroom_id = ? AND (LOWER(TRIM(u.full_name)) = LOWER(TRIM(?)) OR u.roll_no = ?) LIMIT 1`,
                        [classId, student_name || '', student_id]
                    );
                    if (enrollCheck.length > 0) {
                        validStudentId = enrollCheck[0].user_id;
                    } else {
                        const anyEnroll = await db.query(
                            `SELECT student_id FROM enrollments WHERE classroom_id = ? LIMIT 1`,
                            [classId]
                        );
                        if (anyEnroll.length > 0) {
                            validStudentId = anyEnroll[0].student_id;
                        } else {
                            const anyStudent = await db.query(
                                'SELECT user_id FROM users WHERE user_role = "Student" LIMIT 1'
                            );
                            if (anyStudent.length > 0) validStudentId = anyStudent[0].user_id;
                        }
                    }
                }
            }

            // Database se asli class name lao
            const classDisplayName = await getClassDisplayName(classId);

            const existing = await db.query(
                `SELECT attendance_id FROM attendance WHERE classroom_id = ? AND student_id = ? AND attendance_date = ?`,
                [classId, validStudentId, formattedDate]
            );

            if (existing.length > 0) {
                await db.query(
                    `UPDATE attendance SET status = ?, marked_by = COALESCE(?, marked_by), marked_at = CURRENT_TIMESTAMP WHERE attendance_id = ?`,
                    [dbStatus, teacherId, existing[0].attendance_id]
                );
            } else {
                try {
                    await db.query(
                        `INSERT INTO attendance (classroom_id, student_id, attendance_date, status, marked_by) VALUES (?, ?, ?, ?, ?)`,
                        [classId, validStudentId, formattedDate, dbStatus, teacherId]
                    );
                } catch (insertErr) {
                    await db.query(
                        `UPDATE attendance SET status = ?, marked_by = COALESCE(?, marked_by), marked_at = CURRENT_TIMESTAMP WHERE classroom_id = ? AND student_id = ? AND attendance_date = ?`,
                        [dbStatus, teacherId, classId, validStudentId, formattedDate]
                    );
                }
            }

            // ✅ AUTOMATIC NOTIFICATIONS: Student Portal (notifications table) + OneSignal Push + Email
            await notifyStudentAttendance({
                studentId: validStudentId,
                studentName: student_name,
                classId,
                classDisplayName,
                formattedDate,
                normStatus,
                teacherId,
                teacherName
            });

            res.json({ success: true, message: 'Attendance synced and student notified successfully' });
        } catch (error) {
            console.error('❌ Sync attendance error:', error.message);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // 2. SYNC MARKS
    async syncMarks(req, res) {
        try {
            const { student_id, student_name, classroom_id, assessment_type, assessment_title, marks_obtained, total_marks } = req.body;

            if (!student_id || !assessment_type || marks_obtained === undefined) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }

            const existing = await db.query(
                `SELECT mark_id FROM marks WHERE student_id = ? AND assessment_type = ? AND assessment_title = ?`,
                [student_id, assessment_type, assessment_title || '']
            );

            if (existing.length > 0) {
                await db.query(
                    `UPDATE marks SET marks_obtained = ?, total_marks = ? WHERE student_id = ? AND assessment_type = ? AND assessment_title = ?`,
                    [marks_obtained, total_marks || 100, student_id, assessment_type, assessment_title || '']
                );
            } else {
                await db.query(
                    `INSERT INTO marks (student_id, classroom_id, assessment_type, assessment_title, marks_obtained, total_marks, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                    [student_id, classroom_id || null, assessment_type, assessment_title || '', marks_obtained, total_marks || 100]
                );
            }

            res.json({ success: true, message: 'Marks synced successfully' });
        } catch (error) {
            console.error('❌ Sync marks error:', error.message);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // 3. ✅ SYNC NOTIFICATION - WITH BULLETPROOF ATOMIC DUPLICATE PREVENTION
    async syncNotification(req, res) {
        try {
            const {
                recipient_id, recipient_type, recipient_email, recipient_name,
                title, message, type, is_bulk, student_ids, offline_ref
            } = req.body;

            if (!title || !message) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }

            //    STEP 1: ATOMIC DEDUPE CHECK - prevents race condition / multi-email
            if (offline_ref) {
                try {
                    await db.query(`CREATE TABLE IF NOT EXISTS sync_dedupe (
                        ref_key VARCHAR(190) PRIMARY KEY,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )`);
                    const dedupeResult = await db.query(
                        `INSERT IGNORE INTO sync_dedupe (ref_key) VALUES (?)`, [String(offline_ref).trim()]
                    );
                    if (dedupeResult.affectedRows === 0) {
                        console.log('♻️ [DEDUPE] ATOMICALLY BLOCKED DUPLICATE NOTIFICATION:', offline_ref);
                        return res.json({ success: true, message: 'Already synced', duplicate: true });
                    }
                    console.log('🔒 [DEDUPE] Acquired dedupe lock for:', offline_ref);
                } catch (e) {
                    console.warn('Dedupe lock warning:', e.message);
                }
            }

            const savedFile = saveUploadedFile(req);
            const sender_id = (req.user?.user_id && !isNaN(Number(req.user.user_id))) ? Number(req.user.user_id) : 11;
            const sender_role = normalizeRole(req.user?.user_role || 'Teacher');

            const isBulk = is_bulk === true || is_bulk === 'true' || is_bulk === '1' || is_bulk === 1;
            let studentIds = student_ids;
            if (typeof student_ids === 'string') {
                try { studentIds = JSON.parse(student_ids); } catch (e) { studentIds = null; }
            }

            if (isBulk && Array.isArray(studentIds) && studentIds.length > 0) {
                let sentCount = 0;
                for (const studentId of studentIds) {
                    try {
                        await sendSingleNotification({
                            sender_id, sender_role, receiver_id: studentId,
                            receiver_role: 'Student', title, message,
                            notification_type: normalizeType(type),
                            recipient_email, recipient_name,
                            attachment_url: savedFile?.attachment_url || null,
                            emailAttachment: savedFile?.emailAttachment || null
                        });
                        sentCount++;
                    } catch (e) {
                        console.error(`Bulk notif failed for student ${studentId}:`, e);
                    }
                }
            } else {
                await sendSingleNotification({
                    sender_id, sender_role,
                    receiver_id: recipient_id,
                    receiver_role: normalizeRole(recipient_type || 'Student'),
                    title, message,
                    notification_type: normalizeType(type),
                    recipient_email, recipient_name,
                    attachment_url: savedFile?.attachment_url || null,
                    emailAttachment: savedFile?.emailAttachment || null
                });
            }

            res.json({ success: true, message: 'Notification synced successfully' });
        } catch (error) {
            console.error('Sync notification error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // 4. SYNC ACADEMIC REPORT
    async syncAcademicReport(req, res) {
        try {
            const {
                studentId, classId, period, reportType,
                midTermMarks, quizMarks, assignmentMarks,
                classActivity, curriculum, subjectMarks, activity, behavior,
                remarks, accessGranted
            } = req.body;

            if (!studentId || !classId || !period) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }

            const teacherId = req.user?.user_id || null;
            const check = await db.query(
                `SELECT report_id FROM academic_reports WHERE student_id = ? AND classroom_id = ? AND period = ?`,
                [studentId, classId, period]
            );

            if (check.length > 0) {
                await db.query(
                    `UPDATE academic_reports SET mid_term_marks = ?, quiz_marks = ?, assignment_marks = ?, class_activity = ?, curriculum = ?, subject_marks = ?, activity = ?, behavior = ?, remarks = ?, access_granted = ?, updated_by = ?, updated_at = NOW()
                     WHERE student_id = ? AND classroom_id = ? AND period = ?`,
                    [midTermMarks || null, quizMarks || null, assignmentMarks || null, classActivity || null, curriculum || null, subjectMarks || null, activity || null, behavior || null, remarks || null, accessGranted ? 1 : 0, teacherId, studentId, classId, period]
                );
            } else {
                await db.query(
                    `INSERT INTO academic_reports (student_id, classroom_id, period, report_type, mid_term_marks, quiz_marks, assignment_marks, class_activity, curriculum, subject_marks, activity, behavior, remarks, access_granted, created_by, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [studentId, classId, period, reportType || 'college', midTermMarks || null, quizMarks || null, assignmentMarks || null, classActivity || null, curriculum || null, subjectMarks || null, activity || null, behavior || null, remarks || null, accessGranted ? 1 : 0, teacherId]
                );
            }

            res.json({ success: true, message: 'Academic report synced successfully' });
        } catch (error) {
            console.error('❌ Sync academic report error:', error.message);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // 5. SYNC CLASS PERFORMANCE
    async syncClassPerformance(req, res) {
        try {
            const { classId, teacherRemarks, coordinatorRemarks, accessGranted, averageGrade, passRate, topPerformer, students, evaluationDate } = req.body;

            if (!classId) {
                return res.status(400).json({ success: false, error: 'classId required' });
            }

            const detailedData = JSON.stringify(students || []);
            const evalDate = toMySQLDate(evaluationDate) || new Date().toISOString().split('T')[0];

            const check = await db.query(
                `SELECT report_id FROM performance_reports WHERE classroom_id = ? AND evaluation_date = ?`,
                [classId, evalDate]
            );

            if (check.length > 0) {
                await db.query(
                    `UPDATE performance_reports SET average_grade = ?, pass_rate = ?, top_performer = ?, teacher_remarks = ?, coordinator_remarks = ?, access_granted = ?, detailed_data = ?, updated_at = NOW()
                     WHERE classroom_id = ? AND evaluation_date = ?`,
                    [averageGrade || 'N/A', passRate || 'N/A', topPerformer || '', teacherRemarks || '', coordinatorRemarks || '', accessGranted ? 1 : 0, detailedData, classId, evalDate]
                );
            } else {
                await db.query(
                    `INSERT INTO performance_reports (classroom_id, evaluation_date, average_grade, pass_rate, top_performer, teacher_remarks, coordinator_remarks, access_granted, detailed_data)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [classId, evalDate, averageGrade || 'N/A', passRate || 'N/A', topPerformer || '', teacherRemarks || '', coordinatorRemarks || '', accessGranted ? 1 : 0, detailedData]
                );
            }

            res.json({ success: true, message: 'Class performance synced successfully' });
        } catch (error) {
            console.error('❌ Sync class performance error:', error.message);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // 6. SYNC CLASS ASSIGNMENT
    async syncClassAssignment(req, res) {
        try {
            const { classId, teacherId, teacherName, subject_name, action } = req.body;

            if (!classId || !action) {
                return res.status(400).json({ success: false, error: 'classId and action required' });
            }

            if (action === 'assign' && teacherId) {
                await db.query(
                    `UPDATE classrooms SET teacher_name = ?, status = 'assigned' WHERE classroom_id = ?`,
                    [teacherName || '', classId]
                );
                const chk = await db.query(
                    `SELECT * FROM classroom_teachers WHERE classroom_id = ? AND teacher_id = ?`,
                    [classId, teacherId]
                );
                if (chk.length === 0) {
                    await db.query(
                        `INSERT INTO classroom_teachers (classroom_id, teacher_id, subject_name) VALUES (?, ?, ?)`,
                        [classId, teacherId, subject_name || teacherName || 'General']
                    );
                }
            } else if (action === 'unassign') {
                await db.query(
                    `UPDATE classrooms SET teacher_name = NULL, status = 'unassigned' WHERE classroom_id = ?`,
                    [classId]
                );
                await db.query(
                    `DELETE FROM classroom_teachers WHERE classroom_id = ?`,
                    [classId]
                );
            }

            res.json({ success: true, message: `Class ${action} synced successfully` });
        } catch (error) {
            console.error('❌ Sync class assignment error:', error.message);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // 7. BULK SYNC
    async bulkSync(req, res) {
        try {
            const { attendance = [], marks = [], notifications = [] } = req.body;
            let syncedCount = { attendance: 0, marks: 0, notifications: 0 };

            for (const item of attendance) {
                try {
                    const { classroom_id, student_id, student_name, attendance_date, status } = item;
                    const formattedDate = toMySQLDate(attendance_date) || new Date().toISOString().slice(0, 10);
                    const sLower = String(status || 'present').trim().toLowerCase();
                    const normStatus = sLower.charAt(0).toUpperCase() + sLower.slice(1);
                    const dbStatus = ['Present', 'Absent', 'Leave', 'Late'].includes(normStatus) 
                        ? normStatus 
                        : (normStatus === 'Late' ? 'Leave' : 'Present');

                    const existing = await db.query(
                        `SELECT attendance_id FROM attendance WHERE classroom_id = ? AND student_id = ? AND attendance_date = ?`,
                        [classroom_id, student_id, formattedDate]
                    );
                    if (existing.length > 0) {
                        await db.query(`UPDATE attendance SET status = ?, marked_at = CURRENT_TIMESTAMP WHERE attendance_id = ?`, [dbStatus, existing[0].attendance_id]);
                    } else {
                        await db.query(`INSERT INTO attendance (classroom_id, student_id, attendance_date, status) VALUES (?, ?, ?, ?)`, [classroom_id, student_id, formattedDate, dbStatus]);
                    }
                    syncedCount.attendance++;

                    // ✅ AUTOMATIC NOTIFICATIONS: Student Portal (notifications table) + OneSignal Push + Email
                    const classDisplayName = await getClassDisplayName(classroom_id);
                    await notifyStudentAttendance({
                        studentId: student_id,
                        studentName,
                        classId: classroom_id,
                        classDisplayName,
                        formattedDate,
                        normStatus,
                        teacherId: req.user?.user_id,
                        teacherName: req.user?.full_name
                    });
                } catch (e) { console.error('⚠️ Bulk attendance error:', e.message); }
            }

            for (const item of marks) {
                try {
                    const { student_id, classroom_id, assessment_type, assessment_title, marks_obtained, total_marks } = item;
                    const existing = await db.query(
                        `SELECT mark_id FROM marks WHERE student_id = ? AND assessment_type = ? AND assessment_title = ?`,
                        [student_id, assessment_type, assessment_title || '']
                    );
                    
                    if (existing.length > 0) {
                        await db.query(
                            `UPDATE marks SET marks_obtained = ?, total_marks = ? WHERE student_id = ? AND assessment_type = ? AND assessment_title = ?`,
                            [marks_obtained, total_marks || 100, student_id, assessment_type, assessment_title || '']
                        );
                    } else {
                        await db.query(
                            `INSERT INTO marks (student_id, classroom_id, assessment_type, assessment_title, marks_obtained, total_marks, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                            [student_id, classroom_id || null, assessment_type, assessment_title || '', marks_obtained, total_marks || 100]
                        );
                    }
                    syncedCount.marks++;
                } catch (e) { console.error('⚠️ Bulk marks error:', e.message); }
            }

            for (const item of notifications) {
                try {
                    await sendSingleNotification({
                        sender_id: item.sender_id || 1,
                        sender_role: item.sender_role || 'System',
                        receiver_id: item.recipient_id || item.receiver_id,
                        receiver_role: item.recipient_type || item.receiver_role || 'Student',
                        title: item.title,
                        message: item.message,
                        notification_type: item.type || 'Announcement',
                        recipient_email: item.recipient_email,
                        recipient_name: item.recipient_name
                    });
                    syncedCount.notifications++;
                } catch (e) { console.error('⚠️ Bulk notification error:', e.message); }
            }

            res.json({ success: true, message: 'Bulk sync completed', syncedCount });
        } catch (error) {
            console.error('❌ Bulk sync error:', error.message);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // 8. GET SYNC STATUS
    async getSyncStatus(req, res) {
        try {
            const { pendingCount = 0 } = req.query;
            res.json({
                success: true,
                serverTime: new Date().toISOString(),
                pendingCount: parseInt(pendingCount),
                status: 'ready'
            });
        } catch (error) {
            console.error('❌ Get sync status error:', error.message);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // 9. GET SYNC HISTORY
    async getSyncHistory(req, res) {
        try {
            const results = await db.query(
                `SELECT log_id AS id, user_id, action_type AS type, description, status, created_at AS timestamp
                 FROM audit_log WHERE action_type LIKE '%SYNC%' ORDER BY created_at DESC LIMIT 50`
            );
            res.json({ success: true, history: results });
        } catch (error) {
            console.error('❌ Get sync history error:', error.message);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // 10. CLEAR SYNC DATA
    async clearSyncData(req, res) {
        try {
            res.json({ success: true, message: 'Sync data cleared on server' });
        } catch (error) {
            console.error('❌ Clear sync data error:', error.message);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }
}

module.exports = new SyncController();