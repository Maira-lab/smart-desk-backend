// src/controllers/coordinatorController.js
//  OOP APPROACH - Complete with Coordinator Reports + View Notifications + Send Notification (Email + Push)
//  FIXED: Semester Optional + "None" Support + Foreign Key Issue Resolved
//  NEW: Notification Reply Feature Added
//  NEW: Direct File Attachment Support in Notifications (Admin Pattern)
//  ENHANCED: Better debugging in getEnrolledStudents

const db = require('../config/db');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const emailService = require('../services/emailService');
const pushService = require('../services/pushService');

//  NEW: Multer for file uploads
const multer = require('multer');
const path = require('path');
const fs = require('fs');

//  Multer setup - Memory storage (file buffer mein aayegi, disk par bhi save hogi)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
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
console.log(`✅ Coordinator: File accepted via extension: ${originalName}`);
cb(null, true);
return;
}
}

console.warn(`⚠️ Coordinator: File rejected: ${file.originalname} | mimetype: ${mimetype}`);
cb(new Error('Invalid file type. Only PDF, Images, Videos, and Documents are allowed.'), false);
}
});

//  
// COORDINATOR CONTROLLER CLASS
//  
class CoordinatorController {
    constructor() {
        this.db = db;

        //  CRITICAL: Bind all methods to preserve 'this' context
        this.getStats = this.getStats.bind(this);
        this.getApprovedAccounts = this.getApprovedAccounts.bind(this);
        this.getUserDetails = this.getUserDetails.bind(this);
        this.getApprovalStats = this.getApprovalStats.bind(this);
        this.getSemesters = this.getSemesters.bind(this);
        this.createSemester = this.createSemester.bind(this);
        this.updateSemester = this.updateSemester.bind(this);
        this.deleteSemester = this.deleteSemester.bind(this);
        this.getClasses = this.getClasses.bind(this);
        this.createClass = this.createClass.bind(this);
        this.updateClass = this.updateClass.bind(this);
        this.deleteClass = this.deleteClass.bind(this);
        this.getTimetable = this.getTimetable.bind(this);
        this.getAssignedClasses = this.getAssignedClasses.bind(this);
        this.getAlerts = this.getAlerts.bind(this);
        this.getAdminNotifications = this.getAdminNotifications.bind(this);
        this.getTeacherMessages = this.getTeacherMessages.bind(this);
        this.getStudentMessages = this.getStudentMessages.bind(this);
        this.markNotificationRead = this.markNotificationRead.bind(this);
        this.markAllNotificationsRead = this.markAllNotificationsRead.bind(this);
        this.getNotificationCounts = this.getNotificationCounts.bind(this);
        this.getProfile = this.getProfile.bind(this);
        this.getTeachers = this.getTeachers.bind(this);
        this.getAssignableClasses = this.getAssignableClasses.bind(this);
        this.assignTeacher = this.assignTeacher.bind(this);
        this.unassignTeacher = this.unassignTeacher.bind(this);
        this.getClassDetails = this.getClassDetails.bind(this);
        this.getApprovedStudents = this.getApprovedStudents.bind(this);
        this.enrollStudents = this.enrollStudents.bind(this);
        this.getEnrolledStudents = this.getEnrolledStudents.bind(this);
        this.updateEnrollmentStatus = this.updateEnrollmentStatus.bind(this);
        this.promoteClass = this.promoteClass.bind(this);
        this.getPerformanceReports = this.getPerformanceReports.bind(this);
        this.getPerformanceReportDetails = this.getPerformanceReportDetails.bind(this);
        this.buildLiveStudents = this.buildLiveStudents.bind(this);
        this.downloadPerformanceReport = this.downloadPerformanceReport.bind(this);
        this.getReportRequests = this.getReportRequests.bind(this);
        this.submitReport = this.submitReport.bind(this);
        this.getSubmittedReports = this.getSubmittedReports.bind(this);
        this.getRecipients = this.getRecipients.bind(this);
        this.sendNotification = this.sendNotification.bind(this);
        this.sendBulkNotification = this.sendBulkNotification.bind(this);
        this.getNotificationHistory = this.getNotificationHistory.bind(this);
        this.getNotificationStats = this.getNotificationStats.bind(this);
        //  Reply methods
        this.getNotificationReplies = this.getNotificationReplies.bind(this);
        this.replyToNotification = this.replyToNotification.bind(this);
        this.deleteNotification = this.deleteNotification.bind(this);

    }

    //  
    // 1. GET DASHBOARD STATS
    //  
    async getStats(req, res) {
        try {
            const coordinatorId = req.user?.user_id;

            if (!coordinatorId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            const nameQuery = 'SELECT full_name FROM users WHERE user_id = ?';
            const nameResult = await db.query(nameQuery, [coordinatorId]);
            const coordinatorName = nameResult[0]?.full_name || 'Coordinator';

            const approvedQuery = 'SELECT COUNT(*) AS total FROM users WHERE status = "Active" AND user_role IN ("Teacher", "Student")';
            const approvedResult = await db.query(approvedQuery);

            const classesQuery = `
                SELECT COUNT(*) AS classes 
                FROM classrooms 
                WHERE coordinator_id = (
                    SELECT coordinator_id FROM coordinators WHERE user_id = ?
                )
            `;
            const classResult = await db.query(classesQuery, [coordinatorId]);

            const alertsQuery = `
                SELECT COUNT(*) AS alerts 
                FROM notifications 
                WHERE receiver_id = ? AND is_read = FALSE
            `;
            const alertResult = await db.query(alertsQuery, [coordinatorId]);

            const pendingReportsQuery = `
                SELECT COUNT(*) AS pending 
                FROM report_requests 
                WHERE coordinator_id = ? AND status = 'pending'
            `;
            const pendingReportsResult = await db.query(pendingReportsQuery, [coordinatorId]);

            res.json({
                success: true,
                stats: {
                    coordinatorName: coordinatorName,
                    totalApproved: approvedResult[0]?.total || 0,
                    assignedClasses: classResult[0]?.classes || 0,
                    urgentAlerts: alertResult[0]?.alerts || 0,
                    pendingReports: pendingReportsResult[0]?.pending || 0
                }
            });
        } catch (error) {
            console.error('Stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 2. GET APPROVED ACCOUNTS
    //  
    async getApprovedAccounts(req, res) {
        try {
            const { role = 'all', search = '' } = req.query;

            let whereClause = `WHERE status = 'Active' AND user_role IN ('Teacher', 'Student')`;
            const params = [];

            if (role !== 'all') {
                const roleMap = { 'teacher': 'Teacher', 'student': 'Student' };
                const dbRole = roleMap[role];
                if (dbRole) {
                    whereClause += ` AND user_role = ?`;
                    params.push(dbRole);
                }
            }

            if (search) {
                whereClause += ` AND (full_name LIKE ? OR email LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`);
            }

            const countQuery = `SELECT COUNT(*) AS total FROM users ${whereClause}`;
            const countResult = await db.query(countQuery, params);
            const total = countResult[0]?.total || 0;

            const query = `
                SELECT 
                    user_id AS id,
                    full_name AS fullName,
                    email,
                    user_role AS role,
                    status,
                    institute_name AS institute,
                    department_name AS department,
                    class_name AS className,
                    semester,
                    roll_no AS rollNo,
                    section,
                    DATE_FORMAT(created_at, '%b %d, %Y') AS accountCreated,
                    DATE_FORMAT(updated_at, '%b %d, %Y') AS approvalDate,
                    'Admin' AS approvedBy
                FROM users
                ${whereClause}
                ORDER BY user_role ASC, created_at DESC
            `;

            const results = await db.query(query, params);

            const formattedUsers = results.map(user => {
                const baseUser = {
                    id: user.id?.toString(),
                    fullName: user.fullName || 'Unknown',
                    email: user.email || 'N/A',
                    role: user.role?.toLowerCase() || 'student',
                    status: 'approved',
                    approvalDate: user.approvalDate || new Date().toLocaleDateString(),
                    approvedBy: user.approvedBy || 'Admin',
                    accountCreated: user.accountCreated || new Date().toLocaleDateString()
                };

                if (user.role === 'Teacher') {
                    return { ...baseUser, institute: user.institute || 'N/A' };
                } else {
                    return {
                        ...baseUser,
                        rollNo: user.rollNo || 'N/A',
                        section: user.section || 'N/A',
                        className: user.className || 'N/A',
                        semester: user.semester || 'N/A'
                    };
                }
            });

            res.json({
                success: true,
                users: formattedUsers,
                total: total,
                count: formattedUsers.length
            });
        } catch (error) {
            console.error('Get approved accounts error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 3. GET USER DETAILS - READ ONLY
    //  
    async getUserDetails(req, res) {
        try {
            const { user_id } = req.params;

            if (!user_id) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required'
                });
            }

            const query = `
                SELECT 
                    user_id AS id,
                    full_name AS fullName,
                    email,
                    user_role AS role,
                    status,
                    institute_name AS institute,
                    department_name AS department,
                    class_name AS className,
                    semester,
                    roll_no AS rollNo,
                    section,
                    DATE_FORMAT(created_at, '%b %d, %Y') AS accountCreated,
                    DATE_FORMAT(updated_at, '%b %d, %Y') AS approvalDate,
                    'Admin' AS approvedBy
                FROM users
                WHERE user_id = ? AND status = 'Active' AND user_role IN ('Teacher', 'Student')
            `;

            const results = await db.query(query, [user_id]);

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Approved user not found'
                });
            }

            const user = results[0];

            const formattedUser = {
                id: user.id?.toString(),
                fullName: user.fullName || 'Unknown',
                email: user.email || 'N/A',
                role: user.role?.toLowerCase() || 'student',
                status: 'approved',
                approvalDate: user.approvalDate || new Date().toLocaleDateString(),
                approvedBy: user.approvedBy || 'Admin',
                accountCreated: user.accountCreated || new Date().toLocaleDateString()
            };

            if (user.role === 'Teacher') {
                formattedUser.institute = user.institute || 'N/A';
            } else {
                formattedUser.rollNo = user.rollNo || 'N/A';
                formattedUser.section = user.section || 'N/A';
                formattedUser.className = user.className || 'N/A';
                formattedUser.semester = user.semester || 'N/A';
            }

            res.json({
                success: true,
                user: formattedUser
            });
        } catch (error) {
            console.error('Get user details error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 4. GET APPROVAL STATISTICS
    //  
    async getApprovalStats(req, res) {
        try {
            const totalQuery = `
                SELECT COUNT(*) AS total FROM users 
                WHERE status = 'Active' AND user_role IN ('Teacher', 'Student')
            `;
            const totalResult = await db.query(totalQuery);

            const teacherQuery = `
                SELECT COUNT(*) AS count FROM users 
                WHERE status = 'Active' AND user_role = 'Teacher'
            `;
            const teacherResult = await db.query(teacherQuery);

            const studentQuery = `
                SELECT COUNT(*) AS count FROM users 
                WHERE status = 'Active' AND user_role = 'Student'
            `;
            const studentResult = await db.query(studentQuery);

            const recentQuery = `
                SELECT COUNT(*) AS count FROM users 
                WHERE status = 'Active' 
                AND user_role IN ('Teacher', 'Student')
                AND updated_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
            `;
            const recentResult = await db.query(recentQuery);

            res.json({
                success: true,
                stats: {
                    total: totalResult[0]?.total || 0,
                    teachers: teacherResult[0]?.count || 0,
                    students: studentResult[0]?.count || 0,
                    recentApprovals: recentResult[0]?.count || 0
                }
            });
        } catch (error) {
            console.error('Get approval stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 5. GET ALL SEMESTERS
    //  
    async getSemesters(req, res) {
        try {
            const query = `
                SELECT 
                    semester_id AS id,
                    semester_code AS semId,
                    department_name AS department,
                    year,
                    is_active
                FROM semesters
                ORDER BY year DESC, semester_code ASC
            `;

            const results = await db.query(query);

            res.json({
                success: true,
                semesters: results,
                count: results.length
            });
        } catch (error) {
            console.error('Get semesters error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 6. CREATE SEMESTER
    //  
    async createSemester(req, res) {
        try {
            const { semester_code, department_name, year } = req.body;

            if (!semester_code || !department_name || !year) {
                return res.status(400).json({
                    success: false,
                    error: 'Please provide semester_code, department_name, and year'
                });
            }

            const checkQuery = 'SELECT * FROM semesters WHERE semester_code = ? AND department_name = ?';
            const checkResult = await db.query(checkQuery, [semester_code, department_name]);

            if (checkResult.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Semester already exists for this department'
                });
            }

            const query = `
                INSERT INTO semesters (semester_code, department_name, year, is_active)
                VALUES (?, ?, ?, TRUE)
            `;

            const result = await db.query(query, [semester_code, department_name, year]);

            res.status(201).json({
                success: true,
                message: 'Semester created successfully!',
                semester_id: result.insertId
            });
        } catch (error) {
            console.error('Create semester error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 7. UPDATE SEMESTER
    //  
    async updateSemester(req, res) {
        try {
            const { semester_id } = req.params;
            const { semester_code, department_name, year, is_active } = req.body;

            if (!semester_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Semester ID is required'
                });
            }

            const query = `
                UPDATE semesters 
                SET semester_code = ?, department_name = ?, year = ?, is_active = ?
                WHERE semester_id = ?
            `;

            await db.query(query, [semester_code, department_name, year, is_active, semester_id]);

            res.json({
                success: true,
                message: 'Semester updated successfully!'
            });
        } catch (error) {
            console.error('Update semester error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 8. DELETE SEMESTER
    //  
    async deleteSemester(req, res) {
        try {
            const { semester_id } = req.params;

            if (!semester_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Semester ID is required'
                });
            }

            const checkQuery = 'SELECT COUNT(*) AS count FROM classrooms WHERE semester_id = ?';
            const checkResult = await db.query(checkQuery, [semester_id]);

            if (checkResult[0]?.count > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot delete semester with existing classes'
                });
            }

            const query = 'DELETE FROM semesters WHERE semester_id = ?';
            await db.query(query, [semester_id]);

            res.json({
                success: true,
                message: 'Semester deleted successfully!'
            });
        } catch (error) {
            console.error('Delete semester error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 9. GET ALL CLASSES
        //  
    // 9. GET ALL CLASSES
    //  
    async getClasses(req, res) {
        try {
            const query = `
                SELECT
                    c.classroom_id AS id,
                    c.class_code AS classId,
                    c.class_name AS className,
                    c.semester_id AS semId,
                    c.subject_name AS subject,
                    c.day,
                    c.start_time AS startTime,
                    c.end_time AS endTime,
                    c.room,
                    c.teacher_name AS teacher,
                    COALESCE(c.semester, s.semester_code, '') AS semester,
                    COALESCE(c.department_name, s.department_name, '') AS department,
                    COALESCE(c.section, '') AS section,
                    c.notes
                FROM classrooms c
                LEFT JOIN semesters s ON c.semester_id = s.semester_id
                ORDER BY c.day, c.start_time
            `;
            const results = await db.query(query);
            res.json({
                success: true,
                classes: results,
                count: results.length
            });
        } catch (error) {
            console.error('Get classes error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }
    //  
    // 10. CREATE CLASS - ✅ FIXED: Semester Optional + "None" Support
    //  
    async createClass(req, res) {
        try {
            const coordinatorId = req.user?.user_id;
            const {
                class_code,
                class_name,
                semester_id,
                semester,
                subject_name,
                day,
                start_time,
                end_time,
                room,
                teacher_name,
                department_name,
                notes
            } = req.body;

            console.log('📝 Create class payload:', req.body);

            if (!subject_name) {
                return res.status(400).json({
                    success: false,
                    error: 'Subject name is required'
                });
            }

            let final_semester_id = null;
            const semesterValue = semester_id || semester;

            if (semesterValue !== null && semesterValue !== undefined && semesterValue !== '') {
                const semesterStr = semesterValue.toString().trim().toLowerCase();

                if (semesterStr === 'none' || semesterStr === 'null' || semesterStr === 'n/a' || semesterStr === '') {
                    final_semester_id = null;
                    console.log('ℹ️ Semester set to NULL (None selected)');
                } else {
                    const match = semesterStr.match(/\d+/);

                    if (match) {
                        const extractedNumber = parseInt(match[0]);

                        const semesterCheck = await db.query(
                            'SELECT semester_id FROM semesters WHERE semester_id = ?',
                            [extractedNumber]
                        );

                        if (semesterCheck.length > 0) {
                            final_semester_id = extractedNumber;
                            console.log(`✅ Semester ${extractedNumber} found in database`);
                        } else {
                            final_semester_id = null;
                            console.log(`⚠️ Semester ${extractedNumber} not found. Setting to NULL.`);
                        }
                    } else {
                        final_semester_id = null;
                        console.log('⚠️ Invalid semester format. Setting to NULL.');
                    }
                }
            }

            const final_class_code = class_code || `CLS-${Date.now()}`;
            const final_class_name = class_name || `${subject_name} - ${final_class_code}`;

            const coordQuery = 'SELECT coordinator_id FROM coordinators WHERE user_id = ?';
            const coordResult = await db.query(coordQuery, [coordinatorId]);

            let coordinator_internal_id = null;
            if (coordResult.length > 0) {
                coordinator_internal_id = coordResult[0].coordinator_id;
            }

            //  FIX: Semester text column ko bhi save karo
            const semesterText = semester || (final_semester_id ? `Semester ${final_semester_id}` : null);

            const query = `
                INSERT INTO classrooms (
                    class_code, 
                    class_name,
                    semester_id, 
                    semester,
                    department_name,
                    subject_name, 
                    day,
                    start_time, 
                    end_time, 
                    room, 
                    teacher_name,
                    coordinator_id, 
                    notes, 
                    is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
            `;

            const values = [
                final_class_code,
                final_class_name,
                final_semester_id,
                semesterText,
                department_name || null,
                subject_name,
                day || null,
                start_time || null,
                end_time || null,
                room || null,
                teacher_name || null,
                coordinator_internal_id,
                notes || null
            ];

            console.log('📊 Inserting values:', values);

            const result = await db.query(query, values);

            console.log(`✅ Class created: ${final_class_name} (ID: ${result.insertId})`);

            res.status(201).json({
                success: true,
                message: 'Class created successfully!',
                classroom_id: result.insertId,
                class_name: final_class_name,
                class_code: final_class_code,
                semester_id: final_semester_id
            });
        } catch (error) {
            console.error('❌ Create class error:', error);
            console.error('SQL Message:', error.sqlMessage);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 11. UPDATE CLASS - ✅ FIXED: Semester Optional
    //  
    async updateClass(req, res) {
        try {
            const { class_id } = req.params;
            const {
                class_code,
                class_name,
                semester_id,
                semester,
                subject_name,
                day,
                start_time,
                end_time,
                room,
                teacher_name,
                department_name,
                notes,
                is_active
            } = req.body;

            if (!class_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Class ID is required'
                });
            }

            let final_semester_id = null;
            const semesterValue = semester_id || semester;

            if (semesterValue !== null && semesterValue !== undefined && semesterValue !== '') {
                const semesterStr = semesterValue.toString().trim().toLowerCase();

                if (semesterStr !== 'none' && semesterStr !== 'null' && semesterStr !== 'n/a') {
                    const match = semesterStr.match(/\d+/);

                    if (match) {
                        const extractedNumber = parseInt(match[0]);

                        const semesterCheck = await db.query(
                            'SELECT semester_id FROM semesters WHERE semester_id = ?',
                            [extractedNumber]
                        );

                        if (semesterCheck.length > 0) {
                            final_semester_id = extractedNumber;
                        }
                    }
                }
            }

            //  FIX: Semester text column ko bhi update karo
            const semesterText = semester || (final_semester_id ? `Semester ${final_semester_id}` : null);

            const query = `
                UPDATE classrooms 
                SET class_code = ?, 
                    class_name = ?,
                    semester_id = ?, 
                    semester = ?,
                    department_name = ?,
                    subject_name = ?, 
                    day = ?, 
                    start_time = ?, 
                    end_time = ?, 
                    room = ?,
                    teacher_name = ?, 
                    notes = ?, 
                    is_active = ?
                WHERE classroom_id = ?
            `;

            await db.query(query, [
                class_code,
                class_name,
                final_semester_id,
                semesterText,
                department_name || null,
                subject_name,
                day,
                start_time,
                end_time,
                room,
                teacher_name,
                notes || null,
                is_active !== undefined ? is_active : true,
                class_id
            ]);

            res.json({
                success: true,
                message: 'Class updated successfully!'
            });
        } catch (error) {
            console.error('Update class error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 12. DELETE CLASS
    //  
    async deleteClass(req, res) {
        try {
            const { class_id } = req.params;

            if (!class_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Class ID is required'
                });
            }

            const query = 'DELETE FROM classrooms WHERE classroom_id = ?';
            await db.query(query, [class_id]);

            res.json({
                success: true,
                message: 'Class deleted successfully!'
            });
        } catch (error) {
            console.error('Delete class error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 13. GET TIMETABLE
        //  
    // 13. GET TIMETABLE - ✅ FIXED: Sirf apni classes ka timetable
    //  
    async getTimetable(req, res) {
        try {
            const coordinatorId = req.user?.user_id;
            if (!coordinatorId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }
            
            const coordQuery = 'SELECT coordinator_id FROM coordinators WHERE user_id = ?';
            const coordResult = await db.query(coordQuery, [coordinatorId]);
            if (coordResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Coordinator not found'
                });
            }
            const coordId = coordResult[0].coordinator_id;
            
            const query = `
                SELECT
                    c.classroom_id AS id,
                    c.class_code AS classId,
                    c.class_name AS className,
                    c.day,
                    c.start_time AS startTime,
                    c.end_time AS endTime,
                    c.subject_name AS subject,
                    c.teacher_name AS teacher,
                    c.room,
                    COALESCE(c.semester, s.semester_code, '') AS semester,
                    COALESCE(c.department_name, s.department_name, '') AS department,
                    COALESCE(c.section, '') AS section,
                    c.notes
                FROM classrooms c
                LEFT JOIN semesters s ON c.semester_id = s.semester_id
                WHERE c.is_active = TRUE
                AND c.day IS NOT NULL
                AND c.coordinator_id = ?
                ORDER BY FIELD(c.day, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'), c.start_time
            `;
            const results = await db.query(query, [coordId]);
            res.json({
                success: true,
                timetable: results,
                count: results.length
            });
        } catch (error) {
            console.error('Get timetable error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }
    //  
    // 14. GET ASSIGNED CLASSES
    //  
    async getAssignedClasses(req, res) {
        try {
            const coordinatorId = req.user?.user_id;

            const coordQuery = 'SELECT coordinator_id FROM coordinators WHERE user_id = ?';
            const coordResult = await db.query(coordQuery, [coordinatorId]);

            if (coordResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Coordinator not found'
                });
            }

            const coordId = coordResult[0].coordinator_id;

            const query = `
                SELECT 
                    c.classroom_id, 
                    c.class_name, 
                    c.class_code,
                    COALESCE(c.semester, s.semester_code, '') AS semester,
                    COALESCE(c.department_name, s.department_name, '') AS department_name,
                    COALESCE(c.section, '') AS section,
                    c.subject_name, 
                    c.is_active, 
                    c.created_at,
                    s.semester_code,
                    (SELECT COUNT(*) FROM enrollments WHERE classroom_id = c.classroom_id AND status = 'Active') AS total_students
                FROM classrooms c
                LEFT JOIN semesters s ON c.semester_id = s.semester_id
                WHERE c.coordinator_id = ?
                ORDER BY c.created_at DESC
            `;

            const results = await db.query(query, [coordId]);

            res.json({
                success: true,
                classes: results,
                count: results.length
            });
        } catch (error) {
            console.error('Get assigned classes error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

// 15. GET ALL NOTIFICATIONS (View Notifications) - ✅ FIXED
//  
    // 15. GET ALL NOTIFICATIONS - ✅ FIXED: Sender Name + Attachment URL
    async getAlerts(req, res) {
        try {
            const coordinatorId = req.user?.user_id;
            const query = `
                SELECT
                    n.notification_id AS id,
                    n.title AS subject,
                    n.message,
                    DATE_FORMAT(n.created_at, '%b %d, %Y') AS date,
                    n.notification_type AS type,
                    n.sender_role AS senderRole,
                    n.sender_id AS senderId,
                    u.full_name AS senderName,
                    u.email AS senderEmail,
                    n.is_read AS isRead,
                    n.created_at AS timestamp,
                    n.attachment_url AS attachmentUrl
                FROM notifications n
                LEFT JOIN users u ON n.sender_id = u.user_id
                WHERE (n.receiver_id = ? OR (n.receiver_id IS NULL AND (n.receiver_role = 'Coordinator' OR n.receiver_role = 'All')))
                ORDER BY n.created_at DESC
                LIMIT 50
            `;
            const results = await db.query(query, [coordinatorId]);
            const formattedNotifications = results.map(notif => {
                let type = 'info';
                if (notif.type === 'Announcement' || notif.type === 'Alert' || notif.type === 'System') type = 'alert';
                else if (notif.type === 'Reminder') type = 'reminder';
                return {
                    id: notif.id?.toString(),
                    subject: notif.subject || 'No Subject',
                    message: notif.message || 'No message',
                    date: notif.date || new Date().toLocaleDateString(),
                    type: type,
                    read: notif.isRead === 1,
                    senderRole: notif.senderRole || 'Admin',
                    senderId: notif.senderId?.toString() || null,
                    senderName: notif.senderName || null,
                    senderEmail: notif.senderEmail || null,
                    attachmentUrl: notif.attachmentUrl || null
                };
            });
            const adminNotifications = formattedNotifications.filter(n => n.senderRole === 'Admin' || n.senderRole === 'System');
            const teacherNotifications = formattedNotifications.filter(n => n.senderRole === 'Teacher');
            const studentNotifications = formattedNotifications.filter(n => n.senderRole === 'Student');
            res.json({
                success: true,
                admin: adminNotifications,
                teachers: teacherNotifications,
                students: studentNotifications,
                total: formattedNotifications.length,
                unreadCount: formattedNotifications.filter(n => !n.read).length
            });
        } catch (error) {
            console.error('Get alerts error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }
    //  
    // 16. GET ADMIN NOTIFICATIONS
    //  
    async getAdminNotifications(req, res) {
        try {
            const coordinatorId = req.user?.user_id;

            const query = `
                SELECT 
                    notification_id AS id,
                    title AS subject,
                    message,
                    DATE_FORMAT(created_at, '%b %d, %Y') AS date,
                    notification_type AS type,
                    'Admin' AS senderRole,
                    is_read AS \`read\`,
                    attachment_url AS attachmentUrl
                FROM notifications 
               WHERE (receiver_id = ? OR (receiver_id IS NULL AND (receiver_role = 'Coordinator' OR receiver_role = 'All')))
                AND sender_role IN ('Admin', 'System')
                ORDER BY created_at DESC
                LIMIT 50
            `;

            const results = await db.query(query, [coordinatorId]);

            const formattedNotifications = results.map(notif => {
                let type = 'info';
                if (notif.type === 'Alert' || notif.type === 'System') type = 'alert';
                else if (notif.type === 'Reminder') type = 'reminder';

                return {
                    id: notif.id?.toString(),
                    subject: notif.subject || 'No Subject',
                    message: notif.message || 'No message',
                    date: notif.date || new Date().toLocaleDateString(),
                    type: type,
                    read: notif.read === 1,
                    attachmentUrl: notif.attachmentUrl || null
                };
            });

            res.json({
                success: true,
                notifications: formattedNotifications,
                count: formattedNotifications.length,
                unreadCount: formattedNotifications.filter(n => !n.read).length
            });

        } catch (error) {
            console.error('Get admin notifications error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 17. GET TEACHER MESSAGES
    //  
    async getTeacherMessages(req, res) {
        try {
            const coordinatorId = req.user?.user_id;

            const query = `
                SELECT 
                    n.notification_id AS id,
                    n.title AS subject,
                    n.message,
                    DATE_FORMAT(n.created_at, '%b %d, %Y') AS date,
                    u.full_name AS senderName,
                    'Teacher' AS senderRole,
                    n.is_read AS \`read\`,
                    n.notification_type AS relatedTo,
                    n.attachment_url AS attachmentUrl,
                    n.sender_id AS senderId
                FROM notifications n
                JOIN users u ON n.sender_id = u.user_id
                WHERE n.receiver_id = ?
                AND n.sender_role = 'Teacher'
                ORDER BY n.created_at DESC
                LIMIT 50
            `;

            const results = await db.query(query, [coordinatorId]);

            const formattedMessages = results.map(msg => ({
                id: msg.id?.toString(),
                senderName: msg.senderName || 'Unknown Teacher',
                senderId: msg.senderId?.toString(),
                subject: msg.subject || 'No Subject',
                message: msg.message || 'No message',
                date: msg.date || new Date().toLocaleDateString(),
                relatedTo: msg.relatedTo || 'General',
                read: msg.read === 1,
                attachmentUrl: msg.attachmentUrl || null
            }));

            res.json({
                success: true,
                notifications: formattedMessages,
                count: formattedMessages.length,
                unreadCount: formattedMessages.filter(n => !n.read).length
            });

        } catch (error) {
            console.error('Get teacher messages error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 18. GET STUDENT MESSAGES
    //  
    async getStudentMessages(req, res) {
        try {
            const coordinatorId = req.user?.user_id;

            const query = `
                SELECT 
                    n.notification_id AS id,
                    n.title AS subject,
                    n.message,
                    DATE_FORMAT(n.created_at, '%b %d, %Y') AS date,
                    u.full_name AS senderName,
                    u.roll_no AS rollNo,
                    'Student' AS senderRole,
                    n.is_read AS \`read\`,
                    n.notification_type AS relatedTo,
                    n.attachment_url AS attachmentUrl,
                    n.sender_id AS senderId
                FROM notifications n
                JOIN users u ON n.sender_id = u.user_id
                WHERE n.receiver_id = ?
                AND n.sender_role = 'Student'
                ORDER BY n.created_at DESC
                LIMIT 50
            `;

            const results = await db.query(query, [coordinatorId]);

            const formattedMessages = results.map(msg => ({
                id: msg.id?.toString(),
                senderName: msg.senderName || 'Unknown Student',
                senderId: msg.senderId?.toString(),
                rollNo: msg.rollNo || 'N/A',
                subject: msg.subject || 'No Subject',
                message: msg.message || 'No message',
                date: msg.date || new Date().toLocaleDateString(),
                relatedTo: msg.relatedTo || 'General',
                read: msg.read === 1,
                attachmentUrl: msg.attachmentUrl || null
            }));

            res.json({
                success: true,
                notifications: formattedMessages,
                count: formattedMessages.length,
                unreadCount: formattedMessages.filter(n => !n.read).length
            });

        } catch (error) {
            console.error('Get student messages error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 19. MARK NOTIFICATION READ
    //  
    async markNotificationRead(req, res) {
        try {
            const { notification_id } = req.params;
            const coordinatorId = req.user?.user_id;

            if (!notification_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Notification ID is required'
                });
            }

            const query = 'UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND receiver_id = ?';
            await db.query(query, [notification_id, coordinatorId]);

            res.json({
                success: true,
                message: 'Notification marked as read'
            });

        } catch (error) {
            console.error('Mark notification read error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }
// 20. MARK ALL NOTIFICATIONS READ - ✅ FIXED
//  
async markAllNotificationsRead(req, res) {
    try {
        const coordinatorId = req.user?.user_id;

        //  FIXED: Targeted - sirf coordinator ki notifications
        const query = `
            UPDATE notifications 
            SET is_read = TRUE 
            WHERE (receiver_id = ? OR (receiver_id IS NULL AND (receiver_role = 'Coordinator' OR receiver_role = 'All')))
            AND is_read = FALSE
        `;
        await db.query(query, [coordinatorId]);

        res.json({
            success: true,
            message: 'All notifications marked as read'
        });

    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error: ' + error.message
        });
    }
}
    //  
    // 21. GET NOTIFICATION COUNTS
    //  
    async getNotificationCounts(req, res) {
        try {
            const coordinatorId = req.user?.user_id;

            const adminQuery = `
SELECT 
    COUNT(*) AS count,
    SUM(CASE WHEN is_read = FALSE THEN 1 ELSE 0 END) AS unread
FROM notifications
WHERE 
(
    receiver_id = ? 
    OR 
    (
        receiver_id IS NULL 
        AND 
        (receiver_role = 'Coordinator' OR receiver_role = 'All')
    )
)
AND sender_role IN ('Admin', 'System')`;            const adminResult = await db.query(adminQuery, [coordinatorId]);

            const teacherQuery = `
                SELECT COUNT(*) AS count, 
                       SUM(CASE WHEN is_read = FALSE THEN 1 ELSE 0 END) AS unread
                FROM notifications 
                WHERE receiver_id = ? AND sender_role = 'Teacher'
            `;
            const teacherResult = await db.query(teacherQuery, [coordinatorId]);

            const studentQuery = `
                SELECT COUNT(*) AS count, 
                       SUM(CASE WHEN is_read = FALSE THEN 1 ELSE 0 END) AS unread
                FROM notifications 
                WHERE receiver_id = ? AND sender_role = 'Student'
            `;
            const studentResult = await db.query(studentQuery, [coordinatorId]);

            res.json({
                success: true,
                counts: {
                    admin: {
                        total: adminResult[0]?.count || 0,
                        unread: adminResult[0]?.unread || 0
                    },
                    teachers: {
                        total: teacherResult[0]?.count || 0,
                        unread: teacherResult[0]?.unread || 0
                    },
                    students: {
                        total: studentResult[0]?.count || 0,
                        unread: studentResult[0]?.unread || 0
                    },
                    totalUnread: (adminResult[0]?.unread || 0) + (teacherResult[0]?.unread || 0) + (studentResult[0]?.unread || 0)
                }
            });

        } catch (error) {
            console.error('Get notification counts error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 22. GET PROFILE
    //  
    async getProfile(req, res) {
        try {
            const coordinatorId = req.user?.user_id;

            const query = `
                SELECT u.user_id, u.email, u.full_name, u.user_role, 
                       u.institute_name, u.status, u.created_at,
                       c.designation, c.joining_date
                FROM users u
                JOIN coordinators c ON u.user_id = c.user_id
                WHERE u.user_id = ?
            `;

            const results = await db.query(query, [coordinatorId]);

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Coordinator not found'
                });
            }

            res.json({
                success: true,
                coordinator: results[0]
            });
        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 23. GET TEACHERS
    //  
    async getTeachers(req, res) {
        try {
            const query = `
                SELECT 
                    u.user_id AS id,
                    u.full_name AS name,
                    u.email,
                    COALESCE(u.department_name, u.institute_name, 'Head Office') AS department,
                    t.specialization,
                    t.qualification,
                    t.joining_date
                FROM users u
                JOIN teachers t ON u.user_id = t.user_id
                WHERE u.status = 'Active' AND u.user_role = 'Teacher'
                ORDER BY u.full_name ASC
            `;

            const results = await db.query(query);

            res.json({
                success: true,
                teachers: results,
                count: results.length
            });
        } catch (error) {
            console.error('Get teachers error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 24. GET ASSIGNABLE CLASSES
    //  
    async getAssignableClasses(req, res) {
        try {
            const coordinatorId = req.user?.user_id;

            const coordQuery = 'SELECT coordinator_id FROM coordinators WHERE user_id = ?';
            const coordResult = await db.query(coordQuery, [coordinatorId]);

            if (coordResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Coordinator not found'
                });
            }

            const coordId = coordResult[0].coordinator_id;

            const query = `
                SELECT 
                    c.classroom_id AS id,
                    c.class_code AS classId,
                    c.class_name AS className,
                    c.subject_name AS subject,
                    COALESCE(c.semester, s.semester_code, '') AS semester,
                    COALESCE(c.department_name, s.department_name, '') AS department_name,
                    COALESCE(c.section, '') AS section,
                    c.day,
                    c.start_time AS startTime,
                    c.end_time AS endTime,
                    c.room,
                    c.teacher_name AS assignedTeacher,
                    CASE 
                        WHEN c.teacher_name IS NOT NULL THEN 'assigned' 
                        ELSE 'unassigned' 
                    END AS status
                FROM classrooms c
                LEFT JOIN semesters s ON c.semester_id = s.semester_id
                WHERE c.coordinator_id = ? 
                AND c.is_active = TRUE
                ORDER BY c.day, c.start_time
            `;

            const results = await db.query(query, [coordId]);

            const formattedResults = await Promise.all(results.map(async (cls) => {
                let assignedEmail = null;
                if (cls.assignedTeacher) {
                    const emailQuery = 'SELECT email FROM users WHERE full_name = ? AND user_role = "Teacher"';
                    const emailResult = await db.query(emailQuery, [cls.assignedTeacher]);
                    if (emailResult.length > 0) {
                        assignedEmail = emailResult[0].email;
                    }
                }
                return {
                    ...cls,
                    assignedEmail: assignedEmail,
                    assignedTeacher: cls.assignedTeacher || null
                };
            }));

            res.json({
                success: true,
                classes: formattedResults,
                count: formattedResults.length
            });
        } catch (error) {
            console.error('Get assignable classes error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 25. ASSIGN TEACHER
    //  
    async assignTeacher(req, res) {
        try {
            const { class_id } = req.params;
            const { teacher_id } = req.body;
            const coordinatorId = req.user?.user_id;

            if (!class_id || !teacher_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Class ID and Teacher ID are required'
                });
            }

            const teacherQuery = `
                SELECT u.user_id, u.full_name, u.email, t.teacher_id AS internal_teacher_id 
                FROM users u
                JOIN teachers t ON u.user_id = t.user_id
                WHERE u.user_id = ? AND u.status = 'Active' AND u.user_role = 'Teacher'
            `;
            const teacherResult = await db.query(teacherQuery, [teacher_id]);

            if (teacherResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Teacher not found or inactive'
                });
            }

            const teacher = teacherResult[0];

            const classQuery = `
                SELECT c.*, s.semester_code 
                FROM classrooms c
                LEFT JOIN semesters s ON c.semester_id = s.semester_id
                WHERE c.classroom_id = ? 
                AND c.coordinator_id = (
                    SELECT coordinator_id FROM coordinators WHERE user_id = ?
                )
            `;
            const classResult = await db.query(classQuery, [class_id, coordinatorId]);

            if (classResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Class not found or not assigned to you'
                });
            }

            const classData = classResult[0];

            const updateQuery = `
                UPDATE classrooms 
                SET teacher_name = ?
                WHERE classroom_id = ?
            `;
            await db.query(updateQuery, [teacher.full_name, class_id]);

            const checkAssignmentQuery = 'SELECT * FROM classroom_teachers WHERE classroom_id = ?';
            const checkAssignment = await db.query(checkAssignmentQuery, [class_id]);

            if (checkAssignment.length > 0) {
                const updateAssignmentQuery = `
                    UPDATE classroom_teachers 
                    SET teacher_id = ?, assigned_date = CURDATE()
                    WHERE classroom_id = ?
                `;
                await db.query(updateAssignmentQuery, [teacher.internal_teacher_id || teacher_id, class_id]);
            } else {
                const insertAssignmentQuery = `
                    INSERT INTO classroom_teachers (classroom_id, teacher_id, subject_name, assigned_date)
                    VALUES (?, ?, ?, CURDATE())
                `;
                await db.query(insertAssignmentQuery, [class_id, teacher.internal_teacher_id || teacher_id, classData.subject_name]);
            }

            const logQuery = `
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'TEACHER_ASSIGNED', ?, 'Success', ?)
            `;
            await db.query(logQuery, [
                coordinatorId,
                `Assigned teacher ${teacher.full_name} to class ${classData.class_code} - ${classData.subject_name}`,
                req.ip || req.connection.remoteAddress
            ]);

                    const notifQuery = `
            INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role,
            notification_type, title, message, is_pushed)
            VALUES (?, 'Coordinator', ?, 'Teacher', 'Announcement', ?, ?, FALSE)
        `;
        const notifTitle = `📚 New Class Assignment: ${classData.subject_name}`;
        const notifMessage = `Dear ${teacher.full_name},
You have been assigned a new class.
📚 Subject: ${classData.subject_name}
📅 Days: ${classData.day || 'TBD'}
⏰ Time: ${classData.start_time || 'TBD'} - ${classData.end_time || 'TBD'}
📍 Room: ${classData.room || 'TBD'}
Please check your schedule for details.`;
        const notifResult = await db.query(notifQuery, [
            coordinatorId,
            teacher_id,
            notifTitle,
            notifMessage
        ]);
        
        // ✅ PUSH NOTIFICATION TO TEACHER
        try {
            const teacherToken = await db.query('SELECT push_token FROM users WHERE user_id = ?', [teacher_id]);
            if (teacherToken.length > 0 && teacherToken[0].push_token) {
                const pushResult = await pushService.sendAnnouncementPush({
                    pushToken: teacherToken[0].push_token,
                    title: notifTitle,
                    message: `You have been assigned to teach ${classData.subject_name}.`,
                    announcementId: notifResult.insertId
                });
                if (pushResult && pushResult.success) {
                    await db.query('UPDATE notifications SET is_pushed = TRUE WHERE notification_id = ?', [notifResult.insertId]);
                    console.log(`📱✅ Assignment push sent to ${teacher.full_name}`);
                }
            } else {
                console.log(`📱⚠️ No push token for teacher ${teacher_id}`);
            }
        } catch (pushErr) {
            console.error('⚠️ Assignment push error:', pushErr.message);
        }
        
        res.json({                success: true,
                message: 'Teacher assigned successfully!',
                assignment: {
                    classId: class_id,
                    teacherId: teacher_id,
                    teacherName: teacher.full_name,
                    teacherEmail: teacher.email,
                    subject: classData.subject_name
                }
            });

        } catch (error) {
            console.error('Assign teacher error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 26. UNASSIGN TEACHER
    //  
    async unassignTeacher(req, res) {
        try {
            const { class_id } = req.params;
            const coordinatorId = req.user?.user_id;

            if (!class_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Class ID is required'
                });
            }

            const classQuery = `
                SELECT c.*, s.semester_code 
                FROM classrooms c
                LEFT JOIN semesters s ON c.semester_id = s.semester_id
                WHERE c.classroom_id = ? 
                AND c.coordinator_id = (
                    SELECT coordinator_id FROM coordinators WHERE user_id = ?
                )
            `;
            const classResult = await db.query(classQuery, [class_id, coordinatorId]);

            if (classResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Class not found or not assigned to you'
                });
            }

            const classData = classResult[0];
            const teacherName = classData.teacher_name;

            const updateQuery = `
                UPDATE classrooms 
                SET teacher_name = NULL
                WHERE classroom_id = ?
            `;
            await db.query(updateQuery, [class_id]);

            try {
                const updateAssignmentQuery = `
                    UPDATE classroom_teachers 
                    SET teacher_id = NULL
                    WHERE classroom_id = ?
                `;
                await db.query(updateAssignmentQuery, [class_id]);
            } catch (e) {
                // Table might not exist
            }

            const logQuery = `
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'TEACHER_UNASSIGNED', ?, 'Success', ?)
            `;
            await db.query(logQuery, [
                coordinatorId,
                `Unassigned teacher ${teacherName || 'Unknown'} from class ${classData.class_code} - ${classData.subject_name}`,
                req.ip || req.connection.remoteAddress
            ]);

            res.json({
                success: true,
                message: 'Teacher unassigned successfully!',
                classId: class_id
            });

        } catch (error) {
            console.error('Unassign teacher error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 27. GET CLASS DETAILS
    //  
    async getClassDetails(req, res) {
        try {
            const { class_id } = req.params;
            const coordinatorId = req.user?.user_id;

            if (!class_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Class ID is required'
                });
            }

            const query = `
                SELECT 
                    c.classroom_id AS id,
                    c.class_code AS classId,
                    c.class_name AS className,
                    c.subject_name AS subject,
                    s.semester_code AS semester,
                    c.day,
                    c.start_time AS startTime,
                    c.end_time AS endTime,
                    c.room,
                    c.teacher_name AS assignedTeacher,
                    c.notes,
                    c.is_active
                FROM classrooms c
                LEFT JOIN semesters s ON c.semester_id = s.semester_id
                WHERE c.classroom_id = ? 
                AND c.coordinator_id = (
                    SELECT coordinator_id FROM coordinators WHERE user_id = ?
                )
            `;

            const results = await db.query(query, [class_id, coordinatorId]);

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Class not found'
                });
            }

            const classData = results[0];

            let teacherDetails = null;
            if (classData.assignedTeacher) {
                const teacherQuery = `
                    SELECT u.user_id AS id, u.full_name AS name, u.email
                    FROM users u
                    WHERE u.full_name = ? AND u.user_role = 'Teacher'
                `;
                const teacherResult = await db.query(teacherQuery, [classData.assignedTeacher]);
                if (teacherResult.length > 0) {
                    teacherDetails = teacherResult[0];
                }
            }

            res.json({
                success: true,
                class: {
                    ...classData,
                    teacher: teacherDetails
                }
            });

        } catch (error) {
            console.error('Get class details error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 28. GET APPROVED STUDENTS
    //  
   async getApprovedStudents(req, res) {
    try {
        const { search = '' } = req.query;

        let whereClause = `WHERE u.status = 'Active' AND u.user_role = 'Student'`;
        const params = [];

        if (search) {
            whereClause += ` AND (u.full_name LIKE ? OR u.email LIKE ? OR u.roll_no LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const query = `
            SELECT 
                u.user_id AS id,
                s.student_id AS internalStudentId,
                u.full_name AS name,
                u.email,
                u.roll_no AS rollNo,
                u.class_name AS className,
                u.semester,
                u.section,
                COALESCE(u.department_name, u.institute_name, 'Head Office') AS department,
                u.status
            FROM users u
            LEFT JOIN students s ON u.user_id = s.user_id
            ${whereClause}
            ORDER BY u.full_name ASC
        `;

        const results = await db.query(query, params);

        console.log('✅ Approved students sent to frontend:', results);

        res.json({
            success: true,
            students: results,
            count: results.length
        });

    } catch (error) {
        console.error('Get approved students error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error: ' + error.message
        });
    }
}

    //  
    //     //  
    // 29. ENROLL STUDENTS - ✅ FIXED: internal student_id save karta hai + Announcement type
    //  
    //  
// 29. ENROLL STUDENTS - ✅ PERMANENT FIX: Always save users.user_id
//  
async enrollStudents(req, res) {
    try {
        const { class_id } = req.params;
        const { student_ids } = req.body;
        const coordinatorId = req.user?.user_id;

        console.log('📥 Enroll request:', { class_id, student_ids, coordinatorId });

        if (!class_id || !student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Class ID and student IDs array are required'
            });
        }

        const classQuery = `
            SELECT c.*, s.semester_code 
            FROM classrooms c
            LEFT JOIN semesters s ON c.semester_id = s.semester_id
            WHERE c.classroom_id = ? 
            AND c.coordinator_id = (SELECT coordinator_id FROM coordinators WHERE user_id = ?)
        `;
        const classResult = await db.query(classQuery, [class_id, coordinatorId]);

        if (classResult.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Class not found or not assigned to you'
            });
        }

        const classData = classResult[0];

        const placeholders = student_ids.map(() => '?').join(',');

        //  IMPORTANT:
        // Frontend se jo IDs aa rahi hain woh users.user_id honi chahiye.
        // Hum yahan user_id ko finalEnrollmentStudentId bana rahe hain.
        const studentQuery = `
            SELECT 
                u.user_id AS userId,
                s.student_id AS internalStudentId,
                u.full_name AS name,
                u.email,
                u.roll_no AS rollNo
            FROM users u
            LEFT JOIN students s ON u.user_id = s.user_id
            WHERE u.user_id IN (${placeholders})
            AND u.status = 'Active'
            AND u.user_role = 'Student'
        `;

        const students = await db.query(studentQuery, student_ids);

        console.log('✅ Valid students found:', students);

        if (students.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No valid active students found. Check approved-students API IDs.'
            });
        }

        const enrolledStudents = [];
        const failedStudents = [];

        for (const student of students) {
            //  PERMANENT FIX:
            // enrollments.student_id FK users.user_id ko reference karta hai,
            // isliye hamesha userId save karo, internalStudentId nahi.
            const sid = student.userId;

            try {
                console.log(`📝 Enrolling user_id=${sid} in class=${class_id}`);

                const checkEnrollment = `
                    SELECT enrollment_id 
                    FROM enrollments 
                    WHERE classroom_id = ? AND student_id = ?
                `;
                const existing = await db.query(checkEnrollment, [class_id, sid]);

                if (existing.length === 0) {
                    await db.query(
                        `INSERT INTO enrollments (classroom_id, student_id, enrollment_date, status)
                         VALUES (?, ?, CURDATE(), 'Active')`,
                        [class_id, sid]
                    );
                } else {
                    await db.query(
                        `UPDATE enrollments 
                         SET status = 'Active', enrollment_date = CURDATE()
                         WHERE classroom_id = ? AND student_id = ?`,
                        [class_id, sid]
                    );
                }

                enrolledStudents.push({
                    id: String(student.userId),
                    name: student.name,
                    email: student.email,
                    rollNo: student.rollNo
                });

            } catch (error) {
                console.error('❌ Enroll student error:', error);
                failedStudents.push({
                    id: String(student.userId),
                    name: student.name,
                    email: student.email,
                    rollNo: student.rollNo,
                    error: error.message
                });
            }
        }

        //  Agar sab fail ho gaye to success false bhejo
        if (enrolledStudents.length === 0) {
            return res.status(500).json({
                success: false,
                error: 'Enrollment failed for all students. Check foreign key/data issue.',
                failedStudents
            });
        }

        //  Audit log safe
        try {
            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'STUDENTS_ENROLLED', ?, 'Success', ?)
            `, [
                coordinatorId,
                `Enrolled ${enrolledStudents.length} students in class ${classData.class_code} - ${classData.subject_name}`,
                req.ip || req.connection.remoteAddress
            ]);
        } catch (logError) {
            console.error('⚠️ Audit log error:', logError.message);
        }

        //  Notifications safe
        for (const student of enrolledStudents) {
            try {
                const notifQuery = `
                    INSERT INTO notifications (
                        sender_id, sender_role, receiver_id, receiver_role,
                        notification_type, title, message, is_pushed
                    )
                    VALUES (?, 'Coordinator', ?, 'Student', 'Announcement', ?, ?, FALSE)
                `;

                const notifTitle = `🎓 Enrolled in ${classData.subject_name}`;

                const infoLines = [];
                infoLines.push(`📚 Subject: ${classData.subject_name}`);
                infoLines.push(`🏫 Class: ${classData.class_name || classData.class_code}`);

                if (classData.semester_code || classData.semester) {
                    infoLines.push(`🎓 Semester: ${classData.semester_code || classData.semester}`);
                }
                if (classData.teacher_name) {
                    infoLines.push(`👨‍🏫 Teacher: ${classData.teacher_name}`);
                }
                if (classData.room) {
                    infoLines.push(`📍 Room: ${classData.room}`);
                }
                if (classData.day) {
                    infoLines.push(`📅 Schedule: ${classData.day} ${classData.start_time || ''} - ${classData.end_time || ''}`);
                }

                            const notifMessage = `Dear ${student.name},
Congratulations! You have been successfully enrolled in:
${infoLines.join('\n')}
Please check your schedule for details.`;
            const notifResult = await db.query(notifQuery, [
                coordinatorId,
                student.id,
                notifTitle,
                notifMessage
            ]);
            
            // ✅ PUSH NOTIFICATION TO STUDENT
            try {
                const stToken = await db.query('SELECT push_token FROM users WHERE user_id = ?', [student.id]);
                if (stToken.length > 0 && stToken[0].push_token) {
                    const pushResult = await pushService.sendAnnouncementPush({
                        pushToken: stToken[0].push_token,
                        title: notifTitle,
                        message: `You have been enrolled in ${classData.subject_name}.`,
                        announcementId: notifResult.insertId
                    });
                    if (pushResult && pushResult.success) {
                        await db.query('UPDATE notifications SET is_pushed = TRUE WHERE notification_id = ?', [notifResult.insertId]);
                        console.log(`📱✅ Enrollment push sent to ${student.name}`);
                    }
                }
            } catch (pushErr) {
                console.error('⚠️ Enrollment push error:', pushErr.message);
            }
        } catch (notifError) {
            console.error('⚠️ Enrollment notification error:', notifError.message);
        }
    }
        return res.json({
            success: true,
            message: `${enrolledStudents.length} student(s) enrolled successfully!`,
            enrolledCount: enrolledStudents.length,
            failedCount: failedStudents.length,
            enrolledStudents,
            failedStudents
        });

    } catch (error) {
        console.error('❌ Enroll students main error:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error: ' + error.message
        });
    }
}
    // 30. GET ENROLLED STUDENTS - ✅ FIXED: Dual Join (user_id YA student_id - dono parhta hai)
    //  
    //  
// 30. GET ENROLLED STUDENTS - ✅ PERMANENT FIX: Simple users.user_id JOIN
//  
async getEnrolledStudents(req, res) {
    try {
        const { class_id } = req.params;
        const coordinatorId = req.user?.user_id;

        if (!class_id) {
            return res.status(400).json({
                success: false,
                error: 'Class ID is required'
            });
        }

        const checkQuery = `
            SELECT classroom_id 
            FROM classrooms
            WHERE classroom_id = ?
            AND coordinator_id = (SELECT coordinator_id FROM coordinators WHERE user_id = ?)
        `;
        const checkResult = await db.query(checkQuery, [class_id, coordinatorId]);

        if (checkResult.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Class not found or not assigned to you'
            });
        }

        //  enrollments.student_id = users.user_id
        const query = `
            SELECT 
                u.user_id AS id,
                u.full_name AS name,
                u.email,
                u.roll_no AS rollNo,
                e.status,
                DATE_FORMAT(e.enrollment_date, '%b %d, %Y') AS enrollmentDate
            FROM enrollments e
            JOIN users u ON e.student_id = u.user_id
            WHERE e.classroom_id = ?
            AND e.status = 'Active'
            AND u.status = 'Active'
            AND u.user_role = 'Student'
            ORDER BY u.full_name ASC
        `;

        const results = await db.query(query, [class_id]);

        console.log(`✅ Found ${results.length} enrolled students for class ${class_id}`);
        console.log('📦 Enrolled students:', results);

        return res.json({
            success: true,
            students: results,
            count: results.length
        });

    } catch (error) {
        console.error('❌ Get enrolled students error:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error: ' + error.message
        });
    }
}

    //  
    // 31. UPDATE ENROLLMENT STATUS
    //  
    async updateEnrollmentStatus(req, res) {
        try {
            const { class_id, student_id } = req.params;
            const { status } = req.body;
            const coordinatorId = req.user?.user_id;

            if (!class_id || !student_id || !status) {
                return res.status(400).json({
                    success: false,
                    error: 'Class ID, Student ID, and status are required'
                });
            }

            const validStatuses = ['Active', 'On-Hold', 'Withdrawn', 'Promoted'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid status. Must be one of: Active, On-Hold, Withdrawn, Promoted'
                });
            }

            const checkQuery = `
                SELECT classroom_id FROM classrooms 
                WHERE classroom_id = ? 
                AND coordinator_id = (
                    SELECT coordinator_id FROM coordinators WHERE user_id = ?
                )
            `;
            const checkResult = await db.query(checkQuery, [class_id, coordinatorId]);

            if (checkResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Class not found or not assigned to you'
                });
            }

            const updateQuery = `
                UPDATE enrollments 
                SET status = ?
                WHERE classroom_id = ? AND student_id = ?
            `;
            await db.query(updateQuery, [status, class_id, student_id]);

            const logQuery = `
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'ENROLLMENT_UPDATED', ?, 'Success', ?)
            `;
            await db.query(logQuery, [
                coordinatorId,
                `Updated enrollment status to ${status} for student ${student_id} in class ${class_id}`,
                req.ip || req.connection.remoteAddress
            ]);

            res.json({
                success: true,
                message: `Student enrollment status updated to ${status}`
            });

        } catch (error) {
            console.error('Update enrollment status error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 32. PROMOTE CLASS
    //  
    async promoteClass(req, res) {
        try {
            const { class_id } = req.params;
            const { promote_type, target } = req.body;
            const coordinatorId = req.user?.user_id;

            if (!class_id || !promote_type || !target) {
                return res.status(400).json({
                    success: false,
                    error: 'Class ID, promote_type, and target are required'
                });
            }

            if (!['semester', 'class'].includes(promote_type)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid promote_type. Must be "semester" or "class"'
                });
            }

            const checkQuery = `
                SELECT c.*, s.semester_code 
                FROM classrooms c
                LEFT JOIN semesters s ON c.semester_id = s.semester_id
                WHERE c.classroom_id = ? 
                AND c.coordinator_id = (
                    SELECT coordinator_id FROM coordinators WHERE user_id = ?
                )
            `;
            const classResult = await db.query(checkQuery, [class_id, coordinatorId]);

            if (classResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Class not found or not assigned to you'
                });
            }

            const classData = classResult[0];

            if (promote_type === 'semester') {
                const updateQuery = `
                    UPDATE enrollments e
                    JOIN users u ON e.student_id = u.user_id
                    SET u.semester = ?
                    WHERE e.classroom_id = ?
                `;
                await db.query(updateQuery, [target, class_id]);

                const updateClassQuery = `
                    UPDATE classrooms 
                    SET semester_id = ?
                    WHERE classroom_id = ?
                `;
                await db.query(updateClassQuery, [target, class_id]);

                const updateStatusQuery = `
                    UPDATE enrollments 
                    SET status = 'Promoted'
                    WHERE classroom_id = ?
                `;
                await db.query(updateStatusQuery, [class_id]);

            } else {
                const updateClassQuery = `
                    UPDATE classrooms 
                    SET class_code = ?
                    WHERE classroom_id = ?
                `;
                await db.query(updateClassQuery, [target, class_id]);
            }

            const logQuery = `
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'CLASS_PROMOTED', ?, 'Success', ?)
            `;
            await db.query(logQuery, [
                coordinatorId,
                `Promoted class ${classData.class_code} to ${promote_type}: ${target}`,
                req.ip || req.connection.remoteAddress
            ]);

            res.json({
                success: true,
                message: `Class promoted successfully!`,
                promote_type: promote_type,
                target: target
            });

        } catch (error) {
            console.error('Promote class error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 33. GET PERFORMANCE REPORTS
    //  
    async getPerformanceReports(req, res) {
        try {
            const { access = 'granted', search = '' } = req.query;
            const coordinatorId = req.user?.user_id;

            const coordQuery = 'SELECT coordinator_id FROM coordinators WHERE user_id = ?';
            const coordResult = await db.query(coordQuery, [coordinatorId]);

            if (coordResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Coordinator not found'
                });
            }

            let whereClause = '';
            const params = [];

            if (access === 'granted') {
                whereClause = 'WHERE pr.access_granted = TRUE';
            } else if (access === 'pending') {
                whereClause = 'WHERE pr.access_granted = FALSE';
            } else {
                whereClause = 'WHERE 1=1';
            }

            if (search) {
                whereClause += ` AND (c.subject_name LIKE ? OR c.teacher_name LIKE ? OR c.class_code LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`, `%${search}%`);
            }

            const query = `
                SELECT 
                    pr.report_id AS id,
                    c.class_code AS classId,
                    c.subject_name AS subject,
                    c.semester,
                    c.section,
                    c.teacher_name AS teacherName,
                    pr.average_grade AS averageGrade,
                    pr.pass_rate AS passRate,
                    pr.top_performer AS topPerformer,
                    pr.teacher_remarks AS teacherRemarks,
                    DATE_FORMAT(pr.created_at, '%b %d, %Y') AS createdDate,
                    pr.access_granted AS accessGranted
                FROM performance_reports pr
                JOIN classrooms c ON pr.classroom_id = c.classroom_id
                ${whereClause}
                ORDER BY pr.created_at DESC
            `;

            const results = await db.query(query, params);
            res.json({
                success: true,
                reports: results,
                count: results.length
            });

        } catch (error) {
            console.error('Get performance reports error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }
    // 34. GET PERFORMANCE REPORT DETAILS - ✅ CLEAN FIXED
    //  
        //  
    // 34. GET PERFORMANCE REPORT DETAILS
    //  
    async getPerformanceReportDetails(req, res) {
        try {
            const { report_id } = req.params;
            if (!report_id) {
                return res.status(400).json({ success: false, error: 'Report ID is required' });
            }
            const query = `
                SELECT
                    pr.report_id AS id,
                    pr.classroom_id AS classroomId,
                    c.class_code AS classId,
                    c.class_name AS className,
                    c.subject_name AS subject,
                    c.semester,
                    c.section,
                    c.teacher_name AS teacherName,
                    pr.average_grade AS averageGrade,
                    pr.pass_rate AS passRate,
                    pr.top_performer AS topPerformer,
                    pr.teacher_remarks AS teacherRemarks,
                    DATE_FORMAT(pr.created_at, '%b %d, %Y') AS createdDate,
                    pr.access_granted AS accessGranted,
                    pr.detailed_data AS detailedData
                FROM performance_reports pr
                JOIN classrooms c ON pr.classroom_id = c.classroom_id
                WHERE pr.report_id = ? AND pr.access_granted = TRUE
            `;
            const results = await db.query(query, [report_id]);
            if (results.length === 0) {
                return res.status(404).json({ success: false, error: 'Report not found or access not granted' });
            }
            
            const report = results[0];
            let students = [];
            try { 
                students = report.detailedData ? JSON.parse(report.detailedData) : []; 
            } catch (e) { 
                students = []; 
            }

            if (!students || students.length === 0) {
                students = await this.buildLiveStudents(report.classroomId);
            }

            res.json({
                success: true,
                report: { ...report, students: students }
            });
        } catch (error) {
            console.error('Get performance report details error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //  NEW: Live students + unki saved academic reports
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
    //  
    // 35. DOWNLOAD PERFORMANCE REPORT
    //  
       //  DOWNLOAD PERFORMANCE REPORT (PDF / Excel) - REAL IMPLEMENTATION
    async downloadPerformanceReport(req, res) {
        try {
            const { report_id } = req.params;
            const { format = 'pdf' } = req.query;
            if (!report_id) return res.status(400).json({ success: false, error: 'Report ID is required' });

            const results = await db.query(`
                SELECT pr.*, c.class_name, c.subject_name, c.section,
                       COALESCE(c.semester, sem.semester_code, '') AS semester
                FROM performance_reports pr
                JOIN classrooms c ON pr.classroom_id = c.classroom_id
                LEFT JOIN semesters sem ON c.semester_id = sem.semester_id
                WHERE pr.report_id = ?`, [report_id]);

            if (results.length === 0) return res.status(404).json({ success: false, error: 'Report not found' });
            const r = results[0];

            let students = [];
            try { students = r.detailed_data ? JSON.parse(r.detailed_data) : []; } catch (e) { students = []; }

            //  EXCEL
            if (format === 'excel') {
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
                    'Class': r.class_name || '', 'Subject': r.subject_name || '', 'Semester': r.semester || '',
                    'Average Grade': r.average_grade || 'N/A', 'Pass Rate': r.pass_rate || 'N/A',
                    'Top Performer': r.top_performer || 'N/A',
                    'Teacher Remarks': r.teacher_remarks || '', 'Coordinator Remarks': r.coordinator_remarks || ''
                }]), 'Summary');
                const studentsData = students.map(s => ({
                    'Student Name': s.name || '', 'Roll Number': s.rollNo || '',
                    'Attendance': `${s.attendance || 0}%`, 'Mid-Term': s.midTermMarks || '',
                    'Quiz': s.quizMarks || '', 'Assignment': s.assignmentMarks || '',
                    'Overall Grade': s.overallGrade || ''
                }));
                if (studentsData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(studentsData), 'Students');
                const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="Performance_Report_${report_id}.xlsx"`);
                return res.send(buffer);
            }

            //  PDF (students ke saath)
            const doc = new PDFDocument({ margin: 50 });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="Performance_Report_${report_id}.pdf"`);
            doc.pipe(res);

            doc.fontSize(22).fillColor('#1E40AF').text('Class Performance Report', { align: 'center' }).moveDown(0.5);
            doc.fontSize(14).fillColor('#0F172A').text(`${r.subject_name || ''} - ${r.class_name || ''}`, { align: 'center' });
            doc.fontSize(11).fillColor('#64748B').text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' }).moveDown(1);

            doc.fontSize(13).fillColor('#1E40AF').text('Report Summary', { underline: true }).moveDown(0.4);
            doc.fontSize(11).fillColor('#374151');
            doc.text(`Average Grade: ${r.average_grade || 'N/A'}`);
            doc.text(`Pass Rate: ${r.pass_rate || 'N/A'}`);
            doc.text(`Top Performer: ${r.top_performer || 'N/A'}`).moveDown(0.6);

            doc.fontSize(13).fillColor('#1E40AF').text("Teacher's Remarks", { underline: true }).moveDown(0.4);
            doc.fontSize(11).fillColor('#374151').text(r.teacher_remarks || 'No remarks.', { width: 500 }).moveDown(0.6);

            if (r.coordinator_remarks) {
                doc.fontSize(13).fillColor('#1E40AF').text("Coordinator's Remarks", { underline: true }).moveDown(0.4);
                doc.fontSize(11).fillColor('#374151').text(r.coordinator_remarks, { width: 500 }).moveDown(0.6);
            }

            //  Students Monthly Reports (teacher jaisa hi data)
            if (students.length > 0) {
                doc.addPage();
                doc.fontSize(16).fillColor('#1E40AF').text('Students Monthly Reports', { align: 'center' }).moveDown(0.8);
                for (const s of students) {
                    doc.fontSize(12).fillColor('#0F172A').text(`${s.name || 'Student'}  (${s.rollNo || ''})`);
                    doc.fontSize(10).fillColor('#374151')
                       .text(`Attendance: ${s.attendance || 0}%  |  Mid-Term: ${s.midTermMarks || '-'}  |  Quiz: ${s.quizMarks || '-'}  |  Assignment: ${s.assignmentMarks || '-'}`);
                    doc.fontSize(10).fillColor('#047857').text(`Overall Grade: ${s.overallGrade || 'N/A'}`).moveDown(0.6);
                }
            }

            doc.fontSize(9).fillColor('#94A3B8').text('Generated by Smart Desk', { align: 'center' });
            doc.end();
        } catch (error) {
            console.error('Download performance report error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }
    //  
    // 36. GET REPORT REQUESTS
    //  
    //  
// 36. GET REPORT REQUESTS
//  FIXED: Pending Requests + old wrong-id requests both show
//  
async getReportRequests(req, res) {
    try {
        const coordinatorUserId = req.user?.user_id;

        if (!coordinatorUserId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const coordQuery = `
            SELECT coordinator_id, user_id 
            FROM coordinators 
            WHERE user_id = ?
            LIMIT 1
        `;

        const coordResult = await db.query(coordQuery, [coordinatorUserId]);

        if (coordResult.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Coordinator not found'
            });
        }

        const internalCoordId = coordResult[0].coordinator_id;

        //  Pending + submitted requests
        // Dono IDs check kar raha hai:
        // 1) rr.coordinator_id = internal coordinator_id
        // 2) rr.coordinator_id = user_id
        // taake purani wrong saved requests bhi show ho jayein
        const requestsQuery = `
            SELECT 
                rr.request_id AS id,
                rr.request_id AS requestId,
                rr.report_type AS type,
                rr.report_type AS reportType,
                rr.specific_target AS target,
                rr.specific_target AS specificTarget,
                DATE_FORMAT(rr.deadline, '%b %d, %Y') AS deadline,
                rr.deadline AS rawDeadline,
                rr.note AS adminNote,
                rr.note AS note,
                rr.status,
                DATE_FORMAT(rr.created_at, '%b %d, %Y') AS requestedDate,
                rr.created_at AS createdAt
            FROM report_requests rr
            WHERE (rr.coordinator_id = ? OR rr.coordinator_id = ?)
            AND rr.status IN ('pending', 'submitted')
            ORDER BY rr.created_at DESC
        `;

        const requests = await db.query(requestsQuery, [
            internalCoordId,
            coordinatorUserId
        ]);

        //  Submitted/completed reports
        const submittedQuery = `
            SELECT 
                rr.request_id AS id,
                rr.request_id AS requestId,
                CONCAT(rr.report_type, ' Report - ', rr.specific_target) AS title,
                rr.report_type AS type,
                rr.report_type AS reportType,
                rr.specific_target AS target,
                DATE_FORMAT(rr.submitted_at, '%b %d, %Y') AS submittedDate,
                rr.notes AS coordinatorRemarks,
                rr.status
            FROM report_requests rr
            WHERE (rr.coordinator_id = ? OR rr.coordinator_id = ?)
            AND rr.status IN ('submitted', 'completed')
            ORDER BY rr.submitted_at DESC
        `;

        const submitted = await db.query(submittedQuery, [
            internalCoordId,
            coordinatorUserId
        ]);

        res.json({
            success: true,
            requests: requests,
            submitted: submitted,
            count: requests.length,
            submittedCount: submitted.length
        });

    } catch (error) {
        console.error('Get report requests error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error: ' + error.message
        });
    }
}

    //  
    // 37. SUBMIT REPORT
    //  
    async submitReport(req, res) {
        try {
            const { requestId, type, coordinatorRemarks, includeSemesters } = req.body;
            const coordinatorId = req.user?.user_id;

            if (!requestId || !coordinatorRemarks) {
                return res.status(400).json({
                    success: false,
                    error: 'Request ID and remarks are required'
                });
            }

            const coordQuery = 'SELECT coordinator_id FROM coordinators WHERE user_id = ?';
            const coordResult = await db.query(coordQuery, [coordinatorId]);

            if (coordResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Coordinator not found'
                });
            }

                    const coordId = coordResult[0].coordinator_id;
        //  FIXED: coordinator_id internal ho ya user_id — DONO match karo
        const checkQuery = `
            SELECT * FROM report_requests
            WHERE request_id = ?
              AND (coordinator_id = ? OR coordinator_id = ?)
              AND status = 'pending'
        `;
        const checkResult = await db.query(checkQuery, [requestId, coordId, coordinatorId]);
            if (checkResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Request not found or already submitted'
                });
            }

            const updateQuery = `
                UPDATE report_requests 
                SET status = 'submitted', 
                    notes = ?,
                    submitted_at = NOW()
                WHERE request_id = ?
            `;
            await db.query(updateQuery, [coordinatorRemarks, requestId]);

            const logQuery = `
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'REPORT_SUBMITTED', ?, 'Success', ?)
            `;
            await db.query(logQuery, [
                coordinatorId,
                `Submitted report for request ${requestId}`,
                req.ip || req.connection.remoteAddress
            ]);

            const notifQuery = `
                INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role,
                notification_type, title, message, is_pushed)
                VALUES (?, 'Coordinator', NULL, 'Admin', 'Announcement', ?, ?, FALSE)
            `;

           //  FIXED: Report request karne wale specific Admin ko notification bhejo
// Pehle us admin ka user_id find karo jisne yeh report request ki thi
let adminUserId = null;
try {
    const adminCheck = await db.query(
        `SELECT admin_id FROM report_requests WHERE request_id = ?`,
        [requestId]
    );
    if (adminCheck.length > 0 && adminCheck[0].admin_id) {
        adminUserId = adminCheck[0].admin_id;
    } else {
        // Fallback: Koi bhi active admin dhundho
        const fallbackAdmin = await db.query(
            `SELECT user_id FROM users WHERE user_role = 'Admin' AND status = 'Active' LIMIT 1`
        );
        if (fallbackAdmin.length > 0) {
            adminUserId = fallbackAdmin[0].user_id;
        }
    }
} catch (adminErr) {
    console.error('⚠️ Admin lookup error:', adminErr.message);
}

//  TARGETED: Sirf specific admin ko notification
        //  TARGETED: Sirf specific admin ko notification
        if (adminUserId) {
            const notifQuery = `
                INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role,
                notification_type, title, message, is_pushed)
                VALUES (?, 'Coordinator', ?, 'Admin', 'Announcement', ?, ?, FALSE)
            `;
            const notifTitle = `📊 Report Submitted - Request #${requestId}`;
            const notifMessage = `Dear Admin,
A new report has been submitted by Coordinator.
Request ID: #${requestId}
Type: ${type || 'General'}
Remarks: ${coordinatorRemarks}
Please review the report in your dashboard.`;
            const notifResult = await db.query(notifQuery, [
                coordinatorId,
                adminUserId,
                notifTitle,
                notifMessage
            ]);
            
            // ✅ PUSH NOTIFICATION TO ADMIN
            try {
                const adminToken = await db.query('SELECT push_token FROM users WHERE user_id = ?', [adminUserId]);
                if (adminToken.length > 0 && adminToken[0].push_token) {
                    const pushResult = await pushService.sendAnnouncementPush({
                        pushToken: adminToken[0].push_token,
                        title: notifTitle,
                        message: `Coordinator has submitted a report. Request #${requestId}`,
                        announcementId: notifResult.insertId
                    });
                    if (pushResult && pushResult.success) {
                        await db.query('UPDATE notifications SET is_pushed = TRUE WHERE notification_id = ?', [notifResult.insertId]);
                        console.log(`📱✅ Report submit push sent to Admin`);
                    }
                }
            } catch (pushErr) {
                console.error('⚠️ Report submit push error:', pushErr.message);
            }
        }
        
        res.json({                success: true,
                message: 'Report submitted successfully!',
                requestId: requestId
            });

        } catch (error) {
            console.error('Submit report error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 38. GET SUBMITTED REPORTS
    //  
    async getSubmittedReports(req, res) {
        try {
            const coordinatorId = req.user?.user_id;

            const coordQuery = 'SELECT coordinator_id FROM coordinators WHERE user_id = ?';
            const coordResult = await db.query(coordQuery, [coordinatorId]);

            if (coordResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Coordinator not found'
                });
            }

            const coordId = coordResult[0].coordinator_id;

            const query = `
                SELECT 
                    rr.request_id AS id,
                    rr.request_id AS requestId,
                    CONCAT(rr.report_type, ' Report - ', rr.specific_target) AS title,
                    rr.report_type AS type,
                    DATE_FORMAT(rr.submitted_at, '%b %d, %Y') AS submittedDate,
                    rr.notes AS coordinatorRemarks,
                    rr.status
                FROM report_requests rr
                WHERE rr.coordinator_id = ? 
                AND rr.status IN ('submitted', 'completed')
                ORDER BY rr.submitted_at DESC
            `;

            const results = await db.query(query, [coordId]);

            res.json({
                success: true,
                reports: results,
                count: results.length
            });

        } catch (error) {
            console.error('Get submitted reports error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 39. GET RECIPIENTS
    //    FIXED: Recipients - safe query (no missing columns)
    async getRecipients(req, res) {
        try {
            const { type = 'teacher', search = '' } = req.query;
            const roleMap = { teacher: 'Teacher', student: 'Student', admin: 'Admin' };
            const role = roleMap[type] || 'Teacher';

            let query = `
                SELECT u.user_id AS id, u.full_name AS name, u.email, u.user_role AS role
                FROM users u
                WHERE u.status = 'Active' AND u.user_role = ?
            `;
            const params = [role];

            if (search) {
                query += ` AND (u.full_name LIKE ? OR u.email LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`);
            }

            query += ` ORDER BY u.full_name ASC LIMIT 200`;
            const results = await db.query(query, params);

            console.log(`✅ Recipients (${type}): ${results.length} found`);
            res.json({ success: true, recipients: results, count: results.length });

        } catch (error) {
            console.error('Get recipients error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //  
    // 40. SEND NOTIFICATION - ✅ WITH DIRECT FILE ATTACHMENT
    //  
        // 40. SEND NOTIFICATION - ✅ FIXED FOR 'admin-office' & Role-based targeting
    async sendNotification(req, res) {
        try {
            const coordinatorId = req.user?.user_id;
            const coordinatorName = req.user?.full_name || 'Coordinator';
            
            const {
                recipientId,
                recipientType,
                recipientEmail,
                recipientName,
                subject,
                message,
                sendEmail = 'true',
                sendPush = 'true'
            } = req.body;
            
            const attachedFile = req.file;
            
            console.log('📧 Send Notification Request:', {
                recipientId, recipientType, recipientEmail, subject,
                hasFile: !!attachedFile,
                fileName: attachedFile?.originalname
            });

            if (!recipientType || !subject || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'Please provide recipientType, subject, and message'
                });
            }

            if (!['teacher', 'student', 'admin'].includes(recipientType)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid recipient type. Use teacher, student, or admin'
                });
            }

            let targetUsers = [];

            //    FIX 1: Handle 'admin-office' or role-based targeting properly
            if (recipientId === 'admin-office' || recipientType === 'admin') {
                const admins = await db.query(
                    `SELECT u.user_id, u.full_name, u.email, u.user_role, u.push_token 
                     FROM users u 
                     WHERE u.user_role = 'Admin' AND u.status = 'Active'`
                );
                targetUsers = admins;
            } 
            //    FIX 2: Handle specific numeric user ID
            else if (recipientId && !isNaN(Number(recipientId))) {
                const roleCondition = recipientType === 'teacher' ? 'JOIN teachers t ON u.user_id = t.user_id' : 
                                      recipientType === 'student' ? 'JOIN students s ON u.user_id = s.user_id' : '';
                
                const recipientQuery = `
                    SELECT u.user_id, u.full_name, u.email, u.user_role, u.push_token
                    FROM users u
                    ${roleCondition}
                    WHERE u.user_id = ? AND u.status = 'Active'
                `;
                const recipients = await db.query(recipientQuery, [Number(recipientId)]);
                targetUsers = recipients;
            } 
            //    FIX 3: Handle specific email provided directly
            else if (recipientEmail) {
                const recipients = await db.query(
                    `SELECT u.user_id, u.full_name, u.email, u.user_role, u.push_token 
                     FROM users u 
                     WHERE u.email = ? AND u.status = 'Active'`,
                    [recipientEmail]
                );
                targetUsers = recipients;
            } 
            else {
                return res.status(400).json({ success: false, error: 'Invalid recipient data' });
            }

            if (targetUsers.length === 0) {
                return res.status(404).json({ success: false, error: 'No active recipients found' });
            }

            //    Save attachment if file is provided
            let savedFileUrl = null;
            if (attachedFile) {
                try {
                    const path = require('path');
                    const fs = require('fs');
                    const uploadDir = path.join(__dirname, '../uploads/attachments');
                    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
                    
                    const safeName = Date.now() + '-' + String(attachedFile.originalname).replace(/[^a-zA-Z0-9.\-]/g, '_');
                    fs.writeFileSync(path.join(uploadDir, safeName), attachedFile.buffer);
                    
                    savedFileUrl = `${req.protocol}://${req.get('host')}/uploads/attachments/${safeName}`;
                    console.log('✅ File saved to disk:', safeName);
                } catch (fileError) {
                    console.error('⚠️ File save error:', fileError.message);
                }
            }

            const emailService = require('../services/emailService');
            const pushService = require('../services/pushService');
            let totalEmailSent = 0;
            let totalPushSent = 0;

            //    Process each target user
            for (const recipient of targetUsers) {
                const recipientRole = recipient.user_role;
                let notificationId = null;

                // 1. Save to DB
                try {
                    const notifResult = await db.query(`
                        INSERT INTO notifications (
                            sender_id, sender_role, receiver_id, receiver_role,
                            notification_type, title, message, attachment_url, is_pushed, is_email_sent
                        ) VALUES (?, 'Coordinator', ?, ?, 'Announcement', ?, ?, ?, FALSE, FALSE)
                    `, [coordinatorId, recipient.user_id, recipientRole, subject, message, savedFileUrl || null]);
                    notificationId = notifResult.insertId;
                } catch (dbErr) {
                    console.error('⚠️ DB insert failed for user:', recipient.user_id, dbErr.message);
                    continue; // Skip to next user if DB fails
                }

                // 2. Send Email (Non-fatal)
                const shouldSendEmail = sendEmail === 'true' || sendEmail === true || sendEmail === '1';
                console.log('📧 Email check:', {
                shouldSendEmail,
                sendEmailValue: sendEmail,
                recipientEmail: recipient.email,
                hasEmail: !!recipient.email
                });

                if (shouldSendEmail && recipient.email) {
                console.log('📤 Sending email to:', recipient.email);
                try {
                    const emailPayload = {
                    to: recipient.email,
                    subject: subject,
                    message: message,
                    senderName: coordinatorName
                    };
                        if (attachedFile) {
                            emailPayload.attachments = [{
                                filename: attachedFile.originalname,
                                content: attachedFile.buffer,
                                contentType: attachedFile.mimetype
                            }];
                        }
                        const emailResult = await emailService.sendAnnouncementEmail(emailPayload);
                        if (emailResult.success) {
                            totalEmailSent++;
                            await db.query('UPDATE notifications SET is_email_sent = TRUE WHERE notification_id = ?', [notificationId]);
                        }
                            // const emailResult = await emailService.sendAnnouncementEmail(emailPayload);
                        console.log('📧 Email result:', emailResult);
                        
                        if (emailResult.success) {
                        console.log('✅ Email sent successfully to:', recipient.email);
                        totalEmailSent++;
                        await db.query('UPDATE notifications SET is_email_sent = TRUE WHERE notification_id = ?', [notificationId]);
                        } else {
                        console.error('❌ Email failed:', emailResult.error);
                        }
                    } catch (emailError) {
                        console.error(`⚠️ Email failed for ${recipient.email}:`, emailError.message);
                    }
                }

                // 3. Send Push (Non-fatal)
                const shouldSendPush = sendPush === 'true' || sendPush === true || sendPush === '1';
                if (shouldSendPush && recipient.push_token && notificationId) {
                    try {
                        const pushResult = await pushService.sendAnnouncementPush({
                            pushToken: recipient.push_token,
                            title: subject,
                            message: message,
                            announcementId: notificationId
                        });
                        if (pushResult.success) {
                            totalPushSent++;
                            await db.query('UPDATE notifications SET is_pushed = TRUE WHERE notification_id = ?', [notificationId]);
                        }
                    } catch (pushError) {
                        console.error('Push sending error:', pushError.message);
                    }
                }
            }

            // Audit log
            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'NOTIFICATION_SENT', ?, 'Success', ?)
            `, [
                coordinatorId,
                `Sent notification to ${targetUsers.length} recipient(s)${attachedFile ? ' with attachment: ' + attachedFile.originalname : ''}`,
                req.ip || req.connection.remoteAddress
            ]);

            res.json({
                success: true,
                message: `Notification sent to ${targetUsers.length} recipient(s) successfully!`,
                sentCount: targetUsers.length,
                emailSent: totalEmailSent,
                pushSent: totalPushSent,
                hasAttachment: !!attachedFile,
                attachmentUrl: savedFileUrl
            });

        } catch (error) {
            console.error('❌ Send notification error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }
    //  
    // 41. SEND BULK NOTIFICATION - ✅ WITH DIRECT FILE ATTACHMENT
    //  
    async sendBulkNotification(req, res) {
        try {
            const coordinatorId = req.user?.user_id;
            const coordinatorName = req.user?.full_name || 'Coordinator';

            //  FormData se data lo
            const {
                recipientType,
                recipientIds, // Note: FormData mein yeh string aa sakta hai, JSON.parse karna padega
                subject,
                message,
                sendEmail = 'true',
                sendPush = 'true'
            } = req.body;

            const attachedFile = req.file;

            // recipientIds ko parse karo (FormData string bhejta hai)
            let parsedRecipientIds = recipientIds;
            if (typeof recipientIds === 'string') {
                try {
                    parsedRecipientIds = JSON.parse(recipientIds);
                } catch (e) {
                    // Agar comma-separated hai
                    parsedRecipientIds = recipientIds.split(',').map(id => id.trim());
                }
            }

            if (!recipientType || !parsedRecipientIds || !Array.isArray(parsedRecipientIds) || parsedRecipientIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Please provide recipientType and an array of recipient IDs'
                });
            }

            if (!subject || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'Please provide subject and message'
                });
            }

            if (!['teacher', 'student', 'admin'].includes(recipientType)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid recipient type. Use teacher, student, or admin'
                });
            }

            //  File ko ek baar save karo (sab recipients ke liye same URL)
            let savedFileUrl = null;

            if (attachedFile) {
                try {
                    const uploadDir = path.join(__dirname, '../uploads/attachments');
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }

                    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                    //const savedFileName = uniqueSuffix + '-' + attachedFile.originalname;
                   //      Space aur special characters ko underscore bana do (URL kabhi nahi tootega)
const safeOriginal = String(attachedFile.originalname).replace(/[^a-zA-Z0-9.\-]/g, '_');
const savedFileName = Date.now() + '-' + safeOriginal;
                    const filePath = path.join(uploadDir, savedFileName);

                    fs.writeFileSync(filePath, attachedFile.buffer);

                    const baseUrl = `${req.protocol}://${req.get('host')}`;
                    savedFileUrl = `${baseUrl}/uploads/attachments/${savedFileName}`;

                    console.log('✅ Bulk file saved:', savedFileName);
                } catch (fileError) {
                    console.error('⚠️ Bulk file save error:', fileError.message);
                }
            }

            const placeholders = parsedRecipientIds.map(() => '?').join(',');
            const roleMap = { 'teacher': 'Teacher', 'student': 'Student', 'admin': 'Admin' };
            const recipientRole = roleMap[recipientType];

            const recipientQuery = `
                SELECT u.user_id, u.full_name, u.email, u.user_role, u.push_token
                FROM users u
                WHERE u.user_id IN (${placeholders}) AND u.status = 'Active' AND u.user_role = ?
            `;
            const recipients = await db.query(recipientQuery, [...parsedRecipientIds, recipientRole]);

            if (recipients.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No valid recipients found'
                });
            }

            const sentCount = [];
            const failedCount = [];
            const emailResults = [];
            const pushResults = [];

            const shouldSendEmail = sendEmail === 'true' || sendEmail === true || sendEmail === '1';
            const shouldSendPush = sendPush === 'true' || sendPush === true || sendPush === '1';

            for (const recipient of recipients) {
                try {
                    // Notification save
                    const notifQuery = `
                        INSERT INTO notifications (
                            sender_id, sender_role, receiver_id, receiver_role,
                            notification_type, title, message, attachment_url, is_pushed, is_email_sent
                        ) VALUES (?, 'Coordinator', ?, ?, 'Announcement', ?, ?, ?, FALSE, FALSE)
                    `;

                    const result = await db.query(notifQuery, [
                        coordinatorId,
                        recipient.user_id,
                        recipientRole,
                        subject,
                        message,
                        savedFileUrl || null
                    ]);

                    const notificationId = result.insertId;

                    //  Email with attachment
                    let emailSent = false;
                    if (shouldSendEmail) {
                        try {
                            const emailPayload = {
                                to: recipient.email,
                                subject: subject,
                                message: message,
                                senderName: coordinatorName
                            };

                            if (attachedFile) {
                                emailPayload.attachments = [{
    filename: attachedFile.originalname,
    content: attachedFile.buffer ? attachedFile.buffer : fs.createReadStream(attachedFile.path),
    contentType: attachedFile.mimetype
}];
                            }

                            const emailResult = await emailService.sendAnnouncementEmail(emailPayload);
                            emailSent = emailResult.success || false;
                            emailResults.push({ email: recipient.email, success: emailSent });

                            if (emailSent) {
                                await db.query(
                                    'UPDATE notifications SET is_email_sent = TRUE WHERE notification_id = ?',
                                    [notificationId]
                                );
                            }
                        } catch (emailError) {
                            console.error('Email error for', recipient.email, emailError);
                            emailResults.push({ email: recipient.email, success: false, error: emailError.message });
                        }
                    }

                    // Push
                    let pushSent = false;
                    if (shouldSendPush && recipient.push_token) {
                        try {
                            const pushResult = await pushService.sendAnnouncementPush({
                                pushToken: recipient.push_token,
                                title: subject,
                                message: message,
                                announcementId: notificationId
                            });
                            pushSent = pushResult.success || false;
                            pushResults.push({ pushToken: recipient.push_token, success: pushSent });

                            if (pushSent) {
                                await db.query(
                                    'UPDATE notifications SET is_pushed = TRUE WHERE notification_id = ?',
                                    [notificationId]
                                );
                            }
                        } catch (pushError) {
                            console.error('Push error for', recipient.user_id, pushError);
                            pushResults.push({ pushToken: recipient.push_token, success: false });
                        }
                    }

                    sentCount.push(recipient.user_id);

                } catch (error) {
                    failedCount.push(recipient.user_id);
                    console.error('Bulk send error for recipient:', recipient.user_id, error);
                }
            }

            // Audit log
            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'BULK_NOTIFICATION_SENT', ?, 'Success', ?)
            `, [
                coordinatorId,
                `Sent bulk notification to ${sentCount.length} ${recipientType}(s)${attachedFile ? ' with attachment: ' + attachedFile.originalname : ''}`,
                req.ip || req.connection.remoteAddress
            ]);

            res.json({
                success: true,
                message: `Bulk notification sent to ${sentCount.length} recipients`,
                sentCount: sentCount.length,
                failedCount: failedCount.length,
                hasAttachment: !!attachedFile,
                attachmentFileName: attachedFile?.originalname || null,
                attachmentUrl: savedFileUrl,
                recipients: recipients.map(r => ({ id: r.user_id, name: r.full_name, email: r.email })),
                emailResults: emailResults,
                pushResults: pushResults
            });

        } catch (error) {
            console.error('❌ Send bulk notification error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 42. GET NOTIFICATION HISTORY
    //  
    async getNotificationHistory(req, res) {
        try {
            const coordinatorId = req.user?.user_id;
            const { limit = 20, offset = 0 } = req.query;

            const query = `
                SELECT 
                    n.notification_id AS id,
                    n.title,
                    n.message,
                    n.notification_type,
                    n.attachment_url AS attachmentUrl,
                    u.full_name AS recipientName,
                    u.email AS recipientEmail,
                    u.user_role AS recipientRole,
                    n.is_read,
                    n.is_pushed,
                    n.is_email_sent,
                    DATE_FORMAT(n.created_at, '%b %d, %Y %h:%i %p') AS sentAt
                FROM notifications n
                LEFT JOIN users u ON n.receiver_id = u.user_id
                WHERE n.sender_id = ? AND n.sender_role = 'Coordinator'
                ORDER BY n.created_at DESC
                LIMIT ? OFFSET ?
            `;

            const results = await db.query(query, [coordinatorId, parseInt(limit), parseInt(offset)]);

            const countQuery = `
                SELECT COUNT(*) AS total
                FROM notifications
                WHERE sender_id = ? AND sender_role = 'Coordinator'
            `;
            const countResult = await db.query(countQuery, [coordinatorId]);

            res.json({
                success: true,
                notifications: results,
                total: countResult[0]?.total || 0,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

        } catch (error) {
            console.error('Get notification history error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 43. GET NOTIFICATION STATS
    //  
    async getNotificationStats(req, res) {
        try {
            const coordinatorId = req.user?.user_id;

            const totalQuery = `
                SELECT COUNT(*) AS total
                FROM notifications
                WHERE sender_id = ? AND sender_role = 'Coordinator'
            `;
            const totalResult = await db.query(totalQuery, [coordinatorId]);

            const emailQuery = `
                SELECT 
                    SUM(CASE WHEN is_email_sent = TRUE THEN 1 ELSE 0 END) AS sent,
                    SUM(CASE WHEN is_email_sent = FALSE THEN 1 ELSE 0 END) AS failed
                FROM notifications
                WHERE sender_id = ? AND sender_role = 'Coordinator'
            `;
            const emailResult = await db.query(emailQuery, [coordinatorId]);

            const pushQuery = `
                SELECT 
                    SUM(CASE WHEN is_pushed = TRUE THEN 1 ELSE 0 END) AS sent,
                    SUM(CASE WHEN is_pushed = FALSE THEN 1 ELSE 0 END) AS failed
                FROM notifications
                WHERE sender_id = ? AND sender_role = 'Coordinator'
            `;
            const pushResult = await db.query(pushQuery, [coordinatorId]);

            const roleQuery = `
                SELECT 
                    receiver_role,
                    COUNT(*) AS count
                FROM notifications
                WHERE sender_id = ? AND sender_role = 'Coordinator'
                GROUP BY receiver_role
            `;
            const roleResults = await db.query(roleQuery, [coordinatorId]);

            res.json({
                success: true,
                stats: {
                    totalSent: totalResult[0]?.total || 0,
                    email: {
                        sent: emailResult[0]?.sent || 0,
                        failed: emailResult[0]?.failed || 0
                    },
                    push: {
                        sent: pushResult[0]?.sent || 0,
                        failed: pushResult[0]?.failed || 0
                    },
                    byRole: roleResults
                }
            });

        } catch (error) {
            console.error('Get notification stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 44. GET NOTIFICATION REPLIES
    //  
    async getNotificationReplies(req, res) {
        try {
            const { notification_id } = req.params;

            const tableCheck = await db.query(
                "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'smart_desk' AND table_name = 'notification_replies'"
            );

            if (tableCheck[0]?.count === 0) {
                return res.json({ success: true, replies: [] });
            }

            const query = `
                SELECT 
                    reply_id AS id,
                    sender_id,
                    sender_role,
                    message,
                    DATE_FORMAT(created_at, '%b %d, %Y %h:%i %p') AS date
                FROM notification_replies
                WHERE notification_id = ?
                ORDER BY created_at ASC
            `;

            const replies = await db.query(query, [notification_id]);

            const enrichedReplies = await Promise.all(replies.map(async (reply) => {
                const user = await db.query(
                    'SELECT full_name FROM users WHERE user_id = ?',
                    [reply.sender_id]
                );

                let senderName = 'Unknown';
                if (reply.sender_role === 'Coordinator') {
                    senderName = user[0]?.full_name || 'You (Coordinator)';
                } else {
                    senderName = user[0]?.full_name || reply.sender_role;
                }

                return {
                    id: reply.id?.toString(),
                    sender: senderName,
                    senderRole: reply.sender_role,
                    message: reply.message,
                    date: reply.date
                };
            }));

            res.json({
                success: true,
                replies: enrichedReplies
            });
        } catch (error) {
            console.error('Get replies error:', error);
            res.json({ success: true, replies: [] });
        }
    }

    //  

    //    DELETE NOTIFICATION
       //    DELETE NOTIFICATION (FIXED)
    async deleteNotification(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.user_id;

            // 1. Verify notification belongs to user (notification_id column use kiya)
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

            // 3. Delete main notification
            await db.query(`DELETE FROM notifications WHERE notification_id = ?`, [id]);

            res.json({ success: true, message: 'Notification deleted successfully' });
        } catch (error) {
            console.error('❌ Delete notification error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }   // 45. REPLY TO NOTIFICATION
    //  
        // 45. REPLY TO NOTIFICATION - ✅ WITH FILE ATTACHMENT SUPPORT
        // 45. REPLY TO NOTIFICATION - ✅ BULLETPROOF VERSION
    async replyToNotification(req, res) {
        try {
            const { notification_id } = req.params;
            const { message, recipient_id, recipient_role } = req.body;
            
            // ✅ CRITICAL: Sab se pehle variables declare karein (Crash fix)
            const coordinatorId = req.user?.user_id;
            const coordinatorName = req.user?.full_name || 'Coordinator';
            
            // ✅ ROBUST file detection
            let attachedFile = req.file;
            if (!attachedFile && req.files) {
                if (Array.isArray(req.files) && req.files.length > 0) {
                    attachedFile = req.files[0];
                } else {
                    for (const key of Object.keys(req.files)) {
                        const val = req.files[key];
                        if (Array.isArray(val) && val.length > 0) { attachedFile = val[0]; break; }
                        if (val && val.buffer) { attachedFile = val; break; }
                    }
                }
            }

            console.log('📨 Coordinator reply received:', { 
                notification_id, 
                hasFile: !!attachedFile, 
                fileName: attachedFile?.originalname 
            });

            if (!message || !message.trim()) {
                return res.status(400).json({ success: false, error: 'Message is required' });
            }

            // Ensure table exists
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

            // ✅ SAVE ATTACHMENT IF PRESENT
            let savedFileUrl = null;
            if (attachedFile) {
                try {
                    const uploadDir = path.join(__dirname, '../uploads/attachments');
                    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
                    const safeOriginal = String(attachedFile.originalname).replace(/[^a-zA-Z0-9.\-]/g, '_');
                    const savedFileName = Date.now() + '-' + safeOriginal;
                    const filePath = path.join(uploadDir, savedFileName);
                    fs.writeFileSync(filePath, attachedFile.buffer);
                    savedFileUrl = `${req.protocol}://${req.get('host')}/uploads/attachments/${savedFileName}`;
                    console.log('✅ Reply attachment saved:', savedFileName);
                } catch (fileError) {
                    console.error('⚠️ Reply file save error:', fileError.message);
                }
            }

            // ✅ INSERT REPLY WITH ATTACHMENT
            const replyQuery = `
                INSERT INTO notification_replies
                (notification_id, sender_id, sender_role, message, attachment_url, created_at)
                VALUES (?, ?, 'Coordinator', ?, ?, NOW())
            `;
            const result = await db.query(replyQuery, [notification_id, coordinatorId, message.trim(), savedFileUrl]);

            // ✅ SEND REPLY NOTIFICATION BACK TO ORIGINAL SENDER
            let targetId = recipient_id;
            let targetRole = recipient_role;
            if (!targetId) {
                try {
                    const orig = await db.query(
                        'SELECT sender_id, sender_role FROM notifications WHERE notification_id = ?',
                        [notification_id]
                    );
                    if (orig.length > 0) {
                        targetId = orig[0].sender_id;
                        targetRole = orig[0].sender_role;
                    }
                } catch (e) { /* ignore */ }
            }

            if (targetId) {
                let replyNotifId = null;
                try {
                    const replyNotifResult = await db.query(`
                        INSERT INTO notifications
                        (sender_id, sender_role, receiver_id, receiver_role,
                        notification_type, title, message, attachment_url, is_pushed, is_email_sent)
                        VALUES (?, 'Coordinator', ?, ?, 'Response', ?, ?, ?, FALSE, FALSE)
                    `, [
                        coordinatorId,
                        targetId,
                        targetRole || 'Admin',
                        '💬 Reply from Coordinator',
                        message.trim(),
                        savedFileUrl
                    ]);
                    replyNotifId = replyNotifResult.insertId;
                } catch (notifError) {
                    console.error('Reply notification error:', notifError);
                }

                // ✅ EMAIL TO ORIGINAL SENDER (Admin/Teacher/Student)
                try {
                    const senderInfo = await db.query('SELECT email, full_name FROM users WHERE user_id = ?', [targetId]);
                    if (senderInfo.length > 0 && senderInfo[0].email) {
                        const emailPayload = {
                            to: senderInfo[0].email,
                            subject: `💬 Reply from Coordinator`,
                            html: `<h2>💬 New Reply Received</h2>
                                   <p><b>${coordinatorName}</b> has replied to your notification.</p>
                                   <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:16px 0;">
                                     <p><b>Message:</b></p>
                                     <p>${message.trim().replace(/\n/g, '<br>')}</p>
                                   </div>
                                   ${savedFileUrl ? `<p>📎 <b>Attachment:</b> <a href="${savedFileUrl}" style="color:#3B82F6;">Download File</a></p>` : ''}
                                   <p style="color:#64748B;font-size:12px;">Sent via Smart Desk</p>`,
                            text: `${coordinatorName} replied: ${message.trim()}${savedFileUrl ? '\n\nAttachment: ' + savedFileUrl : ''}`
                        };
                        if (attachedFile) {
                            emailPayload.attachments = [{
                                filename: attachedFile.originalname,
                                content: attachedFile.buffer,
                                contentType: attachedFile.mimetype
                            }];
                        }
                        const emailResult = await emailService.sendAnnouncementEmail(emailPayload);
                        if (emailResult && emailResult.success) {
                            console.log(`📧✅ Reply email sent to: ${senderInfo[0].email}`);
                            if (replyNotifId) {
                                await db.query('UPDATE notifications SET is_email_sent = TRUE WHERE notification_id = ?', [replyNotifId]);
                            }
                        }
                    }
                } catch (emailErr) {
                    console.error('⚠️ Reply email error:', emailErr.message);
                }

                // ✅ PUSH NOTIFICATION TO REPLY RECIPIENT
                try {
                    const targetToken = await db.query('SELECT push_token, full_name FROM users WHERE user_id = ?', [targetId]);
                    if (targetToken.length > 0 && targetToken[0].push_token) {
                        const pushResult = await pushService.sendAnnouncementPush({
                            pushToken: targetToken[0].push_token,
                            title: '💬 Reply from Coordinator',
                            message: message.trim().substring(0, 100) + (savedFileUrl ? ' 📎' : ''),
                            announcementId: replyNotifId
                        });
                        if (pushResult && pushResult.success) {
                            if (replyNotifId) {
                                await db.query('UPDATE notifications SET is_pushed = TRUE WHERE notification_id = ?', [replyNotifId]);
                            }
                            console.log(`📱✅ Reply push sent to ${targetToken[0].full_name}`);
                        }
                    }
                } catch (pushErr) {
                    console.error('⚠️ Reply push error:', pushErr.message);
                }
            }

            // Audit log
            try {
                await db.query(`
                    INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                    VALUES (?, 'REPLY_SENT', ?, 'Success', ?)
                `, [
                    coordinatorId,
                    `Replied to notification ${notification_id}${attachedFile ? ' with attachment' : ''}`,
                    req.ip || req.connection.remoteAddress
                ]);
            } catch (logError) {}

            res.json({
                success: true,
                message: 'Reply sent successfully',
                reply_id: result.insertId,
                hasAttachment: !!attachedFile,
                attachmentUrl: savedFileUrl
            });
        } catch (error) {
            console.error('Reply error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to send reply'
            });
        }

        }
}
//  Export both controller instance AND upload middleware
const controllerInstance = new CoordinatorController();
controllerInstance.upload = upload;

module.exports = controllerInstance;