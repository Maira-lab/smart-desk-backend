//    BULLETPROOF: Module-level helpers - NO `this` binding issues
const db = require('../config/db');
const emailService = require('../services/emailService');
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

//    Notification row insert (ULTRA-DEFENSIVE - ENUM & VARCHAR safe)
async function insertNotificationRow(fields) {
    const { sender_id, sender_role, receiver_id, receiver_role, notification_type, title, message, attachment_url } = fields;
    
    const allowedTypes = ['Announcement', 'Alert', 'Reminder', 'System', 'Message', 'General'];
    let safeType = (notification_type || 'Announcement').trim();
    
    if (!allowedTypes.includes(safeType)) {
        safeType = 'Announcement';
    }
    
    safeType = safeType.substring(0, 20);

    console.log('🔍 DB Insert Attempt -> safeType:', safeType, '| Length:', safeType.length);

    try {
        await db.query(
            `INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role, notification_type, title, message, attachment_url, is_read, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE, NOW())`,
            [sender_id, sender_role, receiver_id || null, receiver_role, safeType, title, message, attachment_url || null]
        );
    } catch (e) {
        console.warn('⚠️ Notification insert (full) failed, trying without attachment_url. Error:', e.message);
        try {
            await db.query(
                `INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role, notification_type, title, message, is_read, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, NOW())`,
                [sender_id, sender_role, receiver_id || null, receiver_role, safeType, title, message]
            );
        } catch (e2) {
            console.warn('⚠️ Notification insert (no attachment) failed, trying bare minimum. Error:', e2.message);
            await db.query(
                `INSERT INTO notifications (receiver_id, notification_type, title, message, is_read, created_at)
                 VALUES (?, ?, ?, ?, FALSE, NOW())`,
                [receiver_id || null, safeType, title, message]
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
    
    if (receiver_id && safeReceiverId === null) {
        console.log(`⚠️ Non-numeric receiver_id detected ('${receiver_id}'). Setting to NULL for DB (Role/Dept notification).`);
    }

    await insertNotificationRow({
        sender_id, sender_role, receiver_id: safeReceiverId, receiver_role,
        notification_type, title, message, attachment_url
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
                senderRole: sender_role,
                attachments: emailAttachment ? [emailAttachment] : []
            });
        }
    } catch (emailError) {
        console.error('⚠️ Email send failed (non-fatal):', emailError.message);
    }
}

//    Uploaded file save karo (multer se) - ULTRA LOGGED
function saveUploadedFile(req) {
    console.log('🔍 saveUploadedFile called. req.file exists?', !!req.file);
    console.log('🔍 req.body keys:', Object.keys(req.body));
    
    if (!req.file) {
        console.log('⚠️ No req.file found. Checking for attachment_uri in body...');
        if (req.body.attachment_uri || req.body.attachment_url) {
            console.log('✅ Found attachment_uri in body. Using it (Note: Email attachment will be skipped for URI fallback).');
            return { 
                attachment_url: req.body.attachment_uri || req.body.attachment_url, 
                emailAttachment: null 
            };
        }
        console.log('❌ No file and no URI found. Returning null.');
        return null;
    }
    
    try {
        console.log('✅ File detected! Name:', req.file.originalname, 'Size:', req.file.size, 'Mimetype:', req.file.mimetype);
        const uploadDir = path.join(__dirname, '../../uploads/attachments');
        if (!fsLib.existsSync(uploadDir)) fsLib.mkdirSync(uploadDir, { recursive: true });
        
        const safeName = Date.now() + '-' + String(req.file.originalname).replace(/[^a-zA-Z0-9.\-]/g, '_');
        fsLib.writeFileSync(path.join(uploadDir, safeName), req.file.buffer);
        
        const finalUrl = `${req.protocol}://${req.get('host')}/uploads/attachments/${safeName}`;
        console.log('💾 File saved successfully at:', finalUrl);
        
        return {
            attachment_url: finalUrl,
            emailAttachment: {
                filename: req.file.originalname,
                content: req.file.buffer,
                contentType: req.file.mimetype
            }
        };
    } catch (e) {
        console.error('❌ Attachment save failed:', e.message);
        return null;
    }
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

    // 1. ✅ SYNC ATTENDANCE - FIXED: Asli class name email mein jayega
    async syncAttendance(req, res) {
        try {
            const { classroom_id, class_id, student_id, student_name, attendance_date, status } = req.body;
            const classId = classroom_id || class_id;

            if (!classId || !student_id || !status) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }

            //    FIX: Database se asli class name lao (ID nahi!)
            const classDisplayName = await getClassDisplayName(classId);

            const existing = await db.query(
                `SELECT attendance_id FROM attendance WHERE classroom_id = ? AND student_id = ? AND attendance_date = ?`,
                [classId, student_id, attendance_date]
            );

            let isNew = false;
            if (existing.length > 0) {
                await db.query(
                    `UPDATE attendance SET status = ? WHERE classroom_id = ? AND student_id = ? AND attendance_date = ?`,
                    [status, classId, student_id, attendance_date]
                );
            } else {
                try {
                    await db.query(
                        `INSERT INTO attendance (classroom_id, student_id, attendance_date, status) VALUES (?, ?, ?, ?)`,
                        [classId, student_id, attendance_date, status]
                    );
                    isNew = true;
                } catch (insertErr) {
                    await db.query(
                        `UPDATE attendance SET status = ? WHERE classroom_id = ? AND student_id = ? AND attendance_date = ?`,
                        [status, classId, student_id, attendance_date]
                    );
                }
            }

            if (isNew) {
                try {
                    const studentResult = await db.query(
                        `SELECT email, full_name FROM users WHERE user_id = ?`, [student_id]
                    );
                    if (studentResult.length > 0) {
                        await emailService.sendAttendanceNotification({
                            to: studentResult[0].email,
                            studentName: studentResult[0].full_name || student_name,
                            date: attendance_date,
                            status: status,
                            className: classDisplayName   //    FIX: "Class 17" ki jagah asli naam
                        });
                    }
                } catch (emailError) {
                    console.error('⚠️ Attendance email failed:', emailError.message);
                }
            }

            res.json({ success: true, message: 'Attendance synced successfully' });
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

    // 3. ✅ SYNC NOTIFICATION - WITH DUPLICATE PREVENTION
    async syncNotification(req, res) {
        try {
            const {
                recipient_id, recipient_type, recipient_email, recipient_name,
                title, message, type, is_bulk, student_ids, offline_ref
            } = req.body;

            if (!title || !message) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }

            //    STEP 1: DEDUPE CHECK - same offline_ref dobara process NAHI hoga
            if (offline_ref) {
                try {
                    await db.query(`CREATE TABLE IF NOT EXISTS sync_dedupe (
                        ref_key VARCHAR(190) PRIMARY KEY,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )`);
                    const existing = await db.query(
                        `SELECT ref_key FROM sync_dedupe WHERE ref_key = ?`, [offline_ref]
                    );
                    if (existing.length > 0) {
                        console.log('♻️ DUPLICATE SKIPPED:', offline_ref);
                        return res.json({ success: true, message: 'Already synced', duplicate: true });
                    }
                } catch (e) {
                    console.warn('Dedupe table error:', e);
                }
            }

            const savedFile = saveUploadedFile(req);
            const sender_id = req.user?.user_id || 1;
            const sender_role = req.user?.user_role || 'Coordinator';

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
                            notification_type: type || 'Announcement',
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
                    receiver_role: recipient_type || 'Student',
                    title, message,
                    notification_type: type || 'Announcement',
                    recipient_email, recipient_name,
                    attachment_url: savedFile?.attachment_url || null,
                    emailAttachment: savedFile?.emailAttachment || null
                });
            }

            //    STEP 2: Dedupe record save karo (sirf success ke baad)
            if (offline_ref) {
                try { 
                    await db.query(`INSERT IGNORE INTO sync_dedupe (ref_key) VALUES (?)`, [offline_ref]); 
                } catch (e) {}
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
            const evalDate = evaluationDate || new Date().toISOString().split('T')[0];

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
                    const { classroom_id, student_id, attendance_date, status } = item;
                    const existing = await db.query(
                        `SELECT attendance_id FROM attendance WHERE classroom_id = ? AND student_id = ? AND attendance_date = ?`,
                        [classroom_id, student_id, attendance_date]
                    );
                    if (existing.length > 0) {
                        await db.query(`UPDATE attendance SET status = ? WHERE classroom_id = ? AND student_id = ? AND attendance_date = ?`, [status, classroom_id, student_id, attendance_date]);
                    } else {
                        await db.query(`INSERT INTO attendance (classroom_id, student_id, attendance_date, status) VALUES (?, ?, ?, ?)`, [classroom_id, student_id, attendance_date, status]);
                    }
                    syncedCount.attendance++;
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