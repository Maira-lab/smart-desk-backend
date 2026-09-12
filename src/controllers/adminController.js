// src/controllers/adminController.js
//  OOP APPROACH - Complete with Create Coordinator + Department Reports + Monitor Users + PDF/Excel Download + Delete Report
//  FIXED: Monitor Users sirf Approved users | Approve/Revoke email sirf usi user ko | Bulk email sirf selected roles ko
//  STEP 5: ID Card + Profile Photo columns added to getPendingApprovals and getRevokedUsers

const db = require('../config/db');
const emailService = require('../services/emailService');
const pushService = require('../services/pushService');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const announcementsUploadDir = path.join(__dirname, '../uploads/announcements');
if (!fs.existsSync(announcementsUploadDir)) {
    fs.mkdirSync(announcementsUploadDir, { recursive: true });
}

class AdminController {
    constructor() {
        this.db = db;
        this.bcrypt = bcrypt;
        this.emailService = emailService;
        this.getStats = this.getStats.bind(this);
        this.getAllUsers = this.getAllUsers.bind(this);
        this.getPendingApprovals = this.getPendingApprovals.bind(this);
        this.approveUser = this.approveUser.bind(this);
        this.rejectUser = this.rejectUser.bind(this);
        this.revokeUser = this.revokeUser.bind(this);
        this.recoverAccount = this.recoverAccount.bind(this);
        this.getRevokedUsers = this.getRevokedUsers.bind(this);
        this.permanentlyDeleteUser = this.permanentlyDeleteUser.bind(this);
        this.bulkPermanentlyDeleteUsers = this.bulkPermanentlyDeleteUsers.bind(this);
        this.restoreUser = this.restoreUser.bind(this);
        this.deleteUser = this.deleteUser.bind(this);
        this.createCoordinator = this.createCoordinator.bind(this);
        this.makeAnnouncement = this.makeAnnouncement.bind(this);
        this.getDepartmentReports = this.getDepartmentReports.bind(this);
        this.monitorUsers = this.monitorUsers.bind(this);
        this.getUserActivity = this.getUserActivity.bind(this);
        this.getStaff = this.getStaff.bind(this);
        this.getResponses = this.getResponses.bind(this);
        this.restrictUser = this.restrictUser.bind(this);
        this.getUserStats = this.getUserStats.bind(this);
        this.bulkRestrictUsers = this.bulkRestrictUsers.bind(this);
        this.bulkUnrestrictUsers = this.bulkUnrestrictUsers.bind(this);
        this.getDepartments = this.getDepartments.bind(this);
        this.getCoordinators = this.getCoordinators.bind(this);
        this.requestReport = this.requestReport.bind(this);
        this.getReceivedReports = this.getReceivedReports.bind(this);
        this.getReportDetails = this.getReportDetails.bind(this);
        this.downloadReport = this.downloadReport.bind(this);
        this.sendDirectMessage = this.sendDirectMessage.bind(this);
        this.deleteReport = this.deleteReport.bind(this);
        this.getInstituteCondition = this.getInstituteCondition.bind(this);
        this.getInstitutions = this.getInstitutions.bind(this);
        this.createInstitution = this.createInstitution.bind(this);
        this.createInstituteAdmin = this.createInstituteAdmin.bind(this);       
    }

    //  Helper: Institute-based filtering
getInstituteCondition(req) {
    const instituteId = req.user?.institute_id;
    if (!instituteId) {
        // Agar institute_id nahi hai (purana admin), toh sab dikhega
        return { clause: '', params: [] };
    }
    return { clause: ' AND institute_id = ?', params: [instituteId] };
}

//  Get all institutions
async getInstitutions(req, res) {
    try {
        const results = await db.query(
            'SELECT * FROM institutions WHERE status = "Active" ORDER BY institute_name ASC'
        );
        res.json({ success: true, institutions: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

//  Create new institution
async createInstitution(req, res) {
    try {
        const { institute_name, institute_code, city } = req.body;
        
        if (!institute_name) {
            return res.status(400).json({ success: false, error: 'Institute name is required' });
        }

        const existing = await db.query(
            'SELECT * FROM institutions WHERE institute_name = ?',
            [institute_name]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ success: false, error: 'Institute already exists' });
        }

        const result = await db.query(
            'INSERT INTO institutions (institute_name, institute_code, city, status) VALUES (?, ?, ?, "Active")',
            [institute_name, institute_code || null, city || null]
        );

        res.status(201).json({ 
            success: true, 
            message: 'Institute created successfully!',
            institute_id: result.insertId 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

//  Create admin for specific institute
async createInstituteAdmin(req, res) {
    try {
        const { email, password, full_name, institute_id } = req.body;
        
        if (!email || !password || !full_name || !institute_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Please provide email, password, full_name, and institute_id' 
            });
        }

        // PASSWORD VALIDATION: Minimum 8 characters (Letters, Digits, Special Characters allowed)
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters long (letters, numbers & special characters allowed)'
            });
        }

        // Check institute exists
        const inst = await db.query(
            'SELECT * FROM institutions WHERE institute_id = ? AND status = "Active"',
            [institute_id]
        );
        
        if (inst.length === 0) {
            return res.status(404).json({ success: false, error: 'Institute not found' });
        }

        // Check email already exists
        const existing = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, error: 'Email already exists' });
        }

        const hashedPassword = await this.bcrypt.hash(password, 10);

        await db.query(`
            INSERT INTO users (email, password, full_name, user_role, status, institute_name, institute_id)
            VALUES (?, ?, ?, 'Admin', 'Active', ?, ?)
        `, [email, hashedPassword, full_name, inst[0].institute_name, institute_id]);

        res.status(201).json({ 
            success: true, 
            message: `Admin created for ${inst[0].institute_name}!` 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

    async sendAccountEmail(user, type, extra = '') {
        try {
            const emailService = require('../services/emailService');
            let subject = '', html = '', text = '';

            if (type === 'approved') {
                subject = '✅ Account Approved - Smart Desk';
                html = `<h2>✅ Account Approved</h2><p>Dear <b>${user.full_name}</b>,</p><p>Congratulations! Your <b>${user.user_role}</b> account has been <b>approved</b> by the admin.</p><p>You can now login to Smart Desk and access all features.</p><p><b>Email:</b> ${user.email}</p><p>Best regards,<br><b>Smart Desk Team</b></p>`;
                text = `Account Approved\n\nDear ${user.full_name},\nYour ${user.user_role} account has been approved.\nYou can now login to Smart Desk.\n\nEmail: ${user.email}\n\nSmart Desk Team`;
            } else if (type === 'rejected') {
                subject = '❌ Account Rejected - Smart Desk';
                html = `<h2>❌ Account Rejected</h2><p>Dear <b>${user.full_name}</b>,</p><p>We regret to inform you that your <b>${user.user_role}</b> account has been <b>rejected</b>.</p>${extra ? `<p><b>Reason:</b> ${extra}</p>` : ''}<p>Please contact admin for details.</p><p>Smart Desk Team</p>`;
                text = `Account Rejected\n\nDear ${user.full_name},\nYour ${user.user_role} account has been rejected.${extra ? `\nReason: ${extra}` : ''}\nPlease contact admin.\n\nSmart Desk Team`;
            } else if (type === 'revoked') {
                subject = '⛔ Account Revoked - Smart Desk';
                html = `<h2>⛔ Account Revoked</h2><p>Dear <b>${user.full_name}</b>,</p><p>Your <b>${user.user_role}</b> account has been <b>revoked</b> by the admin.</p><p>Please contact admin for details.</p><p>Smart Desk Team</p>`;
                text = `Account Revoked\n\nDear ${user.full_name},\nYour ${user.user_role} account has been revoked.\nPlease contact admin.\n\nSmart Desk Team`;
            } else if (type === 'restored') {
                subject = '🔄 Account Restored - Smart Desk';
                html = `<h2>🔄 Account Restored</h2><p>Dear <b>${user.full_name}</b>,</p><p>Your <b>${user.user_role}</b> account has been <b>restored</b>. You now have full access.</p><p>Smart Desk Team</p>`;
                text = `Account Restored\n\nDear ${user.full_name},\nYour ${user.user_role} account has been restored.\n\nSmart Desk Team`;
            }
            else if (type === 'recovered') {
    subject = '♻️ Account Recovered - Smart Desk';
    html = `<h2>♻️ Account Recovered</h2><p>Dear <b>${user.full_name}</b>,</p><p>Your <b>${user.user_role}</b> account has been <b>recovered</b> by the admin and moved back to <b>Pending Approvals</b>.</p><p>You will be able to login again once your account is re-approved.</p><p>Smart Desk Team</p>`;
    text = `Account Recovered\n\nDear ${user.full_name},\nYour ${user.user_role} account has been recovered and is now pending re-approval.\n\nSmart Desk Team`;
}

            const result = await emailService.sendEmail({ to: user.email, subject, html, text });
            console.log(`📧 ${type} email to ${user.email}:`, result.success ? 'sent' : 'failed');
            return result;
        } catch (e) {
            console.error('❌ Account email error:', e.message);
            return { success: false, error: e.message };
        }
    }

    async getStats(req, res) {
        try {
            const totalUsersQuery = 'SELECT COUNT(*) AS total FROM users';
            const userResult = await db.query(totalUsersQuery);

            const monitoredUsersQuery = `
                SELECT COUNT(*) AS monitored 
                FROM users 
                WHERE user_role IN ('Teacher', 'Student', 'Coordinator')
                AND status = 'Active'
            `;
            const monitoredResult = await db.query(monitoredUsersQuery);

            const pendingQuery = 'SELECT COUNT(*) AS pending FROM users WHERE status = "Pending"';
            const pendingResult = await db.query(pendingQuery);

            const classesQuery = 'SELECT COUNT(*) AS classes FROM classrooms WHERE is_active = TRUE';
            const classResult = await db.query(classesQuery);

            const teachersQuery = 'SELECT COUNT(*) AS teachers FROM users WHERE user_role = "Teacher" AND status = "Active"';
            const teacherResult = await db.query(teachersQuery);

            const studentsQuery = 'SELECT COUNT(*) AS students FROM users WHERE user_role = "Student" AND status = "Active"';
            const studentResult = await db.query(studentsQuery);

            const restrictedQuery = 'SELECT COUNT(*) AS restricted FROM users WHERE is_restricted = TRUE';
            const restrictedResult = await db.query(restrictedQuery);

            res.json({
                success: true,
                stats: {
                    totalUsers: userResult[0]?.total || 0,
                    monitoredUsers: monitoredResult[0]?.monitored || 0,
                    pendingApprovals: pendingResult[0]?.pending || 0,
                    activeClasses: classResult[0]?.classes || 0,
                    activeTeachers: teacherResult[0]?.teachers || 0,
                    activeStudents: studentResult[0]?.students || 0,
                    restrictedUsers: restrictedResult[0]?.restricted || 0
                }
            });
        } catch (error) {
            console.error('Stats error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    async getAllUsers(req, res) {
    try {
        const { clause, params } = this.getInstituteCondition(req);
        
        const query = `
            SELECT user_id, email, full_name, user_role, status, 
                   institute_name, department_name, class_name,
                   semester, roll_no, section, created_at, is_restricted
            FROM users 
            WHERE user_role IN ('Teacher', 'Student', 'Coordinator') ${clause}
            ORDER BY created_at DESC
        `;
        
        const results = await db.query(query, params);
        res.json({ success: true, users: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

    //  STEP 5: ID CARD + PROFILE PHOTO ADDED
    async getPendingApprovals(req, res) {
    try {
        const { clause, params } = this.getInstituteCondition(req);
        
        const query = `
            SELECT 
                user_id AS id, full_name AS name, email,
                user_role AS role, institute_name AS instituteName,
                DATE_FORMAT(created_at, '%b %d, %Y') AS registrationDate,
                status, roll_no AS rollNo, section, semester,
                class_name AS className, department_name AS department,
                id_card_path AS idCardPath,
                profile_photo_path AS profilePhotoPath
            FROM users 
            WHERE user_role IN ('Teacher', 'Student') ${clause}
            ORDER BY 
                CASE status 
                    WHEN 'Pending' THEN 1 
                    WHEN 'Active' THEN 2 
                    ELSE 3 
                END,
                created_at DESC
        `;
        
        const results = await db.query(query, params);
        const formattedResults = results.map(r => ({ ...r, role: r.role.toLowerCase() }));
        res.json({ success: true, pending: formattedResults, count: formattedResults.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

    async approveUser(req, res) {
        try {
            const { user_id } = req.params;
            const adminId = req.user?.user_id;

            if (!user_id) {
                return res.status(400).json({ success: false, error: 'User ID is required' });
            }

            const users = await db.query('SELECT * FROM users WHERE user_id = ?', [user_id]);
            if (users.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            const user = users[0];
            if (user.status === 'Active') {
                return res.status(400).json({ success: false, error: 'User is already approved' });
            }

            await db.query('UPDATE users SET status = "Active" WHERE user_id = ?', [user_id]);

            await db.query(`
                INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role,
                notification_type, title, message, is_pushed)
                VALUES (?, 'Admin', ?, ?, 'System', 'Account Approved', 
                'Your account has been approved. You can now login to Smart Desk.', FALSE)
            `, [adminId, user_id, user.user_role]);

            await this.sendAccountEmail(user, 'approved');

            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'USER_APPROVED', ?, 'Success', ?)
            `, [adminId, `Approved user: ${user.email} (${user.full_name})`, req.ip || req.connection.remoteAddress]);

            res.json({
                success: true,
                message: 'User approved successfully',
                user: { id: user.user_id, name: user.full_name, email: user.email, role: user.user_role }
            });
        } catch (error) {
            console.error('Approve user error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    async rejectUser(req, res) {
        try {
            const { user_id } = req.params;
            const { reason } = req.body;
            const adminId = req.user?.user_id;

            if (!user_id) {
                return res.status(400).json({ success: false, error: 'User ID is required' });
            }

            const users = await db.query('SELECT * FROM users WHERE user_id = ?', [user_id]);
            if (users.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            const user = users[0];
            if (user.status === 'Inactive') {
                return res.status(400).json({ success: false, error: 'User is already rejected' });
            }

            await db.query('UPDATE users SET status = "Inactive" WHERE user_id = ?', [user_id]);

            const message = `Your account has been rejected. Reason: ${reason || 'Not specified'}. Please contact admin.`;
            await db.query(`
                INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role,
                notification_type, title, message, is_pushed)
                VALUES (?, 'Admin', ?, ?, 'System', 'Account Rejected', ?, FALSE)
            `, [adminId, user_id, user.user_role, message]);

            await this.sendAccountEmail(user, 'rejected', reason || 'Not specified');

            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'USER_REJECTED', ?, 'Success', ?)
            `, [adminId, `Rejected user: ${user.email} (${user.full_name}). Reason: ${reason || 'Not specified'}`, req.ip || req.connection.remoteAddress]);

            res.json({
                success: true,
                message: 'User rejected successfully',
                user: { id: user.user_id, name: user.full_name, email: user.email, role: user.user_role }
            });
        } catch (error) {
            console.error('Reject user error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    async revokeUser(req, res) {
        try {
            const { user_id } = req.params;
            const adminId = req.user?.user_id;

            if (!user_id) {
                return res.status(400).json({ success: false, error: 'User ID is required' });
            }

            const users = await db.query('SELECT * FROM users WHERE user_id = ?', [user_id]);
            if (users.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            const user = users[0];
            if (user.status === 'Inactive') {
                return res.status(400).json({ success: false, error: 'User is already revoked' });
            }

            await db.query('UPDATE users SET status = "Inactive" WHERE user_id = ?', [user_id]);

            await db.query(`
                INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role,
                notification_type, title, message, is_pushed)
                VALUES (?, 'Admin', ?, ?, 'System', 'Account Revoked', 
                'Your account has been revoked. Contact admin for details.', FALSE)
            `, [adminId, user_id, user.user_role]);

            await this.sendAccountEmail(user, 'revoked');

            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'USER_REVOKED', ?, 'Success', ?)
            `, [adminId, `Revoked user: ${user.email} (${user.full_name})`, req.ip || req.connection.remoteAddress]);

            res.json({ success: true, message: 'User revoked successfully' });
        } catch (error) {
            console.error('Revoke user error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //  STEP 5: ID CARD + PROFILE PHOTO ADDED
        async getRevokedUsers(req, res) {
        try {
           //      MULTI-TENANCY: Institute filter
            const { clause, params } = this.getInstituteCondition(req);
            
            const query = `
                SELECT 
                    user_id AS id, full_name AS name, email,
                    user_role AS role, institute_name AS instituteName,
                    DATE_FORMAT(updated_at, '%b %d, %Y') AS revokedDate,
                    status, roll_no AS rollNo, section, semester,
                    class_name AS className, department_name AS department,
                    id_card_path AS idCardPath,
                    profile_photo_path AS profilePhotoPath
                FROM users 
                WHERE status = 'Inactive' 
                AND user_role IN ('Teacher', 'Student') ${clause}
                ORDER BY updated_at DESC
            `;
            const results = await db.query(query, params);
            const formattedResults = results.map(r => ({ ...r, role: r.role.toLowerCase() }));
            res.json({ success: true, revoked: formattedResults, count: formattedResults.length });
        } catch (error) {
            console.error('Get revoked users error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }


    // ✅ RECOVER ACCOUNT - Move from Revoked (Inactive) back to Pending
async recoverAccount(req, res) {
    try {
        const { user_id } = req.params;
        const adminId = req.user?.user_id;

        if (!user_id) {
            return res.status(400).json({ success: false, error: 'User ID is required' });
        }

        // 1. Check user exists and is currently revoked (Inactive)
        const users = await db.query('SELECT * FROM users WHERE user_id = ?', [user_id]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const user = users[0];
        
        if (user.status !== 'Inactive') {
            return res.status(400).json({ 
                success: false, 
                error: 'Only revoked (Inactive) accounts can be recovered' 
            });
        }

        // 2. ✅ Change status to "Pending" (NOT Active - taake Grant Access module mein jaye)
        await db.query('UPDATE users SET status = "Pending" WHERE user_id = ?', [user_id]);

        // 3. Send notification to user
        await db.query(`
            INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role,
            notification_type, title, message, is_pushed)
            VALUES (?, 'Admin', ?, ?, 'System', '♻️ Account Recovered', 
            'Your account has been recovered by admin and is now in Pending status. You can login again once re-approved.', FALSE)
        `, [adminId, user_id, user.user_role]);

        // 4. Send email
        await this.sendAccountEmail(user, 'recovered');

        // 5. Audit log
        await db.query(`
            INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
            VALUES (?, 'USER_RECOVERED', ?, 'Success', ?)
        `, [adminId, `Recovered account: ${user.email} (${user.full_name}) - moved to Pending`, req.ip || req.connection.remoteAddress]);

        res.json({ 
            success: true, 
            message: `${user.full_name}'s account recovered and moved to Pending Approvals`,
            user: { id: user.user_id, name: user.full_name, email: user.email, role: user.user_role }
        });
    } catch (error) {
        console.error('Recover account error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
}

    async permanentlyDeleteUser(req, res) {
        try {
            const { user_id } = req.params;
            const adminId = req.user?.user_id;

            if (!user_id) {
                return res.status(400).json({ success: false, error: 'User ID is required' });
            }

            const users = await db.query('SELECT * FROM users WHERE user_id = ? AND status = "Inactive"', [user_id]);
            if (users.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found or not revoked' });
            }

            const user = users[0];
            await db.query('DELETE FROM users WHERE user_id = ?', [user_id]);

            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'USER_PERMANENTLY_DELETED', ?, 'Success', ?)
            `, [adminId, `Permanently deleted user: ${user.email} (${user.full_name})`, req.ip || req.connection.remoteAddress]);

            res.json({ success: true, message: 'User permanently deleted successfully' });
        } catch (error) {
            console.error('Permanently delete user error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    async bulkPermanentlyDeleteUsers(req, res) {
        try {
            const { user_ids } = req.body;
            const adminId = req.user?.user_id;

            if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
                return res.status(400).json({ success: false, error: 'Please provide an array of user IDs' });
            }

            const placeholders = user_ids.map(() => '?').join(',');

            const users = await db.query(`SELECT * FROM users WHERE user_id IN (${placeholders}) AND status = "Inactive"`, user_ids);

            if (users.length === 0) {
                return res.status(404).json({ success: false, error: 'No valid revoked users found' });
            }

            await db.query(`DELETE FROM users WHERE user_id IN (${placeholders})`, user_ids);

            const userNames = users.map(u => `${u.email} (${u.full_name})`).join(', ');
            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'USERS_BULK_DELETED', ?, 'Success', ?)
            `, [adminId, `Bulk deleted ${users.length} users: ${userNames}`, req.ip || req.connection.remoteAddress]);

            res.json({
                success: true,
                message: `${users.length} users permanently deleted successfully`,
                deletedCount: users.length
            });
        } catch (error) {
            console.error('Bulk delete users error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    async restoreUser(req, res) {
        try {
            const { user_id } = req.params;
            const adminId = req.user?.user_id;

            if (!user_id) {
                return res.status(400).json({ success: false, error: 'User ID is required' });
            }

            const users = await db.query('SELECT * FROM users WHERE user_id = ? AND status = "Inactive"', [user_id]);
            if (users.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found or not revoked' });
            }

            const user = users[0];
            await db.query('UPDATE users SET status = "Active" WHERE user_id = ?', [user_id]);

            await this.sendAccountEmail(user, 'restored');

            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'USER_RESTORED', ?, 'Success', ?)
            `, [adminId, `Restored user: ${user.email} (${user.full_name})`, req.ip || req.connection.remoteAddress]);

            res.json({ success: true, message: 'User restored successfully' });
        } catch (error) {
            console.error('Restore user error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    async deleteUser(req, res) {
        try {
            const { user_id } = req.params;
            if (!user_id) {
                return res.status(400).json({ success: false, error: 'User ID is required' });
            }
            await db.query('DELETE FROM users WHERE user_id = ?', [user_id]);
            res.json({ success: true, message: 'User deleted successfully' });
        } catch (error) {
            console.error('Delete user error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

        async createCoordinator(req, res) {
        try {
            const { 
                email, 
                password, 
                full_name, 
                institute_name,
                notification_mode,
                manual_email,
                custom_message
            } = req.body;
            
            const adminId = req.user?.user_id;
            //  STEP 4 MULTI-TENANCY: Admin ka institute_id extract karein
            const instituteId = req.user?.institute_id; 

            if (!email || !password || !full_name) {
                return res.status(400).json({ success: false, error: 'Please fill all required fields' });
            }

           //      PASSWORD VALIDATION: Minimum 8 characters (Letters, Digits, Special Characters allowed)
            if (password.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 8 characters long (letters, numbers & special characters allowed)'
                });
            }

            //  CHECK 1: Duplicate Email (Email globally unique honi chahiye)
            const existing = await db.query('SELECT * FROM users WHERE email = ?', [email]);
            if (existing.length > 0) {
                return res.status(400).json({ success: false, error: 'Email already exists' });
            }

            //  CHECK 2: ONLY 1 ACTIVE COORDINATOR ALLOWED PER INSTITUTE (Multi-Tenancy Rule)
            let activeCoordQuery = `
                SELECT u.user_id, u.full_name, u.email 
                FROM users u
                JOIN coordinators c ON u.user_id = c.user_id
                WHERE u.user_role = 'Coordinator' 
                  AND u.status = 'Active' 
                  AND (u.is_restricted = 0 OR u.is_restricted IS NULL)
            `;
            let activeCoordParams = [];

            if (instituteId) {
                // Agar Admin kisi specific institute ka hai, toh sirf us institute ka coordinator check karo
                activeCoordQuery += ' AND u.institute_id = ?';
                activeCoordParams.push(instituteId);
            } else {
                // Agar Super Admin hai (institute_id NULL), toh global/NULL coordinator check karo
                activeCoordQuery += ' AND u.institute_id IS NULL';
            }
            activeCoordQuery += ' LIMIT 1';

            const activeCoordCheck = await db.query(activeCoordQuery, activeCoordParams);

            if (activeCoordCheck.length > 0) {
                const existingCoord = activeCoordCheck[0];
                return res.status(400).json({ 
                    success: false, 
                    error: `⚠️ An active coordinator already exists for your institute!\n\nName: ${existingCoord.full_name}\nEmail: ${existingCoord.email}\n\nPlease go to "Monitor Users" and restrict/revoke this coordinator first before creating a new one.`
                });
            }

            const hashedPassword = await this.bcrypt.hash(password, 10);
            
            //  STEP 4: institute_id ko users table mein save karo
            const userResult = await db.query(`
                INSERT INTO users (email, password, full_name, user_role, status, institute_name, institute_id)
                VALUES (?, ?, ?, 'Coordinator', 'Active', ?, ?)
            `, [email, hashedPassword, full_name, institute_name || null, instituteId || null]);

            const userId = userResult.insertId;
            
            //  STEP 4: institute_id ko coordinators table mein bhi save karo
            await db.query(`
                INSERT INTO coordinators (user_id, designation, joining_date, institute_id)
                VALUES (?, 'Coordinator', CURDATE(), ?)
            `, [userId, instituteId || null]);

            let notificationStatus = 'skipped';
            let notificationDetails = {};

            if (notification_mode === 'auto-email' || notification_mode === 'manual') {
                try {
                    const emailService = require('../services/emailService');
                    const toEmail = notification_mode === 'auto-email' ? email : manual_email;
                    const result = await emailService.sendEmail({
                        to: toEmail,
                        subject: '🎉 Welcome to Smart Desk - Your Coordinator Account',
                        html: `<h2>Welcome, ${full_name}! 🎉</h2><p>Your coordinator account has been created.</p><p><b>Email:</b> ${email}<br><b>Password:</b> ${password}<br><b>Role:</b> Coordinator</p><p>Please login to Smart Desk app.</p><p>Smart Desk Team</p>`,
                        text: `Welcome ${full_name}!\n\nEmail: ${email}\nPassword: ${password}\nRole: Coordinator\n\nSmart Desk Team`
                    });
                    notificationStatus = result.success ? 'sent' : 'failed';
                    notificationDetails = result;
                } catch (error) {
                    console.error('❌ Email send error:', error);
                    notificationStatus = 'failed';
                    notificationDetails = { error: error.message };
                }
            }

            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'COORDINATOR_CREATED', ?, 'Success', ?)
            `, [adminId, `Created coordinator: ${email} (${full_name}) for Institute ID: ${instituteId || 'Global'} | Notification: ${notification_mode}`, req.ip || req.connection.remoteAddress]);

            res.status(201).json({
                success: true,
                message: 'Coordinator account created successfully!',
                user_id: userId,
                notification: { mode: notification_mode, status: notificationStatus, details: notificationDetails },
                user: { full_name, email, role: 'Coordinator' }
            });
        } catch (error) {
            console.error('Create coordinator error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

        async makeAnnouncement(req, res) {
        try {
            const { subject, title, message, target_audience, target_role, recipient_mode, recipient_ids, notification_type, sendEmail = 'true', sendPush = 'true'   } = req.body;
            const adminId = req.user?.user_id;
            const finalTitle = subject || title; // Frontend 'subject' bhejta hai

            if (!finalTitle || !message) {
                return res.status(400).json({ success: false, error: 'Please provide subject/title and message' });
            }

            let roles = [];
            if (recipient_mode === 'individual' && recipient_ids) {
                // Individual mode mein roles nahi, specific IDs use hongi
            } else {
                const audience = target_audience || target_role || 'all';
                const roleMap = { 'teacher': 'Teacher', 'student': 'Student', 'coordinator': 'Coordinator', 'all': 'All', 'teachers': 'Teacher', 'coordinators': 'Coordinator' };
                
                if (Array.isArray(audience)) roles = audience;
                else if (typeof audience === 'string' && audience.includes(',')) roles = audience.split(',');
                else roles = [audience];
                
                roles = roles.map(r => roleMap[String(r).trim().toLowerCase()] || String(r).trim()).filter(Boolean);
                if (roles.length === 0) roles = ['All'];
            }

            const notifType = notification_type || 'Announcement';
            
            //    FIX: Handle MULTIPLE files (req.files) instead of single (req.file)
            let attachmentUrls = [];
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    try {
                        const safeName = Date.now() + '-' + String(file.originalname).replace(/[^a-zA-Z0-9.\-]/g, '_');
                        fs.writeFileSync(path.join(announcementsUploadDir, safeName), file.buffer);
                        attachmentUrls.push(`${req.protocol}://${req.get('host')}/uploads/announcements/${safeName}`);
                    } catch (fileErr) {
                        console.error('⚠️ Attachment save error:', fileErr.message);
                    }
                }
            }
            const finalAttachmentUrl = attachmentUrls.length > 0 ? attachmentUrls.join(',') : null;

            //    Database mein save karo
            if (recipient_mode === 'individual' && recipient_ids) {
                try {
                    const ids = JSON.parse(recipient_ids);
                    const users = await db.query(`SELECT user_id, user_role FROM users WHERE user_id IN (${ids.map(() => '?').join(',')})`, ids);
                    for (const user of users) {
                        await db.query(`
                            INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role,
                            notification_type, title, message, attachment_url, is_pushed, is_email_sent, is_read, created_at)
                            VALUES (?, 'Admin', ?, ?, ?, ?, ?, ?, FALSE, FALSE, FALSE, NOW())
                        `, [adminId, user.user_id, user.user_role, notifType, finalTitle, message, finalAttachmentUrl]);
                    }
                } catch (e) {
                    console.error('Individual recipient parse error:', e);
                }
            } else {
                for (const role of roles) {
                    await db.query(`
                        INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role,
                        notification_type, title, message, attachment_url, is_pushed, is_email_sent, is_read, created_at)
                        VALUES (?, 'Admin', NULL, ?, ?, ?, ?, ?, FALSE, FALSE, FALSE, NOW())
                    `, [adminId, role, notifType, finalTitle, message, finalAttachmentUrl]);
                }
            }

            //    Email logic (agar enable hai)
            const emailResults = [];
            const shouldSendEmail = sendEmail === 'true' || sendEmail === true || sendEmail === '1';
            if (shouldSendEmail) {
                let emailUsers = [];
                if (recipient_mode === 'individual' && recipient_ids) {
                    const ids = JSON.parse(recipient_ids);
                    emailUsers = await db.query(`SELECT user_id, full_name, email FROM users WHERE user_id IN (${ids.map(() => '?').join(',')}) AND status = 'Active'`, ids);
                } else if (roles.includes('All')) {
                    emailUsers = await db.query(`SELECT user_id, full_name, email FROM users WHERE status = 'Active' AND user_role IN ('Teacher','Student','Coordinator')`);
                } else {
                    const ph = roles.map(() => '?').join(',');
                    emailUsers = await db.query(`SELECT user_id, full_name, email FROM users WHERE status = 'Active' AND user_role IN (${ph})`, roles);
                }
                
                const emailService = require('../services/emailService');
                const inlineImage = req.files && req.files.length > 0 ? {
                    filename: req.files[0].originalname || 'announcement-file',
                    content: req.files[0].buffer,
                    contentType: req.files[0].mimetype || 'application/octet-stream'
                } : null;

                for (const u of emailUsers) {
                    try {
                        const r = await emailService.sendAnnouncementEmail({ 
                            to: u.email, 
                            subject: finalTitle, 
                            message, 
                            senderName: 'Admin',
                            inlineImage: inlineImage
                        });
                        emailResults.push({ email: u.email, success: !!r.success });
                    } catch (e) {
                        emailResults.push({ email: u.email, success: false, error: e.message });
                    }
                }
            }

            res.json({ 
                success: true, 
                message: 'Announcement sent successfully!', 
                targetRoles: recipient_mode === 'individual' ? 'Individual' : roles, 
                emailResults,
                hasAttachment: attachmentUrls.length > 0
            });
        } catch (error) {
            console.error('Make announcement error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

        //    GET STAFF (For Recipient Picker)
    async getStaff(req, res) {
        try {
            let query = `
                SELECT user_id AS id, full_name AS name, email, user_role AS role, 
                       COALESCE(department_name, institute_name, 'General') AS department
                FROM users 
                WHERE user_role IN ('Teacher', 'Coordinator') AND status = 'Active'
            `;
            let params = [];
            
            if (req.user?.institute_id) {
                query += ` AND institute_id = ?`;
                params.push(req.user.institute_id);
            }
            
            query += ` ORDER BY full_name ASC`;
            
            const results = await db.query(query, params);
            res.json({ success: true, staff: results });
        } catch (error) {
            console.error('Get staff error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //    GET RESPONSES / ANNOUNCEMENTS (Shows Coordinator/Teacher announcements in Admin Portal)
     // ✅ FIXED: 'read' reserved keyword error resolved
    async getResponses(req, res) {
        try {
            const adminId = req.user?.user_id;
            const query = `
                SELECT
                    n.notification_id AS id,
                    u.full_name AS senderName,
                    u.user_role AS senderRole,
                    u.email AS senderEmail,
                    n.title AS subject,
                    n.message AS responseMessage,
                    DATE_FORMAT(n.created_at, '%b %d, %Y %h:%i %p') AS date,
                    n.notification_id AS originalAnnouncementId,
                    n.is_read AS isRead,
                    COALESCE(
                        n.attachment_url,
                        (SELECT nr.attachment_url FROM notification_replies nr
                          WHERE nr.notification_id = n.notification_id
                            AND nr.attachment_url IS NOT NULL
                          ORDER BY nr.reply_id DESC LIMIT 1)
                    ) AS attachmentUrl,
                    n.notification_type AS type
                FROM notifications n
                LEFT JOIN users u ON n.sender_id = u.user_id
                WHERE n.notification_type IN ('Response', 'Reply', 'Submission')
                  AND n.sender_role IN ('Coordinator', 'Teacher', 'Student')
                  AND (n.receiver_id = ? OR n.receiver_role = 'Admin')
                ORDER BY n.created_at DESC
                LIMIT 200
            `;
            const results = await db.query(query, [adminId]);
            const responses = results.map(r => ({
                ...r,
                id: r.id?.toString(),
                read: r.isRead === 1 || r.isRead === true,
                attachmentUrl: r.attachmentUrl || null,
                hasAttachment: !!r.attachmentUrl
            }));
            console.log(`✅ getResponses: ${responses.length} responses, ${responses.filter(x => x.hasAttachment).length} with attachment`);
            res.json({ success: true, responses, count: responses.length });
        } catch (error) {
            console.error('Get responses error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //  DELETE RESPONSE
async deleteResponse(req, res) {
  try {
    const { id } = req.params;
    
    // 1. Response ko notifications table se delete karein
    await db.query('DELETE FROM notifications WHERE notification_id = ?', [id]);
    
    // 2. Agar is response par koi replies hain toh unhein bhi delete karein (Optional but safe)
    try {
      await db.query('DELETE FROM notification_replies WHERE notification_id = ?', [id]);
    } catch (e) {
      // Table might not exist, ignore
    }

    res.json({ 
      success: true, 
      message: 'Response deleted successfully' 
    });
  } catch (error) {
    console.error('Delete response error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error: ' + error.message 
    });
  }
}
    async getDepartmentReports(req, res) {
        try {
            const { department_name } = req.query;
            if (!department_name) {
                return res.status(400).json({ success: false, error: 'Department name is required' });
            }

            const classes = await db.query(`
                SELECT classroom_id, class_name, semester, section, subject_name,
                (SELECT COUNT(*) FROM enrollments WHERE classroom_id = c.classroom_id AND status = 'Active') AS total_students
                FROM classrooms c WHERE department_name LIKE ? ORDER BY semester DESC, class_name ASC
            `, [`%${department_name}%`]);

            const stats = await db.query(`
                SELECT COUNT(DISTINCT s.student_id) AS total_students,
                COUNT(DISTINCT t.teacher_id) AS total_teachers,
                COUNT(DISTINCT c.classroom_id) AS total_classes
                FROM departments d
                LEFT JOIN students s ON s.department_name = d.department_name
                LEFT JOIN teachers t ON t.institute_name = d.department_name
                LEFT JOIN classrooms c ON c.department_name = d.department_name
                WHERE d.department_name LIKE ?
            `, [`%${department_name}%`]);

            res.json({
                success: true,
                department: department_name,
                stats: stats[0] || { total_students: 0, total_teachers: 0, total_classes: 0 },
                classes: classes || []
            });
        } catch (error) {
            console.error('Department reports error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

        async monitorUsers(req, res) {
        try {
            const { limit = 20, offset = 0, search = '', role = 'all' } = req.query;
            
           //      MULTI-TENANCY: Institute filter apply karein
            const { clause: instClause, params: instParams } = this.getInstituteCondition(req);
            
            let whereClause = `WHERE u.user_role IN ('Teacher', 'Student', 'Coordinator') AND u.status = 'Active' ${instClause}`;
            const params = [...instParams];//      Institute params ko pehle add karein
            
            if (role !== 'all') {
                const roleMap = { 'teacher': 'Teacher', 'student': 'Student', 'coordinator': 'Coordinator' };
                const dbRole = roleMap[role];
                if (dbRole) {
                    whereClause += ` AND u.user_role = ?`;
                    params.push(dbRole);
                }
            }
            
            if (search) {
                whereClause += ` AND (u.full_name LIKE ? OR u.email LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`);
            }
            
            const countQuery = `SELECT COUNT(*) AS total FROM users u ${whereClause}`;
            const countResult = await db.query(countQuery, params);
            const total = countResult[0]?.total || 0;
            
            const query = `
                SELECT 
                    u.user_id AS id,
                    u.full_name AS name,
                    u.email,
                    u.user_role AS role,
                    u.institute_name AS institute,
                    u.status,
                    u.last_login,
                    u.created_at,
                    u.is_restricted,
                    (SELECT COUNT(*) FROM audit_log WHERE user_id = u.user_id) AS activity_count,
                    (SELECT COUNT(*) FROM notifications WHERE receiver_id = u.user_id) AS notifications_count,
                    (SELECT COUNT(*) FROM report_requests WHERE coordinator_id = u.user_id) AS reports_submitted,
                    (SELECT action_type FROM audit_log WHERE user_id = u.user_id ORDER BY created_at DESC LIMIT 1) AS recent_action,
                    (SELECT created_at FROM audit_log WHERE user_id = u.user_id ORDER BY created_at DESC LIMIT 1) AS recent_action_time
                FROM users u
                ${whereClause}
                ORDER BY u.last_login DESC, u.created_at DESC
                LIMIT ? OFFSET ?
            `;
            
           //      Params order sahi rakhein: [institute_id, role?, search?, limit, offset]
            const queryParams = [...params, parseInt(limit), parseInt(offset)];
            const results = await db.query(query, queryParams);
            
            const formattedUsers = results.map(user => {
                let status = 'offline';
                if (user.status === 'Active') {
                    if (user.last_login) {
                        const diff = Date.now() - new Date(user.last_login).getTime();
                        status = diff < 300000 ? 'online' : 'offline';
                    }
                }
                
                let lastActive = 'Never';
                if (user.last_login) {
                    const diff = Date.now() - new Date(user.last_login).getTime();
                    if (diff < 60000) lastActive = 'Just now';
                    else if (diff < 3600000) lastActive = `${Math.floor(diff / 60000)} mins ago`;
                    else if (diff < 86400000) lastActive = `${Math.floor(diff / 3600000)} hours ago`;
                    else if (diff < 604800000) lastActive = `${Math.floor(diff / 86400000)} days ago`;
                    else lastActive = new Date(user.last_login).toLocaleDateString();
                }
                
                return {
                    id: user.id?.toString(),
                    name: user.name || 'Unknown',
                    email: user.email || 'N/A',
                    role: user.role?.toLowerCase() || 'student',
                    institute: user.institute || 'N/A',
                    status: status,
                    lastActive: lastActive,
                    recentAction: user.recent_action || 'No recent activity',
                    loginCount: user.activity_count || 0,
                    reportsSubmitted: user.reports_submitted || 0,
                    isRestricted: user.is_restricted === 1 || user.is_restricted === true
                };
            });
            
            res.json({
                success: true,
                users: formattedUsers,
                total: total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        } catch (error) {
            console.error('Monitor users error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }
    async getUserActivity(req, res) {
        try {
            const { user_id } = req.params;
            
            if (!user_id) {
                return res.status(400).json({ success: false, error: 'User ID is required' });
            }
            
            const userCheck = await db.query('SELECT * FROM users WHERE user_id = ?', [user_id]);
            if (userCheck.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            
            const query = `
                SELECT 
                    log_id AS id,
                    action_type AS action,
                    action_category,
                    description,
                    ip_address AS ip,
                    user_agent,
                    status,
                    DATE_FORMAT(created_at, '%h:%i %p') AS time,
                    DATE_FORMAT(created_at, '%b %d, %Y') AS date,
                    created_at AS timestamp
                FROM audit_log 
                WHERE user_id = ?
                ORDER BY created_at DESC 
                LIMIT 50
            `;
            
            const logs = await db.query(query, [user_id]);
            
            const formattedLogs = logs.map(log => {
                let actionWithEmoji = log.action || 'Unknown action';
                const actionEmojis = {
                    'LOGIN': '🔑', 'LOGOUT': '🚪', 'UPLOAD': '📤', 'DOWNLOAD': '📥',
                    'CREATE': '✨', 'UPDATE': '✏️', 'DELETE': '🗑️', 'VIEW': '👁️',
                    'APPROVE': '✅', 'REJECT': '❌', 'SUBMIT': '📝', 'ASSIGN': '📋',
                    'RESTRICT': '🔒', 'UNRESTRICT': '🔓', 'REVOKE': '⛔', 'RESTORE': '🔄'
                };
                
                for (const [key, emoji] of Object.entries(actionEmojis)) {
                    if (log.action?.toUpperCase().includes(key)) {
                        actionWithEmoji = `${emoji} ${log.action}`;
                        break;
                    }
                }
                
                return {
                    id: log.id?.toString(),
                    action: actionWithEmoji,
                    timestamp: log.date ? `${log.date} at ${log.time}` : log.time || 'Unknown',
                    ip: log.ip || 'N/A'
                };
            });
            
            res.json({ success: true, user_id, logs: formattedLogs, count: formattedLogs.length });
        } catch (error) {
            console.error('Get user activity error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    async restrictUser(req, res) {
        try {
            const { user_id } = req.params;
            const { restrict } = req.body;
            const adminId = req.user?.user_id;
            
            if (!user_id) {
                return res.status(400).json({ success: false, error: 'User ID is required' });
            }
            
            const userCheck = await db.query('SELECT * FROM users WHERE user_id = ?', [user_id]);
            if (userCheck.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            
            const user = userCheck[0];
            const isRestricting = restrict === true || restrict === 'true';
            
            await db.query('UPDATE users SET is_restricted = ? WHERE user_id = ?', [isRestricting ? 1 : 0, user_id]);
            
            const actionType = isRestricting ? 'USER_RESTRICTED' : 'USER_UNRESTRICTED';
            const description = `${isRestricting ? 'Restricted' : 'Unrestricted'} user: ${user.email} (${user.full_name})`;
            
            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, ?, ?, 'Success', ?)
            `, [adminId, actionType, description, req.ip || req.connection.remoteAddress]);
            
            const notificationTitle = isRestricting ? 'Account Restricted' : 'Account Unrestricted';
            const notificationMessage = isRestricting 
                ? 'Your account has been restricted. Please contact admin for details.'
                : 'Your account has been unrestricted. You now have full access.';
            
            await db.query(`
                INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role,
                notification_type, title, message, is_pushed)
                VALUES (?, 'Admin', ?, ?, 'System', ?, ?, FALSE)
            `, [adminId, user_id, user.user_role, notificationTitle, notificationMessage]);
            
            res.json({
                success: true,
                message: `User ${isRestricting ? 'restricted' : 'unrestricted'} successfully`,
                user: { id: user_id, name: user.full_name, email: user.email, isRestricted: isRestricting }
            });
        } catch (error) {
            console.error('Restrict user error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    async getUserStats(req, res) {
        try {
            const totalUsers = await db.query('SELECT COUNT(*) AS count FROM users WHERE user_role IN ("Teacher", "Student", "Coordinator")');
            const activeUsers = await db.query(`SELECT COUNT(*) AS count FROM users WHERE last_login > DATE_SUB(NOW(), INTERVAL 24 HOUR) AND user_role IN ("Teacher", "Student", "Coordinator")`);
            const restrictedUsers = await db.query(`SELECT COUNT(*) AS count FROM users WHERE is_restricted = 1`);
            const usersByRole = await db.query(`SELECT user_role AS role, COUNT(*) AS count FROM users WHERE user_role IN ('Teacher', 'Student', 'Coordinator') GROUP BY user_role`);
            const recentSignups = await db.query(`SELECT COUNT(*) AS count FROM users WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) AND user_role IN ("Teacher", "Student", "Coordinator")`);
            const pendingApprovals = await db.query(`SELECT COUNT(*) AS count FROM users WHERE status = 'Pending'`);
            
            const roleStats = {};
            usersByRole.forEach(item => { roleStats[item.role?.toLowerCase() || 'unknown'] = item.count; });
            
            res.json({
                success: true,
                stats: {
                    totalUsers: totalUsers[0]?.count || 0,
                    activeUsers: activeUsers[0]?.count || 0,
                    restrictedUsers: restrictedUsers[0]?.count || 0,
                    recentSignups: recentSignups[0]?.count || 0,
                    pendingApprovals: pendingApprovals[0]?.count || 0,
                    usersByRole: roleStats
                }
            });
        } catch (error) {
            console.error('Get user stats error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    async bulkRestrictUsers(req, res) {
        try {
            const { user_ids } = req.body;
            const adminId = req.user?.user_id;

            if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
                return res.status(400).json({ success: false, error: 'Please provide an array of user IDs' });
            }

            const placeholders = user_ids.map(() => '?').join(',');
            const users = await db.query(`SELECT * FROM users WHERE user_id IN (${placeholders}) AND user_role IN ('Teacher', 'Student', 'Coordinator')`, user_ids);

            if (users.length === 0) {
                return res.status(404).json({ success: false, error: 'No valid users found' });
            }

            await db.query(`UPDATE users SET is_restricted = 1 WHERE user_id IN (${placeholders})`, user_ids);

            const userNames = users.map(u => `${u.email} (${u.full_name})`).join(', ');
            await db.query(`INSERT INTO audit_log (user_id, action_type, description, status, ip_address) VALUES (?, 'USERS_BULK_RESTRICTED', ?, 'Success', ?)`, [adminId, `Bulk restricted ${users.length} users: ${userNames}`, req.ip || req.connection.remoteAddress]);

            for (const user of users) {
                await db.query(`INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role, notification_type, title, message, is_pushed) VALUES (?, 'Admin', ?, ?, 'System', 'Account Restricted', 'Your account has been restricted as part of a bulk action. Please contact admin for details.', FALSE)`, [adminId, user.user_id, user.user_role]);
            }

            res.json({ success: true, message: `${users.length} users restricted successfully`, restrictedCount: users.length });
        } catch (error) {
            console.error('Bulk restrict users error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    async bulkUnrestrictUsers(req, res) {
        try {
            const { user_ids } = req.body;
            const adminId = req.user?.user_id;

            if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
                return res.status(400).json({ success: false, error: 'Please provide an array of user IDs' });
            }

            const placeholders = user_ids.map(() => '?').join(',');
            const users = await db.query(`SELECT * FROM users WHERE user_id IN (${placeholders}) AND is_restricted = 1`, user_ids);

            if (users.length === 0) {
                return res.status(404).json({ success: false, error: 'No restricted users found' });
            }

            await db.query(`UPDATE users SET is_restricted = 0 WHERE user_id IN (${placeholders})`, user_ids);

            const userNames = users.map(u => `${u.email} (${u.full_name})`).join(', ');
            await db.query(`INSERT INTO audit_log (user_id, action_type, description, status, ip_address) VALUES (?, 'USERS_BULK_UNRESTRICTED', ?, 'Success', ?)`, [adminId, `Bulk unrestricted ${users.length} users: ${userNames}`, req.ip || req.connection.remoteAddress]);

            for (const user of users) {
                await db.query(`INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role, notification_type, title, message, is_pushed) VALUES (?, 'Admin', ?, ?, 'System', 'Account Unrestricted', 'Your account has been unrestricted as part of a bulk action. You now have full access.', FALSE)`, [adminId, user.user_id, user.user_role]);
            }

            res.json({ success: true, message: `${users.length} users unrestricted successfully`, unrestrictedCount: users.length });
        } catch (error) {
            console.error('Bulk unrestrict users error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    async getDepartments(req, res) {
        try {
            const results = await db.query(`SELECT DISTINCT department_name FROM classrooms WHERE department_name IS NOT NULL ORDER BY department_name ASC`);
            res.json({ success: true, departments: results.map(r => r.department_name) });
        } catch (error) {
            console.error('Departments error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //  FIXED: N/A ki jagah meaningful value dikhao (department → institute → designation)
        async getCoordinators(req, res) {
        try {
           //      MULTI-TENANCY: Institute filter
            const { clause, params } = this.getInstituteCondition(req);
            
            const query = `
                SELECT 
                    u.user_id AS id, 
                    u.full_name AS name, 
                    u.email, 
                    COALESCE(u.department_name, u.institute_name, c.designation, 'Head Office') AS department,
                    u.status, 
                    c.designation, 
                    c.joining_date
                FROM users u
                JOIN coordinators c ON u.user_id = c.user_id
                WHERE u.user_role = 'Coordinator' AND u.status = 'Active' ${clause}
                ORDER BY u.full_name ASC
            `;
            const results = await db.query(query, params);
            res.json({ success: true, coordinators: results, count: results.length });
        } catch (error) {
            console.error('Get coordinators error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    //  
// REQUEST REPORT FROM COORDINATOR
//  FIXED: Gmail + Coordinator Notification + Pending Request
//  
async requestReport(req, res) {
    try {
        const adminId = req.user?.user_id;
        const adminName = req.user?.full_name || 'Admin';

        const {
            coordinator_id,
            coordinatorId,
            report_type,
            reportType,
            specific_target,
            specificTarget,
            target,
            deadline,
            note,
            adminNote
        } = req.body;

        const selectedCoordinator = coordinator_id || coordinatorId;
        const finalReportType = report_type || reportType;
        const finalTarget = specific_target || specificTarget || target || 'All';
        const finalNote = note || adminNote || '';

        if (!selectedCoordinator || !finalReportType) {
            return res.status(400).json({
                success: false,
                error: 'Coordinator and report type are required'
            });
        }

        //  Coordinator ko dono tareeqon se find karo:
        // 1) agar frontend user_id bheje
        // 2) agar frontend coordinator_id bheje
        const coordRows = await db.query(`
            SELECT 
                c.coordinator_id,
                c.user_id,
                u.full_name,
                u.email
            FROM coordinators c
            JOIN users u ON c.user_id = u.user_id
            WHERE c.user_id = ? OR c.coordinator_id = ?
            LIMIT 1
        `, [selectedCoordinator, selectedCoordinator]);

        if (coordRows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Coordinator not found'
            });
        }

        const coordinator = coordRows[0];

        //  Important:
        // report_requests table mein internal coordinator_id save hoga
        const internalCoordinatorId = coordinator.coordinator_id;

        // notifications table mein receiver_id user_id hoga
        const coordinatorUserId = coordinator.user_id;

        const coordinatorName = coordinator.full_name || 'Coordinator';
        const coordinatorEmail = coordinator.email || '';

        //  1) Pending Request save karo
        const requestResult = await db.query(`
            INSERT INTO report_requests 
            (coordinator_id, report_type, specific_target, deadline, note, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', NOW())
        `, [
            internalCoordinatorId,
            finalReportType,
            finalTarget,
            deadline || null,
            finalNote
        ]);

        const requestId = requestResult.insertId;

        //  2) Coordinator portal notification save karo
        const title = '📊 New Report Request from Admin';
        const message = 
`Dear ${coordinatorName},

Admin ${adminName} has requested a report.

Report Type: ${finalReportType}
Target: ${finalTarget}
Deadline: ${deadline || 'N/A'}

Note:
${finalNote || 'No additional note.'}

Please open Department Reports / Pending Requests to generate and submit this report.`;

        //  NEW: Coordinator portal notification (Admin tab mein dikhegi)
        let notificationId = null;
        try {
            const insertedCoordId = coordinator_id || coordinatorId;
            const coordRow = await db.query(
                `SELECT user_id FROM coordinators WHERE coordinator_id = ? OR user_id = ? LIMIT 1`,
                [insertedCoordId, insertedCoordId]
            );
            const receiverUserId = coordRow[0]?.user_id || insertedCoordId;

            const notifResult = await db.query(
                `INSERT INTO notifications
                 (sender_id, sender_role, receiver_id, receiver_role,
                  notification_type, title, message, is_pushed, is_read, created_at)
                 VALUES (?, 'Admin', ?, 'Coordinator', 'Alert', ?, ?, FALSE, FALSE, NOW())`,
                [
                    req.user?.user_id,
                    receiverUserId,
                    '📊 New Report Request from Admin',
                    `Dear Coordinator,\n\nAdmin has requested a report.\nType: ${report_type}\nTarget: ${specific_target || 'All'}\nDeadline: ${deadline || 'N/A'}\nNote: ${note || ''}`
                ]
            );
            notificationId = notifResult.insertId;
        } catch (notifErr) {
            console.error('⚠️ Report request notification error:', notifErr.message);
        }

        // ✅ PUSH NOTIFICATION TO COORDINATOR
        try {
            const coordToken = await db.query('SELECT push_token, full_name FROM users WHERE user_id = ?', [coordinatorUserId]);
            if (coordToken.length > 0 && coordToken[0].push_token) {
                const pushResult = await pushService.sendAnnouncementPush({
                    pushToken: coordToken[0].push_token,
                    title: '📊 New Report Request from Admin',
                    message: `Admin ${adminName} has requested a ${finalReportType} report. Deadline: ${deadline || 'N/A'}`,
                    announcementId: notificationId
                });
                if (pushResult && pushResult.success) {
                    await db.query('UPDATE notifications SET is_pushed = TRUE WHERE notification_id = ?', [notificationId]);
                    console.log(`📱✅ Report request push sent to ${coordToken[0].full_name}`);
                } else {
                    console.log(`📱❌ Push failed for coordinator ${coordinatorUserId}`);
                }
            } else {
                console.log(`📱⚠️ No push token for coordinator ${coordinatorUserId}`);
            }
        } catch (pushErr) {
            console.error('⚠️ Report request push error:', pushErr.message);
        }

        //  3) Gmail bhi bhejo
        // Aapka Gmail already working hai, yeh usay continue rakhega
        try {
            if (coordinatorEmail && emailService && typeof emailService.sendEmail === 'function') {
                await emailService.sendEmail({
                    to: coordinatorEmail,
                    subject: title,
                    message: message,
                    text: message,
                    html: message.replace(/\n/g, '<br/>'),
                    senderName: adminName
                });

                // Email sent status update
                await db.query(`
                    UPDATE notifications 
                    SET is_email_sent = TRUE 
                    WHERE receiver_id = ? 
                    AND sender_role = 'Admin' 
                    ORDER BY created_at DESC 
                    LIMIT 1
                `, [coordinatorUserId]);
            }
        } catch (emailError) {
            console.error('⚠️ Report request email error:', emailError.message);
            // Email fail ho to bhi request portal mein show hogi
        }

        return res.json({
            success: true,
            message: 'Report request sent successfully!',
            requestId: requestId
        });

    } catch (error) {
        console.error('❌ Request report error:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error: ' + error.message
        });
    }
}

    async getReceivedReports(req, res) {
        try {
            const adminId = req.user?.user_id;
            const query = `
                SELECT 
                    rr.request_id AS id, u.full_name AS coordinatorName, u.email AS coordinatorEmail,
                    CONCAT(rr.report_type, ' Report - ', rr.specific_target) AS title,
                    rr.report_type AS type, DATE_FORMAT(rr.submitted_at, '%b %d, %Y') AS date,
                    rr.status, rr.notes AS contentSummary, rr.file_path
                FROM report_requests rr
                JOIN users u ON rr.coordinator_id = u.user_id
                WHERE rr.admin_id = ?
                ORDER BY rr.created_at DESC
            `;
            const results = await db.query(query, [adminId]);
            res.json({ success: true, reports: results, count: results.length });
        } catch (error) {
            console.error('Get received reports error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    async getReportDetails(req, res) {
        try {
            const { report_id } = req.params;
            const adminId = req.user?.user_id;
            const query = `
                SELECT 
                    rr.request_id AS id, u.full_name AS coordinatorName, u.email AS coordinatorEmail,
                    CONCAT(rr.report_type, ' Report - ', rr.specific_target) AS title,
                    rr.report_type AS type, rr.specific_target AS target,
                    DATE_FORMAT(rr.submitted_at, '%b %d, %Y') AS date, rr.status,
                    rr.notes AS contentSummary, rr.file_path, 
                    DATE_FORMAT(rr.deadline, '%b %d, %Y') AS deadline,                    
                    DATE_FORMAT(rr.created_at, '%b %d, %Y') AS requested_date
                    FROM report_requests rr
                    JOIN users u ON rr.coordinator_id = u.user_id
                    WHERE rr.request_id = ? AND rr.admin_id = ?
            `;
            const results = await db.query(query, [report_id, adminId]);
            if (results.length === 0) {
                return res.status(404).json({ success: false, error: 'Report not found' });
            }
            res.json({ success: true, report: results[0] });
        } catch (error) {
            console.error('Get report details error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }

    async downloadReport(req, res) {
        try {
            const { report_id } = req.params;
            const { format } = req.query;
            const adminId = req.user?.user_id;

            const query = `
                SELECT 
                    rr.request_id AS id, u.full_name AS coordinatorName, u.email AS coordinatorEmail,
                    CONCAT(rr.report_type, ' Report - ', rr.specific_target) AS title,
                    rr.report_type AS type, rr.specific_target AS target,
                    DATE_FORMAT(rr.submitted_at, '%b %d, %Y') AS date, rr.notes AS contentSummary,
                    rr.file_path, DATE_FORMAT(rr.deadline, '%b %d, %Y') AS deadline, DATE_FORMAT(rr.created_at, '%b %d, %Y') AS requested_date
                FROM report_requests rr
                JOIN users u ON rr.coordinator_id = u.user_id
                WHERE rr.request_id = ? AND rr.admin_id = ?
            `;
            const results = await db.query(query, [report_id, adminId]);
            if (results.length === 0) {
                return res.status(404).json({ success: false, error: 'Report not found' });
            }
            const report = results[0];
            const reportData = {
                title: report.title || 'Department Report',
                coordinatorName: report.coordinatorName || 'N/A',
                coordinatorEmail: report.coordinatorEmail || 'N/A',
                target: report.target || 'N/A',
                date: report.date || new Date().toISOString(),
                contentSummary: report.contentSummary || 'No content available',
                deadline: report.deadline || 'Not specified',
                requestedDate: report.requested_date || 'N/A',
                type: report.type || 'General'
            };

            if (format === 'pdf') {
                return new Promise((resolve, reject) => {
                    const doc = new PDFDocument({ margin: 50 });
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `attachment; filename="Report_${report_id}_${Date.now()}.pdf"`);
                    doc.pipe(res);
                    doc.fontSize(24).fillColor('#4C1D95').text('Smart Desk Report', { align: 'center' }).moveDown(0.5);
                    doc.fontSize(14).fillColor('#1F2937').text(`Title: ${reportData.title}`, { align: 'center' }).moveDown(1);
                    doc.fontSize(14).fillColor('#1F2937').text('Report Details', { underline: true }).moveDown(0.5);
                    doc.fontSize(12).fillColor('#374151');
                    [['Coordinator', reportData.coordinatorName], ['Email', reportData.coordinatorEmail], ['Target', reportData.target], ['Type', reportData.type], ['Submitted', reportData.date], ['Deadline', reportData.deadline]].forEach(([label, value]) => {
                        doc.text(`${label}:`, { continued: true }).font('Helvetica-Bold').text(` ${value}`, { continued: false }).font('Helvetica').moveDown(0.3);
                    });
                    doc.moveDown(0.5);
                    doc.fontSize(14).fillColor('#1F2937').text('Content Summary', { underline: true }).moveDown(0.5);
                    doc.fontSize(12).fillColor('#374151').text(reportData.contentSummary, { width: 500, align: 'left', lineGap: 5 }).moveDown(1);
                    doc.fontSize(10).fillColor('#94A3B8').text('Generated by Smart Desk', { align: 'center' });
                    doc.end();
                });
            } else if (format === 'excel') {
                const wb = XLSX.utils.book_new();
                const summaryData = [{ 'Report Title': reportData.title, 'Coordinator': reportData.coordinatorName, 'Email': reportData.coordinatorEmail, 'Target': reportData.target, 'Type': reportData.type, 'Submitted': reportData.date, 'Deadline': reportData.deadline }];
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary');
                const contentData = [['Content Summary'], [reportData.contentSummary]];
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(contentData), 'Content');
                const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="Report_${report_id}_${Date.now()}.xlsx"`);
                return res.send(buffer);
            } else {
                return res.status(400).json({ success: false, error: 'Invalid format. Use "pdf" or "excel"' });
            }
        } catch (error) {
            console.error('Download report error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }
    //  
    // SEND DIRECT MESSAGE TO SPECIFIC USER - ✅ NEW: Targeted Delivery
    //  
    async sendDirectMessage(req, res) {
        try {
            const adminId = req.user?.user_id;
            const { recipientId, recipientType, subject, message, sendEmail = 'false' } = req.body;

            if (!recipientId || !recipientType || !subject || !message) {
                return res.status(400).json({ success: false, error: 'recipientId, recipientType, subject, and message are required' });
            }

            // Role mapping
            const roleMap = { 'teacher': 'Teacher', 'student': 'Student', 'coordinator': 'Coordinator', 'admin': 'Admin' };
            const recipientRole = roleMap[recipientType.toLowerCase()];

            if (!recipientRole) {
                return res.status(400).json({ success: false, error: 'Invalid recipient type' });
            }

            // Verify recipient exists
            const recipientCheck = await db.query('SELECT user_id, full_name, email, user_role FROM users WHERE user_id = ? AND status = "Active"', [recipientId]);
            if (recipientCheck.length === 0) {
                return res.status(404).json({ success: false, error: 'Recipient not found or inactive' });
            }

            const recipient = recipientCheck[0];

            //  TARGETED: receiver_id = specific user ka ID (NULL nahi!)
            await db.query(`
                INSERT INTO notifications (sender_id, sender_role, receiver_id, receiver_role,
                notification_type, title, message, is_pushed, is_email_sent, created_at)
                VALUES (?, 'Admin', ?, ?, 'Direct', ?, ?, FALSE, FALSE, NOW())
            `, [adminId, recipientId, recipientRole, subject, message]);

            // Email bhi bhejo agar requested hai
            const shouldSendEmail = sendEmail === 'true' || sendEmail === true || sendEmail === '1';
            if (shouldSendEmail) {
                try {
                    const emailService = require('../services/emailService');
                    await emailService.sendEmail({
                        to: recipient.email,
                        subject: `📩 Direct Message: ${subject}`,
                        html: `<h2>📩 Direct Message from Admin</h2><p>Dear <b>${recipient.full_name}</b>,</p><p>${message.replace(/\n/g, '<br/>')}</p><p>Best regards,<br><b>Admin - Smart Desk</b></p>`,
                        text: `Direct Message from Admin\n\nDear ${recipient.full_name},\n\n${message}\n\nBest regards,\nAdmin - Smart Desk`
                    });
                } catch (emailError) {
                    console.error('⚠️ Direct message email error:', emailError.message);
                }
            }

            // Audit log
            await db.query(`
                INSERT INTO audit_log (user_id, action_type, description, status, ip_address)
                VALUES (?, 'DIRECT_MESSAGE_SENT', ?, 'Success', ?)
            `, [adminId, `Sent direct message to ${recipient.email} (${recipient.full_name})`, req.ip || req.connection.remoteAddress]);

            res.json({
                success: true,
                message: `Message sent to ${recipient.full_name}`,
                recipient: { id: recipient.user_id, name: recipient.full_name, email: recipient.email, role: recipientRole }
            });
        } catch (error) {
            console.error('Send direct message error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }
    async deleteReport(req, res) {
        try {
            const { report_id } = req.params;
            const adminId = req.user?.user_id;

            if (!report_id) {
                return res.status(400).json({ success: false, error: 'Report ID is required' });
            }

            const reportCheck = await db.query('SELECT * FROM report_requests WHERE request_id = ?', [report_id]);
            if (reportCheck.length === 0) {
                return res.status(404).json({ success: false, error: 'Report request not found' });
            }

            const report = reportCheck[0];
            await db.query('DELETE FROM report_requests WHERE request_id = ?', [report_id]);

            await db.query(`INSERT INTO audit_log (user_id, action_type, description, status, ip_address) VALUES (?, 'REPORT_REQUEST_DELETED', ?, 'Success', ?)`, [adminId, `Deleted report request ID: ${report_id} (${report.report_type} - ${report.specific_target})`, req.ip || req.connection.remoteAddress]);

            res.json({ success: true, message: 'Report request deleted successfully' });
        } catch (error) {
            console.error('Delete report error:', error);
            res.status(500).json({ success: false, error: 'Server error: ' + error.message });
        }
    }
}

module.exports = new AdminController();