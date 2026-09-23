//   COMPLETE: Testing Mode + Attachments + Role-Based + Sync Support + FYP Demo Switch

const nodemailer = require('nodemailer');
require('dotenv').config();

class EmailService {
    constructor() {
        this.transporter = null;
        this.init();
    }
    init() {
        try {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: parseInt(process.env.SMTP_PORT) || 587,
                secure: false, 
                family: 4,  // IPv4 force (IPv6 block fix)
                requireTLS: true,
                connectionTimeout: 30000,
                greetingTimeout: 30000,
                socketTimeout: 60000,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                },
                tls: {
                    rejectUnauthorized: false,
                    minVersion: 'TLSv1.2'
                }
            });
            console.log('✅ Email Service Initialized');
        } catch (error) {
            console.log('❌ Email Service Error:', error);
        }
    }

    // ==========================================
    // SEND EMAIL (Base Method)
    // ==========================================
    // ==========================================
    // SEND EMAIL (Clean & Professional Routing)
    // ==========================================
    async sendEmail({ to, subject, html, text, attachments }) {
        try {
            if (!this.transporter) {
                throw new Error('Email transporter not initialized');
            }

            //  SIMPLE SWITCH: Controlled purely by .env file
            const isTestingMode = process.env.EMAIL_TESTING_MODE === 'true' || process.env.EMAIL_TESTING_MODE === '1';
            
            let recipientEmail = to; // Default: Production Mode (Real user ki email)

            if (isTestingMode) {
                // TESTING MODE: Sab emails aapke personal inbox (SMTP_USER) mein jayengi
                recipientEmail = process.env.SMTP_USER; 
                console.log(`\n🚨 [TESTING MODE ACTIVE] Email rerouted to: ${recipientEmail} (Original target was: ${to})`);
            }

            console.log('\n' + '='.repeat(60));
            console.log('📧 EMAIL SERVICE - SENDING EMAIL');
            console.log('='.repeat(60));
            console.log(`📨 Intended Target:  ${to}`);
            console.log(`📨 Actual Sent To:   ${recipientEmail} ${isTestingMode ? '(TESTING MODE)' : '(PRODUCTION MODE)'}`);
            console.log(`📌 Subject:          ${subject}`);
            if (attachments && attachments.length > 0) {
                console.log(`📎 Attachments:      ${attachments.length} file(s)`);
            }
            console.log('='.repeat(60) + '\n');

            const cleanText = text || (html ? html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim() : '');

            const mailOptions = {
                from: process.env.SMTP_FROM || `"Smart Desk" <${process.env.SMTP_USER}>`,
                replyTo: `"Smart Desk" <${process.env.SMTP_USER}>`,
                to: recipientEmail,
                subject: subject,
                text: cleanText,
                html: html || text || '',
                headers: {
                    'X-Priority': '3',
                    'X-Mailer': 'SmartDesk Academic Portal',
                    'X-Auto-Response-Suppress': 'OOF, AutoReply',
                    'Feedback-ID': 'smartdesk:academic:notification'
                },
                attachments: attachments || []
            };

            // const info = await this.transporter.sendMail (mailOptions);
            let info;
            try {
                info = await this.transporter.sendMail(mailOptions);
            } catch (firstErr) {
                console.error('⚠️ Email attempt 1 failed:', firstErr.message, '- retrying in 3s...');
                await new Promise(r => setTimeout(r, 3000));
                info = await this.transporter.sendMail(mailOptions);  //   Retry
            }
            
            console.log(`✅ Email sent successfully: ${info.messageId}`);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('❌ Email error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ==========================================
    // NEW: SEND ATTENDANCE NOTIFICATION (Called by syncController)
    // ==========================================
    async sendAttendanceNotification({ to, studentName, date, status, className, attachments }) {
        const statusEmoji = status === 'present' ? '✅' : status === 'absent' ? '❌' : '⏰';
        const statusColor = status === 'present' ? '#10B981' : status === 'absent' ? '#EF4444' : '#F59E0B';
        const statusText = status.charAt(0).toUpperCase() + status.slice(1);

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
                    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                    .header { background: linear-gradient(135deg, #10B981, #059669); padding: 24px; text-align: center; }
                    .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
                    .header .sub { color: #D1FAE5; font-size: 14px; margin-top: 4px; }
                    .body { padding: 24px; }
                    .body .greeting { font-size: 16px; color: #1F2937; margin-bottom: 16px; }
                    .body .status-box { background: ${statusColor}20; border-left: 4px solid ${statusColor}; padding: 16px; border-radius: 8px; margin: 16px 0; }
                    .body .status-box .status { font-size: 18px; font-weight: bold; color: ${statusColor}; }
                    .body .details { background: #F9FAFB; padding: 16px; border-radius: 8px; margin: 16px 0; }
                    .body .details .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #E5E7EB; }
                    .body .details .row:last-child { border-bottom: none; }
                    .body .details .label { color: #6B7280; font-size: 14px; }
                    .body .details .value { color: #1F2937; font-size: 14px; font-weight: 600; }
                    .footer { background: #F9FAFB; padding: 16px; text-align: center; font-size: 12px; color: #9CA3AF; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${statusEmoji} Attendance Update</h1>
                        <div class="sub">Smart Desk - ${className || 'Class'}</div>
                    </div>
                    <div class="body">
                        <div class="greeting">Dear ${studentName || 'Student'},</div>
                        <div class="status-box">
                            <div class="status">${statusEmoji} You were marked ${statusText}</div>
                        </div>
                        <div class="details">
                            <div class="row">
                                <span class="label">📅 Date:</span>
                                <span class="value">${date}</span>
                            </div>
                            <div class="row">
                                <span class="label">📚 Class:</span>
                                <span class="value">${className || 'N/A'}</span>
                            </div>
                            <div class="row">
                                <span class="label">✅ Status:</span>
                                <span class="value" style="color: ${statusColor};">${statusText}</span>
                            </div>
                        </div>
                        <div style="margin-top: 16px; color: #6B7280; font-size: 14px;">
                            If you believe this is incorrect, please contact your teacher.
                        </div>
                    </div>
                    <div class="footer">
                        <p>Smart Desk • ${new Date().toLocaleString()}</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        return this.sendEmail({
            to,
            subject: `${statusEmoji} Attendance Update - ${statusText}`,
            html,
            text: `Dear ${studentName},\n\nYour attendance for ${date} in ${className} has been marked as ${statusText}.\n\nSmart Desk`,
            attachments: attachments || []
        });
    }

    // ==========================================
    // ==========================================
    // FIXED: SEND NOTIFICATION EMAIL - Accepts attachments & downloadUrl
    // ==========================================
    async sendNotificationEmail({ to, recipientName, subject, message, senderRole, attachments, downloadUrl }) {
        const roleEmoji = senderRole === 'Teacher' ? '👨‍🏫' : senderRole === 'Coordinator' ? '👨‍💼' : '📢';

        const formattedAttachments = attachments && attachments.length > 0 
            ? attachments.map(att => {
                const item = {
                    filename: att.filename || att.name || 'attachment',
                    contentType: att.contentType || att.mimetype || 'application/octet-stream'
                };
                if (att.content || att.data) item.content = att.content || att.data;
                if (att.path) item.path = att.path;
                return item;
            })
            : [];

        const targetDownloadUrl = downloadUrl || (attachments && attachments[0] && (attachments[0].url || attachments[0].downloadUrl));
        const attachmentName = (attachments && attachments[0] && (attachments[0].filename || attachments[0].name)) || 'Attachment File';

        let downloadCardHtml = '';
        if (targetDownloadUrl) {
            downloadCardHtml = `
                <div style="margin: 20px 0; padding: 16px; background: #F0FDF4; border: 1px solid #86EFAC; border-radius: 10px; text-align: center;">
                    <div style="font-weight: bold; color: #166534; font-size: 15px; margin-bottom: 6px;">📎 Attached Document Available</div>
                    <div style="color: #4B5563; font-size: 13px; margin-bottom: 12px;">${attachmentName}</div>
                    <a href="${targetDownloadUrl}" target="_blank" style="display: inline-block; background: #16A34A; color: #FFFFFF; font-weight: bold; padding: 10px 22px; border-radius: 8px; text-decoration: none; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        ⬇️ Download / Open Attachment
                    </a>
                </div>
            `;
        } else if (formattedAttachments.length > 0) {
            downloadCardHtml = `
                <div style="margin: 20px 0; padding: 14px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px;">
                    <div style="font-weight: bold; color: #1E40AF; font-size: 14px;">📎 File Attached: ${attachmentName}</div>
                    <div style="color: #64748B; font-size: 12px; margin-top: 4px;">You can preview and download this file directly from the attachments section below in Gmail.</div>
                </div>
            `;
        }

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
                    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                    .header { background: linear-gradient(135deg, #3B82F6, #1E40AF); padding: 24px; text-align: center; }
                    .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
                    .header .sub { color: #DBEAFE; font-size: 14px; margin-top: 4px; }
                    .body { padding: 24px; }
                    .body .greeting { font-size: 16px; color: #1F2937; margin-bottom: 16px; }
                    .body .subject { font-size: 18px; font-weight: bold; color: #1F2937; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 2px solid #E5E7EB; }
                    .body .message { color: #4B5563; line-height: 1.8; white-space: pre-wrap; background: #F9FAFB; padding: 16px; border-radius: 8px; }
                    .body .sender { margin-top: 16px; padding: 12px; background: #EFF6FF; border-radius: 8px; font-size: 14px; color: #1E40AF; }
                    .footer { background: #F9FAFB; padding: 16px; text-align: center; font-size: 12px; color: #9CA3AF; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${roleEmoji} Notification</h1>
                        <div class="sub">Smart Desk - ${senderRole || 'System'}</div>
                    </div>
                    <div class="body">
                        <div class="greeting">Dear ${recipientName || 'User'},</div>
                        <div class="subject">${subject}</div>
                        <div class="message">${message}</div>
                        ${downloadCardHtml}
                        <div class="sender">
                            <strong>${roleEmoji} Sent by:</strong> ${senderRole || 'System'}
                        </div>
                    </div>
                    <div class="footer">
                        <p>Smart Desk • ${new Date().toLocaleString()}</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        return this.sendEmail({
            to,
            subject: `${roleEmoji} ${subject}`,
            html,
            text: `Dear ${recipientName},\n\nSubject: ${subject}\n\n${message}\n\nSent by: ${senderRole || 'System'}${targetDownloadUrl ? '\n\nAttachment: ' + targetDownloadUrl : ''}\n\nSmart Desk`,
            attachments: formattedAttachments
        });
    }

    // ==========================================
    // SEND ANNOUNCEMENT EMAIL (Existing - Enhanced with Download Button)
    // ==========================================
    async sendAnnouncementEmail({ to, subject, message, senderName, attachments, inlineImage, downloadUrl }) {
        const cid = `smartdesk-announcement-${Date.now()}`;

        const formattedAttachments = attachments && attachments.length > 0 
            ? attachments.map(att => {
                const item = {
                    filename: att.filename || att.name || 'attachment',
                    contentType: att.contentType || att.mimetype || 'application/octet-stream'
                };
                if (att.content || att.data) item.content = att.content || att.data;
                if (att.path) item.path = att.path;
                return item;
            })
            : [];

        if (inlineImage && inlineImage.content) {
            formattedAttachments.push({
                filename: inlineImage.filename || 'announcement-image.jpg',
                content: inlineImage.content,
                contentType: inlineImage.contentType || 'image/jpeg',
                cid: cid,
                contentDisposition: 'inline'
            });
        }

        const targetDownloadUrl = downloadUrl || (attachments && attachments[0] && (attachments[0].url || attachments[0].downloadUrl));
        const attachmentName = (attachments && attachments[0] && (attachments[0].filename || attachments[0].name)) || 'Attachment File';

        let downloadCardHtml = '';
        if (targetDownloadUrl) {
            downloadCardHtml = `
                <div style="margin: 20px 0; padding: 16px; background: #F0FDF4; border: 1px solid #86EFAC; border-radius: 10px; text-align: center;">
                    <div style="font-weight: bold; color: #166534; font-size: 15px; margin-bottom: 6px;">📎 Attached Document Available</div>
                    <div style="color: #4B5563; font-size: 13px; margin-bottom: 12px;">${attachmentName}</div>
                    <a href="${targetDownloadUrl}" target="_blank" style="display: inline-block; background: #16A34A; color: #FFFFFF; font-weight: bold; padding: 10px 22px; border-radius: 8px; text-decoration: none; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        ⬇️ Download / Open Attachment
                    </a>
                </div>
            `;
        } else if (formattedAttachments.length > 0) {
            downloadCardHtml = `
                <div style="margin: 20px 0; padding: 14px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px;">
                    <div style="font-weight: bold; color: #1E40AF; font-size: 14px;">📎 File Attached: ${attachmentName}</div>
                    <div style="color: #64748B; font-size: 12px; margin-top: 4px;">You can preview and download this file directly from the attachments section below in Gmail.</div>
                </div>
            `;
        }

        const imageHtml = inlineImage && inlineImage.content
            ? `<div style="margin: 20px 0; text-align: center;">
                 <img src="cid:${cid}" alt="Announcement Image" 
                      style="max-width: 100%; border-radius: 12px; border: 1px solid #E5E7EB; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
               </div>`
            : '';

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
                    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                    .header { background: linear-gradient(135deg, #7C3AED, #6D28D9); padding: 24px; text-align: center; }
                    .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
                    .header .sub { color: #DDD6FE; font-size: 14px; margin-top: 4px; }
                    .body { padding: 24px; }
                    .body .subject { font-size: 18px; font-weight: bold; color: #1F2937; margin-bottom: 12px; }
                    .body .message { color: #4B5563; line-height: 1.8; white-space: pre-wrap; }
                    .body .meta { margin-top: 16px; padding-top: 16px; border-top: 1px solid #E5E7EB; font-size: 12px; color: #9CA3AF; }
                    .footer { background: #F9FAFB; padding: 16px; text-align: center; font-size: 12px; color: #9CA3AF; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📢 Smart Desk</h1>
                        <div class="sub">Announcement from ${senderName || 'Admin'}</div>
                    </div>
                    <div class="body">
                        <div class="subject">${subject}</div>
                        <div class="message">${message}</div>
                        ${imageHtml}
                        ${downloadCardHtml}
                        <div class="meta">Sent via Smart Desk • ${new Date().toLocaleString()}</div>
                    </div>
                    <div class="footer">
                        <p>This is an automated notification from Smart Desk</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        return this.sendEmail({
            to,
            subject: `📢 ${subject}`,
            html,
            text: `Smart Desk Announcement\n\nSubject: ${subject}\n\n${message}${targetDownloadUrl ? '\n\nAttachment: ' + targetDownloadUrl : ''}\n\nSent via Smart Desk`,
            attachments: formattedAttachments
        });
    }

    // ==========================================
    // SEND APPROVAL EMAIL (Existing)
    // ==========================================
    async sendApprovalEmail({ to, name, status, reason }) {
        const isApproved = status === 'Approved' || status === 'Active';
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
                    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                    .header { background: ${isApproved ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #EF4444, #DC2626)'}; padding: 24px; text-align: center; }
                    .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
                    .body { padding: 24px; }
                    .body .status { font-size: 18px; font-weight: bold; color: ${isApproved ? '#10B981' : '#EF4444'}; margin-bottom: 12px; }
                    .body .message { color: #4B5563; line-height: 1.8; }
                    .footer { background: #F9FAFB; padding: 16px; text-align: center; font-size: 12px; color: #9CA3AF; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${isApproved ? '✅ Account Approved' : '❌ Account Rejected'}</h1>
                    </div>
                    <div class="body">
                        <div class="status">${isApproved ? '✅ Your account has been approved!' : '❌ Your account has been rejected'}</div>
                        <div class="message">Dear ${name},</div>
                        <div class="message">${isApproved ? 'Your Smart Desk account has been approved. You can now login to the system.' : 'We regret to inform you that your Smart Desk account has been rejected.'}</div>
                        ${!isApproved && reason ? `<div class="message" style="margin-top:10px;"><strong>Reason:</strong> ${reason}</div>` : ''}
                    </div>
                    <div class="footer">
                        <p>Smart Desk • ${new Date().toLocaleString()}</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        return this.sendEmail({
            to,
            subject: `${isApproved ? '✅ Account Approved' : '❌ Account Rejected'} - Smart Desk`,
            html,
            text: `Dear ${name},\n\n${isApproved ? 'Your account has been approved.' : 'Your account has been rejected.'}${!isApproved && reason ? `\nReason: ${reason}` : ''}`
        });
    }
}

module.exports = new EmailService();