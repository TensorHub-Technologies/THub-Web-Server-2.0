import express from "express";
import pool from "../config/db.js"
const userUpdateRoute = express.Router()


userUpdateRoute.post('/', async (req, res) => {
    const { field, value, userId } = req.body
    if (!['name', 'department'].includes(field)) {
        return res.status(400).json({ message: 'Invalid field' })
    }

    try {
        const [result] = await pool.query(`UPDATE users SET ${field} = ? WHERE uid = ?`, [value, userId])
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' })
        }

        res.status(200).json({ message: 'User updated successfully' })
    } catch (error) {
        console.error('Error updating user:', error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

export default userUpdateRoute;
