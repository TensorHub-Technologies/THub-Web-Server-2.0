import express from "express";
import pool from "../config/db.js" 
const router = express.Router();

router.post('/create-workspace', async (req, res) => {
    const { name, createdBy } = req.body;

    if (!name || !createdBy) {
        return res.status(400).json({ message: 'Workspace name and creator are required.' });
    }

    try {
        const [result] = await pool.promise().query(
            'INSERT INTO workspaces (name, created_by) VALUES (?, ?)',
            [name, createdBy]
        );

        const workspaceId = result.insertId;

        await pool.promise().query(
            'INSERT INTO workspace_users (workspace_id, user_id, role) VALUES (?, ?, ?)',
            [workspaceId, createdBy, 'owner']
        );

        res.status(201).json({ message: 'Workspace created successfully.', workspaceId });
    } catch (error) {
        console.error('Error creating workspace:', error);
        res.status(500).json({ message: 'An error occurred while creating the workspace.' });
    }
});

module.exports = router;