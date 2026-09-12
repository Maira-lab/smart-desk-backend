// src/services/pushService.js
// ONESIGNAL PUSH NOTIFICATION SERVICE

const fetch = require('node-fetch');
require('dotenv').config();

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

class PushService {
    constructor() {
        this.initialized = false;
        if (ONESIGNAL_APP_ID && ONESIGNAL_API_KEY) {
            this.initialized = true;
            console.log('✅ Push Service Initialized (OneSignal)');
        } else {
            console.warn('⚠️ Push Service not initialized - missing OneSignal credentials');
        }
    }

    //  
    // SEND PUSH NOTIFICATION VIA ONESIGNAL
    //  
    async sendPushNotification({ pushToken, title, message, data = {} }) {
        try {
            if (!this.initialized) {
                return { success: false, error: 'Push service not initialized' };
            }

            if (!pushToken) {
                console.log('⚠️ No push token provided');
                return { success: false, error: 'No token' };
            }

            const response = await fetch('https://api.onesignal.com/notifications', {
                method: 'POST',
                headers: {
                    'Authorization': `Key ${ONESIGNAL_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    app_id: ONESIGNAL_APP_ID,
                    include_subscription_ids: [pushToken],
                    headings: { en: title },
                    contents: { en: message },
                    data: data,
                    priority: 10,
                    ttl: 86400
                })
            });

            const result = await response.json();
            
            if (result.id) {
                console.log('✅ Push sent via OneSignal:', result.id);
                return { success: true, result: result };
            } else {
                console.log('❌ Push error:', result.errors || result);
                return { success: false, error: result.errors || result };
            }
        } catch (error) {
            console.error('❌ Push error:', error.message);
            return { success: false, error: error.message };
        }
    }

    //  
    // SEND ANNOUNCEMENT PUSH
    //  
    async sendAnnouncementPush({ pushToken, title, message, announcementId }) {
        return this.sendPushNotification({
            pushToken,
            title: `📢 ${title}`,
            message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
            data: {
                type: 'announcement',
                announcementId: announcementId || '',
                timestamp: new Date().toISOString()
            }
        });
    }

    //  
    // SEND TO MULTIPLE USERS
    //  
    async sendMultiplePushNotifications(notifications) {
        try {
            if (!this.initialized) {
                return { success: false, error: 'Push service not initialized' };
            }

            const results = [];
            for (const notification of notifications) {
                const result = await this.sendPushNotification(notification);
                results.push(result);
            }
            
            console.log('✅ Bulk push sent:', results.length, 'notifications');
            return { success: true, results };
        } catch (error) {
            console.error('❌ Bulk push error:', error);
            return { success: false, error };
        }
    }

    //  
    // SEND ATTENDANCE PUSH
    //  
    async sendAttendancePush({ pushToken, studentName, status, class_name }) {
        return this.sendPushNotification({
            pushToken,
            title: `📋 Attendance Marked`,
            message: `${studentName} marked as ${status} in ${class_name || 'class'}`,
            data: {
                type: 'attendance',
                status: status,
                class_name: class_name,
                timestamp: new Date().toISOString()
            }
        });
    }

    //  
    // SEND GRADE PUSH
    //  
    async sendGradePush({ pushToken, studentName, subject, grade }) {
        return this.sendPushNotification({
            pushToken,
            title: `📊 Grade Added`,
            message: `${studentName} - ${subject}: ${grade}`,
            data: {
                type: 'grade',
                subject: subject,
                grade: grade,
                timestamp: new Date().toISOString()
            }
        });
    }

    //  
    // SEND APPROVAL PUSH
    //  
    async sendApprovalPush({ pushToken, name, status }) {
        return this.sendPushNotification({
            pushToken,
            title: `✅ Account ${status}`,
            message: `${name}'s account has been ${status.toLowerCase()}`,
            data: {
                type: 'approval',
                status: status,
                timestamp: new Date().toISOString()
            }
        });
    }

    //  
    // SEND RESPONSE PUSH
    //  
    async sendResponsePush({ pushToken, senderName, subject }) {
        return this.sendPushNotification({
            pushToken,
            title: `💬 New Response`,
            message: `${senderName} replied to: ${subject}`,
            data: {
                type: 'response',
                sender: senderName,
                subject: subject,
                timestamp: new Date().toISOString()
            }
        });
    }
}

module.exports = new PushService();