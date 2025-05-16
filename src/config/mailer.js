// config/mailer.js
import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  host: "smtpout.secureserver.net",
  port: 465,
  secure: true,
  auth: {
    user: "noreply@textiletradebuddy.com",
    pass: process.env.NO_REPLY_MAIL_PASSWORD,
  },
});

export default transporter;
