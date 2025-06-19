import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();
console.log(process.env.NO_REPLY_MAIL_PASSWORD,"no reply mail")

const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false, 
  auth: {
    user: "no-reply@thub.tech",
    pass: process.env.NO_REPLY_MAIL_PASSWORD,
  },
  tls: {
    ciphers: 'SSLv3', 
  }
});

export default transporter;
