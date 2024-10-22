const express = require('express');
const app = express();
const mysql = require('mysql2/promise');
const { OAuth2Client } = require('google-auth-library');
const cors = require('cors'); 
const dotenv=require("dotenv");
dotenv.config()
const GOOGLE_CLIENT_ID=process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID); 
const PORT =process.env.PORT || 6000;

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_TYPE
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});