const express = require("express");
const router = express.Router();
const transporter = require("../config/mailer");

router.post('/', async (req,res) => {
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
    }
});

module.exports = router;
