// src/controllers/studentAttendanceController.js
//  FIXED: Case-insensitive status matching + Graph-ready data for frontend

const db = require('../config/db');

class StudentAttendanceController {
    constructor() {
        this.db = db;
    }

    //  
    // 1. GET STUDENT ATTENDANCE - ✅ FIXED: Case-insensitive status + Graph data
    //  
    async getAttendance(req, res) {
        try {
            const studentId = req.user?.user_id;
            const { period = 'weekly' } = req.query;

            if (!studentId) {
                return res.status(401).json({ success: false, error: 'User not authenticated' });
            }

            //  FIXED: Pehle students table check karo, phir users se fallback
            const studentQuery = `
                SELECT s.student_id, s.roll_no, s.class_name, s.semester, s.section,
                       u.full_name, u.email, u.department_name
                FROM students s
                JOIN users u ON s.user_id = u.user_id
                WHERE s.user_id = ?
            `;
            let studentResult = await db.query(studentQuery, [studentId]);

            //  FALLBACK: Agar students table mein nahi mila, users se lo
            if (studentResult.length === 0) {
                const fallbackQuery = `
                    SELECT user_id AS student_id, roll_no, class_name, semester, section,
                           full_name, email, department_name
                    FROM users
                    WHERE user_id = ? AND user_role = 'Student'
                `;
                studentResult = await db.query(fallbackQuery, [studentId]);
            }

            if (studentResult.length === 0) {
                return res.status(404).json({ success: false, error: 'Student not found' });
            }

            const student = studentResult[0];

            // Determine date range based on period
            let dateCondition = '';
            if (period === 'weekly') {
                dateCondition = `AND a.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
            } else {
                dateCondition = `AND a.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
            }

            //   CRITICAL FIX: LOWER(a.status) use karo - case-insensitive matching
            // Teacher lowercase mein save karta hai (present/absent/late/leave)
            const query = `
                SELECT 
                    c.classroom_id AS id,
                    c.subject_name AS subject,
                    c.teacher_name AS teacherName,
                    COUNT(a.attendance_id) AS totalClasses,
                    SUM(CASE WHEN LOWER(a.status) IN ('present', 'p') THEN 1 ELSE 0 END) AS present,
                    SUM(CASE WHEN LOWER(a.status) IN ('absent', 'a') THEN 1 ELSE 0 END) AS absent,
                    SUM(CASE WHEN LOWER(a.status) IN ('leave', 'late', 'l') THEN 1 ELSE 0 END) AS leaveDays,
                    ROUND(
                        (SUM(CASE WHEN LOWER(a.status) IN ('present', 'p') THEN 1 ELSE 0 END) 
                         / NULLIF(COUNT(a.attendance_id), 0)) * 100, 1
                    ) AS percentage,
                    DATE_FORMAT(MAX(a.attendance_date), '%b %d, %Y') AS lastUpdated,
                    ? AS period
                FROM classrooms c
                JOIN enrollments e ON c.classroom_id = e.classroom_id
                LEFT JOIN attendance a ON c.classroom_id = a.classroom_id 
                    AND (a.student_id = e.student_id 
                         OR a.student_id = (SELECT student_id FROM students WHERE user_id = e.student_id LIMIT 1))
                    ${dateCondition}
                WHERE (e.student_id = ? OR e.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                AND e.status = 'Active'
                AND c.is_active = TRUE
                GROUP BY c.classroom_id, c.subject_name, c.teacher_name
                HAVING totalClasses > 0
                ORDER BY c.subject_name ASC
            `;

            const results = await db.query(query, [period, studentId, studentId]);

            //   Graph-ready formatted data
            const attendance = results.map(r => ({
                id: r.id?.toString() || `ATT-${Date.now()}`,
                subject: r.subject || 'N/A',
                teacherName: r.teacherName || 'N/A',
                totalClasses: r.totalClasses || 0,
                present: r.present || 0,
                absent: r.absent || 0,
                leaveDays: r.leaveDays || 0,
                percentage: parseFloat(r.percentage) || 0,  //   Float ensure karo
                lastUpdated: r.lastUpdated || new Date().toLocaleDateString(),
                period: r.period || period
            }));

            const overallStats = {
                total: attendance.reduce((sum, a) => sum + a.totalClasses, 0),
                present: attendance.reduce((sum, a) => sum + a.present, 0),
                absent: attendance.reduce((sum, a) => sum + a.absent, 0),
                leaveDays: attendance.reduce((sum, a) => sum + a.leaveDays, 0),
                percentage: 0
            };
            overallStats.percentage = overallStats.total > 0 
                ? parseFloat(((overallStats.present / overallStats.total) * 100).toFixed(1))
                : 0;

            res.json({
                success: true,
                attendance: attendance,
                overall: overallStats,
                student: {
                    id: student.student_id?.toString(),
                    name: student.full_name,
                    rollNo: student.roll_no,
                    email: student.email,
                    department: student.department_name,
                    className: student.class_name,
                    semester: student.semester,
                    section: student.section
                }
            });

        } catch (error) {
            console.error('❌ Get attendance error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //  
    // 2. GET ATTENDANCE FOR SPECIFIC SUBJECT - ✅ FIXED: Case-insensitive
    //  
    async getSubjectAttendance(req, res) {
        try {
            const { classroom_id } = req.params;
            const studentId = req.user?.user_id;

            if (!classroom_id) {
                return res.status(400).json({ success: false, error: 'Classroom ID is required' });
            }

            const verifyQuery = `
                SELECT * FROM enrollments 
                WHERE classroom_id = ? 
                AND (student_id = ? OR student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                AND status = 'Active'
            `;
            const verifyResult = await db.query(verifyQuery, [classroom_id, studentId, studentId]);

            if (verifyResult.length === 0) {
                return res.status(404).json({ success: false, error: 'You are not enrolled in this class' });
            }

            const subjectQuery = `
                SELECT c.subject_name, c.teacher_name, c.class_code
                FROM classrooms c
                WHERE c.classroom_id = ?
            `;
            const subjectResult = await db.query(subjectQuery, [classroom_id]);

            if (subjectResult.length === 0) {
                return res.status(404).json({ success: false, error: 'Class not found' });
            }

            const subject = subjectResult[0];

            const attendanceQuery = `
                SELECT 
                    attendance_id,
                    attendance_date,
                    LOWER(status) AS status,
                    DATE_FORMAT(attendance_date, '%b %d, %Y') AS formatted_date,
                    marked_by,
                    marked_at
                FROM attendance
                WHERE classroom_id = ?
                AND (student_id = ? OR student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                ORDER BY attendance_date DESC
                LIMIT 50
            `;

            const records = await db.query(attendanceQuery, [classroom_id, studentId, studentId]);

            //   Case-insensitive stats
            const stats = {
                total: records.length,
                present: records.filter(r => ['present', 'p'].includes(r.status)).length,
                absent: records.filter(r => ['absent', 'a'].includes(r.status)).length,
                leave: records.filter(r => ['leave', 'late', 'l'].includes(r.status)).length
            };
            stats.percentage = stats.total > 0 ? parseFloat(((stats.present / stats.total) * 100).toFixed(1)) : 0;

            res.json({
                success: true,
                subject: {
                    id: classroom_id,
                    name: subject.subject_name,
                    teacher: subject.teacher_name,
                    classCode: subject.class_code
                },
                records: records,
                stats: stats
            });

        } catch (error) {
            console.error('❌ Get subject attendance error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //  
    // 3. GET ATTENDANCE SUMMARY - ✅ FIXED: Case-insensitive + Monthly graph data
    //  
    async getAttendanceSummary(req, res) {
        try {
            const studentId = req.user?.user_id;

            if (!studentId) {
                return res.status(401).json({ success: false, error: 'User not authenticated' });
            }

            let studId = studentId;
            const studentQuery = `SELECT student_id FROM students WHERE user_id = ?`;
            const studentResult = await db.query(studentQuery, [studentId]);
            if (studentResult.length > 0) {
                studId = studentResult[0].student_id;
            }

            //   Case-insensitive summary
            const summaryQuery = `
                SELECT 
                    COUNT(DISTINCT a.classroom_id) AS totalSubjects,
                    COUNT(a.attendance_id) AS totalClasses,
                    SUM(CASE WHEN LOWER(a.status) IN ('present', 'p') THEN 1 ELSE 0 END) AS totalPresent,
                    SUM(CASE WHEN LOWER(a.status) IN ('absent', 'a') THEN 1 ELSE 0 END) AS totalAbsent,
                    SUM(CASE WHEN LOWER(a.status) IN ('leave', 'late', 'l') THEN 1 ELSE 0 END) AS totalLeave,
                    COUNT(DISTINCT CASE WHEN LOWER(a.status) IN ('present', 'p') THEN a.attendance_date END) AS daysPresent
                FROM attendance a
                WHERE a.student_id = ?
            `;

            const summaryResult = await db.query(summaryQuery, [studId]);

            //   Monthly graph data (last 6 months)
            const monthlyQuery = `
                SELECT 
                    DATE_FORMAT(attendance_date, '%b %Y') AS month,
                    DATE_FORMAT(attendance_date, '%Y-%m') AS monthSort,
                    COUNT(*) AS total,
                    SUM(CASE WHEN LOWER(status) IN ('present', 'p') THEN 1 ELSE 0 END) AS present,
                    SUM(CASE WHEN LOWER(status) IN ('absent', 'a') THEN 1 ELSE 0 END) AS absent,
                    SUM(CASE WHEN LOWER(status) IN ('leave', 'late', 'l') THEN 1 ELSE 0 END) AS leaveDays
                FROM attendance
                WHERE student_id = ?
                AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                GROUP BY DATE_FORMAT(attendance_date, '%b %Y'), DATE_FORMAT(attendance_date, '%Y-%m')
                ORDER BY monthSort ASC
            `;

            const monthlyResult = await db.query(monthlyQuery, [studId]);

            const summary = summaryResult[0] || {
                totalSubjects: 0,
                totalClasses: 0,
                totalPresent: 0,
                totalAbsent: 0,
                totalLeave: 0,
                daysPresent: 0
            };

            summary.percentage = summary.totalClasses > 0 
                ? parseFloat(((summary.totalPresent / summary.totalClasses) * 100).toFixed(1))
                : 0;

            res.json({
                success: true,
                summary: summary,
                monthly: monthlyResult
            });

        } catch (error) {
            console.error('❌ Get attendance summary error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //  
    // 4. GET TODAY'S ATTENDANCE STATUS - ✅ FIXED: Case-insensitive
    //  
    async getTodayAttendance(req, res) {
        try {
            const studentId = req.user?.user_id;

            if (!studentId) {
                return res.status(401).json({ success: false, error: 'User not authenticated' });
            }

            let studId = studentId;
            const studentQuery = `SELECT student_id FROM students WHERE user_id = ?`;
            const studentResult = await db.query(studentQuery, [studentId]);
            if (studentResult.length > 0) {
                studId = studentResult[0].student_id;
            }

            const today = new Date().toISOString().split('T')[0];
            const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

            const query = `
                SELECT 
                    c.classroom_id AS id,
                    c.subject_name AS subject,
                    c.start_time AS startTime,
                    c.end_time AS endTime,
                    c.room,
                    c.teacher_name AS teacherName,
                    COALESCE(LOWER(a.status), 'not marked') AS status,
                    CASE 
                        WHEN a.status IS NULL AND c.start_time < CURTIME() THEN 'Pending'
                        WHEN a.status IS NULL AND c.start_time > CURTIME() THEN 'Upcoming'
                        ELSE 'Marked'
                    END AS attendanceStatus
                FROM classrooms c
                JOIN enrollments e ON c.classroom_id = e.classroom_id
                LEFT JOIN attendance a ON c.classroom_id = a.classroom_id 
                    AND (a.student_id = e.student_id 
                         OR a.student_id = (SELECT student_id FROM students WHERE user_id = e.student_id LIMIT 1))
                    AND a.attendance_date = ?
                WHERE (e.student_id = ? OR e.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                AND c.day = ?
                AND c.is_active = TRUE
                AND e.status = 'Active'
                ORDER BY c.start_time ASC
            `;

            const results = await db.query(query, [today, studentId, studentId, todayName]);

            const summary = {
                total: results.length,
                present: results.filter(r => ['present', 'p'].includes(r.status)).length,
                absent: results.filter(r => ['absent', 'a'].includes(r.status)).length,
                leave: results.filter(r => ['leave', 'late', 'l'].includes(r.status)).length,
                notMarked: results.filter(r => r.status === 'not marked').length
            };

            res.json({
                success: true,
                date: today,
                day: todayName,
                classes: results,
                summary: summary
            });

        } catch (error) {
            console.error('❌ Get today attendance error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }
}

module.exports = new StudentAttendanceController();