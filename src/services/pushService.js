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
    // SEND PUSH NOTIFICATION VIA ONESIGNAL (MOBILE + WEB)
    //  
    async sendPushNotification({ userId, pushToken, webPushToken, title, message, data = {} }) {
        try {
            if (!this.initialized) {
                return { success: false, error: 'Push service not initialized' };
            }

            let sentSuccess = false;
            let lastResult = null;

            // 1. Target via external_id (Reaches all logged-in devices of user: Mobile + Web)
            if (userId) {
                try {
                    const aliasPayload = {
                        app_id: ONESIGNAL_APP_ID,
                        include_aliases: { external_id: [String(userId)] },
                        target_channel: 'push',
                        headings: { en: title },
                        contents: { en: message },
                        data: data,
                        priority: 10,
                        ttl: 86400
                    };

                    const response = await fetch('https://api.onesignal.com/notifications', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Key ${ONESIGNAL_API_KEY}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify(aliasPayload)
                    });

                    const result = await response.json();
                    if (result.id) {
                        console.log(`✅ Push delivered via external_id (${userId}):`, result.id);
                        sentSuccess = true;
                        lastResult = result;
                    } else {
                        console.log(`ℹ️ external_id push notice for user ${userId}:`, result.errors || result);
                    }
                } catch (e) {
                    console.warn(`⚠️ external_id push error for user ${userId}:`, e.message);
                }
            }

            // 2. Direct subscription IDs (pushToken for mobile, webPushToken for web)
            const subIds = [];
            const isValid = (id) => id && typeof id === 'string' && !id.startsWith('local-');

            if (isValid(pushToken)) subIds.push(pushToken);
            if (isValid(webPushToken) && !subIds.includes(webPushToken)) subIds.push(webPushToken);

            if (subIds.length > 0) {
                try {
                    const subPayload = {
                        app_id: ONESIGNAL_APP_ID,
                        include_subscription_ids: subIds,
                        headings: { en: title },
                        contents: { en: message },
                        data: data,
                        priority: 10,
                        ttl: 86400
                    };

                    let response = await fetch('https://api.onesignal.com/notifications', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Key ${ONESIGNAL_API_KEY}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify(subPayload)
                    });

                    let result = await response.json();

                    // Fallback to include_player_ids if subscription_ids failed
                    if (!result.id) {
                        subPayload.include_player_ids = subIds;
                        delete subPayload.include_subscription_ids;

                        response = await fetch('https://api.onesignal.com/notifications', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Key ${ONESIGNAL_API_KEY}`,
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify(subPayload)
                        });
                        result = await response.json();
                    }

                    if (result.id) {
                        console.log(`✅ Push sent to subscriptions [${subIds.join(', ')}]:`, result.id);
                        sentSuccess = true;
                        lastResult = result;
                    } else if (!sentSuccess) {
                        console.log('❌ Subscription push notice:', result.errors || result);
                    }
                } catch (subErr) {
                    console.warn('⚠️ Subscription push error:', subErr.message);
                }
            }

            if (sentSuccess) {
                return { success: true, result: lastResult };
            } else {
                return { success: false, error: 'No active device or subscription reached' };
            }
        } catch (error) {
            console.error('❌ Push error:', error.message);
            return { success: false, error: error.message };
        }
    }

    //  
    // SEND ANNOUNCEMENT PUSH
    //  
    async sendAnnouncementPush({ userId, pushToken, webPushToken, title, message, announcementId }) {
        return this.sendPushNotification({
            userId,
            pushToken,
            webPushToken,
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
    async sendAttendancePush({ userId, pushToken, webPushToken, studentName, status, class_name }) {
        return this.sendPushNotification({
            userId,
            pushToken,
            webPushToken,
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
    async sendGradePush({ userId, pushToken, webPushToken, studentName, subject, grade }) {
        return this.sendPushNotification({
            userId,
            pushToken,
            webPushToken,
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
    async sendApprovalPush({ userId, pushToken, webPushToken, name, status }) {
        return this.sendPushNotification({
            userId,
            pushToken,
            webPushToken,
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
    async sendResponsePush({ userId, pushToken, webPushToken, senderName, subject }) {
        return this.sendPushNotification({
            userId,
            pushToken,
            webPushToken,
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