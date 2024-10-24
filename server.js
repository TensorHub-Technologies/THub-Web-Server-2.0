const express = require('express');
const app = express();
const mysql = require('mysql2/promise');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios'); // Import axios
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const PORT = process.env.PORT || 2000;

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  port: process.env.DATABASE_PORT
});

app.use(express.json());

const allowedOrigins = [
  'https://thub-test-378678297066.us-central1.run.app',
  'http://test.thub.tech',
  'http://34.172.179.132:5001',
  'http://localhost:5173',
  'http://localhost:8080',
  'https://thub.tech',
  'https://beta.thub.tech'
];
const regex = /^https?:\/\/([a-z0-9-]+\.)?thub\.tech$/;

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (origin && regex.test(origin)) {
      return callback(null, true);
    }
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));

app.post("/api/auth/google", async (req, res) => {
  const { code } = req.body;
  console.log(code,"from request body")
  try {
    
    const response = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: "postmessage",
      grant_type: "authorization_code",
    });

    const { id_token, access_token } = response.data;
    
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    console.log("Google user payload:", payload);
    const userId = payload["sub"];
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;

    const connection = await pool.getConnection();

    
    const [rows] = await connection.execute(
      `SELECT uid FROM test_users WHERE email = ?`,
      [email]
    );

    if (rows.length === 0) {
      const insertUserQuery = `
        INSERT INTO test_users (uid, email, access_token, login_type, name, picture)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      await connection.execute(insertUserQuery, [
        userId || null,
        email || null,
        access_token || null,
        "google",
        name || null,
        picture || null,
      ]);
    } else {
      const updateUserQuery = `
        UPDATE test_users 
        SET access_token = ?, login_type = ?, name = ?, picture = ? 
        WHERE email = ?
      `;
      await connection.execute(updateUserQuery, [
        access_token || null,
        "google",
        name || null,
        picture || null,
        email || null,
      ]);
    }

    connection.release();
    
    res.json({ id_token, access_token, user: payload });
  } catch (error) {
    console.error("Error exchanging code:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to exchange code" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
