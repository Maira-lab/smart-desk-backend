// src/controllers/studentController.js
//    COMPLETE FIXED: Badges + Targeted Notifications + Attendance + Today's Classes

const db = require('../config/db');

class StudentController {
    constructor() {
        this.db = db;
        
        //    Bind all methods to preserve 'this' context
        this.getStats = this.getStats.bind(this);
        this.getProfile = this.getProfile.bind(this);
        this.getAcademicReports = this.getAcademicReports.bind(this);
        this.getNotifications = this.getNotifications.bind(this);
        this.markNotificationRead = this.markNotificationRead.bind(this);
        this.getTodaysClasses = this.getTodaysClasses.bind(this);
        this.deleteNotification = this.deleteNotification.bind(this);
        this.getAttendanceSummary = this.getAttendanceSummary.bind(this);
        this.getAttendance = this.getAttendance.bind(this);
    }

    // ==========================================
    // 1. GET STUDENT STATS (Dashboard)
    // ==========================================
    async getStats(req, res) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, error: 'User not authenticated' });
            }

            const studentId = req.user.user_id;
            if (!studentId) {
                return res.status(401).json({ success: false, error: 'Invalid user - No ID found' });
            }

            const nameQuery = 'SELECT full_name FROM users WHERE user_id = ?';
            const nameResult = await db.query(nameQuery, [studentId]);
            const studentName = nameResult[0]?.full_name || 'Student';

            // Unread Announcements (last 30 days)
            const announcementsQuery = `
                SELECT COUNT(*) AS count 
                FROM notifications 
                WHERE (receiver_id = ? OR (receiver_id IS NULL AND (receiver_role = 'All' OR receiver_role = 'Student')))
                AND notification_type = 'Announcement'
                AND is_read = FALSE
                AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            `;
            const annResult = await db.query(announcementsQuery, [studentId]);

            // Distinct Subjects with Marks
            const reportsQuery = `
                SELECT COUNT(DISTINCT classroom_id) AS count 
                FROM marks 
                WHERE student_id = ?
                AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            `;
            const repResult = await db.query(reportsQuery, [studentId]);

            // Unread Notices
            const noticesQuery = `
                SELECT COUNT(*) AS count 
                FROM notifications 
                WHERE (receiver_id = ? OR (receiver_id IS NULL AND (receiver_role = 'All' OR receiver_role = 'Student')))
                AND notification_type IN ('Class_Update', 'System', 'Alert')
                AND is_read = FALSE
            `;
            const notResult = await db.query(noticesQuery, [studentId]);

            // Today's Classes Count
            const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
            const todayClassesQuery = `
                SELECT COUNT(*) AS count
                FROM classrooms c
                JOIN enrollments e ON c.classroom_id = e.classroom_id
                WHERE (e.student_id = ? OR e.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                AND c.day = ?
                AND c.is_active = TRUE
                AND e.status = 'Active'
            `;
            const todayResult = await db.query(todayClassesQuery, [studentId, studentId, today]);

            // Attendance Percentage
            const attendanceQuery = `
                SELECT 
                    COUNT(a.attendance_id) AS total,
                    SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present
                FROM attendance a
                WHERE a.student_id = ?
            `;
            const attResult = await db.query(attendanceQuery, [studentId]);
            const totalAtt = attResult[0]?.total || 0;
            const presentAtt = attResult[0]?.present || 0;
            const attendancePercentage = totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 100) : 0;

            const unreadAnn = annResult[0]?.count || 0;
            const subjReports = repResult[0]?.count || 0;
            const unreadNot = notResult[0]?.count || 0;

            res.json({
                success: true,
                stats: {
                    studentName: studentName,
                    unreadAnnouncements: unreadAnn,
                    subjectsWithReports: subjReports,
                    unreadNotices: unreadNot,
                    todayClasses: todayResult[0]?.count || 0,
                    attendancePercentage: attendancePercentage,
                    totalUnread: unreadAnn + unreadNot,
                    recentAnnouncements: unreadAnn,
                    recentReports: subjReports,
                    recentNotices: unreadNot,
                    announcements: unreadAnn,
                    reports: subjReports,
                    notices: unreadNot
                }
            });
        } catch (error) {
            console.error('❌ Stats error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // ==========================================
    // 2. GET STUDENT PROFILE
    // ==========================================
    async getProfile(req, res) {
        try {
            const studentId = req.user?.user_id;
            if (!studentId) {
                return res.status(401).json({ success: false, error: 'Unauthorized - User ID not found' });
            }

            let query = `
                SELECT u.user_id, u.email, u.full_name, u.user_role, 
                       u.status, u.created_at,
                       s.roll_no, s.class_name, s.semester, s.section,
                       s.department_name, s.parent_contact, s.address,
                       DATE_FORMAT(u.created_at, '%b %d, %Y') AS joinedDate
                FROM users u
                JOIN students s ON u.user_id = s.user_id
                WHERE u.user_id = ? AND u.status = 'Active'
            `;

            let results = await db.query(query, [studentId]);

            if (results.length === 0) {
                query = `
                    SELECT user_id, email, full_name, user_role, 
                           status, created_at,
                           roll_no, class_name, semester, section,
                           department_name,
                           DATE_FORMAT(created_at, '%b %d, %Y') AS joinedDate
                    FROM users
                    WHERE user_id = ? AND user_role = 'Student' AND status = 'Active'
                `;
                results = await db.query(query, [studentId]);
            }

            if (results.length === 0) {
                return res.status(404).json({ success: false, error: 'Student not found' });
            }

            res.json({ success: true, profile: results[0] });
        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // ==========================================
    // 9. GET ATTENDANCE (For Graph & Subject-wise UI)
       // ==========================================
    // 9. GET ATTENDANCE (BULLETPROOF - No More Crashes)
    // ==========================================
    async getAttendance(req, res) {
        try {
            const studentId = req.user?.user_id;
            if (!studentId) {
                return res.status(401).json({ success: false, error: 'Unauthorized' });
            }

            const period = req.query.period || 'monthly';
            
            // 🛡️ BULLETPROOF FIX: Dynamically detect the date column to NEVER crash
            let dateColumn = null;
            try {
                const cols = await db.query(`SHOW COLUMNS FROM attendance`);
                const colNames = cols.map(c => c.Field);
                if (colNames.includes('date')) dateColumn = 'date';
                else if (colNames.includes('created_at')) dateColumn = 'created_at';
                else if (colNames.includes('attendance_date')) dateColumn = 'attendance_date';
                else if (colNames.includes('marked_on')) dateColumn = 'marked_on';
            } catch (e) { 
                console.warn('⚠️ Could not detect date column, fetching all records safely.');
            }

            let dateFilter = '';
            if (dateColumn) {
                if (period === 'weekly') {
                    dateFilter = `AND a.${dateColumn} >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
                } else {
                    dateFilter = `AND MONTH(a.${dateColumn}) = MONTH(CURDATE()) AND YEAR(a.${dateColumn}) = YEAR(CURDATE())`;
                }
            }

            // Subject-wise Attendance Calculate karo
            const query = `
                SELECT 
                    c.classroom_id AS id,
                    c.subject_name AS subject,
                    c.teacher_name AS teacherName,
                    COUNT(a.attendance_id) AS totalClasses,
                    SUM(CASE WHEN LOWER(a.status) = 'present' THEN 1 ELSE 0 END) AS present,
                    SUM(CASE WHEN LOWER(a.status) = 'absent' THEN 1 ELSE 0 END) AS absent,
                    SUM(CASE WHEN LOWER(a.status) = 'leave' THEN 1 ELSE 0 END) AS leaveDays
                FROM attendance a
                JOIN classrooms c ON a.classroom_id = c.classroom_id
                WHERE a.student_id = ? ${dateFilter}
                GROUP BY c.classroom_id
            `;
            
            const results = await db.query(query, [studentId]);
            
            // Frontend ke format mein data convert karo
            const attendance = results.map(r => ({
                id: r.id.toString(),
                subject: r.subject,
                teacherName: r.teacherName || 'Teacher',
                totalClasses: r.totalClasses || 0,
                present: r.present || 0,
                absent: r.absent || 0,
                leaveDays: r.leaveDays || 0,
                percentage: r.totalClasses > 0 ? Math.round((r.present / r.totalClasses) * 100) : 0,
                lastUpdated: new Date().toLocaleDateString(),
                period: period
            }));

            // Overall Stats (Total, Present, Absent)
            const overall = attendance.reduce((acc, curr) => ({
                total: acc.total + curr.totalClasses,
                present: acc.present + curr.present,
                absent: acc.absent + curr.absent,
                leaveDays: acc.leaveDays + curr.leaveDays
            }), { total: 0, present: 0, absent: 0, leaveDays: 0 });
            
            overall.percentage = overall.total > 0 ? Math.round((overall.present / overall.total) * 100) : 0;

            // Student Info
            const studentQuery = `
                SELECT u.full_name, u.email, s.roll_no, s.department_name, s.section, s.semester, s.class_name
                FROM users u LEFT JOIN students s ON u.user_id = s.user_id WHERE u.user_id = ?
            `;
            const s = (await db.query(studentQuery, [studentId]))[0] || {};

            res.json({
                success: true,
                attendance,
                overall,
                student: { 
                    id: studentId.toString(), name: s.full_name || 'Student', email: s.email || '',
                    rollNo: s.roll_no || 'N/A', department: s.department_name || 'N/A', 
                    section: s.section || 'N/A', semester: s.semester || 'N/A', className: s.class_name || 'N/A' 
                }
            });
        } catch (error) {
            console.error('❌ Get attendance error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // ==========================================
    // 3. GET ACADEMIC REPORTS (Grades)
    // ==========================================
    async getAcademicReports(req, res) {
        try {
            const studentId = req.user?.user_id;
            if (!studentId) {
                return res.status(401).json({ success: false, error: 'Unauthorized - User ID not found' });
            }

            const query = `
                SELECT 
                    m.mark_id AS id,
                    m.assessment_type AS type,
                    m.assessment_title AS title,
                    m.marks_obtained AS obtained,
                    m.total_marks AS total,
                    ROUND((m.marks_obtained / m.total_marks) * 100, 2) AS percentage,
                    m.grade,
                    m.remarks,
                    c.subject_name AS subject,
                    c.class_name AS className,
                    c.semester,
                    DATE_FORMAT(m.created_at, '%b %d, %Y') AS date
                FROM marks m
                JOIN classrooms c ON m.classroom_id = c.classroom_id
                WHERE m.student_id = ?
                ORDER BY m.created_at DESC
                LIMIT 50
            `;

            const results = await db.query(query, [studentId]);
            const totalMarks = results.reduce((sum, r) => sum + parseFloat(r.obtained || 0), 0);
            const totalPossible = results.reduce((sum, r) => sum + parseFloat(r.total || 0), 0);
            const overallPercentage = totalPossible > 0 ? Math.round((totalMarks / totalPossible) * 100) : 0;

            res.json({
                success: true,
                reports: results,
                summary: {
                    totalSubjects: results.length,
                    overallPercentage: overallPercentage,
                    totalMarks: totalMarks,
                    totalPossible: totalPossible
                }
            });
        } catch (error) {
            console.error('Get academic reports error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // ==========================================
    // 4. GET NOTIFICATIONS
    // ==========================================
    async getNotifications(req, res) {
        try {
            const studentId = req.user?.user_id;
            const { filter = 'all' } = req.query;

            if (!studentId) {
                return res.status(401).json({ success: false, error: 'Unauthorized - User ID not found' });
            }

            let query = `
                SELECT 
                    n.notification_id AS id,
                    n.title AS subject,
                    n.message,
                    n.notification_type AS type,
                    n.sender_role AS senderRoleRaw,
                    u.full_name AS senderName,
                    u.email AS senderEmail,
                    n.attachment_url AS attachmentUrl,
                    n.is_read AS isRead,
                    DATE_FORMAT(n.created_at, '%b %d, %Y %h:%i %p') AS date
                FROM notifications n
                LEFT JOIN users u ON n.sender_id = u.user_id
                WHERE (n.receiver_id = ? OR (n.receiver_id IS NULL AND (n.receiver_role = 'All' OR n.receiver_role = 'Student')))
            `;
            const params = [studentId];

            if (filter === 'admin') query += ` AND n.sender_role = 'Admin'`;
            else if (filter === 'coordinator') query += ` AND n.sender_role = 'Coordinator'`;
            else if (filter === 'teacher') query += ` AND n.sender_role = 'Teacher'`;

            query += ` ORDER BY n.created_at DESC LIMIT 50`;

            const results = await db.query(query, params);

            const notifications = results.map(n => {
                const role = (n.senderRoleRaw || '').toLowerCase();
                return {
                    id: String(n.id),
                    subject: n.subject || 'No Subject',
                    message: n.message || '',
                    type: (n.type || 'announcement').toLowerCase(),
                    sender: n.senderName || (role === 'admin' ? 'Admin Office' : (n.senderRoleRaw || 'Unknown')),
                    senderEmail: n.senderEmail || '',
                    senderRole: role,
                    date: n.date,
                    read: n.isRead === 1,
                    isRead: n.isRead === 1,
                    hasAttachment: !!n.attachmentUrl,
                    attachmentUrl: n.attachmentUrl || null,
                };
            });
            
            const unreadCount = notifications.filter(n => !n.read).length;
            res.json({ success: true, notifications, unreadCount });
        } catch (error) {
            console.error('Get notifications error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // ==========================================
    // 5. MARK NOTIFICATION AS READ
    // ==========================================
    async markNotificationRead(req, res) {
        try {
            const { notification_id } = req.params;
            const studentId = req.user?.user_id;

            if (!notification_id) {
                return res.status(400).json({ success: false, error: 'Notification ID is required' });
            }

            const query = 'UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND receiver_id = ?';
            await db.query(query, [notification_id, studentId]);

            res.json({ success: true, message: 'Notification marked as read' });
        } catch (error) {
            console.error('Mark notification read error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // ==========================================
    // 6. GET TODAY'S CLASSES
    // ==========================================
    async getTodaysClasses(req, res) {
        try {
            const studentId = req.user?.user_id;
            const { filter = 'all' } = req.query;

            if (!studentId) {
                return res.status(401).json({ success: false, error: 'Unauthorized - User ID not found' });
            }

            const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
            const now = new Date();
            const today = now.toLocaleDateString('en-US', { weekday: 'long' });
            const todayIdx = dayOrder.indexOf(today);
            const nowHM = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

            const query = `
                SELECT 
                    c.classroom_id AS id,
                    c.class_code AS classId,
                    c.subject_name AS subject,
                    c.day,
                    c.start_time AS startTime,
                    c.end_time AS endTime,
                    c.room,
                    c.teacher_name AS teacher,
                    c.notes,
                    (SELECT COUNT(*) FROM enrollments WHERE classroom_id = c.classroom_id AND status = 'Active') AS totalStudents
                FROM classrooms c
                JOIN enrollments e ON c.classroom_id = e.classroom_id
                WHERE (e.student_id = ? OR e.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                  AND c.is_active = TRUE 
                  AND e.status = 'Active'
                  AND c.day IS NOT NULL AND c.day != ''
                ORDER BY FIELD(c.day,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), c.start_time
            `;
            const results = await db.query(query, [studentId, studentId]);

            const toHM = (t) => (t ? String(t).slice(0, 5) : '');

            const classes = results.map(cls => {
                const start = toHM(cls.startTime);
                const end = toHM(cls.endTime);
                const dayIdx = dayOrder.indexOf(cls.day);

                let status = 'upcoming';
                if (dayIdx === todayIdx) {
                    if (start && nowHM < start) status = 'upcoming';
                    else if (end && nowHM > end) status = 'completed';
                    else status = 'ongoing';
                } else if (dayIdx > -1 && todayIdx > -1 && dayIdx < todayIdx) {
                    status = 'completed';
                } else {
                    status = 'upcoming';
                }

                let duration = '';
                if (start && end) {
                    const [sh, sm] = start.split(':').map(Number);
                    const [eh, em] = end.split(':').map(Number);
                    const diff = (eh * 60 + em) - (sh * 60 + sm);
                    if (diff > 0) duration = `${Math.floor(diff / 60)}h${diff % 60 ? ` ${diff % 60}m` : ''}`;
                }

                return {
                    id: String(cls.id),
                    subject: cls.subject || 'Class',
                    teacherName: cls.teacher || 'TBD',
                    startTime: start || 'TBD',
                    endTime: end || 'TBD',
                    duration: duration || '-',
                    day: cls.day,
                    date: cls.day === today ? 'Today' : cls.day,
                    roomNumber: cls.room || 'TBD',
                    status,
                    teacherNotification: cls.notes || null,
                    totalStudents: cls.totalStudents || 0,
                    isActive: true,
                };
            });

            const summary = {
                total: classes.length,
                upcoming: classes.filter(c => c.status === 'upcoming').length,
                ongoing: classes.filter(c => c.status === 'ongoing').length,
                completed: classes.filter(c => c.status === 'completed').length,
            };

            let displayed = classes;
            if (filter === 'upcoming') displayed = classes.filter(c => c.status === 'upcoming' || c.status === 'ongoing');
            else if (filter === 'completed') displayed = classes.filter(c => c.status === 'completed');

            res.json({
                success: true,
                day: today,
                date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
                classes: displayed,
                count: displayed.length,
                summary,
            });
        } catch (error) {
            console.error('Get today\'s classes error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // ==========================================
    // 7. DELETE NOTIFICATION
    // ==========================================
    async deleteNotification(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.user_id;
            
            const notif = await db.query(
                `SELECT notification_id FROM notifications 
                 WHERE notification_id = ? AND (receiver_id = ? OR sender_id = ?)`,
                [id, userId, userId]
            );
            
            if (notif.length === 0) {
                return res.status(404).json({ success: false, error: 'Notification not found or access denied' });
            }
            
            try {
                await db.query(`DELETE FROM notification_replies WHERE notification_id = ?`, [id]);
            } catch (e) { /* Table might not exist */ }
            
            await db.query(`DELETE FROM notifications WHERE notification_id = ?`, [id]);
            
            res.json({ success: true, message: 'Notification deleted successfully' });
        } catch (error) {
            console.error('❌ Delete notification error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // ==========================================
    // 8. GET ATTENDANCE SUMMARY
    // ==========================================
    async getAttendanceSummary(req, res) {
        try {
            const studentId = req.user?.user_id;
            if (!studentId) {
                return res.status(401).json({ success: false, error: 'Unauthorized - User ID not found' });
            }

            const query = `
                SELECT 
                    c.classroom_id AS classId,
                    c.subject_name AS subject,
                    c.semester,
                    COUNT(a.attendance_id) AS totalClasses,
                    SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present,
                    SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent,
                    SUM(CASE WHEN a.status = 'Leave' THEN 1 ELSE 0 END) AS leaveDays,
                    ROUND((SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) / 
                           NULLIF(COUNT(a.attendance_id), 0)) * 100, 2) AS percentage
                FROM attendance a
                JOIN classrooms c ON a.classroom_id = c.classroom_id
                WHERE a.student_id = ?
                GROUP BY c.classroom_id, c.subject_name, c.semester
                ORDER BY c.semester DESC
            `;

            const results = await db.query(query, [studentId]);

            let totalDays = 0;
            let totalPresent = 0;
            results.forEach(r => {
                totalDays += r.totalClasses || 0;
                totalPresent += r.present || 0;
            });
            const overallPercentage = totalDays > 0 ? Math.round((totalPresent / totalDays) * 100) : 0;

            res.json({
                success: true,
                summary: {
                    totalClasses: totalDays,
                    present: totalPresent,
                    absent: results.reduce((sum, r) => sum + (r.absent || 0), 0),
                    leaveDays: results.reduce((sum, r) => sum + (r.leaveDays || 0), 0),
                    percentage: overallPercentage
                },
                details: results
            });
        } catch (error) {
            console.error('Get attendance summary error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }
}

module.exports = new StudentController();