const express = require('express');
const router = express.Router();
const pool = require("../config/db");
const transporter = require("../config/mailer");
const bcrypt = require("bcryptjs");

function generateRandomID() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
        (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
}

router.post("/", async (req, res) => {
    try {
        const {
            email, firstName, lastName, phone, password, login_type,
            subscription_type, subscription_duration, subscription_date,
            workspace, company, department, role
        } = req.body;

        const uid = generateRandomID();
        const name = `${firstName} ${lastName}`;
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        console.log("Inside server::invite user:", email, firstName, lastName, phone, password_hash, login_type, subscription_type, subscription_duration, subscription_date, workspace, company, department, role);

        const connection = await pool.getConnection();

        // Check if workspace has less than 5 users
        const [workspaceUserCount] = await connection.execute(
            "SELECT COUNT(*) AS userCount FROM workspace_users WHERE workspace_name = ?",
            [workspace]
        );

        console.log(workspaceUserCount,"workspaceUserCount")
        if (workspaceUserCount[0].userCount >= 5) {
            connection.release();
            return res.status(400).json({ message: `Workspace "${workspace}" already has the maximum of 5 users.` });
        }

        // Insert user into `users` table
        const insertUserQuery = `
            INSERT INTO users 
            (uid, email, phone, login_type, name, password_hash, subscription_type, subscription_duration, subscription_date, workspace, company, department, role)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await connection.execute(insertUserQuery, [
            uid || null,
            email || null,
            phone || null,
            login_type || null,
            name || null,
            password_hash || null,
            subscription_type || "free",
            subscription_duration || null,
            subscription_date || null,
            workspace || null,
            company || null,
            department || null,
            role || null
        ]);

        // Insert user into `workspace_users` table
        const insertWorkspaceUserQuery = `
            INSERT INTO workspace_users 
            (workspace_id, user_id, role, workspace_name) 
            VALUES ((SELECT id FROM workspaces WHERE name = ?), ?, ?, ?)
        `;
        await connection.execute(insertWorkspaceUserQuery, [
            workspace,
            uid,
            role || "member",
            workspace
        ]);

        // Send welcome email to the new user
        const mailOptions = {
            from: '"THub" <no-reply@thub.tech>',
            to: email,
            subject: "Welcome to THub!",
            text: `Hi ${name},\n\nWelcome to THub! We're excited to have you onboard. Explore our platform and get the most out of your subscription.\n\nBest regards,\nThe THub Team`,
            html: `<p>Hi <strong>${name}</strong>,</p>
                   <p>Welcome to THub! We're excited to have you onboard. Explore our platform and get the most out of your subscription.</p>
                   <p>Best regards,<br>The THub Team</p>`,
        };

        console.log("Sending welcome email to:", email);

        try {
            await transporter.sendMail(mailOptions);
            console.log("Welcome email sent successfully");
        } catch (emailError) {
            console.error("Failed to send welcome email:", emailError.message);
        }

        res.status(200).json({ message: "User successfully added", userId: uid, workspace: workspace });
        connection.release();
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

module.exports = router;
