// src/controllers/studentAcademicReportController.js
//  FIXED: Teacher ki reports (academic_reports) se parhta hai + PDF/Excel download

const db = require('../config/db');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

class StudentAcademicReportController {
    constructor() { this.db = db; }

    //  
    // 1. GET REPORTS (Weekly / Monthly)
    //  
    async getReports(req, res) {
        try {
            const studentId = req.user?.user_id;
            const { period = 'weekly' } = req.query;
            if (!studentId) return res.status(401).json({ success: false, error: 'User not authenticated' });

            const query = `
                SELECT ar.report_id AS id, ar.period, ar.remarks, ar.mid_term_marks, ar.quiz_marks,
                       ar.assignment_marks, ar.class_activity, ar.behavior, ar.activity, ar.created_at,
                       c.subject_name AS subject, c.class_name AS className, c.classroom_id AS classId,
                       t.full_name AS teacherName
                FROM academic_reports ar
                JOIN classrooms c ON ar.classroom_id = c.classroom_id
                LEFT JOIN users t ON ar.created_by = t.user_id
                WHERE ar.student_id = ? AND ar.period = ?
                ORDER BY ar.created_at DESC`;
            const results = await db.query(query, [studentId, period]);

            const reports = [];
            for (const r of results) {
                //  Attendance (present/Present dono)
                const att = await db.query(
                    `SELECT COUNT(*) AS total, SUM(CASE WHEN LOWER(status)='present' THEN 1 ELSE 0 END) AS present
                     FROM attendance WHERE student_id = ? AND classroom_id = ?`,
                    [studentId, r.classId]);
                const total = att[0]?.total || 0, present = att[0]?.present || 0;
                const attendance = total > 0 ? Math.round((present / total) * 100) : null;

                //  Grade (marks table se)
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
                    detailedRemarks: remarks,
                    summaryRemarks: remarks,
                    remarks: remarks,
                    date: r.created_at ? new Date(r.created_at).toISOString() : null,
                    createdAt: r.created_at,
                    period: r.period,
                    type: r.period
                });
            }

            res.json({ success: true, reports, count: reports.length });
        } catch (e) {
            console.error('Get reports error:', e);
            res.status(500).json({ success: false, error: 'Server error: ' + e.message });
        }
    }

    //  
    // 2. GET REPORT DETAILS
    //  
    async getReportDetails(req, res) {
        try {
            const { report_id } = req.params;
            const studentId = req.user?.user_id;
            if (!studentId) return res.status(401).json({ success: false, error: 'User not authenticated' });

            const q = `
                SELECT ar.*, c.subject_name AS subject, c.class_name AS className, t.full_name AS teacherName
                FROM academic_reports ar
                JOIN classrooms c ON ar.classroom_id = c.classroom_id
                LEFT JOIN users t ON ar.created_by = t.user_id
                WHERE ar.report_id = ? AND ar.student_id = ?`;
            const r = await db.query(q, [report_id, studentId]);
            if (r.length === 0) return res.status(404).json({ success: false, error: 'Report not found' });

            const row = r[0];
            res.json({
                success: true,
                report: {
                    id: String(row.report_id),
                    subject: row.subject, teacherName: row.teacherName || 'Teacher',
                    period: row.period,
                    midTermMarks: row.mid_term_marks, quizMarks: row.quiz_marks, assignmentMarks: row.assignment_marks,
                    classActivity: row.class_activity, behavior: row.behavior, activity: row.activity,
                    detailedRemarks: row.remarks || '', summaryRemarks: row.remarks || '', remarks: row.remarks || '',
                    date: row.created_at ? new Date(row.created_at).toISOString() : null
                }
            });
        } catch (e) { res.status(500).json({ success: false, error: 'Server error: ' + e.message }); }
    }

    //  
    // 3. DOWNLOAD (PDF / Excel)
    //  
    async downloadReport(req, res) {
        try {
            const { report_id } = req.params;
            const { format = 'pdf' } = req.query;
            const studentId = req.user?.user_id;

            const q = `
                SELECT ar.*, c.subject_name AS subject, c.class_name AS className,
                       t.full_name AS teacherName, u.full_name AS studentName, u.roll_no AS rollNo
                FROM academic_reports ar
                JOIN classrooms c ON ar.classroom_id = c.classroom_id
                LEFT JOIN users t ON ar.created_by = t.user_id
                LEFT JOIN users u ON ar.student_id = u.user_id
                WHERE ar.report_id = ? AND ar.student_id = ?`;
            const r = await db.query(q, [report_id, studentId]);
            if (r.length === 0) return res.status(404).json({ success: false, error: 'Report not found' });
            const row = r[0];

            if (format === 'excel') return this._excel(row, res);
            return this._pdf(row, res);
        } catch (e) { res.status(500).json({ success: false, error: 'Server error: ' + e.message }); }
    }

    _pdf(row, res) {
        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Report_${row.report_id}.pdf"`);
        doc.pipe(res);
        doc.fontSize(20).fillColor('#1E40AF').text('Academic Report', { align: 'center' }).moveDown();
        doc.fontSize(12).fillColor('#000');
        doc.text(`Student: ${row.studentName || ''} (${row.rollNo || ''})`);
        doc.text(`Subject: ${row.subject || ''}   Class: ${row.className || ''}`);
        doc.text(`Teacher: ${row.teacherName || ''}   Period: ${row.period || ''}`);
        doc.text(`Mid-Term: ${row.mid_term_marks || '-'}  Quiz: ${row.quizMarks || row.quiz_marks || '-'}  Assignment: ${row.assignmentMarks || row.assignment_marks || '-'}`);
        doc.moveDown();
        doc.text('Teacher Remarks:', { underline: true });
        doc.text(row.remarks || 'No remarks.');
        doc.end();
    }

    _excel(row, res) {
        const wb = XLSX.utils.book_new();
        const data = [{
            Student: row.studentName || '', RollNo: row.rollNo || '', Subject: row.subject || '',
            Class: row.className || '', Teacher: row.teacherName || '', Period: row.period || '',
            MidTerm: row.mid_term_marks || '', Quiz: row.quiz_marks || '', Assignment: row.assignment_marks || '',
            Remarks: row.remarks || ''
        }];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Report');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Report_${row.report_id}.xlsx"`);
        res.send(buf);
    }

    //  
    // 4. STATS
    //  
    async getStats(req, res) {
        try {
            const studentId = req.user?.user_id;
            const r = await db.query(
                `SELECT COUNT(*) AS total FROM academic_reports WHERE student_id = ?`, [studentId]);
            res.json({ success: true, stats: { totalReports: r[0]?.total || 0 } });
        } catch (e) { res.status(500).json({ success: false, error: 'Server error: ' + e.message }); }
    }
}

module.exports = new StudentAcademicReportController();