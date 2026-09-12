// resetDatabase.js - Backend root folder mein rakhein (server.js ke sath)
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

// YAHAN APNI MARZI KA EMAIL/PASSWORD RAKH SAKTY HAIN
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin123';

(async () => {
    try {
        const db = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'smart_desk',
            port: process.env.DB_PORT || 3306,
        });

        console.log('🔄 Database reset shuru ho raha hai...\n');

        // 1️⃣ PURANA SARA DATA DELETE KARO
        const tables = [
            'notification_replies', 'notification_responses', 'notifications',
            'otp_verification', 'attendance', 'marks', 'enrollments',
            'classroom_teachers', 'classrooms', 'assignment_submissions', 'assignments',
            'academic_reports', 'performance_reports', 'report_requests',
            'audit_log', 'students', 'teachers', 'coordinators', 'admins',
            'semesters', 'departments', 'users'
        ];

        await db.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const t of tables) {
            try {
                await db.query(`DELETE FROM ${t}`);
                console.log(`🗑️  ${t} -> cleared`);
            } catch (e) {
                console.log(`⏭️  ${t} -> skip (table nahi mili)`);
            }
        }
        await db.query('SET FOREIGN_KEY_CHECKS = 1');

        // 2️⃣ NAYA ADMIN BANAO (bcrypt hashed password ke sath)
        const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
        await db.query(
            `INSERT INTO users (email, password, full_name, user_role, status, email_verified, email_domain_type)
             VALUES (?, ?, ?, 'Admin', 'Active', 1, 'institute')`,
            [ADMIN_EMAIL, hash, 'Super Admin']
        );

        console.log('\n✅ DATABASE RESET COMPLETE!');
        console.log('=========================================');
        console.log(`👑 ADMIN EMAIL:    ${ADMIN_EMAIL}`);
        console.log(`🔑 ADMIN PASSWORD: ${ADMIN_PASSWORD}`);
        console.log('=========================================');
        console.log('\nAb server restart karein: node server.js');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
})();