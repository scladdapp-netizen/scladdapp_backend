const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST   || "smtp.gmail.com",
  port:   parseInt(process.env.EMAIL_PORT || "587"),
  secure: false, // true for port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Send an email.
 * @param {{ to: string, subject: string, html: string, text?: string }} options
 */
const sendEmail = async ({ to, subject, html, text }) => {
  const info = await transporter.sendMail({
    from:    process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ""),
  });
  console.log(`Email sent to ${to}: ${info.messageId}`);
  return info;
};

module.exports = { sendEmail };
