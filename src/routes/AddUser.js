const express = require("express");
const router = express.Router();
const pool = require("../config/db"); 

router.post('/add-user', async (req, res) => {
    const { workspaceId, userId, role } = req.body;

    if (!workspaceId || !userId) {
        return res.status(400).json({ message: 'Workspace ID and user ID are required.' });
    }

    try {
        const [result] = await pool.promise().query(
            'INSERT INTO workspace_users (workspace_id, user_id, role) VALUES (?, ?, ?)',
            [workspaceId, userId, role || 'member']
        );

        res.status(200).json({ message: 'User added to workspace successfully.' });
    } catch (error) {
        console.error('Error adding user to workspace:', error);
        res.status(500).json({ message: 'An error occurred while adding the user to the workspace.' });
    }
});


module.exports = router;