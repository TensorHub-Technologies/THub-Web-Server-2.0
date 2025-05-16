import express from "express";
import pool from "../config/db.js"
import transporter from "../config/mailer.js";
const enterpriceRoute=express.Router();


enterpriceRoute.post("/", async (req, res) => {
    const {
      firstName,
      lastName,
      companyName,
      designation,
      email,
      contactNumber,
      description,
    } = req.body;
  
    try {
      const mailOptions = {
        from: "no-reply@thub.tech",
        to: "admin@thub.tech",
        subject: "New Enterprise Inquiry",
        html: `
          <h3>Enterprise Inquiry Details</h3>
          <p><strong>First Name:</strong> ${firstName}</p>
          <p><strong>Last Name:</strong> ${lastName}</p>
          <p><strong>Company Name:</strong> ${companyName}</p>
          <p><strong>Designation:</strong> ${designation}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Contact Number:</strong> ${contactNumber}</p>
          <p><strong>Description:</strong> ${description}</p>
        `,
      };
  
      await transporter.sendMail(mailOptions);
  
      console.log("Email sent to admin@thub.tech");
      
      const connection = await pool.getConnection();

      const insertInquiryQuery = `
        INSERT INTO enterprise_inquiries 
        (first_name, last_name, company_name, designation, email, contact_number, description) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      await connection.execute(insertInquiryQuery, [
        firstName || null,
        lastName || null,
        companyName || null,
        designation || null,
        email || null,
        contactNumber || null,
        description || null,
      ]);
  
      connection.release();
      res.status(200).json({ message: "Inquiry submitted successfully" });
    } catch (error) {
      console.error("Error processing inquiry:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  

export default enterpriceRoute;