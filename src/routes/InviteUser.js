import express from "express";
import pool from "../config/db.js"
import transporter from "../config/mailer.js";
const inviteRoute = express.Router();

inviteRoute.post('/', async (req, res) => {
    const { email, workspace } = req.body;
    console.log("email:",email)
    console.log("workspace:",workspace)
  const selectedWorkspace = workspace || "app";

    if (!email || !selectedWorkspace) {
        return res.status(400).json({ message: 'Email and workspace name are required.' });
    }

    try {
        // const connection = await pool.getConnection();

        // const [workspaceResult] = await connection.query(
        //     'SELECT id FROM workspaces WHERE name = ?',
        //     [selectedWorkspace]
        // );

        // let workspaceId;
        // if (workspaceResult.length > 0) {
        //     workspaceId = workspaceResult[0].id;
        // } else {
        //     const [newWorkspaceResult] = await connection.query(
        //         'INSERT INTO workspaces (name, created_at) VALUES (?, NOW())',
        //         [workspace]
        //     );
        //     workspaceId = newWorkspaceResult.insertId;
        // }

        // // Check if the workspace user count exceeds the limit
        // const [userCountResult] = await connection.query(
        //     'SELECT COUNT(*) AS userCount FROM workspace_users WHERE workspace_id = ?',
        //     [workspaceId]
        // );

        // if (userCountResult[0].userCount >= 5) {
        //     connection.release();
        //     return res.status(400).json({ message: 'User limit for this workspace has been reached.' });
        // }

        // // Insert into the invitations table
        // await connection.query(
        //     'INSERT INTO invitations (workspace_id, email, invited_at) VALUES (?, ?, NOW())',
        //     [workspaceId, email]
        // );

        // Send the invitation email
        const inviteLink = `https://app.thub.tech?theme=lite/join?email=${encodeURIComponent(email)}`;
        await transporter.sendMail({
            from: "no-reply@thub.tech",
            to: email,
            subject: 'Workspace Invitation',
            text: `You have been invited to join the workspace. Click the link to accept: ${inviteLink}`,
        });
       

        // connection.release();

        res.status(200).json({ message: `Invitation sent successfully to ${email}` });
    } catch (error) {
        console.error('Error sending invitation:', error);
        res.status(500).json({ message: 'An error occurred while processing the invitation.' });
    }
});

export default inviteRoute;
