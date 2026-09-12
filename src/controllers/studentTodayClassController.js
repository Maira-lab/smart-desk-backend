// src/controllers/studentTodayClassController.js
//  FIXED: Student not found fallback + enrollment user_id fix
//  NEW: Teacher notification wali classes bhi Today's Classes mein dikhengi

const db = require('../config/db');

class StudentTodayClassController {
    constructor() {
        this.db = db;
    }

    //  
    // 1. GET TODAY'S CLASSES - ✅ FIXED: Regular + Notification Classes
    //  
    async getTodayClasses(req, res) {
        try {
            const studentId = req.user?.user_id;
            const { filter = 'all' } = req.query;

            if (!studentId) {
                return res.status(401).json({ success: false, error: 'User not authenticated' });
            }

            // Student info fetch
            const studentQuery = `
                SELECT s.student_id, s.roll_no, s.class_name, s.semester, s.section,
                       u.full_name, u.email
                FROM students s
                JOIN users u ON s.user_id = u.user_id
                WHERE s.user_id = ?
            `;
            let studentResult = await db.query(studentQuery, [studentId]);

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
                return res.status(404).json({ success: false, error: 'Student not found' });
            }

            const student = studentResult[0];

            const today = new Date();
            const todayName = today.toLocaleDateString('en-US', { weekday: 'long' });
            const todayDate = today.toISOString().split('T')[0];
            const formattedDate = today.toLocaleDateString('en-US', { 
                month: 'long', day: 'numeric', year: 'numeric' 
            });

            //  REGULAR TODAY'S CLASSES (based on scheduled day)
            const regularQuery = `
                SELECT 
                    c.classroom_id AS id,
                    c.subject_name AS subject,
                    c.teacher_name AS teacherName,
                    c.start_time AS startTime,
                    c.end_time AS endTime,
                    c.room,
                    c.day,
                    c.notes AS teacherNotification,
                    c.is_active,
                    (SELECT COUNT(*) FROM enrollments WHERE classroom_id = c.classroom_id AND status = 'Active') AS totalStudents,
                    CASE 
                        WHEN TIME(NOW()) > c.end_time THEN 'completed'
                        WHEN TIME(NOW()) BETWEEN c.start_time AND c.end_time THEN 'ongoing'
                        ELSE 'upcoming'
                    END AS status
                FROM classrooms c
                JOIN enrollments e ON c.classroom_id = e.classroom_id
                WHERE (e.student_id = ? OR e.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                AND c.day = ?
                AND c.is_active = TRUE
                AND e.status = 'Active'
            `;
            const regularResults = await db.query(regularQuery, [studentId, studentId, todayName]);

            //  NEW: NOTIFICATION-BASED CLASSES (teacher ne notification bheji hai)
            const notifQuery = `
                SELECT DISTINCT
                    c.classroom_id AS id,
                    c.subject_name AS subject,
                    c.teacher_name AS teacherName,
                    c.start_time AS startTime,
                    c.end_time AS endTime,
                    c.room,
                    c.day,
                    n.title AS teacherNotification,
                    c.is_active,
                    (SELECT COUNT(*) FROM enrollments WHERE classroom_id = c.classroom_id AND status = 'Active') AS totalStudents,
                    'upcoming' AS status
                FROM notifications n
                JOIN classrooms c ON n.classroom_id = c.classroom_id
                JOIN enrollments e ON c.classroom_id = e.classroom_id
                WHERE (e.student_id = ? OR e.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                AND n.receiver_id = ?
                AND n.sender_role = 'Teacher'
                AND n.classroom_id IS NOT NULL
                AND c.is_active = TRUE
                AND e.status = 'Active'
                AND c.day != ?
            `;
            const notifResults = await db.query(notifQuery, [studentId, studentId, studentId, todayName]);

            //  Combine both results
            const allResults = [...regularResults, ...notifResults];

            const classes = allResults.map(cls => {
                let duration = 'N/A';
                if (cls.startTime && cls.endTime) {
                    try {
                        const startParts = cls.startTime.split(':');
                        const endParts = cls.endTime.split(':');
                        const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
                        const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
                        const diffMin = endMin - startMin;
                        if (diffMin > 0) {
                            const hours = Math.floor(diffMin / 60);
                            const mins = diffMin % 60;
                            duration = hours > 0 ? `${hours}h ${mins > 0 ? mins + 'm' : ''}` : `${mins}m`;
                        }
                    } catch (e) {
                        duration = 'N/A';
                    }
                }

                let status = cls.status || 'upcoming';
                if (cls.startTime && cls.endTime) {
                    const now = new Date();
                    const currentTime = now.getHours() * 60 + now.getMinutes();
                    const startMin = parseInt(cls.startTime.split(':')[0]) * 60 + parseInt(cls.startTime.split(':')[1] || '0');
                    const endMin = parseInt(cls.endTime.split(':')[0]) * 60 + parseInt(cls.endTime.split(':')[1] || '0');
                    
                    if (currentTime > endMin) {
                        status = 'completed';
                    } else if (currentTime >= startMin && currentTime <= endMin) {
                        status = 'ongoing';
                    } else {
                        status = 'upcoming';
                    }
                }

                return {
                    id: cls.id?.toString() || `CLS-${Date.now()}`,
                    subject: cls.subject || 'N/A',
                    teacherName: cls.teacherName || 'N/A',
                    startTime: cls.startTime || 'TBD',
                    endTime: cls.endTime || 'TBD',
                    duration: duration,
                    day: cls.day || todayName,
                    date: formattedDate,
                    roomNumber: cls.room || 'TBD',
                    status: status,
                    teacherNotification: cls.teacherNotification || null,
                    totalStudents: cls.totalStudents || 0,
                    isActive: cls.is_active === 1
                };
            });

            let filteredClasses = classes;
            if (filter === 'upcoming') {
                filteredClasses = classes.filter(c => c.status === 'upcoming' || c.status === 'ongoing');
            } else if (filter === 'completed') {
                filteredClasses = classes.filter(c => c.status === 'completed');
            }

            const summary = {
                total: classes.length,
                upcoming: classes.filter(c => c.status === 'upcoming' || c.status === 'ongoing').length,
                completed: classes.filter(c => c.status === 'completed').length,
                ongoing: classes.filter(c => c.status === 'ongoing').length
            };

            res.json({
                success: true,
                date: formattedDate,
                day: todayName,
                classes: filteredClasses,
                count: filteredClasses.length,
                summary: summary,
                student: {
                    name: student.full_name,
                    rollNo: student.roll_no,
                    className: student.class_name,
                    semester: student.semester,
                    section: student.section
                }
            });

        } catch (error) {
            console.error('Get today classes error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //  
    // 2. GET CLASS DETAILS - ✅ FIXED
    //  
    async getClassDetails(req, res) {
        try {
            const { class_id } = req.params;
            const studentId = req.user?.user_id;

            if (!class_id) {
                return res.status(400).json({ success: false, error: 'Class ID is required' });
            }

            const verifyQuery = `
                SELECT e.*, c.* 
                FROM enrollments e
                JOIN classrooms c ON e.classroom_id = c.classroom_id
                WHERE e.classroom_id = ? 
                AND (e.student_id = ? OR e.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                AND e.status = 'Active'
            `;
            const verifyResult = await db.query(verifyQuery, [class_id, studentId, studentId]);

            if (verifyResult.length === 0) {
                return res.status(404).json({ success: false, error: 'Class not found or not enrolled' });
            }

            const cls = verifyResult[0];

            const countQuery = `
                SELECT COUNT(*) AS totalStudents
                FROM enrollments
                WHERE classroom_id = ? AND status = 'Active'
            `;
            const countResult = await db.query(countQuery, [class_id]);

            const today = new Date().toISOString().split('T')[0];
            const attendanceQuery = `
                SELECT status FROM attendance
                WHERE classroom_id = ? 
                AND (student_id = ? OR student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                AND attendance_date = ?
            `;
            const attendanceResult = await db.query(attendanceQuery, [class_id, studentId, studentId, today]);

            const classDetails = {
                id: cls.classroom_id?.toString(),
                subject: cls.subject_name || 'N/A',
                teacherName: cls.teacher_name || 'N/A',
                startTime: cls.start_time || 'TBD',
                endTime: cls.end_time || 'TBD',
                day: cls.day || 'N/A',
                room: cls.room || 'TBD',
                semester: cls.semester || 'N/A',
                section: cls.section || 'N/A',
                notes: cls.notes || null,
                totalStudents: countResult[0]?.totalStudents || 0,
                attendanceStatus: attendanceResult.length > 0 ? attendanceResult[0].status : 'Not Marked',
                isActive: cls.is_active === 1
            };

            res.json({ success: true, class: classDetails });

        } catch (error) {
            console.error('Get class details error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //  
    // 3. GET WEEKLY SCHEDULE - ✅ FIXED
    //  
    async getWeeklySchedule(req, res) {
        try {
            const studentId = req.user?.user_id;

            if (!studentId) {
                return res.status(401).json({ success: false, error: 'User not authenticated' });
            }

            const query = `
                SELECT 
                    c.classroom_id AS id,
                    c.subject_name AS subject,
                    c.teacher_name AS teacherName,
                    c.start_time AS startTime,
                    c.end_time AS endTime,
                    c.room,
                    c.day,
                    c.notes AS teacherNotification,
                    c.is_active
                FROM classrooms c
                JOIN enrollments e ON c.classroom_id = e.classroom_id
                WHERE (e.student_id = ? OR e.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                AND c.is_active = TRUE
                AND e.status = 'Active'
                ORDER BY FIELD(c.day, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'), c.start_time ASC
            `;

            const results = await db.query(query, [studentId, studentId]);

            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            const schedule = {};
            
            days.forEach(day => { schedule[day] = []; });

            results.forEach(cls => {
                const day = cls.day || 'Monday';
                if (schedule[day]) {
                    schedule[day].push({
                        id: cls.id?.toString(),
                        subject: cls.subject || 'N/A',
                        teacherName: cls.teacherName || 'N/A',
                        startTime: cls.startTime || 'TBD',
                        endTime: cls.endTime || 'TBD',
                        room: cls.room || 'TBD',
                        teacherNotification: cls.teacherNotification || null,
                        isActive: cls.is_active === 1
                    });
                }
            });

            res.json({ success: true, schedule: schedule, student_id: studentId });

        } catch (error) {
            console.error('Get weekly schedule error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //  
    // 4. GET CLASS ATTENDANCE STATUS - ✅ FIXED
    //  
    async getAttendanceStatus(req, res) {
        try {
            const studentId = req.user?.user_id;

            if (!studentId) {
                return res.status(401).json({ success: false, error: 'User not authenticated' });
            }

            const today = new Date().toISOString().split('T')[0];
            const query = `
                SELECT 
                    c.classroom_id AS id,
                    c.subject_name AS subject,
                    COALESCE(a.status, 'Not Marked') AS attendanceStatus
                FROM classrooms c
                JOIN enrollments e ON c.classroom_id = e.classroom_id
                LEFT JOIN attendance a ON c.classroom_id = a.classroom_id 
                    AND (a.student_id = ? OR a.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                    AND a.attendance_date = ?
                WHERE (e.student_id = ? OR e.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1))
                AND c.is_active = TRUE
                AND e.status = 'Active'
                ORDER BY c.start_time ASC
            `;

            const results = await db.query(query, [studentId, studentId, today, studentId, studentId]);

            const summary = {
                total: results.length,
                present: results.filter(r => r.attendanceStatus === 'Present' || r.attendanceStatus === 'present').length,
                absent: results.filter(r => r.attendanceStatus === 'Absent' || r.attendanceStatus === 'absent').length,
                leave: results.filter(r => r.attendanceStatus === 'Leave' || r.attendanceStatus === 'leave').length,
                notMarked: results.filter(r => r.attendanceStatus === 'Not Marked').length
            };

            res.json({ success: true, date: today, attendance: results, summary: summary });

        } catch (error) {
            console.error('Get attendance status error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //  
    // 5. GET CLASS SUMMARY STATS - ✅ FIXED
    //  
    async getClassSummary(req, res) {
        try {
            const studentId = req.user?.user_id;

            if (!studentId) {
                return res.status(401).json({ success: false, error: 'User not authenticated' });
            }

            let className = 'Student';
            const studentQuery = `SELECT class_name FROM students WHERE user_id = ?`;
            const studentResult = await db.query(studentQuery, [studentId]);
            if (studentResult.length > 0) {
                className = studentResult[0].class_name || 'Student';
            } else {
                const fallbackQuery = `SELECT class_name FROM users WHERE user_id = ?`;
                const fallbackResult = await db.query(fallbackQuery, [studentId]);
                if (fallbackResult.length > 0) className = fallbackResult[0].class_name || 'Student';
            }

            const totalQuery = `
                SELECT COUNT(*) AS total
                FROM enrollments e
                JOIN classrooms c ON e.classroom_id = c.classroom_id
                WHERE (e.student_id = ? OR e.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1)) AND e.status = 'Active'
            `;
            const totalResult = await db.query(totalQuery, [studentId, studentId]);

            const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
            const todayQuery = `
                SELECT COUNT(*) AS today
                FROM enrollments e
                JOIN classrooms c ON e.classroom_id = c.classroom_id
                WHERE (e.student_id = ? OR e.student_id = (SELECT student_id FROM students WHERE user_id = ? LIMIT 1)) AND c.day = ? AND e.status = 'Active'
            `;
            const todayResult = await db.query(todayQuery, [studentId, studentId, today]);

            const total = totalResult[0]?.total || 0;
            const todayCount = todayResult[0]?.today || 0;

            res.json({
                success: true,
                summary: {
                    totalClasses: total,
                    todayClasses: todayCount,
                    upcomingClasses: todayCount,
                    completedClasses: 0,
                    attendanceRate: 0,
                    progress: 0
                },
                student: { className: className }
            });

        } catch (error) {
            console.error('Get class summary error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }
}

module.exports = new StudentTodayClassController();