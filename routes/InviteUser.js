const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const transporter = require("../config/mailer");

router.post('/', async (req, res) => {
    const { email, workspace} = req.body;
    function generateWorkspaceId() {
        return Math.floor(100000 + Math.random() * 900000);
    }
    const workspaceId = generateWorkspaceId();

    if (!email) {
        return res.status(400).json({ message: 'Email is required.' });
    }

    try {
        const [users] = await pool.query(
            'SELECT COUNT(*) AS userCount FROM workspace_users WHERE workspace_id = ?',
            [workspaceId]
        );

        if (users[0].userCount > 4) {
            return res.status(400).json({ message: 'User limit for this workspace has been reached.' });
        }

        await pool.query(
            'INSERT INTO invitations (workspace_id, email, invited_at) VALUES (?, ?, NOW())',
            [workspaceId, email]
        );

        const inviteLink = `https://${workspace}.thub.tech?theme=lite/join?email=${encodeURIComponent(email)}`;

        await transporter.sendMail({
            from: "no-reply@thub.tech",
            to: email,
            subject: 'Workspace Invitation',
            text: `You have been invited to join the workspace. Click the link to accept: ${inviteLink}`,
        });

        res.status(200).json({ message: `Invitation sent successfully to ${email}` });
    } catch (error) {
        console.error('Error sending invitation:', error);
        res.status(500).json({ message: 'An error occurred while processing the invitation.' });
    }
});

module.exports = router;
