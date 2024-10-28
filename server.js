const express = require('express');
const app = express();
const mysql = require('mysql2/promise');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const bcrypt = require('bcrypt');
const router = express.Router();
const jwt = require("jsonwebtoken");


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
  console.log(code, "from request body");

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
      `SELECT subscription_type FROM test_users WHERE email = ?`,
      [email]
    );

    let subscription_type = "free"; 

    if (rows.length > 0) {
      subscription_type = rows[0].subscription_type || "free";
    }

    if (rows.length === 0) {
      const insertUserQuery = `
        INSERT INTO test_users (uid, email, access_token, login_type, name, picture, subscription_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      await connection.execute(insertUserQuery, [
        userId || null,
        email || null,
        access_token || null,
        "google",
        name || null,
        picture || null,
        subscription_type,
      ]);
    } else {
      const updateUserQuery = `
        UPDATE test_users 
        SET access_token = ?, login_type = ?, name = ?, picture = ?, subscription_type = ?
        WHERE email = ?
      `;
      await connection.execute(updateUserQuery, [
        access_token || null,
        "google",
        name || null,
        picture || null,
        subscription_type,
        email || null,
      ]);
    }

    connection.release();

    res.json({ id_token, access_token, user: payload ,userId:userId,});
  } catch (error) {
    console.error("Error exchanging code:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to exchange code" });
  }
});


// github
app.get("/getAccessToken", async (req, res) => {
  try {
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: req.query.code,
    });

    const { data } = await axios.post(
      "https://github.com/login/oauth/access_token",
      params.toString(),
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    console.log(data, "Access Token Response");
    res.json(data);
  } catch (error) {
    console.error("Error fetching access token:", error);
    res.status(500).json({ error: "Failed to fetch access token" });
  }
});

app.get("/getuserData", async (req, res) => {
  const authorizationHeader = req.get("Authorization");

  try {
    const { data } = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: authorizationHeader,
      },
    });

    console.log(data, "User Data");

    const { id, login, node_id, name, avatar_url } = data;

    const connection = await pool.getConnection();

    try {
      const [rows] = await connection.execute(
        "SELECT COUNT(*) as count FROM test_users WHERE email = ?",
        [login]
      );

      if (rows[0].count === 0) {
        const query = `
          INSERT INTO test_users 
          (uid, email, access_token, name, login_type, picture, subscription_type) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(query, [
          id,
          login,
          node_id,
          name,
          "github",
          avatar_url,
          subcription_type || 'free',
        ]);

        console.log("User data inserted successfully");
        res.status(200).send("User authenticated and data stored");
      } else {
        console.log("User already exists");
        res.status(200).send("User already exists");
      }
    } finally {
      connection.release(); 
    }
  } catch (error) {
    console.error("Error fetching user data or storing in DB:", error);
    res.status(500).json({ error: "Failed to fetch user data or store in DB" });
  }
});

// email register

function generateRandomID() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
  );
}

app.post("/user", async (req, res) => {
  try {
    console.log("host: ",process.env.DATABASE_HOST)
    console.log("user: ",process.env.DATABASE_USER)
    console.log("password: ",process.env.DATABASE_PASSWORD)
    console.log("database type: ",process.env.DATABASE_TYPE)
    console.log(req.body);
    const { email, firstName, lastName, phone, password, login_type, subscription_type, subscription_duration, subscription_date,workspace } = await req.body;
    const uid = generateRandomID();
    const name = firstName+" "+lastName;
     const saltRounds = 10; 
     password_hash = await bcrypt.hash(password, saltRounds);
    console.log("inside server::user : ", email, firstName, lastName, phone, password_hash, login_type, subscription_type, subscription_duration, subscription_date,workspace);

    const connection = await pool.getConnection();

      const insertUserQuery = `INSERT INTO test_users (uid, email, phone, login_type, name, password_hash, subscription_type, subscription_duration, subscription_date,workspace) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,?)`;
      await connection.execute(insertUserQuery, [
        uid || null,
        email || null,
        phone || null,
        login_type || null,
        name || null,
        password_hash || null,
        subscription_type || null,
        subscription_duration || null,
        subscription_date || null,
        null,
      ]);
      res.status(200).json({ message: "user successfully added", userId: uid, workspace: null});
    
    connection.release();
  } catch (error) {
    console.error("Error :", error);

    res.status(401).send(error);
  }
})

// login register
  app.post('/loginUser', async (req, res) => {
    const { email, password } = req.body;
  
    try {
      const connection = await pool.getConnection();
      
      // Query to get user data including workspace
      const [rows] = await connection.execute(
        `SELECT uid, email, password_hash, workspace 
         FROM test_users 
         WHERE email = ?`,
        [email]
      );
      connection.release();
  
      if (rows.length === 0) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
  
      const { uid, password_hash, workspace } = rows[0];
      const isPasswordMatch = await bcrypt.compare(password, password_hash);
  
      if (!isPasswordMatch) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
  
      const token = jwt.sign({ uid, email }, process.env.EMAIL_SECRET_KEY);
  
      res.status(200).json({
        message: 'Login successful',
        token,
        userId: uid,
        workspace: workspace || 'beta', 
      });
  
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
