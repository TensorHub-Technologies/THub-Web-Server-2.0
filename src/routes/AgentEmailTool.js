import express from "express";
import transporter from "../config/mailer.js";
const emailTriggerAgent = express.Router();

const sendEmail = async ({ email, message, subject }) => {
  
  await transporter.sendMail({
    from: 'no-reply@thub.tech',
    to: email,
    subject: subject || 'Scheduled Email',
    html: message,
  });
};

emailTriggerAgent.post("/", async (req, res) => {
   console.log("Agent email got triggered")
    const {email,message,subject}=req.body;
    if (!email || !message) {
        return res.status(400).json({ message: 'Missing email or message' });
    }

  try {
        await transporter.sendMail({
                 from: 'no-reply@thub.tech',
                 to: email,
                 subject:subject,
                 html: `
                 ${message}
                `
              });

        res.status(200).json({ message: `Invitation sent successfully to ${email}` });
    } catch (error) {
        console.error('Error sending invitation:', error);
        res.status(500).json({ message: 'An error occurred while processing the invitation.' });
}});

export default emailTriggerAgent;
