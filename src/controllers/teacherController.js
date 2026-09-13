// src/controllers/teacherController.js
//  ULTIMATE BULLETPROOF FIX + ✅ TARGETED NOTIFICATION FIX
const db = require('../config/db');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const emailService = require('../services/emailService');
const pushService = require('../services/pushService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

//    Multer setup - ✅ SDK 57 Compatible with Extension Fallback
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'video/mp4',
            'video/quicktime',
            'video/x-msvideo',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain',
            'application/octet-stream'
        ];
        
        let mimetype = file.mimetype || '';
        
        // Agar mimetype valid hai aur allowed list mein hai
        if (mimetype && allowedTypes.includes(mimetype)) {
            cb(null, true);
            return;
        }
        
        // ✅ SDK 57 FIX: Agar mimetype empty/generic hai, toh extension se check karo
        if (!mimetype || mimetype === 'application/octet-stream' || mimetype === '') {
            const originalName = file.originalname || '';
            const ext = originalName.split('.').pop()?.toLowerCase();
            
            const allowedExtensions = [
                'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp',
                'mp4', 'mov', 'avi',
                'doc', 'docx', 'xls', 'xlsx', 'txt'
            ];
            
            if (ext && allowedExtensions.includes(ext)) {
                console.log(`✅ Teacher: File accepted via extension: ${originalName}`);
                cb(null, true);
                return;
            }
        }
        
        console.warn(`⚠️ Teacher: File rejected: ${file.originalname} | mimetype: ${mimetype}`);
        cb(new Error('Invalid file type. Only PDF, Images, Videos, and Documents are allowed.'), false);
    }
});

//  DATE FIX HELPER: DD-MM-YYYY / DD/MM/YYYY / DD/MM/YY → YYYY-MM-DD (2-digit year support)
function toMySQLDate(dateStr) {
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split(' ')[0];
    const m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2}|\d{4})$/);
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
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    return s;
}

class TeacherController {
    
    constructor() {
        this.db = db;
        
        this.getStats = this.getStats.bind(this);
        this.getMyClasses = this.getMyClasses.bind(this);
        this.getMyAssignedClasses = this.getMyAssignedClasses.bind(this);
        this.getAssignmentNotification = this.getAssignmentNotification.bind(this);
        this.getClassStudents = this.getClassStudents.bind(this);
        this.getClassStudentsForAttendance = this.getClassStudentsForAttendance.bind(this);
        this.markBulkAttendance = this.markBulkAttendance.bind(this);
        this.getAttendanceRecords = this.getAttendanceRecords.bind(this);
        this.getAttendanceSummary = this.getAttendanceSummary.bind(this);
        this.markAttendance = this.markAttendance.bind(this);
        this.getStudentsForAttendance = this.getStudentsForAttendance.bind(this);
        this.getCoordinatorsList = this.getCoordinatorsList.bind(this);
        this.getProfile = this.getProfile.bind(this);
        this.getNotifications = this.getNotifications.bind(this);
        this.sendNotification = this.sendNotification.bind(this);
        this.generateReport = this.generateReport.bind(this);
        this.getAssignedClassesForPerformance = this.getAssignedClassesForPerformance.bind(this);
        this.getClassStudentsPerformance = this.getClassStudentsPerformance.bind(this);
        this.saveClassPerformanceReport = this.saveClassPerformanceReport.bind(this);
        this.getClassPerformanceReport = this.getClassPerformanceReport.bind(this);
        this.downloadClassPerformanceReport = this.downloadClassPerformanceReport.bind(this);
        this.generatePerformancePDF = this.generatePerformancePDF.bind(this);
        this.generatePerformanceExcel = this.generatePerformanceExcel.bind(this);
        this.getTeacherNotifications = this.getTeacherNotifications.bind(this);
        this.getTeacherNotificationById = this.getTeacherNotificationById.bind(this);
        this.markTeacherNotificationRead = this.markTeacherNotificationRead.bind(this);
        this.replyToTeacherNotification = this.replyToTeacherNotification.bind(this);
        this.getTeacherUnreadCount = this.getTeacherUnreadCount.bind(this);
        this.getTeacherNotificationStats = this.getTeacherNotificationStats.bind(this);
        this.sendTeacherNotification = this.sendTeacherNotification.bind(this);
        this.sendBulkTeacherNotification = this.sendBulkTeacherNotification.bind(this);
        this.getTeacherClassesForReport = this.getTeacherClassesForReport.bind(this);
        this.getStudentForReport = this.getStudentForReport.bind(this);
        this.saveAcademicReport = this.saveAcademicReport.bind(this);
        this.getAcademicReport = this.getAcademicReport.bind(this);
        this.downloadAcademicReport = this.downloadAcademicReport.bind(this);
        this.generateAcademicPDF = this.generateAcademicPDF.bind(this);
        this.generateAcademicExcel = this.generateAcademicExcel.bind(this);
        this.getClassPerformanceFull = this.getClassPerformanceFull.bind(this);
        this.deleteNotification = this.deleteNotification.bind(this);
        this.initializeClassPerformance = this.initializeClassPerformance.bind(this);
        this.buildLiveStudents = this.buildLiveStudents.bind(this);
        this.saveClassPerformanceFull = this.saveClassPerformanceFull.bind(this);
    }

    // 1. GET TEACHER STATS
    async getStats(req, res) {
        try {
            const teacherId = req.user?.user_id;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || 'Teacher';
            
            const classesQuery = `SELECT COUNT(DISTINCT c.classroom_id) AS classes FROM classrooms c LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?)) AND c.is_active = TRUE`;
            const classResult = await db.query(classesQuery, [teacherId, teacherId, teacherName]);
            
            const studentsQuery = `SELECT COUNT(DISTINCT e.student_id) AS students FROM enrollments e JOIN classrooms c ON e.classroom_id = c.classroom_id LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?)) AND e.status = 'Active'`;
            const studentResult = await db.query(studentsQuery, [teacherId, teacherId, teacherName]);
            
            // ✅ NEW DEFINITION: Student ne bheji (Submission/Response) + Teacher ne reply NAHI kiya
            let assignResult = [{ pending: 0 }];
            try {
                const assignmentsQuery = `
                    SELECT COUNT(*) AS pending
                    FROM notifications n
                    WHERE n.receiver_id = ?
                      AND n.sender_role = 'Student'
                      AND n.notification_type IN ('Submission', 'Response')
                      AND NOT EXISTS (
                          SELECT 1 FROM notification_replies nr
                          WHERE nr.notification_id = n.notification_id
                            AND nr.sender_role = 'Teacher'
                      )
                `;
                assignResult = await db.query(assignmentsQuery, [teacherId]);
            } catch (e) {
                // Fallback: has_response column use karo
                try {
                    assignResult = await db.query(`
                        SELECT COUNT(*) AS pending FROM notifications
                        WHERE receiver_id = ? AND sender_role = 'Student'
                        AND notification_type IN ('Submission', 'Response')
                        AND (has_response IS NULL OR has_response = FALSE)
                    `, [teacherId]);
                } catch (e2) {
                    assignResult = [{ pending: 0 }];
                }
            }
            
            res.json({ success: true, stats: { teacherName, totalClasses: classResult[0]?.classes || 0, totalStudents: studentResult[0]?.students || 0, pendingAssignments: assignResult[0]?.pending || 0 } });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 2. GET MY CLASSES
    async getMyClasses(req, res) {
        try {
            const teacherId = req.user?.user_id;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });
            const query = `SELECT c.classroom_id, c.class_name, c.class_name AS className, c.subject_name AS subjectName, COALESCE(c.semester, sem.semester_code, '') AS semester, c.department_name, c.section, c.subject_name, c.is_active, ct.subject_name AS assigned_subject, (SELECT COUNT(*) FROM enrollments WHERE classroom_id = c.classroom_id AND status = 'Active') AS total_students FROM classrooms c LEFT JOIN semesters sem ON c.semester_id = sem.semester_id JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE (t.user_id = ? OR ct.teacher_id = ?) AND c.is_active = TRUE ORDER BY c.created_at DESC`;
            const results = await db.query(query, [teacherId, teacherId]);
            res.json({ success: true, classes: results, count: results.length });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 3. GET MY ASSIGNED CLASSES
    async getMyAssignedClasses(req, res) {
        try {
            const teacherId = req.user?.user_id;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            
            const query = `SELECT c.classroom_id AS classId, c.class_code, c.class_name AS className, c.subject_name AS subjectName, COALESCE(c.semester, sem.semester_code, '') AS semester, c.section, c.day, c.start_time AS startTime, c.end_time AS endTime, c.room, c.teacher_name AS assignedBy, c.created_at AS assignedDate, (SELECT COUNT(*) FROM enrollments WHERE classroom_id = c.classroom_id AND status = 'Active') AS totalStudents FROM classrooms c LEFT JOIN semesters sem ON c.semester_id = sem.semester_id LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?)) AND c.is_active = TRUE ORDER BY c.day, c.start_time`;
            const results = await db.query(query, [teacherId, teacherId, teacherName]);
            
            const classes = results.map(row => {
                let semester = row.semester || '';
                const notifId = `NOT-${new Date(row.assignedDate || Date.now()).getFullYear()}-${String(row.classId).padStart(3, '0')}`;
                return { id: row.classId?.toString() || `CLS-${Date.now()}`, notificationId: notifId, subject: row.subjectName || 'Class', semester, section: row.section || '', roomNumber: row.room || 'TBD', day: row.day || 'TBD', startTime: row.startTime || 'TBD', endTime: row.endTime || 'TBD', assignedBy: row.assignedBy || 'Coordinator', assignedDate: row.assignedDate ? new Date(row.assignedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A', notificationSubject: `📢 Class Assignment: ${row.subjectName || 'Class'}${semester ? ' - ' + semester : ''}`, notificationBody: `You have been assigned to teach ${row.subjectName || 'Class'}.`, totalStudents: row.totalStudents || 0 };
            });
            const semesters = ['all', ...new Set(classes.map(c => c.semester).filter(s => s !== ''))];
            res.json({ success: true, classes, count: classes.length, semesters });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 4. GET ASSIGNMENT NOTIFICATION DETAILS - ✅ TARGETED FIX
    async getAssignmentNotification(req, res) {
        try {
            const { notification_id } = req.params;
            const teacherId = req.user?.user_id;
            if (!notification_id) return res.status(400).json({ success: false, error: 'Notification ID is required' });
            let actualNotifId = notification_id;
            const match = notification_id.match(/(\d+)$/);
            if (match) actualNotifId = match[1];
            
            //  FIXED: Targeted delivery - sirf specific teacher ko
            const notifQuery = `SELECT n.notification_id AS id, n.title AS subject, n.message AS notificationBody, n.created_at AS assignedDate, u.full_name AS assignedBy, u.user_role AS assignedByRole FROM notifications n LEFT JOIN users u ON n.sender_id = u.user_id WHERE (n.notification_id = ? OR n.notification_id = ?) AND (n.receiver_id = ? OR (n.receiver_id IS NULL AND (n.receiver_role = 'Teacher' OR n.receiver_role = 'All'))) AND n.notification_type IN ('Class_Update', 'Announcement', 'Direct', 'Bulk')`;
            const notifResult = await db.query(notifQuery, [notification_id, actualNotifId, teacherId]);
            
            if (notifResult.length === 0) {
                const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
                const teacherName = nameResult[0]?.full_name || '';
                const fallbackQuery = `SELECT c.classroom_id AS classId, c.class_name AS className, COALESCE(c.semester, sem.semester_code, '') AS semester, c.section, c.subject_name AS subjectName, c.day, c.start_time AS startTime, c.end_time AS endTime, c.room, c.created_at AS assignedDate, (SELECT COUNT(*) FROM enrollments WHERE classroom_id = c.classroom_id AND status = 'Active') AS totalStudents FROM classrooms c LEFT JOIN semesters sem ON c.semester_id = sem.semester_id LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?)) AND c.is_active = TRUE LIMIT 1`;
                const fallbackResult = await db.query(fallbackQuery, [teacherId, teacherId, teacherName]);
                if (fallbackResult.length === 0) return res.status(404).json({ success: false, error: 'Notification not found or not assigned to you' });
                const row = fallbackResult[0];
                return res.json({ success: true, notification: { id: notification_id, notificationId: notification_id, subject: row.subjectName || 'Class', semester: row.semester || '', section: row.section || '', roomNumber: row.room || 'TBD', day: row.day || 'TBD', startTime: row.startTime || 'TBD', endTime: row.endTime || 'TBD', assignedBy: 'Coordinator', assignedDate: new Date(row.assignedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), notificationSubject: `📢 Class Assignment: ${row.subjectName}${row.semester ? ' - ' + row.semester : ''}`, notificationBody: `You have been assigned to teach ${row.subjectName}.`, totalStudents: row.totalStudents || 0, className: row.className || 'Class' } });
            }
            const row = notifResult[0];
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const classesQuery = `SELECT c.classroom_id AS classId, c.class_name AS className, COALESCE(c.semester, sem.semester_code, '') AS semester, c.section, c.subject_name AS subjectName, c.day, c.start_time AS startTime, c.end_time AS endTime, c.room, (SELECT COUNT(*) FROM enrollments WHERE classroom_id = c.classroom_id AND status = 'Active') AS totalStudents FROM classrooms c LEFT JOIN semesters sem ON c.semester_id = sem.semester_id LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?)) AND c.is_active = TRUE`;
            const classes = await db.query(classesQuery, [teacherId, teacherId, teacherName]);
            let matchedClass = classes[0] || {};
            if (classes.length > 0 && (row.notificationBody || row.subject)) {
                const searchText = `${row.notificationBody || ''} ${row.subject || ''}`;
                const found = classes.find(c => searchText.includes(c.subjectName));
                if (found) matchedClass = found;
            }
            const notifId = `NOT-${new Date(row.assignedDate).getFullYear()}-${String(row.id).padStart(3, '0')}`;
            res.json({ success: true, notification: { id: row.id?.toString(), notificationId: notifId, subject: matchedClass.subjectName || row.subject || 'Class', semester: matchedClass.semester || '', section: matchedClass.section || '', roomNumber: matchedClass.room || 'TBD', day: matchedClass.day || 'TBD', startTime: matchedClass.startTime || 'TBD', endTime: matchedClass.endTime || 'TBD', assignedBy: `${row.assignedBy || 'Coordinator'} (${row.assignedByRole || 'Coordinator'})`, assignedDate: new Date(row.assignedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), notificationSubject: `📢 Class Assignment: ${matchedClass.subjectName || row.subject}${matchedClass.semester ? ' - ' + matchedClass.semester : ''}`, notificationBody: row.notificationBody || 'No additional details provided.', totalStudents: matchedClass.totalStudents || 0, className: matchedClass.className || 'Class' } });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 5. GET CLASS STUDENTS
    async getClassStudents(req, res) {
        try {
            const { class_id } = req.params;
            const teacherId = req.user?.user_id;
            if (!class_id) return res.status(400).json({ success: false, error: 'Class ID is required' });
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const verifyQuery = `SELECT c.classroom_id FROM classrooms c LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE c.classroom_id = ? AND (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?))`;
            const verifyResult = await db.query(verifyQuery, [class_id, teacherId, teacherId, teacherName]);
            if (verifyResult.length === 0) return res.status(403).json({ success: false, error: 'You are not assigned to this class' });
            const query = `SELECT u.user_id AS id, u.full_name AS name, u.email, u.roll_no AS rollNo, u.semester, u.section, e.enrollment_date AS enrollmentDate, e.status AS enrollmentStatus FROM enrollments e JOIN users u ON (e.student_id = u.user_id OR e.student_id = (SELECT st.student_id FROM students st WHERE st.user_id = u.user_id LIMIT 1)) WHERE e.classroom_id = ? AND e.status = 'Active' ORDER BY u.full_name ASC`;
            const results = await db.query(query, [class_id]);
            res.json({ success: true, students: results, count: results.length });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 6. GET CLASS STUDENTS FOR ATTENDANCE
    async getClassStudentsForAttendance(req, res) {
        try {
            const { classroom_id } = req.params;
            const teacherId = req.user?.user_id;
            if (!classroom_id) return res.status(400).json({ success: false, error: 'Classroom ID is required' });
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const verifyQuery = `SELECT c.classroom_id FROM classrooms c LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE c.classroom_id = ? AND (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?))`;
            const verifyResult = await db.query(verifyQuery, [classroom_id, teacherId, teacherId, teacherName]);
            if (verifyResult.length === 0) return res.status(403).json({ success: false, error: 'You are not assigned to this class' });
            
            const classQuery = `SELECT c.classroom_id AS id, c.subject_name AS subject, COALESCE(c.semester, sem.semester_code, '') AS semester, c.section, c.room, c.day, c.start_time AS startTime, COUNT(e.student_id) AS totalStudents FROM classrooms c LEFT JOIN semesters sem ON c.semester_id = sem.semester_id LEFT JOIN enrollments e ON c.classroom_id = e.classroom_id AND e.status = 'Active' WHERE c.classroom_id = ? GROUP BY c.classroom_id`;
            const classResult = await db.query(classQuery, [classroom_id]);
            
            const studentsQuery = `SELECT u.user_id AS id, u.full_name AS name, u.email, u.roll_no AS rollNo, (SELECT COUNT(*) FROM attendance WHERE student_id = u.user_id AND classroom_id = ? AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND status = 'present') AS weeklyPresent, (SELECT COUNT(*) FROM attendance WHERE student_id = u.user_id AND classroom_id = ? AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) AS weeklyTotal, COALESCE((SELECT status FROM attendance WHERE student_id = u.user_id AND classroom_id = ? AND attendance_date = CURDATE()), 'unmarked') AS todayStatus FROM enrollments e JOIN users u ON (e.student_id = u.user_id OR e.student_id = (SELECT st.student_id FROM students st WHERE st.user_id = u.user_id LIMIT 1)) WHERE e.classroom_id = ? AND e.status = 'Active' ORDER BY u.full_name ASC`;
            const students = await db.query(studentsQuery, [classroom_id, classroom_id, classroom_id, classroom_id]);
            const formattedStudents = students.map(s => { const weeklyTotal = s.weeklyTotal || 0; const weeklyPresent = s.weeklyPresent || 0; const percentage = weeklyTotal > 0 ? Math.round((weeklyPresent / weeklyTotal) * 100) : 0; return { id: s.id?.toString(), name: s.name || 'Unknown', rollNo: s.rollNo || 'N/A', email: s.email || 'N/A', weekly: { present: weeklyPresent, total: weeklyTotal, percentage }, todayStatus: s.todayStatus || 'unmarked' }; });
            res.json({ success: true, classInfo: classResult[0] || null, students: formattedStudents, count: formattedStudents.length });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 7. MARK BULK ATTENDANCE - ✅ DATE FIXED + PER-STUDENT EMAIL
    async markBulkAttendance(req, res) {
        try {
            const { classroom_id, day, attendance } = req.body;
            const teacherId = req.user?.user_id;
            
            const attendance_date = toMySQLDate(req.body.attendance_date);
            const week_start = toMySQLDate(req.body.week_start);
            const week_end = toMySQLDate(req.body.week_end);
            
            if (!classroom_id || !attendance || !Array.isArray(attendance) || attendance.length === 0 || !attendance_date) {
                return res.status(400).json({ success: false, error: 'Missing parameters' });
            }
            
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const verifyQuery = `SELECT c.classroom_id FROM classrooms c LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE c.classroom_id = ? AND (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?))`;
            const verifyResult = await db.query(verifyQuery, [classroom_id, teacherId, teacherId, teacherName]);
            if (verifyResult.length === 0) return res.status(403).json({ success: false, error: 'You are not assigned to this class' });
            
            const classInfo = await db.query('SELECT subject_name, class_name FROM classrooms WHERE classroom_id = ?', [classroom_id]);
            const subjectName = classInfo[0]?.subject_name || 'Class';
            const className = [classInfo[0]?.class_name, classInfo[0]?.subject_name]
    .filter(Boolean).join(' - ') || 'Class';
            
            const emailService = require('../services/emailService');
            let markedCount = 0;
            let emailSentCount = 0;
            
            for (const item of attendance) {
                const { student_id, status } = item;
                if (!student_id || !status || !['present', 'absent', 'late'].includes(status)) continue;
                
                const checkResult = await db.query(`SELECT attendance_id FROM attendance WHERE classroom_id = ? AND student_id = ? AND attendance_date = ?`, [classroom_id, student_id, attendance_date]);
                if (checkResult.length > 0) {
                    await db.query(`UPDATE attendance SET status = ?, marked_by = ?, marked_at = CURRENT_TIMESTAMP WHERE attendance_id = ?`, [status, teacherId, checkResult[0].attendance_id]);
                } else {
                    await db.query(`INSERT INTO attendance (classroom_id, student_id, attendance_date, status, marked_by) VALUES (?, ?, ?, ?, ?)`, [classroom_id, student_id, attendance_date, status, teacherId]);
                }
                markedCount++;
                
                try {
                    const studentInfo = await db.query('SELECT email, full_name FROM users WHERE user_id = ?', [student_id]);
                    if (studentInfo.length > 0 && studentInfo[0].email) {
                        const st = studentInfo[0];
                        const statusUpper = status.toUpperCase();
                        const statusEmoji = status === 'present' ? '✅' : status === 'absent' ? '❌' : '⏰';
                        const statusColor = status === 'present' ? '#10B981' : status === 'absent' ? '#EF4444' : '#F59E0B';
                        
                        const emailHtml = `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                                <div style="background: linear-gradient(135deg, #065F46, #047857); padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
                                    <h1 style="color: #fff; margin: 0; font-size: 22px;">📚 Smart Desk</h1>
                                    <p style="color: #D1FAE5; margin: 6px 0 0 0;">Attendance Notification</p>
                                </div>
                                <div style="background: #F9FAFB; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #E5E7EB;">
                                    <p style="color: #374151; font-size: 15px;">Dear <b>${st.full_name}</b>,</p>
                                    <p style="color: #374151; font-size: 14px;">Your attendance for <b>${subjectName}</b>${className ? ` (${className})` : ''} has been marked by <b>${teacherName}</b>.</p>
                                    <div style="background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 10px; padding: 16px; margin: 16px 0; text-align: center;">
                                        <p style="margin: 0 0 6px 0; color: #6B7280; font-size: 12px;">STATUS</p>
                                        <p style="margin: 0; font-size: 24px; font-weight: bold; color: ${statusColor};">${statusEmoji} ${statusUpper}</p>
                                        <p style="margin: 10px 0 0 0; color: #6B7280; font-size: 13px;">📅 Date: ${attendance_date}</p>
                                    </div>
                                    <p style="color: #6B7280; font-size: 12px;">${status === 'absent' ? '⚠️ You were marked absent. Please contact your teacher if this is incorrect.' : status === 'late' ? '⏰ You were marked late. Please be on time next class.' : '✅ Great! Keep up the good attendance.'}</p>
                                    <p style="color: #9CA3AF; font-size: 11px; margin-top: 20px;">Sent via Smart Desk</p>
                                </div>
                            </div>
                        `;
                        
                        const emailResult = await emailService.sendEmail({
                            to: st.email,
                            subject: `${statusEmoji} Attendance Marked: ${subjectName} (${attendance_date})`,
                            html: emailHtml,
                            text: `Dear ${st.full_name}, your attendance for ${subjectName} on ${attendance_date} has been marked as ${statusUpper} by ${teacherName}.`
                        });
                        if (emailResult.success) emailSentCount++;
                    }
                } catch (emailErr) {
                    console.error('⚠️ Attendance email error:', emailErr.message);
                }
                               //      NEW: STUDENT PORTAL NOTIFICATION (email ke saath)
                try {
                    const stInfo = await db.query('SELECT full_name FROM users WHERE user_id = ?', [student_id]);
                    const stName = stInfo[0]?.full_name || 'Student';
                    const statusEmoji2 = status === 'present' ? '✅' : status === 'absent' ? '❌' : '⏰';
                    const statusLine2 = status === 'absent'
                        ? '⚠️ You were marked absent. Please contact your teacher if this is incorrect.'
                        : status === 'late'
                        ? '⏰ You were marked late. Please be on time next class.'
                        : '✅ Great! Keep up the good attendance.';

                    await db.query(`
                        INSERT INTO notifications (
                            sender_id, sender_role, receiver_id, receiver_role,
                            notification_type, title, message, is_pushed, is_email_sent
                        ) VALUES (?, 'Teacher', ?, 'Student', 'Announcement', ?, ?, FALSE, TRUE)
                    `, [
                        teacherId,
                        student_id,
                        `${statusEmoji2} Attendance Marked: ${subjectName} (${attendance_date})`,
                        `Dear ${stName},\n\nYour attendance for ${subjectName}${className ? ` (${className})` : ''} has been marked by ${teacherName}.\n\n📊 Status: ${status.toUpperCase()}\n📅 Date: ${attendance_date}\n\n${statusLine2}\n\nSent via Smart Desk`
                    ]);
                } catch (notifErr) {
                    console.error('⚠️ Attendance notification error:', notifErr.message);
                }

                // ✅ PUSH NOTIFICATION TO STUDENT (email ke saath)
                try {
                    const stToken = await db.query('SELECT push_token, full_name FROM users WHERE user_id = ?', [student_id]);
                    if (stToken.length > 0 && stToken[0].push_token) {
                        const pushEmoji = status === 'present' ? '✅' : status === 'absent' ? '❌' : '⏰';
                        const pushResult = await pushService.sendAnnouncementPush({
                            pushToken: stToken[0].push_token,
                            title: `${pushEmoji} Attendance Marked: ${subjectName}`,
                            message: `Your attendance for ${subjectName} on ${attendance_date} has been marked as ${status.toUpperCase()} by ${teacherName}.`,
                            announcementId: null
                        });
                        if (pushResult && pushResult.success) {
                            console.log(`📱✅ Attendance push sent to ${stToken[0].full_name}`);
                        } else {
                            console.log(`📱❌ Push failed for ${student_id}:`, pushResult && pushResult.error);
                        }
                    } else {
                        console.log(`📱⚠️ No push token for student ${student_id}`);
                    }
                } catch (pushErr) {
                    console.error('⚠️ Attendance push error:', pushErr.message);
                }
            }
            
            console.log(`✅ Attendance saved: ${markedCount} students on ${attendance_date} | 📧 Emails sent: ${emailSentCount}`);
            
            res.json({ 
                success: true, 
                message: `Attendance marked for ${markedCount} students`, 
                markedCount, 
                emailSentCount,
                attendance_date, 
                week_start: week_start || null, 
                week_end: week_end || null, 
                day: day || null 
            });
        } catch (error) { 
            console.error('❌ Bulk attendance error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message }); 
        }
    }

    // 8. GET ATTENDANCE RECORDS
    async getAttendanceRecords(req, res) {
        try {
            const { classroom_id } = req.params;
            const start_date = toMySQLDate(req.query.start_date);
            const end_date = toMySQLDate(req.query.end_date);
            const teacherId = req.user?.user_id;
            if (!classroom_id) return res.status(400).json({ success: false, error: 'Classroom ID is required' });
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const verifyQuery = `SELECT c.classroom_id FROM classrooms c LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE c.classroom_id = ? AND (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?))`;
            const verifyResult = await db.query(verifyQuery, [classroom_id, teacherId, teacherId, teacherName]);
            if (verifyResult.length === 0) return res.status(403).json({ success: false, error: 'You are not assigned to this class' });
            let dateCondition = ''; const params = [classroom_id];
            if (start_date && end_date) { dateCondition = 'AND a.attendance_date BETWEEN ? AND ?'; params.push(start_date, end_date); }
            else { dateCondition = 'AND a.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)'; }
            const query = `SELECT a.attendance_id AS id, u.full_name AS studentName, u.roll_no AS rollNo, a.status, a.attendance_date AS date, DATE_FORMAT(a.attendance_date, '%b %d, %Y') AS formattedDate, DAYNAME(a.attendance_date) AS day, a.marked_at, tu.full_name AS markedBy FROM attendance a JOIN users u ON (a.student_id = u.user_id OR a.student_id = (SELECT st.student_id FROM students st WHERE st.user_id = u.user_id LIMIT 1)) LEFT JOIN teachers t ON a.marked_by = t.teacher_id LEFT JOIN users tu ON tu.user_id = COALESCE(t.user_id, a.marked_by) WHERE a.classroom_id = ? ${dateCondition} ORDER BY a.attendance_date DESC, u.full_name ASC`;
            const results = await db.query(query, params);
            const summary = { total: results.length, present: results.filter(r => r.status === 'present').length, absent: results.filter(r => r.status === 'absent').length, late: results.filter(r => r.status === 'late').length, unmarked: 0 };
            res.json({ success: true, records: results, summary, count: results.length });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 9. GET ATTENDANCE SUMMARY
    async getAttendanceSummary(req, res) {
        try {
            const teacherId = req.user?.user_id;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const query = `SELECT c.classroom_id AS id, c.subject_name AS subject, COALESCE(c.semester, sem.semester_code, '') AS semester, c.section, COUNT(DISTINCT e.student_id) AS totalStudents, COALESCE((SELECT COUNT(*) FROM attendance WHERE classroom_id = c.classroom_id AND attendance_date = CURDATE()), 0) AS todayMarked, (SELECT COUNT(*) FROM attendance WHERE classroom_id = c.classroom_id AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) AS weeklyTotal FROM classrooms c LEFT JOIN semesters sem ON c.semester_id = sem.semester_id LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id LEFT JOIN enrollments e ON c.classroom_id = e.classroom_id AND e.status = 'Active' WHERE (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?)) AND c.is_active = TRUE GROUP BY c.classroom_id`;
            const results = await db.query(query, [teacherId, teacherId, teacherName]);
            let totalStudents = 0, totalTodayMarked = 0, totalWeeklyClasses = 0;
            results.forEach(r => { totalStudents += r.totalStudents || 0; totalTodayMarked += r.todayMarked || 0; totalWeeklyClasses += r.weeklyTotal || 0; });
            res.json({ success: true, classes: results, overall: { totalClasses: results.length, totalStudents, todayMarked: totalTodayMarked, weeklyClasses: totalWeeklyClasses, averageAttendance: totalStudents > 0 ? Math.round((totalTodayMarked / totalStudents) * 100) : 0 } });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }
    // 10. MARK SINGLE ATTENDANCE
        // 10. MARK SINGLE ATTENDANCE - ✅ NEW: Portal notification bhi
    async markAttendance(req, res) {
        try {
            const { classroom_id, student_id, status } = req.body;
            const teacherId = req.user?.user_id;
            if (!teacherId || !classroom_id || !student_id || !status) return res.status(400).json({ success: false, error: 'Missing parameters' });

            const today = toMySQLDate(new Date().toISOString().slice(0, 10));
            const existing = await db.query(`SELECT * FROM attendance WHERE classroom_id = ? AND student_id = ? AND attendance_date = CURDATE()`, [classroom_id, student_id]);
            if (existing.length > 0) {
                await db.query(`UPDATE attendance SET status = ?, marked_by = ? WHERE classroom_id = ? AND student_id = ? AND attendance_date = CURDATE()`, [status, teacherId, classroom_id, student_id]);
            } else {
                await db.query(`INSERT INTO attendance (classroom_id, student_id, attendance_date, status, marked_by) VALUES (?, ?, CURDATE(), ?, ?)`, [classroom_id, student_id, status, teacherId]);
            }

            //  NEW: Student PORTAL notification
            try {
                const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
                const teacherName = nameResult[0]?.full_name || 'Teacher';
                const classInfo = await db.query('SELECT subject_name, class_name FROM classrooms WHERE classroom_id = ?', [classroom_id]);
                const subjectName = classInfo[0]?.subject_name || 'Class';
                const className = [classInfo[0]?.class_name, classInfo[0]?.subject_name]
    .filter(Boolean).join(' - ') || 'Class';
                const studentInfo = await db.query('SELECT full_name FROM users WHERE user_id = ?', [student_id]);
                const studentName = studentInfo[0]?.full_name || 'Student';
                const statusEmoji = status === 'present' ? '✅' : status === 'absent' ? '❌' : '⏰';

                await db.query(`
                    INSERT INTO notifications (
                        sender_id, sender_role, receiver_id, receiver_role,
                        notification_type, title, message, is_pushed, is_email_sent
                    ) VALUES (?, 'Teacher', ?, 'Student', 'Announcement', ?, ?, FALSE, FALSE)
                `, [
                    teacherId,
                    student_id,
                    `${statusEmoji} Attendance Marked: ${subjectName} (${today})`,
                    `Dear ${studentName},\n\nYour attendance for ${subjectName}${className ? ` (${className})` : ''} has been marked by ${teacherName}.\n\n📊 Status: ${status.toUpperCase()}\n📅 Date: ${today}\n\nSent via Smart Desk`
                ]);
            } catch (notifErr) {
                console.error('⚠️ Attendance notification error:', notifErr.message);
            }

            res.json({ success: true, message: existing.length > 0 ? 'Attendance updated' : 'Attendance marked' });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 11. GET STUDENTS FOR ATTENDANCE
    async getStudentsForAttendance(req, res) {
        try {
            const { classroom_id } = req.params;
            const teacherId = req.user?.user_id;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const verifyQuery = `SELECT c.classroom_id FROM classrooms c LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE c.classroom_id = ? AND (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?))`;
            const verify = await db.query(verifyQuery, [classroom_id, teacherId, teacherId, teacherName]);
            if (verify.length === 0) return res.status(403).json({ success: false, error: 'You are not assigned to this class' });
            const query = `SELECT u.user_id AS student_id, u.full_name, u.roll_no, COALESCE((SELECT status FROM attendance WHERE student_id = u.user_id AND classroom_id = ? AND attendance_date = CURDATE()), 'Not Marked') AS attendance_status FROM enrollments e JOIN users u ON (e.student_id = u.user_id OR e.student_id = (SELECT st.student_id FROM students st WHERE st.user_id = u.user_id LIMIT 1)) WHERE e.classroom_id = ? AND e.status = 'Active' ORDER BY u.full_name ASC`;
            const results = await db.query(query, [classroom_id, classroom_id]);
            res.json({ success: true, students: results, count: results.length });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    //  GET ACTIVE COORDINATORS
    async getCoordinatorsList(req, res) {
        try {
            const results = await db.query(`SELECT user_id, full_name, email FROM users WHERE user_role = 'Coordinator' AND status = 'Active' ORDER BY full_name ASC`);
            res.json({ success: true, coordinators: results, count: results.length });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // 12. GET TEACHER PROFILE
    async getProfile(req, res) {
        try {
            const teacherId = req.user?.user_id;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });
            const query = `SELECT u.user_id, u.email, u.full_name, u.user_role, u.institute_name, u.status, u.created_at, t.specialization, t.qualification, t.experience, t.joining_date FROM users u LEFT JOIN teachers t ON u.user_id = t.user_id WHERE u.user_id = ?`;
            const results = await db.query(query, [teacherId]);
            if (results.length === 0) return res.status(404).json({ success: false, error: 'Teacher not found' });
            res.json({ success: true, teacher: results[0] });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 13. GET NOTIFICATIONS - ✅ TARGETED FIX
    async getNotifications(req, res) {
        try {
            const teacherId = req.user?.user_id;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });
            //  FIXED: Sirf is teacher ki targeted + broadcasts
            const query = `SELECT notification_id, title, message, notification_type, is_read, created_at, sender_role FROM notifications WHERE (receiver_id = ? OR (receiver_id IS NULL AND (receiver_role = 'All' OR receiver_role = 'Teacher'))) ORDER BY created_at DESC LIMIT 20`;
            const results = await db.query(query, [teacherId]);
            res.json({ success: true, notifications: results, unreadCount: results.filter(r => !r.is_read).length });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 14. SEND NOTIFICATION
        // 14. SEND NOTIFICATION - ✅ FIXED: Targeted Delivery
    async sendNotification(req, res) {
        try {
            //  receiver_id ko req.body se extract karo
            const { title, message, receiver_role, receiver_id, notification_type } = req.body;
            const teacherId = req.user?.user_id;
            
            if (!teacherId || !title || !message) return res.status(400).json({ success: false, error: 'Missing parameters' });
            
            //  Agar specific user ka ID hai toh usay save karo, warna NULL (broadcast for all)
            const finalReceiverId = receiver_id || null;
            
            const query = `INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role, notification_type, title, message, is_pushed) VALUES (?, 'Teacher', ?, ?, ?, ?, ?, FALSE)`;
            const result = await db.query(query, [teacherId, finalReceiverId, receiver_role || 'Student', notification_type || 'Announcement', title, message]);
            
            res.json({ success: true, message: 'Notification sent!', notification_id: result.insertId });
        } catch (error) { 
            res.status(500).json({ success: false, error: 'Server error: ' + error.message }); 
        }
    }
    // 15. GENERATE ACADEMIC REPORT
    async generateReport(req, res) {
        try {
            const { classroom_id, student_id } = req.body;
            const teacherId = req.user?.user_id;
            if (!teacherId || !classroom_id || !student_id) return res.status(400).json({ success: false, error: 'Missing parameters' });
            const marks = await db.query(`SELECT assessment_type, assessment_title, marks_obtained, total_marks, ROUND((marks_obtained / total_marks) * 100, 2) AS percentage, grade FROM marks WHERE classroom_id = ? AND student_id = ? ORDER BY created_at DESC`, [classroom_id, student_id]);
            const attendance = await db.query(`SELECT attendance_date, status FROM attendance WHERE classroom_id = ? AND student_id = ? ORDER BY attendance_date DESC LIMIT 30`, [classroom_id, student_id]);
            const studentInfo = await db.query(`SELECT u.full_name, u.roll_no FROM students s JOIN users u ON s.user_id = u.user_id WHERE s.student_id = ?`, [student_id]);
            let present = 0; attendance.forEach(a => { if (a.status === 'present' || a.status === 'Present') present++; });
            const attendancePercentage = attendance.length > 0 ? Math.round((present / attendance.length) * 100) : 0;
            let totalObtained = 0, totalPossible = 0; marks.forEach(m => { totalObtained += m.marks_obtained || 0; totalPossible += m.total_marks || 0; });
            const overallPercentage = totalPossible > 0 ? Math.round((totalObtained / totalPossible) * 100) : 0;
            res.json({ success: true, report: { student: studentInfo[0] || null, marks, attendance, attendancePercentage, overallPercentage, totalMarks: totalObtained, totalPossible } });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 16. GET ASSIGNED CLASSES FOR PERFORMANCE
    async getAssignedClassesForPerformance(req, res) {
        try {
            const teacherId = req.user?.user_id;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const query = `SELECT c.classroom_id AS id, c.class_name AS name, '${req.query.type || 'class'}' AS type, c.subject_name AS subject, c.section, COALESCE(c.semester, sem.semester_code, '') AS semester, COUNT(DISTINCT e.student_id) AS totalStudents, MAX(p.created_at) AS lastPerformanceDate FROM classrooms c LEFT JOIN semesters sem ON c.semester_id = sem.semester_id LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id LEFT JOIN enrollments e ON c.classroom_id = e.classroom_id AND e.status = 'Active' LEFT JOIN performance_reports p ON c.classroom_id = p.classroom_id WHERE (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?)) AND c.is_active = TRUE GROUP BY c.classroom_id ORDER BY c.class_name ASC`;
            const results = await db.query(query, [teacherId, teacherId, teacherName]);

            const type = (req.query.type || 'class').toString();
            const filteredResults = results.filter(row => {
                const sem = (row.semester || '').toString().trim();
                return type === 'class' ? sem === '' : sem !== '';
            });

            const classes = filteredResults.map(row => ({ id: row.id?.toString(), name: row.name || row.subject || 'Class', type: row.type || 'class', subject: row.subject || 'Class', section: row.section || '', semester: row.semester || '', totalStudents: row.totalStudents || 0, lastPerformanceDate: row.lastPerformanceDate ? new Date(row.lastPerformanceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null }));
            res.json({ success: true, classes, count: classes.length });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 17. GET CLASS STUDENTS PERFORMANCE
    async getClassStudentsPerformance(req, res) {
        try {
            const { class_id } = req.params;
            const teacherId = req.user?.user_id;
            if (!class_id) return res.status(400).json({ success: false, error: 'Class ID is required' });
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const verifyQuery = `SELECT c.classroom_id FROM classrooms c LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE c.classroom_id = ? AND (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?))`;
            const verifyResult = await db.query(verifyQuery, [class_id, teacherId, teacherId, teacherName]);
            if (verifyResult.length === 0) return res.status(403).json({ success: false, error: 'You are not assigned to this class' });
            const classResult = await db.query(`SELECT c.classroom_id AS id, c.class_name AS name, c.subject_name AS subject, c.section, COALESCE(c.semester, sem.semester_code, '') AS semester, c.department_name AS department FROM classrooms c LEFT JOIN semesters sem ON c.semester_id = sem.semester_id WHERE c.classroom_id = ?`, [class_id]);
            const studentsQuery = `SELECT u.user_id AS id, u.full_name AS name, u.roll_no AS rollNo, u.email, COALESCE((SELECT ROUND(AVG(CASE WHEN status = 'present' THEN 1 ELSE 0 END) * 100) FROM attendance WHERE student_id = u.user_id AND classroom_id = ? AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)), 0) AS attendance, COALESCE((SELECT grade FROM marks WHERE student_id = u.user_id AND classroom_id = ? ORDER BY created_at DESC LIMIT 1), 'N/A') AS overallGrade FROM enrollments e JOIN users u ON (e.student_id = u.user_id OR e.student_id = (SELECT st.student_id FROM students st WHERE st.user_id = u.user_id LIMIT 1)) WHERE e.classroom_id = ? AND e.status = 'Active' ORDER BY u.full_name ASC`;
            const students = await db.query(studentsQuery, [class_id, class_id, class_id]);
            const formattedStudents = students.map(s => ({ id: s.id?.toString(), name: s.name || 'Unknown', rollNo: s.rollNo || 'N/A', attendance: s.attendance || 0, midTermMarks: '0/50', quizMarks: '0/20', assignmentMarks: '0/30', overallGrade: s.overallGrade || 'N/A', status: s.attendance >= 90 ? 'excellent' : s.attendance >= 75 ? 'good' : s.attendance >= 60 ? 'average' : 'needs-improvement' }));
            res.json({ success: true, classInfo: classResult[0] || null, students: formattedStudents, count: formattedStudents.length });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 18. SAVE CLASS PERFORMANCE REPORT
    async saveClassPerformanceReport(req, res) {
        try {
            const { class_id, teacher_remarks, access_granted } = req.body;
            const teacherId = req.user?.user_id;
            if (!class_id || !teacher_remarks) return res.status(400).json({ success: false, error: 'Missing parameters' });
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const verifyQuery = `SELECT c.classroom_id FROM classrooms c LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE c.classroom_id = ? AND (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?))`;
            const verifyResult = await db.query(verifyQuery, [class_id, teacherId, teacherId, teacherName]);
            if (verifyResult.length === 0) return res.status(403).json({ success: false, error: 'You are not assigned to this class' });
            const existing = await db.query(`SELECT report_id FROM performance_reports WHERE classroom_id = ?`, [class_id]);
            let result;
            if (existing.length > 0) result = await db.query(`UPDATE performance_reports SET teacher_remarks = ?, access_granted = ?, updated_at = CURRENT_TIMESTAMP WHERE classroom_id = ?`, [teacher_remarks.trim(), access_granted || false, class_id]);
            else result = await db.query(`INSERT INTO performance_reports (classroom_id, average_grade, pass_rate, top_performer, teacher_remarks, access_granted) VALUES (?, 'N/A', 'N/A', 'N/A', ?, ?)`, [class_id, teacher_remarks.trim(), access_granted || false]);
            res.json({ success: true, message: 'Performance report saved!', report_id: existing.length > 0 ? existing[0].report_id : result.insertId });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 19. GET CLASS PERFORMANCE REPORT
    async getClassPerformanceReport(req, res) {
        try {
            const { class_id } = req.params;
            const teacherId = req.user?.user_id;
            if (!class_id) return res.status(400).json({ success: false, error: 'Class ID is required' });
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const verifyQuery = `SELECT c.classroom_id FROM classrooms c LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE c.classroom_id = ? AND (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?))`;
            const verifyResult = await db.query(verifyQuery, [class_id, teacherId, teacherId, teacherName]);
            if (verifyResult.length === 0) return res.status(403).json({ success: false, error: 'You are not assigned to this class' });
            const results = await db.query(`SELECT pr.report_id AS id, pr.average_grade AS averageGrade, pr.pass_rate AS passRate, pr.top_performer AS topPerformer, pr.teacher_remarks AS teacherRemarks, pr.access_granted AS accessGranted, pr.created_at AS createdAt, pr.updated_at AS updatedAt, c.class_name AS className, c.subject_name AS subject, COALESCE(c.semester, sem.semester_code, '') AS semester, c.section FROM performance_reports pr JOIN classrooms c ON pr.classroom_id = c.classroom_id LEFT JOIN semesters sem ON c.semester_id = sem.semester_id WHERE pr.classroom_id = ?`, [class_id]);
            if (results.length === 0) return res.status(404).json({ success: false, error: 'Performance report not found' });
            const report = results[0];
            res.json({ success: true, report: { id: report.id?.toString(), className: report.className || 'Class', subject: report.subject || 'Class', semester: report.semester || '', section: report.section || '', averageGrade: report.averageGrade || 'N/A', passRate: report.passRate || 'N/A', topPerformer: report.topPerformer || 'N/A', teacherRemarks: report.teacherRemarks || 'No remarks available', accessGranted: report.accessGranted === 1, createdAt: report.createdAt ? new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A', updatedAt: report.updatedAt ? new Date(report.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A' } });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 20. DOWNLOAD CLASS PERFORMANCE REPORT
    async downloadClassPerformanceReport(req, res) {
        try {
            const { class_id } = req.params;
            const { format } = req.query;
            const teacherId = req.user?.user_id;
            if (!class_id) return res.status(400).json({ success: false, error: 'Class ID is required' });
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const verifyQuery = `SELECT c.classroom_id FROM classrooms c LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE c.classroom_id = ? AND (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?))`;
            const verifyResult = await db.query(verifyQuery, [class_id, teacherId, teacherId, teacherName]);
            if (verifyResult.length === 0) return res.status(403).json({ success: false, error: 'You are not assigned to this class' });
            const reportResult = await db.query(`SELECT pr.report_id AS id, pr.average_grade AS averageGrade, pr.pass_rate AS passRate, pr.top_performer AS topPerformer, pr.teacher_remarks AS teacherRemarks, c.class_name AS className, c.subject_name AS subject, COALESCE(c.semester, sem.semester_code, '') AS semester, c.section, c.department_name AS department FROM performance_reports pr JOIN classrooms c ON pr.classroom_id = c.classroom_id LEFT JOIN semesters sem ON c.semester_id = sem.semester_id WHERE pr.classroom_id = ?`, [class_id]);
            if (reportResult.length === 0) return res.status(404).json({ success: false, error: 'Performance report not found' });
            const report = reportResult[0];
            const students = await db.query(`SELECT u.full_name AS name, u.roll_no AS rollNo, ROUND(AVG(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) * 100) AS attendance, COALESCE((SELECT grade FROM marks WHERE student_id = u.user_id AND classroom_id = ? ORDER BY created_at DESC LIMIT 1), 'N/A') AS grade FROM enrollments e JOIN users u ON (e.student_id = u.user_id OR e.student_id = (SELECT st.student_id FROM students st WHERE st.user_id = u.user_id LIMIT 1)) LEFT JOIN attendance a ON u.user_id = a.student_id AND a.classroom_id = e.classroom_id WHERE e.classroom_id = ? AND e.status = 'Active' GROUP BY u.user_id, u.full_name, u.roll_no ORDER BY u.full_name ASC`, [class_id, class_id]);
            if (format === 'pdf') return this.generatePerformancePDF(report, students, res);
            else if (format === 'excel') return this.generatePerformanceExcel(report, students, res);
            else return res.status(400).json({ success: false, error: 'Invalid format' });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 21. GENERATE PERFORMANCE PDF
    generatePerformancePDF(report, students, res) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50 });
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="Class_Performance_Report_${Date.now()}.pdf"`);
                doc.pipe(res);
                doc.fontSize(24).fillColor('#065F46').text('Class Performance Report', { align: 'center' }).moveDown(0.5);
                doc.fontSize(16).fillColor('#0F172A').text(`${report.subject} - ${report.className}`, { align: 'center' });
                doc.fontSize(12).fillColor('#64748B').text(`Generated: ${new Date().toISOString().split('T')[0]}`, { align: 'center' }).moveDown(1);
                doc.fontSize(14).fillColor('#065F46').text('Report Summary', { underline: true }).moveDown(0.5);
                doc.fontSize(12).fillColor('#374151');
                [['Class', report.className], ['Subject', report.subject], ['Semester', report.semester || 'N/A'], ['Average Grade', report.averageGrade || 'N/A'], ['Pass Rate', report.passRate || 'N/A']].forEach(([label, value]) => { doc.text(`${label}:`, { continued: true }).font('Helvetica-Bold').text(` ${value}`, { continued: false }).font('Helvetica').moveDown(0.3); });
                doc.moveDown(1).fontSize(14).fillColor('#065F46').text('Teacher Remarks', { underline: true }).moveDown(0.5);
                doc.fontSize(12).fillColor('#374151').text(report.teacherRemarks || 'No remarks available.', { width: 500 });
                doc.moveDown(2).fontSize(10).fillColor('#94A3B8').text('Generated by Smart Desk', { align: 'center' });
                doc.end(); resolve();
            } catch (error) { reject(error); }
        });
    }

    // 22. GENERATE PERFORMANCE EXCEL
    generatePerformanceExcel(report, students, res) {
        try {
            const wb = XLSX.utils.book_new();
            const summaryData = [{ 'Class': report.className, 'Subject': report.subject, 'Semester': report.semester || 'N/A', 'Average Grade': report.averageGrade || 'N/A', 'Pass Rate': report.passRate || 'N/A' }];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary');
            const studentsData = students.map(s => ({ 'Student Name': s.name || 'N/A', 'Roll Number': s.rollNo || 'N/A', 'Attendance': `${s.attendance || 0}%`, 'Grade': s.grade || 'N/A' }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(studentsData), 'Students');
            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="Performance_Report_${Date.now()}.xlsx"`);
            return res.send(buffer);
        } catch (error) { console.error('Excel generation error:', error); throw error; }
    }

    // 23. GET TEACHER NOTIFICATIONS - TARGETED FIX
        // 23. GET TEACHER NOTIFICATIONS - FIXED: Proper Tab Filtering
    async getTeacherNotifications(req, res) {
        try {
            const teacherId = req.user?.user_id;
            const { filter = 'all', page = 1, limit = 20 } = req.query;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });

            let query = `SELECT n.notification_id AS id, n.title AS subject, n.message, n.attachment_url AS attachmentUrl, n.notification_type AS notifType, n.is_read, n.created_at AS date, u.full_name AS from_name, u.user_role AS from_role, (SELECT COUNT(*) FROM notification_responses WHERE notification_id = n.notification_id) AS response_count FROM notifications n LEFT JOIN users u ON n.sender_id = u.user_id WHERE (n.receiver_id = ? OR (n.receiver_id IS NULL AND (n.receiver_role = 'Teacher' OR n.receiver_role = 'All')))`;
            const params = [teacherId];

            //  FIXED: Tab-wise sahi filtering
            if (filter === 'admin') {
                query += ` AND LOWER(u.user_role) = 'admin'`;
            } else if (filter === 'coordinator') {
                query += ` AND LOWER(u.user_role) = 'coordinator'`;
            } else if (filter === 'replies' || filter === 'student') {
                query += ` AND n.notification_type IN ('Reply', 'Response')`;
            }

            query += ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`;
            params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
            const notifications = await db.query(query, params);

            // Count query bhi same filter ke sath
            let countQuery = `SELECT COUNT(*) AS total FROM notifications n LEFT JOIN users u ON n.sender_id = u.user_id WHERE (n.receiver_id = ? OR (n.receiver_id IS NULL AND (n.receiver_role = 'Teacher' OR n.receiver_role = 'All')))`;
            const countParams = [teacherId];
            if (filter === 'admin') { countQuery += ` AND LOWER(u.user_role) = 'admin'`; }
            else if (filter === 'coordinator') { countQuery += ` AND LOWER(u.user_role) = 'coordinator'`; }
            else if (filter === 'replies' || filter === 'student') { countQuery += ` AND n.notification_type IN ('Reply', 'Response')`; }
            const countResult = await db.query(countQuery, countParams);

            const formattedNotifications = notifications.map(n => ({ id: String(n.id), from: n.from_name || 'System', fromRole: n.from_role || 'System', subject: n.subject || 'No Subject', message: n.message || '', attachmentUrl: n.attachmentUrl || null, hasAttachment: !!n.attachmentUrl, date: new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), read: n.is_read === 1, hasResponse: n.response_count > 0, responseCount: n.response_count || 0 }));
            res.json({ success: true, notifications: formattedNotifications, pagination: { currentPage: parseInt(page), totalItems: countResult[0]?.total || 0, totalPages: Math.ceil((countResult[0]?.total || 0) / limit) } });
        } catch (error) { res.status(500).json({ success: false, error: 'Failed to load notifications: ' + error.message }); }
    }
    // 24. GET SINGLE NOTIFICATION BY ID -  TARGETED FIX
    async getTeacherNotificationById(req, res) {
        try {
            const { id } = req.params;
            const teacherId = req.user?.user_id;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });
            //  FIXED: Targeted
            const query = `SELECT n.notification_id AS id, n.title AS subject, n.message, n.attachment_url AS attachmentUrl, n.is_read, n.created_at AS date, u.full_name AS from_name, u.user_role AS from_role, (SELECT COUNT(*) FROM notification_responses WHERE notification_id = n.notification_id) AS response_count FROM notifications n LEFT JOIN users u ON n.sender_id = u.user_id WHERE n.notification_id = ? AND (n.receiver_id = ? OR (n.receiver_id IS NULL AND (n.receiver_role = 'Teacher' OR n.receiver_role = 'All')))`;
            const results = await db.query(query, [id, teacherId]);
            if (results.length === 0) return res.status(404).json({ success: false, error: 'Notification not found' });
            const n = results[0];
            res.json({ success: true, notification: { id: String(n.id), from: n.from_name || 'System', fromRole: n.from_role || 'System', subject: n.subject || 'No Subject', message: n.message || '', attachmentUrl: n.attachmentUrl || null, hasAttachment: !!n.attachmentUrl, date: new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), read: n.is_read === 1, hasResponse: n.response_count > 0, responseCount: n.response_count || 0 } });
        } catch (error) { res.status(500).json({ success: false, error: 'Failed to load notification: ' + error.message }); }
    }

    // 25. MARK NOTIFICATION AS READ - TARGETED FIX
    async markTeacherNotificationRead(req, res) {
        try {
            const { id } = req.params;
            const teacherId = req.user?.user_id;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });
            //  FIXED: Targeted
            await db.query(`UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND (receiver_id = ? OR (receiver_id IS NULL AND (receiver_role = 'Teacher' OR receiver_role = 'All')))`, [id, teacherId]);
            res.json({ success: true, message: 'Notification marked as read' });
        } catch (error) { res.status(500).json({ success: false, error: 'Failed to mark as read: ' + error.message }); }
    }

    // 26. REPLY TO NOTIFICATION - ✅ TARGETED FIX
        //    REPLY TO NOTIFICATION - WITH FILE ATTACHMENT SUPPORT
    async replyToTeacherNotification(req, res) {
        try {
            const { notificationId, message } = req.body; // Frontend sends notificationId
            const teacherId = req.user?.user_id;
            const attachedFile = req.file; //    Multer se file

            if (!message && !attachedFile) {
                return res.status(400).json({ success: false, error: 'Message or attachment is required' });
            }

            // Ensure notification_replies table exists and has attachment_url
            const tableCheck = await db.query(
                "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'notification_replies'"
            );
            if (tableCheck[0]?.count === 0) {
                await db.query(`
                    CREATE TABLE notification_replies (
                        reply_id INT AUTO_INCREMENT PRIMARY KEY,
                        notification_id INT NOT NULL,
                        sender_id INT NOT NULL,
                        sender_role VARCHAR(50) NOT NULL,
                        message TEXT NOT NULL,
                        attachment_url TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_notification (notification_id),
                        INDEX idx_sender (sender_id)
                    )
                `);
            } else {
                try { await db.query(`ALTER TABLE notification_replies ADD COLUMN attachment_url TEXT`); } catch (e) {}
            }

            //    SAVE ATTACHMENT IF PRESENT
            let savedFileUrl = null;
            if (attachedFile) {
                try {

                    const uploadBase = process.env.VERCEL ? '/tmp' : path.join(__dirname, '..');
const uploadDir = path.join(uploadBase, 'uploads', 'attachments');
try {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
} catch (e) {
    console.warn('uploads dir warning:', e.message);
}
                    //const uploadDir = path.join(__dirname, '../uploads/attachments');
                    //if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
                    const safeOriginal = String(attachedFile.originalname).replace(/[^a-zA-Z0-9.\-]/g, '_');
                    const savedFileName = Date.now() + '-' + safeOriginal;
                    fs.writeFileSync(path.join(uploadDir, savedFileName), attachedFile.buffer);
                    savedFileUrl = `${req.protocol}://${req.get('host')}/uploads/attachments/${savedFileName}`;
                } catch (fileError) {
                    console.error('⚠️ Reply file save error:', fileError.message);
                }
            }

            //    INSERT REPLY WITH ATTACHMENT
            const replyQuery = `
                INSERT INTO notification_replies 
                (notification_id, sender_id, sender_role, message, attachment_url, created_at) 
                VALUES (?, ?, 'Teacher', ?, ?, NOW())
            `;
            const result = await db.query(replyQuery, [notificationId, teacherId, message || '📎 Attachment sent', savedFileUrl]);

            //    SEND RESPONSE NOTIFICATION BACK TO ORIGINAL SENDER
            let targetId = null;
            let targetRole = null;
            try {
                const orig = await db.query('SELECT sender_id, sender_role FROM notifications WHERE notification_id = ?', [notificationId]);
                if (orig.length > 0) {
                    targetId = orig[0].sender_id;
                    targetRole = orig[0].sender_role;
                }
            } catch (e) {}

            if (targetId) {
                let replyNotifId = null;
                try {
                    const replyNotifResult = await db.query(`
                        INSERT INTO notifications 
                        (sender_id, sender_role, receiver_id, receiver_role, notification_type, title, message, attachment_url, is_pushed, is_email_sent) 
                        VALUES (?, 'Teacher', ?, ?, 'Response', ?, ?, ?, FALSE, FALSE)
                    `, [
                        teacherId, targetId, targetRole, 
                        '💬 Reply from Teacher', 
                        message || '📎 Attachment sent', 
                        savedFileUrl
                    ]);
                    replyNotifId = replyNotifResult.insertId;
                } catch (notifError) {
                    console.error('⚠️ Reply notification error:', notifError);
                }

                // ✅ EMAIL TO ADMIN (original sender)
                try {
                    const adminInfo = await db.query('SELECT email, full_name, push_token FROM users WHERE user_id = ?', [targetId]);
                    if (adminInfo.length > 0 && adminInfo[0].email) {
                        const teacherNameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
                        const teacherName = teacherNameResult[0]?.full_name || 'Teacher';
                        
                        const emailPayload = {
                            to: adminInfo[0].email,
                            subject: `💬 Reply from ${teacherName}`,
                            html: `<h2>💬 New Reply Received</h2>
                                   <p><b>${teacherName}</b> has replied to your notification.</p>
                                   <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:16px 0;">
                                     <p><b>Message:</b></p>
                                     <p>${(message || '📎 Attachment sent').replace(/\n/g, '<br>')}</p>
                                   </div>
                                   ${savedFileUrl ? `<p>📎 <b>Attachment:</b> <a href="${savedFileUrl}" style="color:#3B82F6;">Download File</a></p>` : ''}
                                   <p style="color:#64748B;font-size:12px;">Sent via Smart Desk</p>`,
                            text: `${teacherName} replied: ${message || '📎 Attachment sent'}${savedFileUrl ? '\n\nAttachment: ' + savedFileUrl : ''}`
                        };
                        
                        // Attach file directly if buffer available
                        if (attachedFile) {
                            emailPayload.attachments = [{
                                filename: attachedFile.originalname,
                                content: attachedFile.buffer,
                                contentType: attachedFile.mimetype
                            }];
                        }
                        
                        await emailService.sendEmail(emailPayload);
                        console.log(`📧 Reply email sent to admin: ${adminInfo[0].email}`);
                        
                        if (replyNotifId) {
                            await db.query('UPDATE notifications SET is_email_sent = TRUE WHERE notification_id = ?', [replyNotifId]);
                        }
                    }
                } catch (emailErr) {
                    console.error('⚠️ Reply email error:', emailErr.message);
                }

                // ✅ PUSH NOTIFICATION TO ADMIN
                try {
                    const adminToken = await db.query('SELECT push_token, full_name FROM users WHERE user_id = ?', [targetId]);
                    if (adminToken.length > 0 && adminToken[0].push_token) {
                        const teacherNameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
                        const teacherName = teacherNameResult[0]?.full_name || 'Teacher';
                        
                        const pushResult = await pushService.sendAnnouncementPush({
                            pushToken: adminToken[0].push_token,
                            title: `💬 Reply from ${teacherName}`,
                            message: (message || '📎 Attachment sent').substring(0, 100) + (savedFileUrl ? ' 📎' : ''),
                            announcementId: replyNotifId
                        });
                        if (pushResult && pushResult.success) {
                            if (replyNotifId) {
                                await db.query('UPDATE notifications SET is_pushed = TRUE WHERE notification_id = ?', [replyNotifId]);
                            }
                            console.log(`📱 Reply push sent to admin: ${adminToken[0].full_name}`);
                        }
                    } else {
                        console.log(`📱⚠️ No push token for admin ${targetId}`);
                    }
                } catch (pushErr) {
                    console.error('⚠️ Reply push error:', pushErr.message);
                }
            }

            // Update original notification has_response flag
            try {
                await db.query('UPDATE notifications SET has_response = TRUE WHERE notification_id = ?', [notificationId]);
            } catch(e) {}

            res.json({
                success: true,
                message: 'Response sent successfully',
                reply_id: result.insertId,
                hasAttachment: !!attachedFile,
                attachmentUrl: savedFileUrl
            });
        } catch (error) {
            console.error('Reply error:', error);
            res.status(500).json({ success: false, error: error.message || 'Failed to send reply' });
        }
    }
    // 27. GET UNREAD NOTIFICATION COUNT - ✅ TARGETED FIX
    async getTeacherUnreadCount(req, res) {
        try {
            const teacherId = req.user?.user_id;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });
            //  FIXED: Targeted
            const rows = await db.query(`SELECT COUNT(*) AS unread_count FROM notifications WHERE (receiver_id = ? OR (receiver_id IS NULL AND (receiver_role = 'Teacher' OR receiver_role = 'All'))) AND is_read = FALSE`, [teacherId]);
            res.json({ success: true, unreadCount: rows[0]?.unread_count || 0 });
        } catch (error) { res.status(500).json({ success: false, error: 'Failed to get unread count: ' + error.message }); }
    }

    // 28. GET NOTIFICATION STATISTICS - ✅ TARGETED FIX
    async getTeacherNotificationStats(req, res) {
        try {
            const teacherId = req.user?.user_id;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });
            //  FIXED: Targeted
            const total = await db.query(`SELECT COUNT(*) AS total FROM notifications WHERE (receiver_id = ? OR (receiver_id IS NULL AND (receiver_role = 'Teacher' OR receiver_role = 'All')))`, [teacherId]);
            const unread = await db.query(`SELECT COUNT(*) AS unread FROM notifications WHERE (receiver_id = ? OR (receiver_id IS NULL AND (receiver_role = 'Teacher' OR receiver_role = 'All'))) AND is_read = FALSE`, [teacherId]);
            const byRole = await db.query(`SELECT u.user_role, COUNT(*) AS count FROM notifications n LEFT JOIN users u ON n.sender_id = u.user_id WHERE (n.receiver_id = ? OR (n.receiver_id IS NULL AND (n.receiver_role = 'Teacher' OR n.receiver_role = 'All'))) GROUP BY u.user_role`, [teacherId]);
            let replied = [{ replied: 0 }]; try { replied = await db.query(`SELECT COUNT(DISTINCT n.notification_id) AS replied FROM notifications n WHERE (n.receiver_id = ? OR (n.receiver_id IS NULL AND n.receiver_role = 'Teacher')) AND n.has_response = TRUE`, [teacherId]); } catch (e) {}
            let responses = [{ totalResponses: 0 }]; try { responses = await db.query(`SELECT COUNT(*) AS totalResponses FROM notification_responses WHERE sender_id = ? AND sender_role = 'Teacher'`, [teacherId]); } catch (e) {}
            const roleStats = {}; byRole.forEach(row => { roleStats[row.user_role || 'System'] = row.count; });
            res.json({ success: true, stats: { total: total[0]?.total || 0, unread: unread[0]?.unread || 0, replied: replied[0]?.replied || 0, totalResponses: responses[0]?.totalResponses || 0, byRole: roleStats } });
        } catch (error) { res.status(500).json({ success: false, error: 'Failed to get stats: ' + error.message }); }
    }

    // 29. SEND NOTIFICATION TO STUDENT/COORDINATOR
        // 29. SEND NOTIFICATION TO STUDENT/COORDINATOR - ✅ WITH FILE ATTACHMENT
    async sendTeacherNotification(req, res) {
        try {
            const teacherId = req.user?.user_id;
            const { recipientId, recipientType, subject, message, classId } = req.body;
            const attachedFile = req.file; // Multer se file 
            if (!teacherId || !recipientId || !recipientType || !subject || !message) return res.status(400).json({ success: false, error: 'Missing parameters' });
            if (!['student', 'coordinator'].includes(recipientType)) return res.status(400).json({ success: false, error: 'Invalid recipient type' });
            
            let recipientRole = recipientType.charAt(0).toUpperCase() + recipientType.slice(1);
            const recipientResult = await db.query(`SELECT user_id, full_name, email, user_role, status FROM users WHERE user_id = ? AND user_role = ?`, [recipientId, recipientRole]);
            if (recipientResult.length === 0) return res.status(404).json({ success: false, error: `Recipient not found` });
            const recipient = recipientResult[0];
            
            if (recipientType === 'student' && classId) {
                const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
                const teacherName = nameResult[0]?.full_name || '';
                const verifyStudentQuery = `SELECT e.enrollment_id FROM enrollments e JOIN classrooms c ON e.classroom_id = c.classroom_id LEFT JOIN classroom_teachers ct ON e.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE (e.student_id = ? OR e.student_id = (SELECT student_id FROM students WHERE user_id = ?)) AND e.classroom_id = ? AND (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?)) AND e.status = 'Active'`;
                const verifyResult = await db.query(verifyStudentQuery, [recipientId, recipientId, classId, teacherId, teacherId, teacherName]);
                if (verifyResult.length === 0) return res.status(403).json({ success: false, error: 'This student is not enrolled in your class' });
            }

            //  FILE SAVE LOGIC
            let savedFileUrl = null;
            if (attachedFile) {
                try {
                    const uploadDir = path.join(__dirname, '../uploads/attachments');
                    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
                    //  Space aur special characters ko underscore bana do (URL kabhi nahi tootega)
                    const safeOriginal = String(attachedFile.originalname).replace(/[^a-zA-Z0-9.\-]/g, '_');
                    const savedFileName = Date.now() + '-' + safeOriginal;
                    fs.writeFileSync(path.join(uploadDir, savedFileName), attachedFile.buffer);
                    savedFileUrl = `${req.protocol}://${req.get('host')}/uploads/attachments/${savedFileName}`;
                } catch (fileError) { console.error('⚠️ File save error:', fileError.message); }
            }

            //  UPDATED INSERT QUERY (attachment_url added)
            const result = await db.query(`INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role, notification_type, title, message, attachment_url, classroom_id, is_pushed, is_read, created_at) VALUES (?, 'Teacher', ?, ?, 'Announcement', ?, ?, ?, ?, FALSE, FALSE, NOW())`, [teacherId, recipientId, recipientRole, subject.trim(), message.trim(), savedFileUrl, classId || null]);
                        //  EMAIL WITH ATTACHMENT (Gmail par bhi jayegi)
            try {
                const teacherNameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
                const emailPayload = {
                    to: recipient.email,
                    subject: subject.trim(),
                    message: message.trim(),
                    senderName: teacherNameResult[0]?.full_name || 'Teacher'
                };
                if (attachedFile) {
                    emailPayload.attachments = [{
                        filename: attachedFile.originalname,
                        content: attachedFile.buffer,
                        contentType: attachedFile.mimetype
                    }];
                }
                await emailService.sendAnnouncementEmail(emailPayload);
                console.log('✅ Teacher notification email sent to:', recipient.email);
            } catch (emailErr) {
                console.error('⚠️ Teacher notification email error:', emailErr.message);
            }
                        // 📱 PUSH NOTIFICATION (OneSignal) - ✅ NEW
            try {
                const pushService = require('../services/pushService');
                const tokenResult = await db.query('SELECT push_token FROM users WHERE user_id = ?', [recipientId]);
                const pushToken = tokenResult[0]?.push_token;
                if (pushToken) {
                    const pushResult = await pushService.sendPushNotification({
                        pushToken,
                        title: `📢 ${subject.trim()}`,
                        message: message.trim().substring(0, 100),
                        data: { type: 'announcement', sender: 'Teacher', notificationId: result.insertId }
                    });
                    if (pushResult.success) {
                        await db.query('UPDATE notifications SET is_pushed = TRUE WHERE notification_id = ?', [result.insertId]);
                        console.log('✅ Teacher push sent to:', recipient.full_name);
                    }
                } else {
                    console.log('⚠️ Recipient ka push token nahi hai');
                }
            } catch (pushErr) {
                console.error('⚠️ Teacher push error:', pushErr.message);
            }
            res.json({ success: true, message: 'Notification sent!', notification_id: result.insertId, hasAttachment: !!attachedFile, attachmentUrl: savedFileUrl, recipient: { id: recipient.user_id, name: recipient.full_name, email: recipient.email, type: recipientType }, sent_at: new Date().toISOString() });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 30. SEND BULK NOTIFICATION
        // 30. SEND BULK NOTIFICATION -  WITH FILE ATTACHMENT
    async sendBulkTeacherNotification(req, res) {
        try {
            const teacherId = req.user?.user_id;
            const { classId, subject, message, sendPush = 'true' } = req.body;
            const attachedFile = req.file; //  Multer se file

            if (!teacherId || !classId || !subject || !message) return res.status(400).json({ success: false, error: 'Missing parameters' });
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const verifyQuery = `SELECT c.classroom_id FROM classrooms c LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE c.classroom_id = ? AND (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?))`;
            const verifyResult = await db.query(verifyQuery, [classId, teacherId, teacherId, teacherName]);
            if (verifyResult.length === 0) return res.status(403).json({ success: false, error: 'You are not assigned to this class' });
            let studentsToSend = await db.query(`SELECT u.user_id AS student_id, u.user_id, u.full_name, u.email FROM enrollments e JOIN users u ON (e.student_id = u.user_id OR e.student_id = (SELECT st.student_id FROM students st WHERE st.user_id = u.user_id LIMIT 1)) WHERE e.classroom_id = ? AND e.status = 'Active'`, [classId]);
            if (studentsToSend.length === 0) return res.status(404).json({ success: false, error: 'No students found' });
            
            //  FILE SAVE LOGIC (Ek baar save karo, sab ko same URL jayega)
            let savedFileUrl = null;
            if (attachedFile) {
                try {
                    const uploadDir = path.join(__dirname, '../uploads/attachments');
                    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
                   //      Space aur special characters ko underscore bana do (URL kabhi nahi tootega)
const safeOriginal = String(attachedFile.originalname).replace(/[^a-zA-Z0-9.\-]/g, '_');
const savedFileName = Date.now() + '-' + safeOriginal;
                    fs.writeFileSync(path.join(uploadDir, savedFileName), attachedFile.buffer);
                    savedFileUrl = `${req.protocol}://${req.get('host')}/uploads/attachments/${savedFileName}`;
                } catch (fileError) { console.error('⚠️ Bulk file save error:', fileError.message); }
            }

            let sentCount = 0;
            for (const student of studentsToSend) {
                try { 
                    //  UPDATED INSERT QUERY (attachment_url added)
                    await db.query(`INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role, notification_type, title, message, attachment_url, is_pushed, is_read, created_at) VALUES (?, 'Teacher', ?, 'Student', 'Announcement', ?, ?, ?, FALSE, FALSE, NOW())`, [teacherId, student.user_id, subject.trim(), message.trim(), savedFileUrl]); 
                                       //      EMAIL WITH ATTACHMENT
                    try {
                        const emailPayload = {
                            to: student.email,
                            subject: subject.trim(),
                            message: message.trim(),
                            senderName: teacherName
                        };
                        if (attachedFile) {
                            emailPayload.attachments = [{
                                filename: attachedFile.originalname,
                                content: attachedFile.buffer,
                                contentType: attachedFile.mimetype
                            }];
                        }
                        await emailService.sendAnnouncementEmail(emailPayload);
                    } catch (emailErr) {
                        console.error('⚠️ Bulk email error:', emailErr.message);
                    }
                                        // 📱 PUSH (OneSignal)
                    try {
                        const pushService = require('../services/pushService');
                        const tRes = await db.query('SELECT push_token FROM users WHERE user_id = ?', [student.user_id]);
                        const pToken = tRes[0]?.push_token;
                        if (pToken) {
                            await pushService.sendPushNotification({
                                pushToken: pToken,
                                title: `📢 ${subject.trim()}`,
                                message: message.trim().substring(0, 100),
                                data: { type: 'announcement', sender: 'Teacher' }
                            });
                        }
                    } catch (pushErr) {}
                    sentCount++; 
                } catch (err) {}
            }
            res.json({ success: true, message: `Bulk notification sent to ${sentCount} students`, sentCount, totalStudents: studentsToSend.length, classId, hasAttachment: !!attachedFile, attachmentUrl: savedFileUrl, sent_at: new Date().toISOString() });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }
    // 31. GET TEACHER CLASSES FOR REPORT
    async getTeacherClassesForReport(req, res) {
        try {
            const teacherId = req.user?.user_id;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });
            
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            
            console.log(`\n🔍 [Method 31] Teacher: ${teacherName} (ID: ${teacherId})`);
            
            const query1 = `
                SELECT DISTINCT c.classroom_id AS id, c.subject_name AS subject, c.class_name,
                    COALESCE(c.semester, sem.semester_code, '') AS semester, c.section, c.department_name
                FROM classrooms c
                LEFT JOIN semesters sem ON c.semester_id = sem.semester_id
                JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id
                LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id
                WHERE (t.user_id = ? OR ct.teacher_id = ?) AND c.is_active = TRUE
            `;
            let results = await db.query(query1, [teacherId, teacherId]);
            console.log(`   Strategy 1 (classroom_teachers): ${results.length} classes`);
            
            if (results.length === 0 && teacherName) {
                const query2 = `
                    SELECT DISTINCT c.classroom_id AS id, c.subject_name AS subject, c.class_name,
                        COALESCE(c.semester, sem.semester_code, '') AS semester, c.section, c.department_name
                    FROM classrooms c
                    LEFT JOIN semesters sem ON c.semester_id = sem.semester_id
                    WHERE LOWER(TRIM(c.teacher_name)) = LOWER(TRIM(?)) AND c.is_active = TRUE
                `;
                results = await db.query(query2, [teacherName]);
                console.log(`   Strategy 2 (teacher_name): ${results.length} classes`);
            }
            
            if (results.length === 0 && teacherName) {
                const query3 = `
                    SELECT DISTINCT c.classroom_id AS id, c.subject_name AS subject, c.class_name,
                        COALESCE(c.semester, sem.semester_code, '') AS semester, c.section, c.department_name
                    FROM classrooms c
                    LEFT JOIN semesters sem ON c.semester_id = sem.semester_id
                    WHERE LOWER(c.teacher_name) LIKE LOWER(CONCAT('%', ?, '%')) AND c.is_active = TRUE
                `;
                results = await db.query(query3, [teacherName]);
                console.log(`   Strategy 3 (LIKE): ${results.length} classes`);
            }
            
            if (results.length === 0) {
                console.log(`   ❌ No classes found for teacher`);
                return res.json({ success: true, classes: [], count: 0 });
            }

            //  NEW: Class tab → sirf bina-semester wali; Semester tab → sirf semester wali
            const classes = [];
            for (const row of results) {
                const studentsQuery = `
                    SELECT u.user_id AS id, u.full_name AS name, u.roll_no AS rollNo, u.email,
                        COALESCE((
                            SELECT ROUND(AVG(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) * 100)
                            FROM attendance a 
                            WHERE a.student_id = u.user_id 
                            AND a.classroom_id = ? 
                            AND a.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                        ), 0) AS currentAttendance,
                        COALESCE((
                            SELECT grade FROM marks 
                            WHERE student_id = u.user_id AND classroom_id = ? 
                            ORDER BY created_at DESC LIMIT 1
                        ), 'N/A') AS currentGrade
                    FROM enrollments e
                    JOIN users u ON e.student_id = u.user_id
                    WHERE e.classroom_id = ? AND e.status = 'Active'
                    ORDER BY u.full_name ASC
                `;
                
                let students = [];
                try {
                    students = await db.query(studentsQuery, [row.id, row.id, row.id]);
                    console.log(`   📚 Class "${row.class_name}" (${row.subject}): ${students.length} students`);
                } catch (e) {
                    console.log(`   ⚠️ Students fetch error for class ${row.id}:`, e.message);
                    students = [];
                }
                
                classes.push({
                    id: String(row.id),
                    subject: row.subject || row.class_name || 'Class',
                    semester: row.semester || '',
                    section: row.section || '',
                    className: row.class_name || '',
                    department: row.department_name || '',
                    totalStudents: students.length,
                    students: students
                });
            }
            
            console.log(`   ✅ Returning ${classes.length} classes\n`);
            res.json({ success: true, classes: classes, count: classes.length });
            
        } catch (error) {
            console.error('❌ Method 31 error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    // 32. GET STUDENT FOR REPORT
    async getStudentForReport(req, res) {
        try {
            const { student_id, class_id } = req.params;
            const teacherId = req.user?.user_id;
            if (!teacherId || !student_id || !class_id) return res.status(400).json({ success: false, error: 'Missing parameters' });
            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const verifyQuery = `SELECT c.classroom_id FROM classrooms c LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE c.classroom_id = ? AND (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?))`;
            const verifyResult = await db.query(verifyQuery, [class_id, teacherId, teacherId, teacherName]);
            if (verifyResult.length === 0) return res.status(403).json({ success: false, error: 'You do not have access to this student' });
            const results = await db.query(`SELECT u.user_id AS id, u.full_name AS name, u.roll_no AS rollNo, u.email, u.institute_name, c.class_name AS className, c.subject_name AS subject, COALESCE(c.semester, sem.semester_code, '') AS semester, c.section, c.department_name AS department, COALESCE((SELECT ROUND(AVG(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) * 100) FROM attendance a WHERE a.student_id = ? AND a.classroom_id = ? AND a.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)), 0) AS currentAttendance, COALESCE((SELECT grade FROM marks WHERE student_id = ? AND classroom_id = ? ORDER BY created_at DESC LIMIT 1), 'N/A') AS currentGrade, COALESCE((SELECT ROUND(AVG(marks_obtained / total_marks * 100), 2) FROM marks WHERE student_id = ? AND classroom_id = ?), 0) AS overallPercentage FROM users u JOIN enrollments e ON (e.student_id = u.user_id OR e.student_id = (SELECT st.student_id FROM students st WHERE st.user_id = u.user_id LIMIT 1)) JOIN classrooms c ON e.classroom_id = c.classroom_id LEFT JOIN semesters sem ON c.semester_id = sem.semester_id WHERE u.user_id = ? AND e.classroom_id = ?`, [student_id, class_id, student_id, class_id, student_id, class_id, student_id, class_id]);
            if (results.length === 0) return res.status(404).json({ success: false, error: 'Student not found' });
            const student = results[0];
            const marksHistory = await db.query(`SELECT assessment_type AS type, assessment_title AS title, marks_obtained AS obtained, total_marks AS total, ROUND((marks_obtained / total_marks) * 100, 2) AS percentage, grade, created_at AS date FROM marks WHERE student_id = ? AND classroom_id = ? ORDER BY created_at DESC`, [student_id, class_id]);
            const attendanceHistory = await db.query(`SELECT attendance_date AS date, status, DAYNAME(attendance_date) AS day FROM attendance WHERE student_id = ? AND classroom_id = ? ORDER BY attendance_date DESC LIMIT 30`, [student_id, class_id]);
            const presentCount = attendanceHistory.filter(a => a.status === 'present').length;
            res.json({ success: true, student: { id: String(student.id), name: student.name, rollNo: student.rollNo, email: student.email, className: student.className || student.semester || 'Class', subject: student.subject || 'Class', semester: student.semester || '', section: student.section || '', department: student.department || '', institute: student.institute_name || 'N/A', currentAttendance: student.currentAttendance || 0, currentGrade: student.currentGrade || 'N/A', overallPercentage: student.overallPercentage || 0 }, marksHistory, attendanceHistory, attendanceStats: { present: presentCount, absent: attendanceHistory.filter(a => a.status === 'absent').length, late: attendanceHistory.filter(a => a.status === 'late').length, total: attendanceHistory.length, percentage: attendanceHistory.length > 0 ? Math.round((presentCount / attendanceHistory.length) * 100) : 0 } });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 33. SAVE ACADEMIC REPORT
        // 33. SAVE ACADEMIC REPORT - ✅ FIXED: marks table mein grade save karta hai
    async saveAcademicReport(req, res) {
        try {
            const { studentId, classId, period, reportType, midTermMarks, quizMarks, assignmentMarks, classActivity, curriculum, subjectMarks, activity, behavior, remarks, accessGranted } = req.body;
            const teacherId = req.user?.user_id;
            if (!teacherId || !studentId || !classId || !period) return res.status(400).json({ success: false, error: 'Missing parameters' });

            const nameResult = await db.query('SELECT full_name FROM users WHERE user_id = ?', [teacherId]);
            const teacherName = nameResult[0]?.full_name || '';
            const verifyQuery = `SELECT c.classroom_id FROM classrooms c LEFT JOIN classroom_teachers ct ON c.classroom_id = ct.classroom_id LEFT JOIN teachers t ON ct.teacher_id = t.teacher_id OR ct.teacher_id = t.user_id WHERE c.classroom_id = ? AND (t.user_id = ? OR ct.teacher_id = ? OR LOWER(c.teacher_name) = LOWER(?))`;
            const verifyResult = await db.query(verifyQuery, [classId, teacherId, teacherId, teacherName]);
            if (verifyResult.length === 0) return res.status(403).json({ success: false, error: 'You do not have access to this student' });

            const existing = await db.query(`SELECT report_id FROM academic_reports WHERE student_id = ? AND classroom_id = ? AND period = ?`, [studentId, classId, period]);
            let reportId;
            if (existing.length > 0) {
                await db.query(`UPDATE academic_reports SET mid_term_marks = ?, quiz_marks = ?, assignment_marks = ?, class_activity = ?, curriculum = ?, subject_marks = ?, activity = ?, behavior = ?, remarks = ?, access_granted = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE student_id = ? AND classroom_id = ? AND period = ?`, [midTermMarks || null, quizMarks || null, assignmentMarks || null, classActivity || null, curriculum || null, subjectMarks || null, activity || null, behavior || null, remarks || null, accessGranted || false, teacherId, studentId, classId, period]);
                reportId = existing[0].report_id;
            } else {
                const result = await db.query(`INSERT INTO academic_reports (student_id, classroom_id, period, report_type, mid_term_marks, quiz_marks, assignment_marks, class_activity, curriculum, subject_marks, activity, behavior, remarks, access_granted, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`, [studentId, classId, period, reportType || 'weekly', midTermMarks || null, quizMarks || null, assignmentMarks || null, classActivity || null, curriculum || null, subjectMarks || null, activity || null, behavior || null, remarks || null, accessGranted || false, teacherId]);
                reportId = result.insertId;
            }

            //  NEW: marks parse karke marks table mein save karo (grade banega)
            const parse = (value, defTotal) => {
                if (!value || !String(value).trim()) return null;
                const v = String(value).trim();
                let obtained = 0, total = defTotal;
                if (v.includes('/')) {
                    const [a, b] = v.split('/').map(x => parseFloat(x));
                    if (isNaN(a)) return null;
                    obtained = a; total = !isNaN(b) && b > 0 ? b : defTotal;
                } else if (v.includes('-')) {
                    const [a, b] = v.split('-').map(x => parseFloat(x));
                    if (isNaN(a)) return null;
                    if (!isNaN(b)) { total = Math.max(a, b); obtained = Math.min(a, b); } else obtained = a;
                } else {
                    const n = parseFloat(v);
                    if (isNaN(n)) return null;
                    obtained = n;
                }
                if (obtained > total) { const t = obtained; obtained = total; total = t; }
                return { obtained, total };
            };
            const gradeOf = (p) => p >= 90 ? 'A+' : p >= 80 ? 'A' : p >= 70 ? 'B+' : p >= 60 ? 'B' : p >= 50 ? 'C' : p >= 40 ? 'D' : 'F';

            const entries = [];
            const mt = parse(midTermMarks, 50); if (mt) entries.push({ type: 'Mid-Term', title: 'Mid-Term Examination', ...mt });
            const qz = parse(quizMarks, 20); if (qz) entries.push({ type: 'Quiz', title: 'Class Quiz', ...qz });
            const asg = parse(assignmentMarks, 30); if (asg) entries.push({ type: 'Assignment', title: 'Assignment', ...asg });

            for (const en of entries) {
                const pct = Math.round((en.obtained / en.total) * 100);
                const grade = gradeOf(pct);
                await db.query(`DELETE FROM marks WHERE student_id = ? AND classroom_id = ? AND assessment_type = ?`, [studentId, classId, en.type]);
                await db.query(`INSERT INTO marks (student_id, classroom_id, assessment_type, assessment_title, marks_obtained, total_marks, percentage, grade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [studentId, classId, en.type, en.title, en.obtained, en.total, pct, grade]);
            }
                        // ✅ NEW: Jab access grant ho → student ko notification + push + email
            if (accessGranted === true || accessGranted === 'true' || accessGranted === 1) {
                try {
                    const stInfo = await db.query('SELECT full_name, email, push_token FROM users WHERE user_id = ?', [studentId]);
                    const stName = stInfo[0]?.full_name || 'Student';
                    const classRow = await db.query('SELECT subject_name FROM classrooms WHERE classroom_id = ?', [classId]);
                    const subj = classRow[0]?.subject_name || 'Class';

                    // Portal notification
                    const notifResult = await db.query(`
                        INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role,
                        notification_type, title, message, is_pushed, is_email_sent)
                        VALUES (?, 'Teacher', ?, 'Student', 'Announcement', ?, ?, FALSE, FALSE)
                    `, [
                        teacherId,
                        studentId,
                        `📊 Academic Report Available: ${subj}`,
                        `Dear ${stName},\n\nYour academic report for ${subj} (${period}) is now available. Open Academic Reports to view it.\n\nSent via Smart Desk`
                    ]);

                    // ✅ PUSH
                    if (stInfo[0]?.push_token) {
                        const pushResult = await pushService.sendAnnouncementPush({
                            pushToken: stInfo[0].push_token,
                            title: `📊 Academic Report Available: ${subj}`,
                            message: `Your academic report for ${subj} (${period}) is now available.`,
                            announcementId: notifResult.insertId
                        });
                        if (pushResult && pushResult.success) {
                            await db.query('UPDATE notifications SET is_pushed = TRUE WHERE notification_id = ?', [notifResult.insertId]);
                            console.log(`📱✅ Report access push sent to ${stName}`);
                        }
                    } else {
                        console.log(`📱⚠️ No push token for student ${studentId}`);
                    }

                    // ✅ EMAIL
                    if (stInfo[0]?.email) {
                        await emailService.sendEmail({
                            to: stInfo[0].email,
                            subject: `📊 Academic Report Available: ${subj}`,
                            html: `<h2>📊 Academic Report Available</h2><p>Dear <b>${stName}</b>,</p><p>Your academic report for <b>${subj}</b> (${period}) is now available.</p><p>Open Smart Desk → Academic Reports to view it.</p><p>Smart Desk Team</p>`,
                            text: `Dear ${stName}, your academic report for ${subj} (${period}) is now available.`
                        });
                    }
                } catch (accessErr) {
                    console.error('⚠️ Report access notification error:', accessErr.message);
                }
            }

            res.json({ success: true, message: 'Academic report saved!', report_id: reportId, period });
            res.json({ success: true, message: 'Academic report saved!', report_id: reportId, period });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }
    // 34. GET ACADEMIC REPORT
    async getAcademicReport(req, res) {
        try {
            const { student_id, class_id, period } = req.params;
            const teacherId = req.user?.user_id;
            if (!teacherId || !student_id || !class_id || !period) return res.status(400).json({ success: false, error: 'Missing parameters' });
            const results = await db.query(`SELECT ar.report_id AS id, ar.period, ar.report_type, ar.mid_term_marks, ar.quiz_marks, ar.assignment_marks, ar.class_activity, ar.curriculum, ar.subject_marks, ar.activity, ar.behavior, ar.remarks, ar.access_granted, ar.created_at, ar.updated_at, u.full_name AS created_by_name, u2.full_name AS updated_by_name FROM academic_reports ar LEFT JOIN users u ON ar.created_by = u.user_id LEFT JOIN users u2 ON ar.updated_by = u2.user_id WHERE ar.student_id = ? AND ar.classroom_id = ? AND ar.period = ?`, [student_id, class_id, period]);
            if (results.length === 0) return res.status(404).json({ success: false, error: 'Report not found' });
            const report = results[0];
            res.json({ success: true, report: { id: report.id, period: report.period, reportType: report.report_type || 'weekly', midTermMarks: report.mid_term_marks, quizMarks: report.quiz_marks, assignmentMarks: report.assignment_marks, classActivity: report.class_activity, curriculum: report.curriculum, subjectMarks: report.subject_marks, activity: report.activity, behavior: report.behavior, remarks: report.remarks, accessGranted: report.access_granted === 1, createdAt: report.created_at, updatedAt: report.updated_at, createdBy: report.created_by_name, updatedBy: report.updated_by_name } });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 35. DOWNLOAD ACADEMIC REPORT
    async downloadAcademicReport(req, res) {
        try {
            const { student_id, class_id, period } = req.params;
            const { format = 'pdf' } = req.query;
            const teacherId = req.user?.user_id;
            if (!teacherId) return res.status(401).json({ success: false, error: 'User not authenticated' });
            const reportResult = await db.query(`SELECT ar.*, u.full_name AS student_name, u.roll_no, u.email, c.subject_name AS subject, COALESCE(c.semester, sem.semester_code, '') AS semester, c.section, c.class_name FROM academic_reports ar JOIN users u ON ar.student_id = u.user_id JOIN classrooms c ON ar.classroom_id = c.classroom_id LEFT JOIN semesters sem ON c.semester_id = sem.semester_id WHERE ar.student_id = ? AND ar.classroom_id = ? AND ar.period = ?`, [student_id, class_id, period]);
            if (reportResult.length === 0) return res.status(404).json({ success: false, error: 'Report not found' });
            const report = reportResult[0];
            const marks = await db.query(`SELECT assessment_type, assessment_title, marks_obtained, total_marks, grade FROM marks WHERE student_id = ? AND classroom_id = ? ORDER BY created_at DESC`, [student_id, class_id]);
            const attendance = await db.query(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present, SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent, SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late FROM attendance WHERE student_id = ? AND classroom_id = ? AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`, [student_id, class_id]);
            const attendanceData = attendance[0] || { total: 0, present: 0, absent: 0, late: 0 };
            if (format === 'pdf') return this.generateAcademicPDF(report, marks, attendanceData, res);
            else if (format === 'excel') return this.generateAcademicExcel(report, marks, attendanceData, res);
            else return res.status(400).json({ success: false, error: 'Invalid format' });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 36. GENERATE ACADEMIC PDF
    generateAcademicPDF(report, marks, attendance, res) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50 });
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="Academic_Report_${Date.now()}.pdf"`);
                doc.pipe(res);
                doc.fontSize(24).fillColor('#065F46').text('Academic Report', { align: 'center' }).moveDown(1);
                doc.fontSize(14).fillColor('#0F172A').text(`Student: ${report.student_name}`, { align: 'center' });
                doc.fontSize(12).fillColor('#64748B').text(`Subject: ${report.subject || 'N/A'} | Class: ${report.class_name || 'N/A'}`, { align: 'center' }).moveDown(1);
                doc.fontSize(12).fillColor('#374151');
                doc.text(`Mid-Term Marks: ${report.mid_term_marks || 'N/A'}`).moveDown(0.3);
                doc.text(`Quiz Marks: ${report.quiz_marks || 'N/A'}`).moveDown(0.3);
                doc.text(`Assignment Marks: ${report.assignment_marks || 'N/A'}`).moveDown(0.3);
                doc.text(`Attendance: ${attendance.present || 0}/${attendance.total || 0}`).moveDown(1);
                if (report.remarks) { doc.fontSize(12).text('Teacher Remarks:', { underline: true }).moveDown(0.3); doc.fontSize(11).text(report.remarks, { width: 500 }); }
                doc.end(); resolve();
            } catch (error) { reject(error); }
        });
    }

    // 37. GENERATE ACADEMIC EXCEL
    generateAcademicExcel(report, marks, attendance, res) {
        try {
            const wb = XLSX.utils.book_new();
            const summaryData = [{ 'Student Name': report.student_name, 'Roll Number': report.roll_no || 'N/A', 'Subject': report.subject || 'N/A', 'Mid-Term Marks': report.mid_term_marks || 'N/A', 'Quiz Marks': report.quiz_marks || 'N/A', 'Assignment Marks': report.assignment_marks || 'N/A', 'Teacher Remarks': report.remarks || 'N/A' }];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary');
            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="Academic_Report_${Date.now()}.xlsx"`);
            return res.send(buffer);
        } catch (error) { console.error('Excel generation error:', error); throw error; }
    }
        //  NEW: Live students + unki saved academic reports nikalta hai
    async buildLiveStudents(classId) {
        const students = await db.query(`
            SELECT u.user_id AS id, u.full_name AS name, u.roll_no AS rollNo,
                COALESCE((SELECT ROUND(AVG(CASE WHEN a.status='present' THEN 1 ELSE 0 END)*100)
                    FROM attendance a WHERE a.student_id=u.user_id AND a.classroom_id=?),0) AS attendance
            FROM enrollments e
            JOIN users u ON e.student_id=u.user_id
            WHERE e.classroom_id=? AND e.status='Active'
            ORDER BY u.full_name ASC`, [classId, classId]);

        const formatted = [];
        for (const s of students) {
            const ar = await db.query(
                `SELECT mid_term_marks, quiz_marks, assignment_marks FROM academic_reports
                 WHERE student_id=? AND classroom_id=? ORDER BY created_at DESC LIMIT 1`, [s.id, classId]);
            const mk = await db.query(
                `SELECT grade FROM marks WHERE student_id=? AND classroom_id=? ORDER BY created_at DESC LIMIT 1`, [s.id, classId]);
            const att = parseInt(s.attendance) || 0;
            formatted.push({
                id: String(s.id), name: s.name || 'Unknown', rollNo: s.rollNo || '',
                attendance: att,
                midTermMarks: ar[0]?.mid_term_marks || '0/50',
                quizMarks: ar[0]?.quiz_marks || '0/20',
                assignmentMarks: ar[0]?.assignment_marks || '0/30',
                overallGrade: mk[0]?.grade || 'N/A',
                status: att >= 90 ? 'excellent' : att >= 75 ? 'good' : att >= 60 ? 'average' : 'needs-improvement'
            });
        }
        return formatted;
    }
    // 38. GET CLASS PERFORMANCE FULL
        // 38. GET CLASS PERFORMANCE FULL - ✅ FIXED: live students + metrics
    async getClassPerformanceFull(req, res) {
        try {
            const { class_id } = req.params;
            const results = await db.query(`
                SELECT pr.*, c.class_name, c.subject_name, c.section,
                       COALESCE(c.semester, sem.semester_code, '') AS semester
                FROM performance_reports pr
                JOIN classrooms c ON pr.classroom_id = c.classroom_id
                LEFT JOIN semesters sem ON c.semester_id = sem.semester_id
                WHERE pr.classroom_id = ?`, [class_id]);

            if (results.length === 0) {
                return res.json({ success: false, error: 'No performance report yet' });
            }
            const r = results[0];

            let students = [];
            try { students = r.detailed_data ? JSON.parse(r.detailed_data) : []; } catch (e) { students = []; }

            //  Agar saved students khali hain → live students + unki reports lao
            if (!students || students.length === 0) {
                students = await this.buildLiveStudents(class_id);
            }

            res.json({
                success: true,
                data: {
                    classId: String(class_id),
                    className: r.class_name || '',
                    classType: 'class',
                    subject: r.subject_name || '',
                    section: r.section || '',
                    teacherRemarks: r.teacher_remarks || '',
                    coordinatorRemarks: r.coordinator_remarks || '',
                    averageGrade: r.average_grade || '',
                    passRate: r.pass_rate || '',
                    topPerformer: r.top_performer || '',
                    evaluationDate: r.updated_at || r.created_at,
                    accessGranted: r.access_granted === 1 || r.access_granted === true,
                    students: students
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //    DELETE NOTIFICATION
        //    DELETE NOTIFICATION (FIXED: notification_id use kiya)
    async deleteNotification(req, res) {
        try {
            const { id } = req.params; // Frontend se notification_id aa rahi hai
            const userId = req.user.user_id;

            // 1. Verify notification belongs to user (notification_id column use karo)
            const notif = await db.query(
                `SELECT notification_id FROM notifications 
                 WHERE notification_id = ? AND (receiver_id = ? OR sender_id = ?)`,
                [id, userId, userId]
            );

            if (notif.length === 0) {
                return res.status(404).json({ success: false, error: 'Notification not found or access denied' });
            }

            // 2. Delete replies first (cascade)
            try {
                await db.query(`DELETE FROM notification_replies WHERE notification_id = ?`, [id]);
            } catch (e) { /* Table might not exist */ }
            
            try {
                await db.query(`DELETE FROM notification_responses WHERE notification_id = ?`, [id]);
            } catch (e) { /* Table might not exist */ }

            // 3. Delete main notification
            await db.query(`DELETE FROM notifications WHERE notification_id = ?`, [id]);

            res.json({ success: true, message: 'Notification deleted successfully' });
        } catch (error) {
            console.error('❌ Delete notification error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // 39. INITIALIZE CLASS PERFORMANCE
        // 39. INITIALIZE CLASS PERFORMANCE - ✅ FIXED: Asli marks academic_reports se
    async initializeClassPerformance(req, res) {
        try {
            const { classId } = req.body;
            if (!classId) return res.status(400).json({ success: false, error: 'classId required' });

            const students = await db.query(`
                SELECT u.user_id AS id, u.full_name AS name, u.roll_no AS rollNo, u.email,
                    COALESCE((SELECT ROUND(AVG(CASE WHEN a.status='present' THEN 1 ELSE 0 END)*100)
                        FROM attendance a WHERE a.student_id=u.user_id AND a.classroom_id=?),0) AS attendance
                FROM enrollments e
                JOIN users u ON e.student_id=u.user_id
                WHERE e.classroom_id=? AND e.status='Active'
                ORDER BY u.full_name ASC`, [classId, classId]);

            const formatted = [];
            for (const s of students) {
                //  Teacher ke enter kiye hue marks (academic_reports se)
                const ar = await db.query(
                    `SELECT mid_term_marks, quiz_marks, assignment_marks FROM academic_reports
                     WHERE student_id=? AND classroom_id=? ORDER BY created_at DESC LIMIT 1`, [s.id, classId]);
                //  Grade (marks table se)
                const mk = await db.query(
                    `SELECT grade FROM marks WHERE student_id=? AND classroom_id=? ORDER BY created_at DESC LIMIT 1`, [s.id, classId]);

                const att = parseInt(s.attendance) || 0;
                formatted.push({
                    id: String(s.id),
                    name: s.name || 'Unknown',
                    rollNo: s.rollNo || '',
                    attendance: att,
                    midTermMarks: ar[0]?.mid_term_marks || '0/50',
                    quizMarks: ar[0]?.quiz_marks || '0/20',
                    assignmentMarks: ar[0]?.assignment_marks || '0/30',
                    overallGrade: mk[0]?.grade || 'N/A',
                    status: att >= 90 ? 'excellent' : att >= 75 ? 'good' : att >= 60 ? 'average' : 'needs-improvement'
                });
            }
            res.json({ success: true, data: { students: formatted } });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }

    // 40. SAVE CLASS PERFORMANCE FULL
        // 40. SAVE CLASS PERFORMANCE FULL - ✅ FIXED: Avg/Pass/Top save + auto-compute
        // 40. SAVE CLASS PERFORMANCE FULL - ✅ FIXED: Safe save + auto-compute metrics
    async saveClassPerformanceFull(req, res) {
        try {
            const { classId, teacherRemarks, accessGranted, students, averageGrade, passRate, topPerformer } = req.body;
            if (!classId) return res.status(400).json({ success: false, error: 'classId required' });
            const detailedData = JSON.stringify(students || []);

            //  Auto-compute agar teacher ne metrics khali chhori
            let finalAvg = averageGrade || '';
            let finalPass = passRate || '';
            let finalTop = topPerformer || '';
            if (students && students.length > 0) {
                if (!finalTop) {
                    const best = students.reduce((a, b) => ((parseInt(a.attendance) || 0) >= (parseInt(b.attendance) || 0) ? a : b));
                    finalTop = best.name || '';
                }
                if (!finalPass) {
                    const passing = students.filter(s => (parseInt(s.attendance) || 0) >= 40).length;
                    finalPass = `${Math.round((passing / students.length) * 100)}%`;
                }
                if (!finalAvg) {
                    const avgAtt = Math.round(students.reduce((s, x) => s + (parseInt(x.attendance) || 0), 0) / students.length);
                    finalAvg = avgAtt >= 90 ? 'A+' : avgAtt >= 80 ? 'A' : avgAtt >= 70 ? 'B+' : avgAtt >= 60 ? 'B' : avgAtt >= 50 ? 'C' : avgAtt >= 40 ? 'D' : 'F';
                }
            }

            const existing = await db.query(`SELECT report_id FROM performance_reports WHERE classroom_id = ?`, [classId]);
            if (existing.length > 0) {
                await db.query(`UPDATE performance_reports SET average_grade=?, pass_rate=?, top_performer=?, teacher_remarks=?, access_granted=?, detailed_data=?, updated_at=CURRENT_TIMESTAMP WHERE classroom_id=?`,
                    [finalAvg || 'N/A', finalPass || 'N/A', finalTop || 'N/A', teacherRemarks || '', accessGranted ? 1 : 0, detailedData, classId]);
            } else {
                await db.query(`INSERT INTO performance_reports (classroom_id, average_grade, pass_rate, top_performer, teacher_remarks, access_granted, detailed_data) VALUES (?,?,?,?,?,?,?)`,
                    [classId, finalAvg || 'N/A', finalPass || 'N/A', finalTop || 'N/A', teacherRemarks || '', accessGranted ? 1 : 0, detailedData]);
            }
            res.json({ success: true, message: 'Class performance saved successfully!' });
        } catch (error) { res.status(500).json({ success: false, error: 'Server error: ' + error.message }); }
    }
}
const controllerInstance = new TeacherController();
controllerInstance.upload = upload;
module.exports = controllerInstance;