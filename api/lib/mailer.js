const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendNotificationEmail(to, subject, text) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || 
        process.env.EMAIL_USER.includes('your_email') || 
        process.env.EMAIL_PASS.includes('app_password')) {
        console.log(`[MOCK] Email to ${to}: ${subject}`);
        return;
    }

    try {
        await transporter.sendMail({
            from: `"Maple Apartments" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text
        });
        console.log(`Email sent to ${to}`);
    } catch (err) {
        console.error(`Error sending email to ${to}:`, err);
    }
}

module.exports = { sendNotificationEmail };
