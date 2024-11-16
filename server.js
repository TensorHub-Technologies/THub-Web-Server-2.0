const express = require("express");
const app = express();
const mysql = require("mysql2/promise");
const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { validatePaymentVerification } = require('razorpay/dist/utils/razorpay-utils');


const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const PORT = process.env.PORT || 8080;

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  port: process.env.DATABASE_PORT,
});

app.use(express.json());

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "https://thub-test-378678297066.us-central1.run.app",
      "https://thub-web-2-0-0-378678297066.us-central1.run.app",
      "http://test.thub.tech",
      "http://34.172.179.132:5001",
      "http://localhost:5173",
      "http://localhost:8080",
      "http://localhost:2000",
      "https://thub.tech",
      "https://beta.thub.tech",
    ];

    const regex = /^https?:\/\/([a-z0-9-]+\.)?thub\.tech$/;

    if (!origin || allowedOrigins.includes(origin) || regex.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
};

app.use(cors(corsOptions));

app.get("/", (req, res) => {
  const url = process.env.URL;
  res.status(200).send({ message: "Thub-Web-Server-2.0.....", url});
});

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
      `SELECT subscription_type FROM users WHERE email = ?`,
      [email]
    );

    let subscription_type = "free";

    if (rows.length > 0) {
      subscription_type = rows[0].subscription_type || "free";
    }

    if (rows.length === 0) {
      const insertUserQuery = `
        INSERT INTO users (uid, email, access_token, login_type, name, picture, subscription_type)
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
        UPDATE users 
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

    res.json({ id_token, access_token, user: payload, userId: userId });
  } catch (error) {
    console.error(
      "Error exchanging code:",
      error.response?.data || error.message
    );
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

    const { id, login, node_id, name, avatar_url, workspace } = data;

    const connection = await pool.getConnection();

    try {
      const [rows] = await connection.execute(
        "SELECT COUNT(*) as count FROM users WHERE email = ?",
        [login]
      );

      let userData;
      if (rows[0].count === 0) {
        const subscription_type = "free";
        const query = `
          INSERT INTO users 
          (uid, email, access_token, name, login_type, picture, subscription_type, workspace) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(query, [
          id,
          login,
          node_id,
          name,
          "github",
          avatar_url,
          subscription_type,
          workspace || null,
        ]);

        userData = {
          uid: id,
          email: login,
          access_token: node_id,
          name,
          login_type: "github",
          picture: avatar_url,
          subscription_type,
          workspace: workspace || null,
        };

        console.log("User data inserted successfully");
      } else {
        console.log("User already exists");

        const [existingUser] = await connection.execute(
          "SELECT * FROM users WHERE email = ?",
          [login]
        );
        userData = existingUser[0];
      }

      res.status(200).json(userData);
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
async function sendEmail({ recipient_email, OTP }) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.privateemail.com', 
    port: 465, 
    secure: true, 
    auth: {
      user: 'no-reply@thub.tech', 
      pass: process.env.NO_REPLY_MAIL_PASSWORD,
    },
  });
  

  const mailOptions = {
    from: "no-reply@thub.tech", 
    to: recipient_email, 
    subject: "Your OTP Code",
    html: `
    <p>Hi there,</p>
    <p>Your one-time password (OTP) for accessing THub.tech is:</p>
    <strong><span style="font-size: 18px;">${OTP}</span></strong>
    <p>This code will expire in 1 minutes.</p>
    <p>Please enter this code to verify your identity.</p>
    <p>Thanks,</p>
    <p>The THub Team</p>
  `,
  };

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        return reject(error);
      }
      console.log(`OTP sent to ${recipient_email}: ${info.response}`);
      resolve(info);
    });
  });
}

// Store for OTPs
const otpStore = new Map();

// Endpoint to check email existence
app.post("/check-email", async (req, res) => {
  try {
    const { email } = req.body;

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT COUNT(*) AS count FROM users WHERE email = ?`,
      [email]
    );
    connection.release();

    const emailExists = rows[0].count > 0;

    if (emailExists) {
      res.status(200).json({ exists: true });
    } else {
      res.status(200).json({ exists: false });
    }
  } catch (error) {
    console.error("Error checking email:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Endpoint to send OTP
app.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); 
  otpStore.set(email, otp); 

  console.log(`OTP for ${email}: ${otp}`); 

  try {
    await sendEmail({ recipient_email: email, OTP: otp }); 
    res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Error sending OTP email:", error);
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

// Endpoint to verify OTP
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  const storedOtp = otpStore.get(email);

  if (storedOtp === otp) {
    otpStore.delete(email); 
    res.status(200).json({ message: "OTP verified" });
  } else {
    res.status(400).json({ message: "Invalid OTP" });
  }
});

// Endpoint to register a user
app.post("/user", async (req, res) => {
  try {
    const { email, firstName, lastName, phone, password, login_type, subscription_type, subscription_duration, subscription_date, workspace } = req.body;

    const uid = generateRandomID();
    const name = `${firstName} ${lastName}`;
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);
    
    console.log("Inside server::user:", email, firstName, lastName, phone, password_hash, login_type, subscription_type, subscription_duration, subscription_date, workspace);

    const connection = await pool.getConnection();

    const insertUserQuery = `INSERT INTO users (uid, email, phone, login_type, name, password_hash, subscription_type, subscription_duration, subscription_date, workspace) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
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
      workspace || null,
    ]);
    res.status(200).json({ message: "User successfully added", userId: uid, workspace: null });
    connection.release();
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


app.post("/userdata", async (req, res) => {
  const { userId } = req.body;
  console.log(req.body, "****");

  try {
    const connection = await pool.getConnection();

    const fetchUser = `SELECT * FROM users WHERE uid = ?`;
    const user = await connection.execute(fetchUser, [userId]);
    connection.release();
    res.status(200).send(user[0]);
  } catch (error) { 
    console.error("Error creating new user:", error);
    res
      .status(500)
      .json({ message: "Error creating new user", error: error.message });
  }
});

// login register
app.post("/loginUser", async (req, res) => {
  const { email, password } = req.body;

  try {
    const connection = await pool.getConnection();

    // Query to get user data including workspace
    const [rows] = await connection.execute(
      `SELECT uid, email, password_hash, workspace 
         FROM users 
         WHERE email = ?`,
      [email]
    );
    connection.release();

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const { uid, password_hash, workspace } = rows[0];
    const isPasswordMatch = await bcrypt.compare(password, password_hash);

    if (!isPasswordMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign({ uid, email }, process.env.EMAIL_SECRET_KEY);

    res.status(200).json({
      message: "Login successful",
      token,
      userId: uid,
      workspace: workspace,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/updateUser", async (req, res) => {
  const { uid, department, role, designation, company, workspace } = req.body;
  try {
    const connection = await pool.getConnection();
    const updateUserQuery = `UPDATE users SET department = ?, role = ?, designation = ?, company = ?, workspace = ? WHERE uid = ?`;
    await connection.execute(updateUserQuery, [
      department,
      role,
      designation,
      company,
      workspace,
      uid,
    ]);
    connection.release();
    res.status(200).send({ message: "User data updated successfully" });
  } catch (error) {
    console.error("Error updating user data:", error);
    res
      .status(500)
      .json({ message: "Error updating user data", error: error.message });
  }
});

const transporter = nodemailer.createTransport({
  host: 'smtp.privateemail.com', 
  port: 465, 
  secure: true, 
  auth: {
    user: 'no-reply@thub.tech', 
    pass: process.env.NO_REPLY_MAIL_PASSWORD,
  },
});

app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const connection = await pool.getConnection();

    const [user] = await connection.execute(
      `SELECT uid FROM users WHERE email = ?`,
      [email]
    );

    if (user.length === 0) {
      connection.release();
      return res.status(404).json({ message: "User not found" });
    }

    const userId = user[0].uid;
    const resetToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiryDate = new Date(Date.now() + 3600000);
    const tokenExpiry = tokenExpiryDate
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    await connection.execute(
      `UPDATE users SET reset_token = ?, token_expiry = ? WHERE uid = ?`,
      [resetToken, tokenExpiry, userId]
    );

    connection.release();
    const apiUrl =
      process.env.NODE_ENV === "development"
        ? "http://localhost:5173"
        : "https://thub.tech";
    const resetURL = `${apiUrl}/auth/reset-password/${resetToken}?uid=${userId}`;

    await transporter.sendMail({
      from: 'no-reply@thub.tech', 
      to: email,
      subject: "Password Reset Request",
      text: `Please use the following link to reset your password: ${resetURL}`,
      html: `<p>Please use the following link to reset your password: <a href="${resetURL}">${resetURL}</a></p>`,
    });

    res.status(200).json({ message: "Password reset link sent" });
  } catch (error) {
    console.error("Error in forgot-password:", error);
    res.status(500).json({
      message: "Error sending password reset email",
      error: error.message,
    });
  }
});

app.post("/reset-password/:token", async (req, res) => {
  const { uid, newPassword } = req.body;
  const { token } = req.params;

  try {
    const connection = await pool.getConnection();

    // Fetch the user based on uid and token
    const [user] = await connection.execute(
      `SELECT token_expiry, reset_token FROM users WHERE uid = ? AND reset_token = ?`,
      [uid, token]
    );

    // Hash the new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await connection.execute(
      `UPDATE users SET password_hash = ?, reset_token = NULL, token_expiry = NULL WHERE uid = ?`,
      [hashedPassword, uid]
    );

    connection.release();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Error resetting password:", error);
    res
      .status(500)
      .json({ message: "Error resetting password", error: error.message });
  }
});
  
//razorpay Code
app.use(express.urlencoded({ extended: false }));

app.post('/create-subscription', async (req, res) => {
  console.log(req.body,"create-subscription")
  try {
    const razorpay = new Razorpay({
      key_id: "rzp_test_pMR0oNtQh7JOlN",
      key_secret: "mGm9bAlPYmCMSgyj49LyOeps",
    });
    
    const { planId, customerEmail } = req.body;
    let subscriptionType, duration;

    if (planId === 'plan_PKKqYOHRkFFVTZ') {
      subscriptionType = 'pro';
      duration = 'monthly';
    } else if (planId === 'plan_PKhfVyO6JCxaeR') {
      subscriptionType = 'pro';
      duration = 'yearly';
    } else {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    const interval = duration === 'monthly' ? 1 : 12;
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      total_count: interval,
      customer_notify: 1
    });

    res.json({
      id: subscription.id,
      status: subscription.status,
      message: 'Subscription created successfully',
      subscriptionType,
      duration
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});


// Validate subscription and store details
app.post('/validate-subscription', async (req, res) => {
  const {
    razorpay_subscription_id,
    razorpay_payment_id,
    razorpay_signature,
    planId,
    user_id
  } = req.body;

  try {
    const respBody = {
      subscription_id: razorpay_subscription_id,
      payment_id: razorpay_payment_id
    };
    
    const secret = "mGm9bAlPYmCMSgyj49LyOeps";

    // Validate the signature using Razorpay SDK function
    const isValid = validatePaymentVerification(respBody, razorpay_signature, secret);

    if (isValid) {
      // Signature is valid, proceed with your logic
      const subscription_date = new Date().toISOString().split('T')[0];
      const expiry_date = new Date(subscription_date);

      let subscriptionType;
      let duration;

      if (planId === 'plan_PKKqYOHRkFFVTZ') {
        subscriptionType = 'pro';
        duration = 'monthly';
        expiry_date.setMonth(expiry_date.getMonth() + 1);
      } else if (planId === 'plan_PKhfVyO6JCxaeR') {
        subscriptionType = 'pro';
        duration = 'yearly';
        expiry_date.setFullYear(expiry_date.getFullYear() + 1);
      } else {
        subscriptionType = 'free';
        duration = 'monthly';
      }

      // Database update for user's subscription
      const updateSubscriptionQuery = `
        UPDATE users
        SET 
          subscription_type = ?, 
          subscription_duration = ?, 
          subscription_date = ?, 
          expiry_date = ?, 
          subscription_status = 'active',
          razorpay_subscription_id = ? 
        WHERE uid = ?
      `;

      const connection = await pool.getConnection();
      await connection.execute(updateSubscriptionQuery, [
        subscriptionType,
        duration,
        subscription_date,
        expiry_date,
        razorpay_subscription_id,
        user_id
      ]);

      connection.release();

      res.json({ msg: 'success', subscriptionType });
    } else {
      res.status(400).json({ msg: 'Payment validation failed' });
    }
  } catch (error) {
    console.error('Error validating payment:', error);
    res.status(500).json({ error: 'Validation error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});