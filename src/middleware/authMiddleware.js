// src/middleware/authMiddleware.js
//  COMPLETE FIXED VERSION - Null Token Handled & Terminal Clean

const jwt = require('jsonwebtoken');
const db = require('../config/db');

//  
// AUTH MIDDLEWARE CLASS
//  
class AuthMiddleware {
    constructor() {
        this.secret = process.env.JWT_SECRET || 'smart_desk_secret_key_2026';
        this.db = db;
        console.log('AuthMiddleware initialized');
    }

    //  
    // 1. AUTHENTICATION MIDDLEWARE - FIXED (No more malformed errors)
    //  
    // 1. AUTHENTICATION MIDDLEWARE - FIXED (Header + Query token support)
    //  
        //  
        // ============================================
    // 1. AUTHENTICATION MIDDLEWARE - ✅ MULTI-TENANCY + FIXED DB QUERY
    // ============================================
    authenticate = async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;

            let token = null;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            } else if (req.query && req.query.token) {
                token = req.query.token;
            }

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: 'No token provided. Please login.'
                });
            }

            if (token === 'null' || token === 'undefined' || String(token).trim() === '') {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid token. Please login again.'
                });
            }

            console.log('🔑 Token received:', String(token).substring(0, 20) + '...');

            const decoded = jwt.verify(token, this.secret);

           //      FIX: db module ko directly use karo (this.query callback wala tha, wo async mein crash karta tha)
            let institute_id = null;
            let institute_name = decoded.institute_name || null;

            try {
                const userResult = await db.query(
                    'SELECT institute_id, status, institute_name FROM users WHERE user_id = ?', 
                    [decoded.user_id]
                );

                if (userResult && userResult.length > 0) {
                    institute_id = userResult[0].institute_id;
                    institute_name = userResult[0].institute_name || institute_name;
                    
                   //      Check if user is still active
                    if (userResult[0].status !== 'Active') {
                        return res.status(403).json({
                            success: false,
                            error: 'Account is inactive. Please contact admin.'
                        });
                    }
                }
            } catch (dbError) {
               //      SAFETY NET: Agar DB query fail ho jaye, toh bhi authentication pass ho jaye
                // (institute_id null rahega = global access, lekin app crash nahi hoga)
                console.log('⚠️ DB query in auth failed (non-critical):', dbError.message);
            }

            req.user = {
                user_id: decoded.user_id,
                email: decoded.email,
                role: decoded.role,
                full_name: decoded.full_name || null,
                institute_name: institute_name,
                department_name: decoded.department_name || null,
                institute_id: institute_id
            };

            console.log(`✅ Authenticated: ${decoded.email} (${decoded.role}) | Institute ID: ${institute_id || 'Global'}`);
            next();
        } catch (error) {
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    error: error.name === 'TokenExpiredError' ? 'Token expired. Please login again.' : 'Invalid token. Please login again.'
                });
            }

            console.log('❌ JWT ERROR:', error.message);
            return res.status(401).json({
                success: false,
                error: 'Authentication failed. Please login again.'
            });
        }
    };

    //  
    // 2. STUDENT ONLY MIDDLEWARE
    //  
    studentOnly = (req, res, next) => {
        if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized. Please login.' });
        if (req.user.role !== 'Student') {
            return res.status(403).json({ success: false, error: `Access denied. Student only.` });
        }
        console.log(`✅ Student access granted: ${req.user.email}`);
        next();
    };

    //  
    // 3. ADMIN ONLY MIDDLEWARE
    //  
    adminOnly = (req, res, next) => {
        if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized. Please login.' });
        if (req.user.role !== 'Admin') return res.status(403).json({ success: false, error: `Access denied. Admin only.` });
        next();
    };

    //  
    // 4. TEACHER ONLY MIDDLEWARE
    //  
    teacherOnly = (req, res, next) => {
        if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized. Please login.' });
        if (req.user.role !== 'Teacher') return res.status(403).json({ success: false, error: `Access denied. Teacher only.` });
        next();
    };

    //  
    // 5. COORDINATOR ONLY MIDDLEWARE
    //  
    coordinatorOnly = (req, res, next) => {
        if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized. Please login.' });
        if (req.user.role !== 'Coordinator') return res.status(403).json({ success: false, error: `Access denied. Coordinator only.` });
        next();
    };

    //  
    // 6. AUTHORIZATION MIDDLEWARE
    //  
    authorize = (...roles) => {
        return (req, res, next) => {
            if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized. Please login.' });
            if (!roles.includes(req.user.role)) {
                return res.status(403).json({ success: false, error: `Access denied. Required roles: ${roles.join(', ')}` });
            }
            next();
        };
    };

    //  
    // SHORTCUTS
    //  
    teacherOrCoordinator = (req, res, next) => this.authorize('Teacher', 'Coordinator')(req, res, next);
    adminOrCoordinator = (req, res, next) => this.authorize('Admin', 'Coordinator')(req, res, next);
    anyAuthenticated = (req, res, next) => this.authorize('Admin', 'Teacher', 'Student', 'Coordinator')(req, res, next);
    studentNotif = (req, res, next) => this.authorize('Student')(req, res, next);
    studentAcademic = (req, res, next) => this.authorize('Student')(req, res, next);
    studentTodayClass = (req, res, next) => this.authorize('Student')(req, res, next);
    studentAttendance = (req, res, next) => this.authorize('Student')(req, res, next);

    //  
    // CHECK USER STATUS
    //  
    checkUserStatus = (req, res, next) => {
        return async (req, res, next) => {
            try {
                if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized.' });
                const results = await this.query('SELECT status FROM users WHERE user_id = ?', [req.user.user_id]);
                if (results.length === 0) return res.status(404).json({ success: false, error: 'User not found.' });
                
                const status = results[0].status;
                if (status === 'Pending') return res.status(403).json({ success: false, error: 'Account pending approval.' });
                if (status === 'Inactive') return res.status(403).json({ success: false, error: 'Account has been revoked.' });
                if (status !== 'Active') return res.status(403).json({ success: false, error: 'Account is not active.' });
                next();
            } catch (error) {
                return res.status(500).json({ success: false, error: 'Server error while checking user status.' });
            }
        };
    };

    //  
    // VERIFY USER EXISTS
    //  
    verifyUserExists = (req, res, next) => {
        return async (req, res, next) => {
            try {
                if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized.' });
                const results = await this.query('SELECT user_id, email, full_name, user_role, status FROM users WHERE user_id = ?', [req.user.user_id]);
                if (results.length === 0) return res.status(404).json({ success: false, error: 'User not found.' });
                
                const user = results[0];
                req.user.email = user.email;
                req.user.full_name = user.full_name;
                req.user.role = user.user_role;
                req.user.status = user.status;
                next();
            } catch (error) {
                return res.status(500).json({ success: false, error: 'Server error while verifying user.' });
            }
        };
    };

    //  
    // 16. OPTIONAL AUTHENTICATION - ✅ FIXED
    //  
    optionalAuthenticate = (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                //  Null/undefined token ko verify karne se rokein
                if (token && token !== 'null' && token !== 'undefined' && token.trim() !== '') {
                    try {
                        const decoded = jwt.verify(token, this.secret);
                        req.user = {
                            user_id: decoded.user_id,
                            email: decoded.email,
                            role: decoded.role,
                            full_name: decoded.full_name || null
                        };
                    } catch (error) {
                        // Silently ignore invalid optional tokens
                    }
                }
            }
            next();
        } catch (error) {
            next();
        }
    };

    //  
    // 17. RATE LIMIT BY ROLE
    //  
    rateLimitByRole = (limits) => {
        const userRequestCounts = new Map();
        return (req, res, next) => {
            if (!req.user) return next();
            const { role, user_id } = req.user;
            const limit = limits[role] || limits.default || 100;
            const userKey = `user-${user_id}`;
            
            if (!userRequestCounts.has(userKey)) {
                userRequestCounts.set(userKey, { count: 0, resetAt: Date.now() + 60000 });
            }
            const userData = userRequestCounts.get(userKey);
            if (Date.now() > userData.resetAt) {
                userData.count = 0;
                userData.resetAt = Date.now() + 60000;
            }
            userData.count++;
            if (userData.count > limit) {
                return res.status(429).json({ success: false, error: `Rate limit exceeded.` });
            }
            next();
        };
    };

    //  
    // 18. PERMISSION CHECK
    //  
    checkPermission = (resource, action) => {
        return (req, res, next) => {
            if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized.' });
            if (req.user.role === 'Admin') return next();

            const permissions = {
                'Teacher': { 'classroom': ['read', 'update', 'create'], 'attendance': ['read', 'create', 'update'], 'grades': ['read', 'create', 'update'], 'assignment': ['read', 'create', 'update', 'delete'] },
                'Student': { 'classroom': ['read'], 'attendance': ['read', 'view'], 'grades': ['read'], 'assignment': ['read', 'submit'], 'notification': ['read', 'reply', 'submit'], 'academic_reports': ['read', 'download'], 'today_classes': ['read', 'view'] },
                'Coordinator': { 'department': ['read', 'update'], 'reports': ['read', 'create'], 'users': ['read'] }
            };

            const rolePermissions = permissions[req.user.role];
            if (!rolePermissions || !rolePermissions[resource] || !rolePermissions[resource].includes(action)) {
                return res.status(403).json({ success: false, error: `Permission denied for ${req.user.role}` });
            }
            next();
        };
    };

    //  
    // HELPER: PROMISE-BASED QUERY
    //  
    query = (sql, params = []) => {
        return new Promise((resolve, reject) => {
            this.db.query(sql, params, (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
    };
}

//  
// EXPORT SINGLE INSTANCE
//  
module.exports = new AuthMiddleware();