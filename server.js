//  OOP APPROACH - Complete with all fixes applied

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

//  IMPORT ROUTES
const authRoutes = require('./src/routes/authRoutes');
const otpRoutes = require('./src/routes/otpRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const coordinatorRoutes = require('./src/routes/coordinatorRoutes');
const teacherRoutes = require('./src/routes/teacherRoutes');
const studentRoutes = require('./src/routes/studentRoutes');
const announcementRoutes = require('./src/routes/announcementRoutes');
const classPerformanceRoutes = require('./src/routes/classPerformanceRoutes');
const syncRoutes = require('./src/routes/syncRoutes'); //      Single import

//  Student Modules Routes
const studentNotificationRoutes = require('./src/routes/studentNotificationRoutes');
const studentAcademicReportRoutes = require('./src/routes/studentAcademicReportRoutes');
const studentTodayClassRoutes = require('./src/routes/studentTodayClassRoutes');
const studentAttendanceRoutes = require('./src/routes/studentAttendanceRoutes');

//  EMAIL ROUTES
const emailRoutes = require('./src/routes/emailRoutes');

// ❌ REMOVED: Duplicate syncRoutes import (Lines 30-32 deleted)

//  IMPORT DATABASE CONNECTION
const db = require('./src/config/db');

//  Academic Reports ke liye
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const auth = require('./src/middleware/authMiddleware');

//  
// SERVER CLASS
//  
class Server {
    constructor() {
        this.app = express();
        this.PORT = process.env.PORT || 5000;
        this.db = db;
        
        this.initializeMiddlewares();
        this.initializeRoutes();
        this.initializeTestRoutes();
        this.initializeSuperDeleteRoute();
        this.initializeErrorHandling();
    }

    //  
    // 1. INITIALIZE MIDDLEWARES
    //  
    initializeMiddlewares() {
        this.app.use(cors({
            origin: process.env.CLIENT_URL || 'http://localhost:3000',
            credentials: true
        }));
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

                // ✅ GLOBAL BASE64 → MULTER-STYLE FILES (register se PEHLE chalta hai)
        this.app.use('/api/auth/register', (req, res, next) => {
            try {
                if (req.body && !req.files && (req.body.idCardBase64 || req.body.profilePhotoBase64)) {
                    const path = require('path');
                    const fs = require('fs');
                    const uploadDir = path.join(__dirname, 'uploads', 'registrations');
                    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
                    req.files = req.files || {};

                    if (req.body.idCardBase64) {
                        const buf = Buffer.from(String(req.body.idCardBase64), 'base64');
                        const safeName = Date.now() + '-' + String(req.body.idCardName || 'idcard.jpg').replace(/[^a-zA-Z0-9.\-]/g, '_');
                        const filePath = path.join(uploadDir, safeName);
                        fs.writeFileSync(filePath, buf);
                        req.files.idCard = [{
                            fieldname: 'idCard', originalname: safeName, filename: safeName,
                            mimetype: 'image/jpeg', buffer: buf, size: buf.length, path: filePath
                        }];
                        console.log('✅ [GLOBAL] idCard base64 → file:', safeName, buf.length, 'bytes');
                    }

                    if (req.body.profilePhotoBase64) {
                        const buf = Buffer.from(String(req.body.profilePhotoBase64), 'base64');
                        const safeName = Date.now() + '-' + String(req.body.profilePhotoName || 'photo.jpg').replace(/[^a-zA-Z0-9.\-]/g, '_');
                        const filePath = path.join(uploadDir, safeName);
                        fs.writeFileSync(filePath, buf);
                        req.files.profilePhoto = [{
                            fieldname: 'profilePhoto', originalname: safeName, filename: safeName,
                            mimetype: 'image/jpeg', buffer: buf, size: buf.length, path: filePath
                        }];
                        console.log('✅ [GLOBAL] profilePhoto base64 → file:', safeName, buf.length, 'bytes');
                    }
                }
            } catch (e) {
                console.error('⚠️ base64 middleware error:', e.message);
            }
            next();
        });
        
                // Static files - uploads
        this.app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
        this.app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));
        
        // Agar uploads folder src ke andar hai to yeh bhi:
        this.app.use('/uploads', express.static(path.join(__dirname, 'src', 'uploads')));
        this.app.use('/api/uploads', express.static(path.join(__dirname, 'src', 'uploads')));
                // ✅ SMART UPLOADS FALLBACK: file ko har possible folder mein dhundo
        const serveUploadFallback = (req, res, next) => {
            try {
                const rel = req.path.replace(/^\/+/, '');        // e.g. idcards/x.jpeg
                const fileName = path.basename(rel);

                // 1️⃣ Direct paths check karo
                const direct = [
                    path.join(__dirname, 'uploads', rel),
                    path.join(__dirname, 'src', 'uploads', rel),
                    path.join(__dirname, rel),
                    path.join(__dirname, 'src', rel),
                ];
                for (const p of direct) {
                    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                        console.log('✅ [uploads-fallback] serving:', p);
                        return res.sendFile(p);
                    }
                }

                // 2️⃣ Recursive search (filename se poori backend mein dhundo)
                const roots = [
                    path.join(__dirname, 'uploads'),
                    path.join(__dirname, 'src', 'uploads'),
                    path.join(__dirname, 'src'),
                    __dirname,
                ];
                const findFile = (dir, depth) => {
                    if (depth > 5) return null;
                    let entries = [];
                    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return null; }
                    for (const entry of entries) {
                        if (entry.name === 'node_modules') continue;
                        const full = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            const found = findFile(full, depth + 1);
                            if (found) return found;
                        } else if (entry.name === fileName) {
                            return full;
                        }
                    }
                    return null;
                };
                for (const root of roots) {
                    const found = findFile(root, 0);
                    if (found) {
                        console.log('✅ [uploads-fallback] found via search:', found);
                        return res.sendFile(found);
                    }
                }

                console.warn('⚠️ [uploads-fallback] NOT FOUND:', fileName);
                return res.status(404).json({ success: false, error: 'File not found: ' + fileName });
            } catch (e) {
                return next(e);
            }
        };
        this.app.use('/uploads', serveUploadFallback);
        this.app.use('/api/uploads', serveUploadFallback);
        if (process.env.VERCEL) {
    this.app.use('/uploads', express.static('/tmp/uploads'));
}
        
        // Logging middleware
        this.app.use((req, res, next) => {
            console.log(`📝 ${req.method} ${req.url}`);
            next();
        });
    }

    //  
    // 2. INITIALIZE ROUTES - ✅ FIXED ORDER
    //  
    initializeRoutes() {
        // Authentication Routes
        this.app.use('/api/auth', authRoutes);
        
        // Admin Routes
        this.app.use('/api/admin', adminRoutes);
        
        // Coordinator Routes
        this.app.use('/api/coordinator', coordinatorRoutes);
        
        // Teacher Routes
        this.app.use('/api/teacher', teacherRoutes);

        

       //     ✅ ACADEMIC REPORTS — INLINE (server.js mein hi, hamesha chalega)
        const ar = express.Router();
        ar.use(auth.authenticate, auth.studentOnly);

        // LIST (Weekly / Monthly)
        ar.get('/', async (req, res) => {
            try {
                const studentId = req.user.user_id;
                const period = req.query.period || 'weekly';
                const rows = await db.query(`
                    SELECT ar.report_id AS id, ar.period, ar.remarks, ar.created_at,
                           ar.mid_term_marks, ar.quiz_marks, ar.assignment_marks, ar.class_activity,
                           c.subject_name AS subject, c.class_name AS className, c.classroom_id AS classId,
                           t.full_name AS teacherName
                    FROM academic_reports ar
                    JOIN classrooms c ON ar.classroom_id = c.classroom_id
                    LEFT JOIN users t ON ar.created_by = t.user_id
                    WHERE ar.student_id = ? AND ar.period = ?
                    ORDER BY ar.created_at DESC`, [studentId, period]);

                const reports = [];
                for (const r of rows) {
                    const att = await db.query(
                        `SELECT COUNT(*) AS total, SUM(CASE WHEN LOWER(status)='present' THEN 1 ELSE 0 END) AS present
                         FROM attendance WHERE student_id = ? AND classroom_id = ?`, [studentId, r.classId]);
                    const total = att[0]?.total || 0, present = att[0]?.present || 0;
                    const attendance = total > 0 ? Math.round((present / total) * 100) : null;
                    const mk = await db.query(
                        `SELECT grade FROM marks WHERE student_id = ? AND classroom_id = ? ORDER BY created_at DESC LIMIT 1`,
                        [studentId, r.classId]);
                    const remarks = r.remarks || '';
                    reports.push({
                        id: String(r.id),
                        subject: r.subject || 'Subject',
                        teacherName: r.teacherName || 'Teacher',
                        grade: mk[0]?.grade || 'N/A',
                        attendance: attendance === null ? 'N/A' : attendance,
                        assignmentsCompleted: 0,
                        midTermMarks: r.mid_term_marks || '',
                        quizMarks: r.quiz_marks || '',
                        assignmentMarks: r.assignment_marks || '',
                        classActivity: r.class_activity || '',
                        detailedRemarks: remarks,
                        summaryRemarks: remarks,
                        remarks: remarks,
                        date: r.created_at ? new Date(r.created_at).toISOString() : null,
                        period: r.period
                    });
                }
                res.json({ success: true, reports, count: reports.length });
            } catch (e) {
                console.error('Get reports error:', e);
                res.status(500).json({ success: false, error: 'Server error: ' + e.message });
            }
        });

        // STATS
        ar.get('/stats', async (req, res) => {
            try {
                const r = await db.query(`SELECT COUNT(*) AS total FROM academic_reports WHERE student_id = ?`, [req.user.user_id]);
                res.json({ success: true, stats: { totalReports: r[0]?.total || 0 } });
            } catch (e) { res.status(500).json({ success: false, error: 'Server error: ' + e.message }); }
        });

        // DOWNLOAD (PDF / Excel)
        ar.get('/:report_id/download', async (req, res) => {
            try {
                const format = req.query.format || 'pdf';
                const r = await db.query(`
                    SELECT ar.*, c.subject_name AS subject, c.class_name AS className,
                           t.full_name AS teacherName, u.full_name AS studentName, u.roll_no AS rollNo
                    FROM academic_reports ar
                    JOIN classrooms c ON ar.classroom_id = c.classroom_id
                    LEFT JOIN users t ON ar.created_by = t.user_id
                    LEFT JOIN users u ON ar.student_id = u.user_id
                    WHERE ar.report_id = ? AND ar.student_id = ?`, [req.params.report_id, req.user.user_id]);
                if (r.length === 0) return res.status(404).json({ success: false, error: 'Report not found' });
                const row = r[0];

                if (format === 'excel') {
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
                        Student: row.studentName || '', RollNo: row.rollNo || '', Subject: row.subject || '',
                        Class: row.className || '', Teacher: row.teacherName || '', Period: row.period || '',
                        MidTerm: row.mid_term_marks || '', Quiz: row.quiz_marks || '', Assignment: row.assignment_marks || '',
                        Remarks: row.remarks || ''
                    }]), 'Report');
                    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
                    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                    res.setHeader('Content-Disposition', `attachment; filename="Report_${row.report_id}.xlsx"`);
                    return res.send(buf);
                }

                const doc = new PDFDocument({ margin: 50 });
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="Report_${row.report_id}.pdf"`);
                doc.pipe(res);
                doc.fontSize(20).fillColor('#1E40AF').text('Academic Report', { align: 'center' }).moveDown();
                doc.fontSize(12).fillColor('#000');
                doc.text(`Student: ${row.studentName || ''} (${row.rollNo || ''})`);
                doc.text(`Subject: ${row.subject || ''}   Class: ${row.className || ''}`);
                doc.text(`Teacher: ${row.teacherName || ''}   Period: ${row.period || ''}`);
                doc.text(`Mid-Term: ${row.mid_term_marks || '-'}  Quiz: ${row.quiz_marks || '-'}  Assignment: ${row.assignment_marks || '-'}`);
                doc.moveDown();
                doc.text('Teacher Remarks:', { underline: true });
                doc.text(row.remarks || 'No remarks.');
                doc.end();
            } catch (e) {
                console.error('Download error:', e);
                res.status(500).json({ success: false, error: 'Server error: ' + e.message });
            }
        });

        // DETAILS
        ar.get('/:report_id', async (req, res) => {
            try {
                const r = await db.query(`
                    SELECT ar.*, c.subject_name AS subject, c.class_name AS className, t.full_name AS teacherName
                    FROM academic_reports ar
                    JOIN classrooms c ON ar.classroom_id = c.classroom_id
                    LEFT JOIN users t ON ar.created_by = t.user_id
                    WHERE ar.report_id = ? AND ar.student_id = ?`, [req.params.report_id, req.user.user_id]);
                if (r.length === 0) return res.status(404).json({ success: false, error: 'Report not found' });
                const row = r[0];
                res.json({
                    success: true,
                    report: {
                        id: String(row.report_id),
                        subject: row.subject, teacherName: row.teacherName || 'Teacher', period: row.period,
                        midTermMarks: row.mid_term_marks, quizMarks: row.quiz_marks, assignmentMarks: row.assignment_marks,
                        detailedRemarks: row.remarks || '', summaryRemarks: row.remarks || '', remarks: row.remarks || '',
                        date: row.created_at ? new Date(row.created_at).toISOString() : null
                    }
                });
            } catch (e) { res.status(500).json({ success: false, error: 'Server error: ' + e.message }); }
        });

        //  Register Academic Reports router
        this.app.use('/api/student/academic-reports', ar);

       //     ✅ CLASS PERFORMANCE ROUTES (Teacher monthly report + Coordinator view)
        const teacherController = require('./src/controllers/teacherController');
        const cp = express.Router();
        cp.use(auth.authenticate);

        // Students list initialize karne ke liye
        cp.post('/initialize', (req, res) => teacherController.initializeClassPerformance(req, res));

        // Report SAVE karne ke liye (POST = Create)
        cp.post('/', (req, res) => teacherController.saveClassPerformanceFull(req, res));

        // Report UPDATE karne ke liye (PUT = Edit) ✅ FIXED
        cp.put('/:class_id', (req, res) => teacherController.saveClassPerformanceFull(req, res));

        // Saved report + students dekhne ke liye
        cp.get('/:class_id', (req, res) => teacherController.getClassPerformanceFull(req, res));

        //  Register Class Performance router
        this.app.use('/api/class-performance', cp);

        //  Student Routes (generic /api/student) - Baad mein
        this.app.use('/api/student', studentRoutes);
        
        // Announcement Routes
        this.app.use('/api/announcements', announcementRoutes);

        //  Student Notifications Routes
        this.app.use('/api/student', studentNotificationRoutes);
        
        //  Student Today's Classes Routes
        this.app.use('/api/student', studentTodayClassRoutes);
        
        //  Student Attendance Routes
        this.app.use('/api/student', studentAttendanceRoutes);

        //  EMAIL ROUTES
        this.app.use('/api/email', emailRoutes);

       //      SYNC ROUTES (Offline Sync) - Already registered correctly
        this.app.use('/api/sync', syncRoutes);

        // OTP Routes
        this.app.use('/api/otp', otpRoutes);
    }

    //  
    // 3. INITIALIZE TEST ROUTES
    //  
    initializeTestRoutes() {
        this.app.get('/api/test', (req, res) => {
            res.json({ 
                success: true,
                message: '✅ Smart Desk API is working!',
                timestamp: new Date().toISOString()
            });
        });

        this.app.get('/api/db-test', (req, res) => {
            this.db.query('SELECT 1 AS test', (err, results) => {
                if (err) {
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Database error: ' + err.message 
                    });
                }
                res.json({ 
                    success: true, 
                    message: '✅ Database Connected!', 
                    data: results 
                });
            });
        });

        this.app.get('/api/health', (req, res) => {
            res.json({
                success: true,
                status: 'healthy',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                memory: process.memoryUsage(),
                node_version: process.version
            });
        });

       //      UPDATED: Sync test route with all 6 endpoints
        this.app.get('/api/sync/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ Sync API is ready! (Complete Offline Sync System)',
                endpoints: {
                    // Core sync
                    attendance: 'POST /api/sync/attendance',
                    marks: 'POST /api/sync/marks',
                    notification: 'POST /api/sync/notification',
                    bulk: 'POST /api/sync/bulk',
                   //      NEW: Academic & Performance sync
                    academic_report: 'POST /api/sync/academic-report',
                    class_performance: 'POST /api/sync/class-performance',
                    class_assignment: 'POST /api/sync/class-assignment',
                    // Management
                    status: 'GET /api/sync/status',
                    history: 'GET /api/sync/history'
                }
            });
        });

        this.app.get('/api/admin/monitor/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ Monitor Users API is ready!',
                endpoints: {
                    monitor_users: 'GET /api/admin/monitor?limit=20&offset=0&search=&role=all',
                    user_activity: 'GET /api/admin/activity/:user_id',
                    restrict_user: 'PUT /api/admin/restrict/:user_id',
                    user_stats: 'GET /api/admin/stats/users',
                    bulk_restrict: 'POST /api/admin/bulk-restrict',
                    bulk_unrestrict: 'POST /api/admin/bulk-unrestrict'
                }
            });
        });

        this.app.get('/api/admin/reports/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ Department Reports API is ready!',
                endpoints: {
                    request_report: 'POST /api/admin/request-report',
                    received_reports: 'GET /api/admin/received-reports',
                    report_details: 'GET /api/admin/report-details/:report_id',
                    download_report: 'GET /api/admin/download-report/:report_id',
                    departments: 'GET /api/admin/departments',
                    department_reports: 'GET /api/admin/department-reports'
                }
            });
        });

        this.app.get('/api/coordinator/approved/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ View Approved Accounts API is ready!',
                endpoints: {
                    approved_accounts: 'GET /api/coordinator/approved-accounts?role=all&search=',
                    user_details: 'GET /api/coordinator/user-details/:user_id',
                    approval_stats: 'GET /api/coordinator/approval-stats'
                }
            });
        });

        this.app.get('/api/coordinator/assign/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ Assign Classes API is ready!',
                endpoints: {
                    teachers: 'GET /api/coordinator/teachers',
                    assignable_classes: 'GET /api/coordinator/assignable-classes',
                    assign_teacher: 'PUT /api/coordinator/assign-class/:class_id',
                    unassign_teacher: 'PUT /api/coordinator/unassign-class/:class_id',
                    class_details: 'GET /api/coordinator/class-details/:class_id'
                }
            });
        });

        this.app.get('/api/coordinator/enroll/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ Enroll Students API is ready!',
                endpoints: {
                    approved_students: 'GET /api/coordinator/approved-students?search=',
                    class_enrollments: 'GET /api/coordinator/class-enrollments/:class_id',
                    enroll_students: 'POST /api/coordinator/enroll-students/:class_id',
                    enrollment_status: 'PUT /api/coordinator/enrollment-status/:class_id/:student_id',
                    promote_class: 'PUT /api/coordinator/promote-class/:class_id'
                }
            });
        });

        this.app.get('/api/coordinator/performance/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ View Class Performance Report API is ready!',
                endpoints: {
                    performance_reports: 'GET /api/coordinator/performance-reports?access=granted&search=',
                    report_details: 'GET /api/coordinator/performance-report/:report_id',
                    download_pdf: 'GET /api/coordinator/reports/download/:report_id?format=pdf',
                    download_excel: 'GET /api/coordinator/reports/download/:report_id?format=excel'
                }
            });
        });

        this.app.get('/api/coordinator/reports/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ Coordinator Reports API is ready!',
                endpoints: {
                    report_requests: 'GET /api/coordinator/report-requests',
                    submit_report: 'POST /api/coordinator/reports/submit',
                    submitted_reports: 'GET /api/coordinator/submitted-reports'
                }
            });
        });

        this.app.get('/api/coordinator/notifications/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ View Notifications API is ready!',
                endpoints: {
                    all_notifications: 'GET /api/coordinator/notifications',
                    admin_notifications: 'GET /api/coordinator/notifications/admin',
                    teacher_messages: 'GET /api/coordinator/notifications/teachers',
                    student_messages: 'GET /api/coordinator/notifications/students',
                    notification_counts: 'GET /api/coordinator/notifications/counts',
                    mark_read: 'PUT /api/coordinator/notifications/read/:notification_id',
                    mark_all_read: 'PUT /api/coordinator/notifications/read-all'
                }
            });
        });

        this.app.get('/api/coordinator/send/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ Send Notification API is ready!',
                endpoints: {
                    recipients: 'GET /api/coordinator/recipients?type=teacher&search=',
                    send_notification: 'POST /api/coordinator/notifications/send',
                    send_bulk_notification: 'POST /api/coordinator/notifications/send-bulk'
                }
            });
        });

        this.app.get('/api/coordinator/notification-history/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ Notification History & Stats API is ready!',
                endpoints: {
                    history: 'GET /api/coordinator/notifications/history?limit=20&offset=0',
                    stats: 'GET /api/coordinator/notifications/stats'
                }
            });
        });

        this.app.get('/api/student/notifications/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ Student Notifications API is ready!',
                endpoints: {
                    get_notifications: 'GET /api/student/notifications?filter=all',
                    get_details: 'GET /api/student/notifications/:notification_id',
                    send_reply: 'POST /api/student/notifications/reply',
                    mark_read: 'PUT /api/student/notifications/:notification_id/read',
                    mark_all_read: 'PUT /api/student/notifications/read-all',
                    unread_count: 'GET /api/student/notifications/unread-count',
                    submit_assignment: 'POST /api/student/notifications/submit-assignment'
                }
            });
        });

        this.app.get('/api/student/academic-reports/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ Student Academic Reports API is ready!',
                endpoints: {
                    get_reports: 'GET /api/student/academic-reports?period=weekly',
                    get_details: 'GET /api/student/academic-reports/:report_id',
                    download_pdf: 'GET /api/student/academic-reports/:report_id/download?format=pdf',
                    download_excel: 'GET /api/student/academic-reports/:report_id/download?format=excel',
                    get_stats: 'GET /api/student/academic-reports/stats'
                }
            });
        });

        this.app.get('/api/student/today-classes/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ Student Today\'s Classes API is ready!',
                endpoints: {
                    get_today_classes: 'GET /api/student/today-classes?filter=all',
                    get_class_details: 'GET /api/student/today-classes/:class_id',
                    get_weekly_schedule: 'GET /api/student/weekly-schedule',
                    get_today_attendance: 'GET /api/student/today-attendance',
                    get_class_summary: 'GET /api/student/class-summary'
                }
            });
        });

        this.app.get('/api/student/attendance/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ Student Attendance API is ready!',
                endpoints: {
                    get_attendance: 'GET /api/student/attendance?period=weekly',
                    get_subject_attendance: 'GET /api/student/attendance/subject/:classroom_id',
                    get_summary: 'GET /api/student/attendance/summary',
                    get_today: 'GET /api/student/attendance/today'
                }
            });
        });

        this.app.get('/api/teacher/test', (req, res) => {
            res.json({
                success: true,
                message: '✅ Teacher API is ready!',
                endpoints: {
                    stats: 'GET /api/teacher/stats',
                    profile: 'GET /api/teacher/profile',
                    my_classes: 'GET /api/teacher/my-classes',
                    academic_reports: {
                        get_classes: 'GET /api/teacher/report/classes',
                        save_report: 'POST /api/teacher/report/save',
                        download_pdf: 'GET /api/teacher/report/download/:student_id/:class_id/:period?format=pdf',
                        download_excel: 'GET /api/teacher/report/download/:student_id/:class_id/:period?format=excel'
                    }
                }
            });
        });

        this.app.get('/api/email/docs', (req, res) => {
            res.json({
                success: true,
                message: '✅ Email API is ready!',
                endpoints: {
                    send_email: 'POST /api/email/send',
                    welcome_email: 'POST /api/email/welcome',
                    otp_email: 'POST /api/email/otp',
                    approval_email: 'POST /api/email/approval'
                }
            });
        });

        this.app.get('/api/docs', (req, res) => {
            res.json({
                name: 'Smart Desk API',
                version: '2.0.0',
                description: 'Complete API for Smart Desk Education Management System',
                base_url: `http://localhost:${this.PORT}/api`,
                endpoints: {
                    auth: '/api/auth',
                    otp: '/api/otp',
                    admin: '/api/admin',
                    coordinator: '/api/coordinator',
                    teacher: '/api/teacher',
                    student: '/api/student',
                    announcements: '/api/announcements',
                    email: '/api/email',
                    sync: '/api/sync',
                    uploads: '/uploads'
                }
            });
        });
    }

        initializeSuperDeleteRoute() {
        const deleteHandler = async (req, res) => {
            console.log('🔥🔥🔥 SUPER DELETE ROUTE HIT! ID:', req.params.id);
            try {
                // Pehle replies delete karo (agar hain)
                await this.db.query('DELETE FROM notification_replies WHERE notification_id = ?', [req.params.id]).catch(() => {});
                // Phir main notification delete karo
                await this.db.query('DELETE FROM notifications WHERE notification_id = ?', [req.params.id]);
                res.json({ success: true, message: 'Response deleted permanently!' });
            } catch (err) {
                console.error('Super delete error:', err);
                res.status(500).json({ success: false, error: err.message });
            }
        };

        //  Dono URLs ko handle karein (With and without /api prefix)
        this.app.post('/super-delete-response/:id', auth.authenticate, auth.adminOnly, deleteHandler);
        this.app.post('/api/super-delete-response/:id', auth.authenticate, auth.adminOnly, deleteHandler);
    }

    //  
    // 4. ERROR HANDLING MIDDLEWARE
    //  
    initializeErrorHandling() {
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Route not found',
                path: req.originalUrl
            });
        });

        this.app.use((err, req, res, next) => {
            console.error('❌ Global Error:', err);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        });
    }


    //  
    // 5. START SERVER
    //  
    start() {
        this.app.listen(this.PORT, '0.0.0.0', () => {
            console.log('\n========================================');
            console.log('🚀 Smart Desk Server Started Successfully!');
            console.log('========================================');
            console.log(`📡 Server: http://localhost:${this.PORT}`);
            console.log(`🔍 Test: http://localhost:${this.PORT}/api/test`);
            console.log(`🗄️  DB Test: http://localhost:${this.PORT}/api/db-test`);
            console.log(`❤️  Health: http://localhost:${this.PORT}/api/health`);
            console.log(`📚 Docs: http://localhost:${this.PORT}/api/docs`);
            console.log('========================================');
            console.log('✅ Admin Module Loaded');
            console.log('✅ Coordinator Module Loaded');
            console.log('✅ Teacher Module Loaded');
            console.log('✅ Student Module Loaded');
            console.log('✅ Email Module Loaded');
            console.log('✅ Sync Module Loaded (Offline Sync - 9 Endpoints)');
            console.log('✅ Static Files: /uploads');
            console.log('========================================\n');
        });
    }

    getApp() {
        return this.app;
    }
}

const server = new Server();
server.start();

module.exports = server;