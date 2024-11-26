// config/mailer.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.privateemail.com",
  port: 465,
  secure: true,
  auth: {
    user: "no-reply@thub.tech",
    pass: process.env.NO_REPLY_MAIL_PASSWORD,
  },
});

module.exports = transporter;
