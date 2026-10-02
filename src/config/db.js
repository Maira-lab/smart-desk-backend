// src/config/db.js
//  OOP APPROACH - Using Classes with Retry Limit

const mysql = require('mysql2');
require('dotenv').config();

//  
// DATABASE CONNECTION CLASS
//  
class Database {
    constructor() {
        this.config = {
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'myra-lab2026',
            database: process.env.DB_NAME || 'smart_desk',
            port: process.env.DB_PORT || 3306,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
            waitForConnections: true,
            connectionLimit: 25,
            maxIdle: 15,
            idleTimeout: 60000,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
            timezone: '+05:00'
        };

        this.pool = mysql.createPool(this.config);
        this.isConnected = true;
        this._activeTxConn = null;

        // Pre-warm pool on startup
        this.pool.query('SELECT 1', (err) => {
            if (err) {
                console.error('❌ MySQL Pool initial check failed:', err.message);
                this.isConnected = false;
            } else {
                console.log('✅ MySQL High-Performance Connection Pool Ready & Pre-warmed!');
                this.isConnected = true;
            }
        });
    }

    getConnection() {
        return this.pool;
    }

    // Direct pool query supporting BOTH Promise and Callback patterns
    query(sql, params = [], callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        if (typeof callback === 'function') {
            return this.pool.query(sql, params, callback);
        }

        return new Promise((resolve, reject) => {
            this.pool.query(sql, params, (err, results) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }

    queryCallback(sql, params, callback) {
        this.pool.query(sql, params, callback);
    }

    isConnectedStatus() {
        return this.isConnected;
    }

    getStatus() {
        return {
            connected: this.isConnected,
            host: this.config.host,
            database: this.config.database,
            user: this.config.user,
            poolLimit: this.config.connectionLimit
        };
    }

    reconnect() {
        this.pool.query('SELECT 1', (err) => {
            this.isConnected = !err;
        });
    }

    disconnect() {
        if (this.pool) {
            this.pool.end((err) => {
                if (err) console.error('❌ Error closing pool:', err.message);
                else console.log('✅ MySQL Pool Closed Successfully!');
                this.isConnected = false;
            });
        }
    }

    beginTransaction() {
        return new Promise((resolve, reject) => {
            this.pool.getConnection((err, conn) => {
                if (err) return reject(err);
                conn.beginTransaction((txErr) => {
                    if (txErr) {
                        conn.release();
                        return reject(txErr);
                    }
                    this._activeTxConn = conn;
                    resolve(conn);
                });
            });
        });
    }

    commit() {
        return new Promise((resolve, reject) => {
            if (!this._activeTxConn) return resolve();
            this._activeTxConn.commit((err) => {
                this._activeTxConn.release();
                this._activeTxConn = null;
                if (err) return reject(err);
                resolve();
            });
        });
    }

    rollback() {
        return new Promise((resolve, reject) => {
            if (!this._activeTxConn) return resolve();
            this._activeTxConn.rollback((err) => {
                this._activeTxConn.release();
                this._activeTxConn = null;
                if (err) return reject(err);
                resolve();
            });
        });
    }

    async transaction(callback) {
        const conn = await new Promise((resolve, reject) => {
            this.pool.getConnection((err, c) => (err ? reject(err) : resolve(c)));
        });

        try {
            await new Promise((resolve, reject) => {
                conn.beginTransaction(err => (err ? reject(err) : resolve()));
            });

            const txWrapper = {
                query: (sql, params = []) => new Promise((resolve, reject) => {
                    conn.query(sql, params, (err, res) => (err ? reject(err) : resolve(res)));
                })
            };

            const result = await callback(txWrapper);
            await new Promise((resolve, reject) => {
                conn.commit(err => (err ? reject(err) : resolve()));
            });
            return result;
        } catch (error) {
            await new Promise(r => conn.rollback(() => r()));
            throw error;
        } finally {
            conn.release();
        }
    }
}

//  
// CREATE AND EXPORT SINGLE INSTANCE
//  
const db = new Database();

//  
// FOR BACKWARD COMPATIBILITY
//  
module.exports = db;
module.exports.connection = db.getConnection();