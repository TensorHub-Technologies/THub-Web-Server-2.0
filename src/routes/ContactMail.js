import express from "express";
import transporter from "../config/mailer.js";

const contactMail = express.Router();

contactMail.post("/", async (req, res) => {
  const { firstName, email, mobileNumber, YourMessage } = req.body.values;

  try {
    const adminMail = {
      from: `"THub" <no-reply@thub.tech>`,
      to: "tensorhub01@gmail.com",
      subject: "New Inquiry",
      html: `
        <h3>Inquiry Details</h3>
        <p><strong>Name:</strong> ${firstName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Contact Number:</strong> ${mobileNumber}</p>
        <p><strong>Message:</strong> ${YourMessage}</p>
      `,
    };

    const userMail = {
      from: `"THub" <no-reply@thub.tech>`,
      to: email,
      subject: "Thanks for contacting us!",
      html: `
        <p>Hi ${firstName},</p>
        <p>Thank you for reaching out to us. Our team will contact you shortly.</p>
        <p>Best regards,<br/>Team THub</p>
      `,
    };

    await transporter.sendMail(adminMail);
    await transporter.sendMail(userMail);

    console.log("Emails sent to admin and user");
    res.status(200).json({ message: "Emails sent successfully" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ message: "Failed to send email" });
  }
});

export default contactMail;
