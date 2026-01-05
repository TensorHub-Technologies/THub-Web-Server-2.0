import express from "express";
import pool from '../config/db.js'

const studentEnroll = express.Router();

studentEnroll.post("/",async(req,res)=>{
 try {
    const {
      firstName,
      lastName,
      email,
      course,
      current_status,
      collegeName,
      companyName,
      designation,
      description,
    } = req.body;

    const sql = `
      INSERT INTO student_enrollments
      (first_name, last_name, email, course, current_status,
       college_name, company_name, designation, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await pool.execute(sql, [
      firstName,
      lastName,
      email,
      course,
      current_status,
      collegeName || null,
      companyName || null,
      designation || null,
      description,
    ]);

    res.status(201).json({ message: "Enrollment saved successfully" });
  } catch (error) {
    console.error("DB Error:", error);
    res.status(500).json({ message: "Failed to save enrollment" });
  }
})

export default studentEnroll;



