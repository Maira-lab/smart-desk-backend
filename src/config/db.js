// src/config/db.js
//  OOP APPROACH - Using Classes with Retry Limit

const mysql = require('mysql2');
require('dotenv').config();

//  
// DATABASE CONNECTION CLASS
//  
class Database {
    constructor() {
        // Database connection settings (host, user, password, database)
        this.config = {
            // .env se host ly gy, nahi toh localhost use kry gy 
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'myra-lab2026',
            database: process.env.DB_NAME || 'smart_desk',
            port: process.env.DB_PORT || 3306,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
            connectionLimit: 10,
            queueLimit: 0,
            waitForConnections: true
        };
        
        this.connection = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this._loggedError = false;
        this._reconnecting = false;
        
        // Initialize connection
        this.connect();
    }

    //  
    // 1. CREATE CONNECTION (With Retry Limit)
    //  
    connect() {
        //  Prevent multiple simultaneous reconnection attempts
        if (this._reconnecting) {
            return;
        }
        this._reconnecting = true;

        try {
            this.connection = mysql.createConnection(this.config);
            
            this.connection.connect((err) => {
                this._reconnecting = false;
                
                if (err) {
                    //  Only log error once
                    if (!this._loggedError) {
                        console.error('❌ MySQL Connection Failed:', err.message);
                        this._loggedError = true;
                    }
                    this.isConnected = false;
                    
                    //  Retry with limit
                    if (this.retryCount < this.maxRetries) {
                        this.retryCount++;
                        console.log(`🔄 Retry ${this.retryCount}/${this.maxRetries} in 5 seconds...`);
                        setTimeout(() => this.connect(), 5000);
                    } else {
                        console.error('❌ Max retries reached. Please check MySQL server.');
                    }
                    return;
                }
                
                console.log('✅ MySQL Connected Successfully!');
                this.isConnected = true;
                this.retryCount = 0;
                this._loggedError = false;
            });

            // Handle connection errors
            this.connection.on('error', (err) => {
                console.error('❌ MySQL Connection Error:', err.message);
                this.isConnected = false;
                this._loggedError = false;
                
                // Auto-reconnect with limit
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    setTimeout(() => this.connect(), 5000);
                }
            });

        } catch (error) {
            this._reconnecting = false;
            
            //  Only log error once
            if (!this._loggedError) {
                console.error('❌ MySQL Connection Error:', error.message);
                this._loggedError = true;
            }
            this.isConnected = false;
            
            //  Retry with limit
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`🔄 Retry ${this.retryCount}/${this.maxRetries} in 5 seconds...`);
                setTimeout(() => this.connect(), 5000);
            } else {
                console.error('❌ Max retries reached. Please check MySQL server.');
            }
        }
    }

    //  
    // 2. GET CONNECTION (Silent Warning)
    //  
    getConnection() {
        if (!this.isConnected) {
            //  Silent warning - only show once
            if (!this._loggedWarning) {
                console.warn('⚠️ Database not connected. Attempting to reconnect...');
                this._loggedWarning = true;
            }
            this.connect();
        } else {
            this._loggedWarning = false;
        }
        return this.connection;
    }

    //  
    // 3. EXECUTE QUERY (Promise-based)
    //  
    query(sql, params = []) {
        // 
        return new Promise((resolve, reject) => {
            //  Wait for connection if not connected
            if (!this.isConnected) {
                // Try to connect first
                this.getConnection();
                
                // Wait a bit and retry
                setTimeout(() => {
                    if (!this.isConnected) {
                        reject(new Error('Database not connected'));
                        return;
                    }
                    this.connection.query(sql, params, (err, results) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve(results);
                    });
                }, 1000);
                return;
            }
            
            this.connection.query(sql, params, (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(results);
            });
        });
    }

    //  
    // 4. EXECUTE QUERY WITH CALLBACK (Backward Compatible)
    //  
    queryCallback(sql, params, callback) {
        if (!this.isConnected) {
            callback(new Error('Database not connected'), null);
            return;
        }
        
        this.connection.query(sql, params, callback);
    }

    //  
    // 5. CHECK CONNECTION STATUS
    //  
    isConnectedStatus() {
        return this.isConnected;
    }

    //  
    // 6. GET CONNECTION STATUS
    //  
    getStatus() {
        return {
            connected: this.isConnected,
            host: this.config.host,
            database: this.config.database,
            user: this.config.user,
            retryCount: this.retryCount,
            maxRetries: this.maxRetries
        };
    }

    //  
    // 7. FORCE RECONNECT
    //  
    reconnect() {
        console.log('🔄 Forcing reconnection...');
        this.retryCount = 0;
        this._loggedError = false;
        this._loggedWarning = false;
        this.isConnected = false;
        this.connect();
    }

    //  
    // 8. CLOSE CONNECTION
    //  
    disconnect() {
        if (this.connection) {
            this.connection.end((err) => {
                if (err) {
                    console.error('❌ Error disconnecting:', err.message);
                    return;
                }
                console.log('✅ MySQL Disconnected Successfully!');
                this.isConnected = false;
            });
        }
    }

    //  
    // 9. TRANSACTION HELPERS
    //  
    beginTransaction() {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Database not connected'));
                return;
            }
            this.connection.beginTransaction((err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    commit() {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Database not connected'));
                return;
            }
            this.connection.commit((err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    rollback() {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Database not connected'));
                return;
            }
            this.connection.rollback((err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    //  
    // 10. TRANSACTION WRAPPER
    //  
    async transaction(callback) {
        try {
            await this.beginTransaction();
            const result = await callback(this);
            await this.commit();
            return result;
        } catch (error) {
            await this.rollback();
            throw error;
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