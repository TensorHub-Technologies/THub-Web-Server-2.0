import express from "express";
import pool from "../config/db.js";
import transporter from "../config/mailer.js";
import jwt from "jsonwebtoken";

const inviteRoute = express.Router();

inviteRoute.post("/", async (req, res) => {
  const { email, workspace, uid } = req.body;
  console.log(req.body, "req body");
  const inviterId = uid;
  const selectedWorkspace = workspace || "app";

  if (!email || !selectedWorkspace) {
    return res
      .status(400)
      .json({ message: "Email and workspace name are required." });
  }

  const connection = await pool.getConnection();
  try {
    // 1. Check or create workspace
    const [workspaceResult] = await connection.query(
      "SELECT id FROM workspaces WHERE name = ?",
      [selectedWorkspace]
    );

    let workspaceId;
    if (workspaceResult.length > 0) {
      workspaceId = workspaceResult[0].id;
    } else {
      const [newWorkspaceResult] = await connection.query(
        "INSERT INTO workspaces (name, created_at, owner_id) VALUES (?, NOW(), ?)",
        [workspace, inviterId]
      );
      workspaceId = newWorkspaceResult.insertId;
    }

    // 2. Check member limit
    const [userCountResult] = await connection.query(
      "SELECT COUNT(*) AS userCount FROM workspace_users WHERE workspace_id = ?",
      [workspaceId]
    );
    if (userCountResult[0].userCount >= 5) {
      return res
        .status(400)
        .json({ message: "User limit for this workspace has been reached." });
    }

    // 3. Check duplicate invitation
    const [existingInvite] = await connection.query(
      "SELECT id FROM invitations WHERE workspace_id = ? AND email = ?",
      [workspaceId, email]
    );
    if (existingInvite.length > 0) {
      return res.status(400).json({ message: "This user is already invited." });
    }

    // 4. Generate secure token
    const token = jwt.sign({ workspaceId, email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // 5. Insert invitation
    await connection.query(
      "INSERT INTO invitations (workspace_id, email, invited_at, token) VALUES (?, ?, NOW(), ?)",
      [workspaceId, email, token]
    );

    // 6. Send email
    const inviteLink = `https://${workspace}.thub.tech/?token=${token}`;

    await transporter.sendMail({
      from: "no-reply@thub.tech",
      to: email,
      subject: "Workspace Invitation",
      text: `You have been invited to join ${selectedWorkspace}. Click to accept: ${inviteLink}`,
    });

    res
      .status(200)
      .json({ message: `Invitation sent successfully to ${email}` });
  } catch (error) {
    console.error("Error sending invitation:", error);
    res.status(500).json({ message: "Error processing the invitation." });
  } finally {
    connection.release();
  }
});

export default inviteRoute;
