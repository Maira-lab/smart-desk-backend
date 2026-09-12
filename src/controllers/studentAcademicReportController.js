// src/controllers/studentAcademicReportController.js
//  FIXED: Student not found fallback + user_id direct usage

const db = require('../config/db');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

class StudentAcademicReportController {
    constructor() {
        this.db = db;
    }

    //  
    // 1. GET ACADEMIC REPORTS - ✅ FIXED
    //  
    async getReports(req, res) {
        try {
            const studentId = req.user?.user_id;
            const { period = 'weekly', class_name, roll_no } = req.query;

            if (!studentId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            //  FIXED: Pehle students table check, phir users se fallback
            const studentQuery = `
                SELECT s.student_id, s.roll_no, s.class_name, s.semester, s.section,
                       u.full_name, u.email
                FROM students s
                JOIN users u ON s.user_id = u.user_id
                WHERE s.user_id = ?
            `;
            let studentResult = await db.query(studentQuery, [studentId]);

            //  FALLBACK: Agar students table mein nahi mila, users se lo
            if (studentResult.length === 0) {
                const fallbackQuery = `
                    SELECT user_id AS student_id, roll_no, class_name, semester, section,
                           full_name, email
                    FROM users
                    WHERE user_id = ? AND user_role = 'Student'
                `;
                studentResult = await db.query(fallbackQuery, [studentId]);
            }

            if (studentResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Student not found'
                });
            }

            const student = studentResult[0];

            //  FIXED: marks mein user_id OR students table check
            let query = '';
            let params = [];

            if (period === 'weekly') {
                query = `
                    SELECT 
                        m.mark_id AS id,
                        c.subject_name AS subject,
                        c.teacher_name AS teacherName,
                        m.grade,
                        m.remarks AS detailedRemarks,
                        CONCAT(SUBSTRING(m.remarks, 1, 100), '...') AS summaryRemarks,
                        DATE_FORMAT(m.created_at, '%b %d, %Y') AS date,
                        'weekly' AS period,
                        COALESCE(
                            (SELECT COUNT(*) FROM attendance 
                             WHERE (student_id = ? OR student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                             AND classroom_id = c.classroom_id 
                             AND attendance_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND CURDATE()
                             AND status = 'Present'),
                            0
                        ) AS attendance_percentage,
                        COALESCE(
                            (SELECT COUNT(*) FROM marks 
                             WHERE (student_id = ? OR student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                             AND classroom_id = c.classroom_id 
                             AND assessment_type IN ('Assignment', 'Quiz')
                             AND created_at BETWEEN DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND CURDATE()),
                            0
                        ) AS assignments_completed
                    FROM marks m
                    JOIN classrooms c ON m.classroom_id = c.classroom_id
                    WHERE (m.student_id = ? OR m.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                    AND m.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                    ORDER BY m.created_at DESC
                    LIMIT 20
                `;
                params = [studentId, studentId, studentId, studentId, studentId, studentId];
            } else {
                query = `
                    SELECT 
                        m.mark_id AS id,
                        c.subject_name AS subject,
                        c.teacher_name AS teacherName,
                        m.grade,
                        CONCAT(SUBSTRING(m.remarks, 1, 100), '...') AS detailedRemarks,
                        m.remarks AS summaryRemarks,
                        DATE_FORMAT(m.created_at, '%b %d, %Y') AS date,
                        'monthly' AS period,
                        NULL AS attendance_percentage,
                        NULL AS assignments_completed
                    FROM marks m
                    JOIN classrooms c ON m.classroom_id = c.classroom_id
                    WHERE (m.student_id = ? OR m.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                    AND m.created_at >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
                    ORDER BY m.created_at DESC
                    LIMIT 20
                `;
                params = [studentId, studentId];
            }

            const results = await db.query(query, params);

            const reports = results.map(r => ({
                id: r.id?.toString() || `R-${Date.now()}`,
                subject: r.subject || 'N/A',
                teacherName: r.teacherName || 'N/A',
                grade: r.grade || 'N/A',
                detailedRemarks: r.detailedRemarks || r.remarks || 'No remarks available.',
                summaryRemarks: r.summaryRemarks || r.remarks || 'No summary available.',
                date: r.date || new Date().toLocaleDateString(),
                period: r.period || period,
                attendance: r.attendance_percentage ? `${r.attendance_percentage}%` : undefined,
                assignmentsCompleted: r.assignments_completed || 0,
                teacherId: r.teacher_id,
                createdAt: r.created_at
            }));

            res.json({
                success: true,
                reports: reports,
                count: reports.length,
                student: {
                    name: student.full_name,
                    rollNo: student.roll_no,
                    className: student.class_name,
                    semester: student.semester,
                    section: student.section,
                    email: student.email
                }
            });

        } catch (error) {
            console.error('Get reports error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 2. GET REPORT DETAILS - ✅ FIXED
    //  
    async getReportDetails(req, res) {
        try {
            const { report_id } = req.params;
            const studentId = req.user?.user_id;

            if (!report_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Report ID is required'
                });
            }

            //  FIXED: marks mein user_id OR students table check
            const query = `
                SELECT 
                    m.mark_id AS id,
                    c.subject_name AS subject,
                    c.teacher_name AS teacherName,
                    m.grade,
                    m.remarks AS detailedRemarks,
                    CONCAT(SUBSTRING(m.remarks, 1, 100), '...') AS summaryRemarks,
                    DATE_FORMAT(m.created_at, '%b %d, %Y') AS date,
                    m.assessment_type AS assessmentType,
                    m.marks_obtained,
                    m.total_marks,
                    m.percentage,
                    DATE_FORMAT(m.created_at, '%Y-%m-%d') AS createdAt,
                    u.full_name AS teacherFullName,
                    u.email AS teacherEmail
                FROM marks m
                JOIN classrooms c ON m.classroom_id = c.classroom_id
                LEFT JOIN users u ON c.teacher_id = u.user_id
                WHERE m.mark_id = ?
                AND (m.student_id = ? OR m.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
            `;

            const results = await db.query(query, [report_id, studentId, studentId]);

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Report not found'
                });
            }

            const r = results[0];

            //  FIXED: attendance mein user_id OR students table check
            const attendanceQuery = `
                SELECT 
                    COUNT(*) AS total_classes,
                    SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present,
                    SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent,
                    SUM(CASE WHEN status = 'Leave' THEN 1 ELSE 0 END) AS leave_days
                FROM attendance a
                JOIN classrooms c ON a.classroom_id = c.classroom_id
                WHERE (a.student_id = ? OR a.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                AND c.subject_name = ?
            `;
            const attendanceResult = await db.query(attendanceQuery, [studentId, studentId, r.subject]);

            const report = {
                id: r.id?.toString(),
                subject: r.subject || 'N/A',
                teacherName: r.teacherFullName || r.teacherName || 'N/A',
                teacherEmail: r.teacherEmail || 'N/A',
                grade: r.grade || 'N/A',
                detailedRemarks: r.detailedRemarks || 'No remarks available.',
                summaryRemarks: r.summaryRemarks || 'No summary available.',
                date: r.date || new Date().toLocaleDateString(),
                assessmentType: r.assessmentType || 'General',
                marksObtained: r.marks_obtained || 0,
                totalMarks: r.total_marks || 100,
                percentage: r.percentage || 0,
                createdAt: r.createdAt || new Date().toISOString(),
                attendance: attendanceResult[0] || { total_classes: 0, present: 0, absent: 0, leave_days: 0 }
            };

            res.json({
                success: true,
                report: report
            });

        } catch (error) {
            console.error('Get report details error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 3. DOWNLOAD REPORT (PDF/Excel) - ✅ FIXED
    //  
    async downloadReport(req, res) {
        try {
            const { report_id } = req.params;
            const { format } = req.query;
            const studentId = req.user?.user_id;

            if (!report_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Report ID is required'
                });
            }

            //  FIXED: Fallback logic for student info
            const query = `
                SELECT 
                    m.mark_id AS id,
                    c.subject_name AS subject,
                    c.teacher_name AS teacherName,
                    m.grade,
                    m.remarks AS detailedRemarks,
                    CONCAT(SUBSTRING(m.remarks, 1, 100), '...') AS summaryRemarks,
                    DATE_FORMAT(m.created_at, '%b %d, %Y') AS date,
                    m.assessment_type AS assessmentType,
                    m.marks_obtained,
                    m.total_marks,
                    m.percentage,
                    DATE_FORMAT(m.created_at, '%Y-%m-%d') AS createdAt,
                    u.full_name AS teacherFullName,
                    u.email AS teacherEmail,
                    COALESCE(s.roll_no, stu.roll_no) AS rollNo,
                    COALESCE(s.class_name, stu.class_name) AS className,
                    COALESCE(s.semester, stu.semester) AS semester,
                    COALESCE(s.section, stu.section) AS section,
                    stu.full_name AS studentName
                FROM marks m
                JOIN classrooms c ON m.classroom_id = c.classroom_id
                LEFT JOIN users u ON c.teacher_id = u.user_id
                LEFT JOIN students s ON m.student_id = s.student_id
                LEFT JOIN users stu ON COALESCE(s.user_id, m.student_id) = stu.user_id
                WHERE m.mark_id = ?
                AND (m.student_id = ? OR m.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
            `;

            const results = await db.query(query, [report_id, studentId, studentId]);

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Report not found'
                });
            }

            const report = results[0];

            if (format === 'pdf') {
                return this.generatePDF(report, res);
            } else if (format === 'excel') {
                return this.generateExcel(report, res);
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid format. Use "pdf" or "excel"'
                });
            }

        } catch (error) {
            console.error('Download report error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }

    //  
    // 4. GENERATE PDF
    //  
    generatePDF(report, res) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50 });
                const filename = `Academic_Report_${report.id}_${Date.now()}.pdf`;

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

                doc.pipe(res);

                doc.fontSize(24)
                   .fillColor('#1E40AF')
                   .text('📊 Academic Report', { align: 'center' })
                   .moveDown(0.5);

                doc.fontSize(14)
                   .fillColor('#1F2937')
                   .text(`${report.subject} - ${report.className || 'N/A'}`, { align: 'center' })
                   .fontSize(12)
                   .fillColor('#64748B')
                   .text(`Generated: ${new Date().toISOString().split('T')[0]}`, { align: 'center' })
                   .moveDown(1);

                doc.moveTo(50, doc.y)
                   .lineTo(550, doc.y)
                   .stroke('#E5E7EB')
                   .moveDown(0.5);

                doc.fontSize(14)
                   .fillColor('#1E40AF')
                   .text('👤 Student Information', { underline: true })
                   .moveDown(0.5);

                doc.fontSize(12)
                   .fillColor('#374151');

                const studentInfo = [
                    ['Name', report.studentName || 'N/A'],
                    ['Roll Number', report.rollNo || 'N/A'],
                    ['Class', report.className || 'N/A'],
                    ['Semester', report.semester || 'N/A'],
                    ['Section', report.section || 'N/A']
                ];

                studentInfo.forEach(([label, value]) => {
                    doc.text(`${label}:`, { continued: true })
                       .font('Helvetica-Bold')
                       .text(` ${value}`, { continued: false })
                       .font('Helvetica')
                       .moveDown(0.3);
                });

                doc.moveDown(0.5);

                doc.moveTo(50, doc.y)
                   .lineTo(550, doc.y)
                   .stroke('#E5E7EB')
                   .moveDown(0.5);

                doc.fontSize(14)
                   .fillColor('#1E40AF')
                   .text('📋 Report Details', { underline: true })
                   .moveDown(0.5);

                doc.fontSize(12)
                   .fillColor('#374151');

                const reportDetails = [
                    ['Subject', report.subject],
                    ['Teacher', report.teacherFullName || report.teacherName],
                    ['Teacher Email', report.teacherEmail || 'N/A'],
                    ['Assessment Type', report.assessmentType || 'General'],
                    ['Date', report.date || 'N/A'],
                    ['Grade', report.grade || 'N/A'],
                    ['Marks', `${report.marks_obtained || 0}/${report.total_marks || 100}`],
                    ['Percentage', `${report.percentage || 0}%`]
                ];

                reportDetails.forEach(([label, value]) => {
                    doc.text(`${label}:`, { continued: true })
                       .font('Helvetica-Bold')
                       .text(` ${value}`, { continued: false })
                       .font('Helvetica')
                       .moveDown(0.3);
                });

                doc.moveDown(0.5);

                doc.moveTo(50, doc.y)
                   .lineTo(550, doc.y)
                   .stroke('#E5E7EB')
                   .moveDown(0.5);

                doc.fontSize(14)
                   .fillColor('#1E40AF')
                   .text('📝 Teacher Remarks', { underline: true })
                   .moveDown(0.5);

                doc.fontSize(12)
                   .fillColor('#374151')
                   .text(report.detailedRemarks || 'No remarks available.', {
                       width: 500,
                       align: 'left',
                       lineGap: 5
                   })
                   .moveDown(1);

                doc.moveDown(1);
                doc.fontSize(10)
                   .fillColor('#94A3B8')
                   .text('Generated by Smart Desk - Academic Report System', { align: 'center' })
                   .text(`© ${new Date().getFullYear()} Smart Desk - All Rights Reserved`, { align: 'center' });

                doc.end();
                resolve();

            } catch (error) {
                reject(error);
            }
        });
    }

    //  
    // 5. GENERATE EXCEL
    //  
    generateExcel(report, res) {
        try {
            const wb = XLSX.utils.book_new();

            const summaryData = [{
                'Report ID': report.id,
                'Subject': report.subject,
                'Student Name': report.studentName || 'N/A',
                'Roll Number': report.rollNo || 'N/A',
                'Class': report.className || 'N/A',
                'Semester': report.semester || 'N/A',
                'Section': report.section || 'N/A',
                'Teacher': report.teacherFullName || report.teacherName || 'N/A',
                'Teacher Email': report.teacherEmail || 'N/A',
                'Assessment Type': report.assessmentType || 'General',
                'Date': report.date || 'N/A',
                'Grade': report.grade || 'N/A',
                'Marks Obtained': report.marks_obtained || 0,
                'Total Marks': report.total_marks || 100,
                'Percentage': `${report.percentage || 0}%`,
                'Generated Date': new Date().toISOString().split('T')[0]
            }];
            const ws1 = XLSX.utils.json_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

            const remarksData = [
                ['Teacher Remarks'],
                [report.detailedRemarks || 'No remarks available.'],
                [],
                ['Generated by Smart Desk - Academic Report System'],
                [`© ${new Date().getFullYear()} Smart Desk - All Rights Reserved`]
            ];
            const ws2 = XLSX.utils.aoa_to_sheet(remarksData);
            XLSX.utils.book_append_sheet(wb, ws2, 'Remarks');

            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

            const filename = `Academic_Report_${report.id}_${Date.now()}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            return res.send(buffer);

        } catch (error) {
            console.error('Excel generation error:', error);
            throw error;
        }
    }

    //  
    // 6. GET REPORT STATS - ✅ FIXED
    //  
    async getReportStats(req, res) {
        try {
            const studentId = req.user?.user_id;

            if (!studentId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            //  FIXED: marks mein user_id OR students table check
            const query = `
                SELECT 
                    COUNT(*) AS total_reports,
                    AVG(percentage) AS avg_percentage,
                    MAX(percentage) AS max_percentage,
                    MIN(percentage) AS min_percentage,
                    COUNT(DISTINCT subject) AS total_subjects,
                    COUNT(DISTINCT teacherName) AS total_teachers
                FROM (
                    SELECT 
                        m.percentage,
                        c.subject_name AS subject,
                        c.teacher_name AS teacherName
                    FROM marks m
                    JOIN classrooms c ON m.classroom_id = c.classroom_id
                    WHERE (m.student_id = ? OR m.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                ) AS report_data
            `;

            const results = await db.query(query, [studentId, studentId]);

            //  FIXED: grade query mein bhi fallback
            const gradeQuery = `
                SELECT 
                    grade,
                    COUNT(*) AS count
                FROM marks
                WHERE (student_id = ? OR student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                GROUP BY grade
                ORDER BY grade
            `;
            const gradeResults = await db.query(gradeQuery, [studentId, studentId]);

            const stats = results[0] || {
                total_reports: 0,
                avg_percentage: 0,
                max_percentage: 0,
                min_percentage: 0,
                total_subjects: 0,
                total_teachers: 0
            };

            const gradeDistribution = {};
            gradeResults.forEach(g => {
                gradeDistribution[g.grade] = g.count;
            });

            res.json({
                success: true,
                stats: {
                    totalReports: stats.total_reports || 0,
                    averagePercentage: Math.round(stats.avg_percentage || 0),
                    maxPercentage: Math.round(stats.max_percentage || 0),
                    minPercentage: Math.round(stats.min_percentage || 0),
                    totalSubjects: stats.total_subjects || 0,
                    totalTeachers: stats.total_teachers || 0,
                    gradeDistribution: gradeDistribution
                }
            });

        } catch (error) {
            console.error('Get report stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    }
}
module.exports = new StudentAcademicReportController();