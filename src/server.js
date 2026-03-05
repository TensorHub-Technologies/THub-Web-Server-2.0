import express from "express";
import mysql from "mysql2/promise";
import { OAuth2Client } from "google-auth-library";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import transporter from "./config/mailer.js";

import "./routes/NotifyMail.js";

import imageUploadRoute from "./routes/ImageUpload.js";
import userUpdateRoute from "./routes/UpdateUser.js";
import enterpriceRoute from "./routes/EnterpriceMail.js";
import inviteRoute from "./routes/InviteUser.js";
import inviteRegister from "./routes/InviteRegister.js";
import paypalRoutes from "./routes/Paypal.js";
import paypalWebhookRoute from "./routes/PaypalWebHooks.js";
import createSubscriptionRoute from "./routes/CreateSubscription.js";
import validateSubscriptionRoute from "./routes/ValidateSubscription.js";
import payuPaymentRoute from "./routes/PayUMoneyRoutes.js";
import emailTriggerAgent from "./routes/AgentEmailTool.js";
import contactMail from "./routes/ContactMail.js";
import {schedulerAgent,scheduleJob} from "./routes/SchedulerAgent.js";
import studentEnroll from "./routes/StudentEnroll.js";
import createCourseOrderRoute from "./routes/CreateCourseOrder.js";
import verifyCoursePaymentRoute from "./routes/VerifyCoursePayment.js";
import { sendInviteEmail } from "./config/sendInviteEmail.js";


dotenv.config();

const app = express();


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
      "https://thub-app.wittysand-a4a5c89d.westus2.azurecontainerapps.io",
      "https://thub-web-2-0-0-378678297066.us-central1.run.app",
      "https://textiletradebuddy-web-378678297066.us-central1.run.app",
      "https://textiletradebuddy-app-378678297066.us-central1.run.app",
      "http://test.thub.tech",
      "http://34.172.179.132:5001",
      "http://localhost:5173",
      "http://localhost:8080",
      "http://localhost:2000",
      "https://thub.tech",
      "https://beta.thub.tech",
      "http://35.193.70.249",
      "http://34.122.113.191",
      "http://20.207.65.5:3000",
      "https://thub-app-beta-378678297066.us-central1.run.app",
      "http://35.224.113.191",
      "http://34.31.158.201",
      "https://textiletradebuddy-app-378678297066.us-central1.run.app/",
      "https://thub-web-demo-378678297066.europe-west1.run.app",
      "https://thub-server.wittycoast-8619cdd6.westus2.azurecontainerapps.io",
      "https://thub-app.calmisland-c4dd80be.westus2.azurecontainerapps.io",
      "https://thub-web.calmisland-c4dd80be.westus2.azurecontainerapps.io",
      "https://thub-app-ded.wittysand-a4a5c89d.westus2.azurecontainerapps.io",
      "https://thub-web.lemonpond-e68ea8b7.westus2.azurecontainerapps.io",
      "https://thub-app.lemonpond-e68ea8b7.westus2.azurecontainerapps.io"
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

app.use(express.urlencoded({ extended: false }));
console.log('Server timezone:', new Date().toString());

// enterprice route
app.use("/enterprice-mail", enterpriceRoute)

// imageUpload route
app.use("/api/image-upload", imageUploadRoute)

// update user fields
app.use("/api/users/update", userUpdateRoute)

// invite user to workspace
app.use("/api/invite", inviteRoute)

// invite Register user
app.use("/user/invite/register", inviteRegister)

// paypal subscription
app.use("/api/paypal/subscription", paypalRoutes)

// paypal webhook 
app.use("/paypal/webhook", paypalWebhookRoute)

// razorpay subscription
app.use("/create-subscription", createSubscriptionRoute)

app.use("/validate-subscription", validateSubscriptionRoute)

// payu money
app.use("/api/payments", payuPaymentRoute)

// agent email trigger
app.use("/api/agent/email", emailTriggerAgent)


app.use("/api/contactmail", contactMail)

// agent scheduler
app.use("/api/schedules", schedulerAgent)

// user course enroll
app.use("/api/student-enroll", studentEnroll)
// subscription
app.use("/api/create-course-order", createCourseOrderRoute)

// course verify
app.use("/api/verify-course-payment", verifyCoursePaymentRoute)

async function loadScheduledJobs() {
  const [jobs] = await pool.query('SELECT * FROM scheduled_jobs WHERE status = "active"');
  jobs.forEach(scheduleJob);
}

app.get("/", (req, res) => {
  const url = process.env.URL;
  res.status(200).send({ message: "Server running.....", url });
});

app.post("/getProUsers", async (req, res) => {

  const { proUserId } = req.body;
  const connection = await pool.getConnection();

  const [rows] = await connection.execute(`SELECT count(1) as Count FROM users WHERE pro_user_id LIKE '%${proUserId}%'`);
  connection.release();

  res.status(200).json(rows[0].Count);
});

app.post("/proUsers", async (req, res) => {

  const { userDomain } = req.body;
  const connection = await pool.getConnection();

  const [rows] = await connection.execute(`SELECT count(1) as Count FROM users u Inner Join chat_flow c on c.tenantId = u.uid WHERE email LIKE '%${userDomain}%'`);
  connection.release();

  res.status(200).json(rows[0].Count);
});

app.post("/api/auth/google", async (req, res) => {
  const { code } = req.body;

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

    const userId = payload["sub"];
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;

    const connection = await pool.getConnection();

    const [rows] = await connection.execute(
      `SELECT subscription_type, expiry_date, workspace, login_type FROM users WHERE email = ?`,
      [email]
    );

    let subscription_type = "free";
    let expiry_date = null;
    let workspace = null;
    let isNewUser = false;

    const current_date = new Date();
    const subscription_date = current_date.toISOString().split("T")[0];
    const subscription_status = "active";

    if (rows.length > 0) {
      const existing_login_type = rows[0].login_type;
      console.log("Existing login type:", existing_login_type);
      if (existing_login_type !== "google") {
        // User is already registered with a different method
        return res.status(400).json({
          success: false,
          message: `This email is already registered using ${existing_login_type}. Please log in using ${existing_login_type}.`
        });
      }
      subscription_type = rows[0].subscription_type;
      expiry_date = rows[0].expiry_date;
      workspace = rows[0].workspace;

    } else {
      isNewUser = true;
      const expiryDateObj = new Date(subscription_date);
      expiryDateObj.setDate(expiryDateObj.getDate() + 90);
      expiry_date = expiryDateObj.toISOString().split("T")[0];
    }

    if (isNewUser) {
      const insertUserQuery = `
        INSERT INTO users (uid, email, access_token, login_type, name, picture, subscription_type, subscription_date, expiry_date, subscription_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await connection.execute(insertUserQuery, [
        userId,
        email,
        access_token,
        "google",
        name,
        picture,
        subscription_type,
        subscription_date,
        expiry_date,
        subscription_status,
      ]);
    } else {
      const updateUserQuery = `
        UPDATE users 
        SET access_token = ?, login_type = ?, name = ?, picture = ?, subscription_status = ?
        WHERE email = ?
      `;
      await connection.execute(updateUserQuery, [
        access_token,
        "google",
        name,
        picture,
        subscription_status,
        email,
      ]);
    }

    connection.release();

    if (isNewUser) {
      const mailOptions = {
        from: '"THub" <no-reply@thub.tech>',
        to: email,
        subject: "Welcome to THub!",
        text: `Hi ${name},\n\nWelcome to THub! We're excited to have you onboard. Explore our platform and get the most out of your subscription.\n\nBest regards,\nThe THub Team`,
        html: `<p>Hi <strong>${name}</strong>,</p>
               <p>Welcome to THub! We're excited to have you onboard. Explore our platform and get the most out of your subscription.</p>
               <p>Best regards,<br>The THub Team</p>`,
      };


      try {
        await transporter.sendMail(mailOptions);
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError.message);
      }
    }

    res.json({
      id_token,
      access_token,
      user: payload,
      userId: userId,
      subscription_type,
      expiry_date,
      workspace,
    });
  } catch (error) {
    console.error("Error exchanging code:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to exchange code" });
  }
});

app.post("/microuser", async (req, res) => {
  try {
    const {
      uid,
      email,
      name,
      phone,
      login_type,
      subscription_type,
      subscription_duration,
      subscription_date,
      workspace,
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const current_date = new Date();
    const effective_subscription_date = subscription_date || current_date.toISOString().split("T")[0];
    let expiry_date = null;
    const subscription_status = "active";

    if (subscription_type === "free") {
      const expiryDateObj = new Date(effective_subscription_date);
      expiryDateObj.setDate(expiryDateObj.getDate() + 90);
      expiry_date = expiryDateObj.toISOString().split("T")[0];
    }

    const connection = await pool.getConnection();

    // Check if the user exists
    const [rows] = await connection.execute(
      `SELECT * FROM users WHERE email = ?`,
      [email]
    );

    if (rows.length > 0) {
      const existingUser = rows[0];

      // Check if login type matches
      if (existingUser.login_type !== login_type) {
        await connection.release();
        return res.status(400).json({
          message: `This email is already registered using ${existingUser.login_type}. Please use ${existingUser.login_type} login.`,
          login_type: existingUser.login_type,
        });
      }

      await connection.release();
      return res.status(200).json({
        message: "User already exists",
        user: existingUser,
      });
    }
    const insertUserQuery = `
      INSERT INTO users (
        uid, email, phone, name, 
        login_type, subscription_type, subscription_duration, 
        subscription_date, expiry_date, subscription_status, workspace
      ) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await connection.execute(insertUserQuery, [
      uid || null,
      email,
      phone || null,
      name || null,
      login_type,
      subscription_type || "free",
      subscription_duration || null,
      effective_subscription_date,
      expiry_date,
      subscription_status,
      workspace || null,
    ]);

    const newUser = {
      uid: uid || null,
      email,
      phone: phone || null,
      name: name || null,
      login_type,
      subscription_type: subscription_type || "free",
      subscription_duration: subscription_duration || null,
      subscription_date: effective_subscription_date,
      expiry_date,
      subscription_status,
      workspace: workspace || null,
    };

    const mailOptions = {
      from: '"THub" <no-reply@thub.tech>',
      to: email,
      subject: "Welcome to THub!",
      text: `Hi ${name},\n\nWelcome to THub! We're excited to have you onboard. Explore our platform and get the most out of your subscription.\n\nBest regards,\nThe THub Team`,
      html: `<p>Hi <strong>${name}</strong>,</p>
             <p>Welcome to THub! We're excited to have you onboard. Explore our platform and get the most out of your subscription.</p>
             <p>Best regards,<br>The THub Team</p>`,
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error("Failed to send welcome email:", {
        errorMessage: emailError.message,
        stack: emailError.stack,
      });
    }

    await connection.release();

    res.json({
      message: "User created successfully",
      user: newUser,
    });
  } catch (error) {
    console.error("Error handling /microuser request:", {
      errorMessage: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "Failed to process request" });
  }
});

// github
app.get("/getAccessToken", async (req, res) => {
  const headersSymbol = Object.getOwnPropertySymbols(req).find(sym => sym.toString() === 'Symbol(kHeaders)');
  let origin;
  if (headersSymbol) {
    const headers = req[headersSymbol];
    origin = headers?.origin;
  } else {
    console.log("Symbol(kHeaders) not found in req");
  }

  console.log(origin, "origin", process.env.GITHUB_CLIENT_ID_DEMO);


  try {
    let params;
    if (origin === "http://localhost:8080") {
      params = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID_LOCAL,
        client_secret: process.env.GITHUB_CLIENT_SECRET_LOCAL,
        code: req.query.code,
      });
    } else if (origin === "https://app.thub.tech") {
      params = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID_APP,
        client_secret: process.env.GITHUB_CLIENT_SECRET_APP,
        code: req.query.code,
      });
    } else if (origin === "https://demo.thub.tech") {
      params = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID_DEMO,
        client_secret: process.env.GITHUB_CLIENT_SECRET_DEMO,
        code: req.query.code,
      });
    } else {
      return res.status(400).json({ error: "Invalid Github hostname" });
    }
    console.log(params.toString(), "params");

    const { data } = await axios.post(
      "https://github.com/login/oauth/access_token",
      params.toString(),
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (data.error) {
      console.error("GitHub OAuth error:", data.error_description);
      return res.status(500).json({ error: data.error_description });
    }

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

    const { id, login, node_id, name, avatar_url, workspace } = data;

    const connection = await pool.getConnection();

    try {
      const current_date = new Date();
      const effective_subscription_date = current_date.toISOString().split("T")[0];

      // Default values for new users
      const subscription_type = "free";
      const subscription_status = "active";
      const expiryDateObj = new Date(effective_subscription_date);
      expiryDateObj.setDate(expiryDateObj.getDate() + 90);
      const expiry_date = expiryDateObj.toISOString().split("T")[0];

      // Use INSERT ... ON DUPLICATE KEY UPDATE to handle both insert and update
      const query = `
        INSERT INTO users 
        (uid, email, access_token, name, login_type, picture, subscription_type, subscription_status, subscription_date, expiry_date, workspace) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        email = VALUES(email),
        name = VALUES(name),
        picture = VALUES(picture)
      `;

      await connection.execute(query, [
        id,
        login,
        node_id,
        name,
        "github",
        avatar_url,
        subscription_type,
        subscription_status,
        effective_subscription_date,
        expiry_date,
        workspace || null,
      ]);

      // Fetch the final user data
      const [userResult] = await connection.execute(
        "SELECT * FROM users WHERE uid = ?",
        [id]
      );

      const userData = userResult[0];

      res.status(200).json({
        uid: userData.uid,
        email: userData.email,
        access_token: userData.access_token,
        name: userData.name,
        login_type: userData.login_type,
        picture: userData.picture,
        subscription_type: userData.subscription_type,
        subscription_status: userData.subscription_status,
        subscription_date: userData.subscription_date,
        expiry_date: userData.expiry_date,
        workspace: userData.workspace,
      });

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
  console.log(recipient_email);
  const mailOptions = {
    from: '"THub" <no-reply@thub.tech>',
    to: recipient_email,
    subject: "Your OTP Code",
    html: `
      <p>Hi there,</p>
      <p>Your one-time password (OTP) for accessing THub.tech is:</p>
      <strong><span style="font-size: 18px;">${OTP}</span></strong>
      <p>This code will expire in 5 minutes.</p>
      <p>Please enter this code to verify your identity.</p>
      <p>Thanks,</p>
      <p>The THub Team</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error };
  }
}

// Store for OTPs
const otpStore = new Map();

// Endpoint to check email existence
app.post("/check-email", async (req, res) => {
  try {
    const { email } = req.body;

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT login_type FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    connection.release();

    if (rows.length > 0) {
      const loginType = rows[0].login_type;
      res.status(200).json({ exists: true, login_type: loginType });
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
app.post("/user/register", async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      phone,
      password,
      login_type,
      subscription_type,
      subscription_duration,
      subscription_date
    } = req.body;

    const uid = generateRandomID();
    const name = `${firstName} ${lastName}`;
    const password_hash = await bcrypt.hash(password, 10);

    const effectiveDate =
      subscription_date || new Date().toISOString().split("T")[0];

    let expiry_date = null;
    if (subscription_type === "free") {
      const d = new Date(effectiveDate);
      d.setDate(d.getDate() + 90);
      expiry_date = d.toISOString().split("T")[0];
    }

    const connection = await pool.getConnection();

    await connection.execute(
      `
      INSERT INTO users (
        uid, email, phone, login_type, name, password_hash,
        subscription_type, subscription_duration, subscription_date,
        expiry_date, subscription_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `,
      [
        uid,
        email,
        phone,
        login_type,
        name,
        password_hash,
        subscription_type || "free",
        subscription_duration || null,
        effectiveDate,
        expiry_date
      ]
    );

    connection.release();

    res.json({
      message: "User registered",
      userId: uid,
      email,
      name
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Registration failed" });
  }
});


app.get('/userdata', async (req, res) => {
  const { userId } = req.query

  try {
    const connection = await pool.getConnection()

    const [rows] = await connection.execute(
      `SELECT
        uid,
        email,
        name,
        picture,
        login_type,
        subscription_type,
        subscription_duration,
        subscription_date,
        expiry_date,
        role,
        workspace,
        workspaceUid,
        profile_completed
      FROM users
      WHERE uid = ?`,
      [userId]
    )

    connection.release()

    if (!rows.length) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json(rows[0])
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})


// login register
app.post("/loginUser", async (req, res) => {
  const { email, password } = req.body;

  try {
    const connection = await pool.getConnection();

    const [rows] = await connection.execute(
      `SELECT uid, email, password_hash, workspace, login_type 
       FROM users 
       WHERE email = ?`,
      [email]
    );
    connection.release();

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const { uid, password_hash, workspace, login_type } = rows[0];

    if (login_type !== "email") {
      return res.status(400).json({
        message: `This email is registered using ${login_type}. Please use ${login_type} login.`
      });
    }

    const isPasswordMatch = await bcrypt.compare(password, password_hash);

    if (!isPasswordMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // const token = jwt.sign({ uid, email }, process.env.EMAIL_SECRET_KEY);
    console.log(workspace, "workspace")
    res.status(200).json({
      message: "Login successful",
      userId: uid,
      workspace: workspace,
      email: email
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// update user (FINAL)
app.post('/updateUser', async (req, res) => {
  const {
    uid,
    company,
    department,
    designation,
    workspace,
    profileCompletedOnly
  } = req.body

  if (!uid) {
    return res.status(400).json({ message: 'UID required' })
  }

  const connection = await pool.getConnection()

  try {
    // -----------------------------
    // 1️⃣ PROFILE SKIP
    // -----------------------------
    if (profileCompletedOnly) {
      await connection.execute(
        `UPDATE users
         SET profile_skipped = 1,
             profile_completed = 1
         WHERE uid = ?`,
        [uid]
      )

      return res.json({ message: 'Profile skipped' })
    }

    if (!company || !department || !designation) {
      return res.status(400).json({ message: 'All profile fields required' })
    }

    // -----------------------------
    // 2️⃣ FETCH USER (CRITICAL)
    // -----------------------------
    const [[user]] = await connection.execute(
      `SELECT uid, workspaceUid, role FROM users WHERE uid = ?`,
      [uid]
    )

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // -----------------------------
    // 3️⃣ USER ALREADY IN WORKSPACE
    // (INVITE WAS ACCEPTED EARLIER)
    // -----------------------------
    if (user.workspaceUid) {
      await connection.execute(
        `UPDATE users
         SET company = ?,
             department = ?,
             designation = ?,
             profile_completed = 1,
             profile_skipped = 0
         WHERE uid = ?`,
        [company, department, designation, uid]
      )

      return res.json({ message: 'Profile updated' })
    }

    if (!workspace) {
      return res.status(400).json({ message: 'Workspace required' })
    }

    const workspaceName = workspace.toLowerCase().trim()

    // -----------------------------
    // 4️⃣ CHECK WORKSPACE
    // -----------------------------
    const [[existingWorkspace]] = await connection.execute(
      `SELECT id FROM workspaces WHERE name = ?`,
      [workspaceName]
    )

    await connection.beginTransaction()

    // -----------------------------
    // 5️⃣ INVITED USER JOIN
    // -----------------------------
    if (existingWorkspace) {
      const workspaceId = existingWorkspace.id

      await connection.execute(
        `INSERT INTO workspace_users (workspace_id, user_id, role)
         VALUES (?, ?, 'member')`,
        [workspaceId, uid]
      )

      await connection.execute(
        `UPDATE users
         SET company = ?,
             department = ?,
             designation = ?,
             workspace = ?,
             workspaceUid = ?,
             role = 'member',
             profile_completed = 1,
             profile_skipped = 0
         WHERE uid = ?`,
        [
          company,
          department,
          designation,
          workspaceName,
          workspaceId,
          uid
        ]
      )

      await connection.commit()
      return res.json({ message: 'Joined workspace' })
    }

    // -----------------------------
    // 6️⃣ FIRST USER → CREATE WORKSPACE
    // -----------------------------
    const workspaceId = uuidv4()

    await connection.execute(
      `INSERT INTO workspaces (id, name, created_by)
       VALUES (?, ?, ?)`,
      [workspaceId, workspaceName, uid]
    )

    await connection.execute(
      `INSERT INTO workspace_users (workspace_id, user_id, role)
       VALUES (?, ?, 'admin')`,
      [workspaceId, uid]
    )

    await connection.execute(
      `UPDATE users
       SET company = ?,
           department = ?,
           designation = ?,
           workspace = ?,
           workspaceUid = ?,
           role = 'admin',
           profile_completed = 1,
           profile_skipped = 0
       WHERE uid = ?`,
      [
        company,
        department,
        designation,
        workspaceName,
        workspaceId,
        uid
      ]
    )

    await connection.commit()
    return res.json({ message: 'Workspace created' })

  } catch (e) {
    await connection.rollback()
    console.error(e)
    res.status(500).json({ message: e.message })
  } finally {
    connection.release()
  }
})




app.post('/inviteUser', async (req, res) => {
  const { email, workspace, invitedBy, role = 'member' } = req.body;

  if (!email || !workspace || !invitedBy) {
    return res.status(400).json({ message: 'Missing fields' });
  }

  const workspaceName = workspace.toLowerCase().trim();
  const token = crypto.randomBytes(32).toString('hex');
  const inviteId = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const baseUrl =
    process.env.INVITE_BASE_URL || 'http://localhost:8080/accept-invite';
  const inviteLink = `${baseUrl}?token=${token}`;

  let connection;
  try {
    connection = await pool.getConnection();

    // 1️⃣ Get workspace
    const [ws] = await connection.execute(
      `SELECT id FROM workspaces WHERE name = ?`,
      [workspaceName]
    );

    if (!ws.length) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const workspaceId = ws[0].id;

    // 2️⃣ Admin check
    const [admin] = await connection.execute(
      `SELECT role FROM workspace_users
       WHERE workspace_id = ? AND user_id = ?`,
      [workspaceId, invitedBy]
    );

    if (!admin.length || admin[0].role !== 'admin') {
      return res.status(403).json({ message: 'Only admin can invite users' });
    }

    // 3️⃣ Prevent duplicate invites
    const [existingInvite] = await connection.execute(
      `SELECT 1 FROM workspace_invites
       WHERE email = ? AND workspace_id = ? AND used = FALSE`,
      [email, workspaceId]
    );

    if (existingInvite.length) {
      return res.status(409).json({ message: 'Invite already sent' });
    }

    // 4️⃣ Prevent inviting existing members
    const [existingUser] = await connection.execute(
      `SELECT 1 FROM users
       WHERE email = ? AND workspaceUid = ?`,
      [email, workspaceId]
    );

    if (existingUser.length) {
      return res.status(409).json({ message: 'User already in workspace' });
    }

    // 5️⃣ Save invite
    await connection.execute(
      `INSERT INTO workspace_invites
       (id, email, workspace_id, workspace_name, role, token, invited_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [inviteId, email, workspaceId, workspaceName, role, token, invitedBy, expiresAt]
    );

    // 6️⃣ Send email
    await sendInviteEmail({
      to: email,
      inviteLink,
      workspace: workspaceName
    });

    res.json({ message: 'Invite sent successfully' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  } finally {
    if (connection) connection.release();
  }
});



app.get('/invite/validate', async (req, res) => {
  const { token } = req.query;
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.execute(
      `SELECT email, workspace_name, role, invited_by, used, expires_at
       FROM workspace_invites
       WHERE token = ?`,
      [token]
    );

    if (!rows.length) {
      return res.status(404).json({ valid: false });
    }

    const invite = rows[0];

    if (invite.used || new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ valid: false });
    }

    res.json({
      valid: true,
      email: invite.email,
      workspace: invite.workspace_name,
      role: invite.role,
      invitedBy: invite.invited_by
    });
  } finally {
    connection.release();
  }
});




app.post("/invite/accept", async (req, res) => {
  const { token, uid, email } = req.body;
  const connection = await pool.getConnection();

  try {
    const [invites] = await connection.execute(
      `SELECT *
       FROM workspace_invites
       WHERE token = ?
         AND used = FALSE
         AND expires_at > NOW()`,
      [token]
    );

    if (!invites.length) {
      return res.status(400).json({ message: "Invalid invite" });
    }

    const invite = invites[0];

    if (invite.email !== email) {
      return res.status(403).json({ message: "Email mismatch" });
    }

    const [exists] = await connection.execute(
      `SELECT 1 FROM workspace_users
       WHERE workspace_id = ? AND user_id = ?`,
      [invite.workspace_id, uid]
    );

    if (exists.length) {
      return res.json({ message: "Already joined" });
    }

    await connection.beginTransaction();

    // 1️⃣ Add to workspace_users
    await connection.execute(
      `INSERT INTO workspace_users (workspace_id, user_id, role)
       VALUES (?, ?, ?)`,
      [invite.workspace_id, uid, invite.role]
    );

    // 2️⃣ Sync users table (CRITICAL)
    await connection.execute(
      `UPDATE users
       SET workspaceUid = ?,
           workspace = ?,
           role = ?,
           profile_completed = 1,
           profile_skipped = 0
       WHERE uid = ?`,
      [
        invite.workspace_id,
        invite.workspace_name,
        invite.role,
        uid
      ]
    );

    // 3️⃣ Mark invite as used
    await connection.execute(
      `UPDATE workspace_invites
       SET used = TRUE
       WHERE token = ?`,
      [token]
    );

    await connection.commit();

    res.json({ message: "Joined workspace successfully" });

  } catch (e) {
    await connection.rollback();
    res.status(500).json({ message: e.message });
  } finally {
    connection.release();
  }
});



app.get("/invite/validate", async (req, res) => {
  const { token } = req.query;
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.execute(
      `SELECT email, workspace_name, role, invited_by, used, expires_at
       FROM workspace_invites
       WHERE token = ?`,
      [token]
    );

    if (!rows.length) {
      return res.status(404).json({ valid: false });
    }

    const invite = rows[0];

    if (invite.used || new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ valid: false });
    }

    res.json({
      valid: true,
      email: invite.email,
      workspace: invite.workspace_name,
      role: invite.role,
      invitedBy: invite.invited_by   // ✅ NOW WORKS
    });
  } finally {
    connection.release();
  }
});



app.post('/invite/accept', async (req, res) => {
  const { token, uid, email } = req.body;
  const connection = await pool.getConnection();

  try {
    const [invites] = await connection.execute(
      `SELECT *
       FROM workspace_invites
       WHERE token = ?
         AND expires_at > NOW()`,
      [token]
    );

    if (!invites.length) {
      return res.status(400).json({ message: 'Invalid invite' });
    }

    const invite = invites[0];

    if (invite.used) {
      return res.json({ message: 'Already joined' });
    }

    if (invite.email !== email) {
      return res.status(403).json({ message: 'Email mismatch' });
    }

    await connection.beginTransaction();

    // 1️⃣ Prevent duplicate workspace_users entry
    const [exists] = await connection.execute(
      `SELECT 1 FROM workspace_users
       WHERE workspace_id = ? AND user_id = ?`,
      [invite.workspace_id, uid]
    );

    if (!exists.length) {
      await connection.execute(
        `INSERT INTO workspace_users (workspace_id, user_id, role)
         VALUES (?, ?, ?)`,
        [invite.workspace_id, uid, invite.role]
      );
    }

    // 2️⃣ Sync users table
    await connection.execute(
      `UPDATE users
       SET workspaceUid = ?,
           workspace = ?,
           role = ?,
           profile_completed = 1,
           profile_skipped = 0
       WHERE uid = ?`,
      [invite.workspace_id, invite.workspace_name, invite.role, uid]
    );

    // 3️⃣ Mark invite used
    await connection.execute(
      `UPDATE workspace_invites SET used = TRUE WHERE token = ?`,
      [token]
    );

    await connection.commit();

    res.json({ message: 'Joined workspace successfully' });
  } catch (e) {
    await connection.rollback();
    res.status(500).json({ message: e.message });
  } finally {
    connection.release();
  }
});





app.get('/workspaceUsers', async (req, res) => {
  const { workspace } = req.query

  if (!workspace) {
    return res.status(400).json({ message: 'Workspace required' })
  }

  const workspaceName = workspace.toLowerCase().trim()
  let connection

  try {
    connection = await pool.getConnection()

    // 1️⃣ Get workspace id
    const [ws] = await connection.execute(
      `SELECT id FROM workspaces WHERE name = ?`,
      [workspaceName]
    )

    if (!ws.length) {
      return res.status(404).json({ message: 'Workspace not found' })
    }

    const workspaceId = ws[0].id

    // 2️⃣ Fetch users
    const [users] = await connection.execute(
      `
      SELECT
        u.uid,
        u.name,
        u.company,
        u.department,
        u.designation,
        wu.role
      FROM workspace_users wu
      JOIN users u ON u.uid = wu.user_id
      WHERE wu.workspace_id = ?
      ORDER BY wu.role DESC, u.name
      `,
      [workspaceId]
    )

    return res.json(users)

  } catch (error) {
    console.error('workspaceUsers error:', error)
    return res.status(500).json({
      message: 'Failed to fetch users'
    })
  } finally {
    if (connection) connection.release()
  }
})


app.delete('/workspaceUser', async (req, res) => {
  const { userId, workspace } = req.body

  if (!userId || !workspace) {
    return res.status(400).json({ message: 'Invalid request' })
  }

  const workspaceName = workspace.toLowerCase().trim()
  let connection

  try {
    connection = await pool.getConnection()

    const [ws] = await connection.execute(
      `SELECT id FROM workspaces WHERE name = ?`,
      [workspaceName]
    )

    if (!ws.length) {
      return res.status(404).json({ message: 'Workspace not found' })
    }

    const workspaceId = ws[0].id

    const [roleRow] = await connection.execute(
      `
      SELECT role FROM workspace_users
      WHERE user_id = ? AND workspace_id = ?
      `,
      [userId, workspaceId]
    )

    if (!roleRow.length) {
      return res.status(404).json({ message: 'User not in workspace' })
    }

    if (roleRow[0].role === 'admin') {
      return res.status(403).json({ message: 'Admin cannot be removed' })
    }

    // ✅ Remove from workspace_users
    await connection.execute(
      `
      DELETE FROM workspace_users
      WHERE user_id = ? AND workspace_id = ?
      `,
      [userId, workspaceId]
    )

    // ✅ Reset user → make them NEW USER
    await connection.execute(
      `
      UPDATE users
      SET
        department = NULL,
        role = NULL,
        designation = NULL,
        workspace = NULL,
        company = NULL,
        workspaceUid = NULL,
        profile_completed = 0,
        profile_skipped = 0
      WHERE uid = ?
      `,
      [userId]
    )

    return res.json({ message: 'User removed and reset successfully' })

  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Delete failed' })
  } finally {
    if (connection) connection.release()
  }
})




app.patch('/workspaceUser/role', async (req, res) => {
  const { userId, role, workspace } = req.body;

  if (!userId || !role || !workspace) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const workspaceName = workspace.toLowerCase().trim();
  let connection;

  try {
    connection = await pool.getConnection();

    // 1️⃣ Get workspace ID
    const [workspaceRows] = await connection.execute(
      'SELECT id FROM workspaces WHERE name = ?',
      [workspaceName]
    );

    if (workspaceRows.length === 0) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const workspaceId = workspaceRows[0].id;

    // 2️⃣ Get current admin
    const [adminRows] = await connection.execute(
      `SELECT user_id FROM workspace_users
       WHERE workspace_id = ? AND role = 'admin'`,
      [workspaceId]
    );

    if (adminRows.length === 0) {
      return res.status(403).json({ message: 'No admin found' });
    }

    const adminId = adminRows[0].user_id;

    // 3️⃣ Prevent admin demoting himself
    if (adminId === userId && role !== 'admin') {
      return res.status(403).json({
        message: 'Admin cannot change his own role'
      });
    }

    // 4️⃣ Update role
    await connection.execute(
      `UPDATE workspace_users
       SET role = ?
       WHERE user_id = ? AND workspace_id = ?`,
      [role, userId, workspaceId]
    );

    // 5️⃣ Sync users table
    await connection.execute(
      `UPDATE users SET role = ? WHERE uid = ?`,
      [role, userId]
    );

    return res.status(200).json({
      message: 'User role updated successfully'
    });

  } catch (error) {
    console.error('Role update error:', error);
    return res.status(500).json({
      message: 'Failed to update role',
      error: error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

app.post('/workspaceUser/transfer-admin', async (req, res) => {
  const { fromUserId, toUserId, workspace } = req.body

  if (!fromUserId || !toUserId || !workspace) {
    return res.status(400).json({ message: 'Missing fields' })
  }

  const workspaceName = workspace.toLowerCase().trim()
  let connection

  try {
    connection = await pool.getConnection()

    const [ws] = await connection.execute(
      `SELECT id FROM workspaces WHERE name = ?`,
      [workspaceName]
    )

    if (!ws.length) {
      return res.status(404).json({ message: 'Workspace not found' })
    }

    const workspaceId = ws[0].id

    // Verify admin
    const [admin] = await connection.execute(
      `
      SELECT role FROM workspace_users
      WHERE user_id = ? AND workspace_id = ?
      `,
      [fromUserId, workspaceId]
    )

    if (!admin.length || admin[0].role !== 'admin') {
      return res.status(403).json({ message: 'Only admin can transfer ownership' })
    }

    await connection.beginTransaction()

    // Old admin → member
    await connection.execute(
      `
      UPDATE workspace_users
      SET role = 'member'
      WHERE user_id = ? AND workspace_id = ?
      `,
      [fromUserId, workspaceId]
    )

    // New admin
    await connection.execute(
      `
      UPDATE workspace_users
      SET role = 'admin'
      WHERE user_id = ? AND workspace_id = ?
      `,
      [toUserId, workspaceId]
    )

    // Sync users table
    await connection.execute(
      `UPDATE users SET role = 'member' WHERE uid = ?`,
      [fromUserId]
    )

    await connection.execute(
      `UPDATE users SET role = 'admin' WHERE uid = ?`,
      [toUserId]
    )

    await connection.commit()

    return res.json({ message: 'Admin transferred successfully' })

  } catch (error) {
    await connection.rollback()
    return res.status(500).json({ message: error.message })
  } finally {
    if (connection) connection.release()
  }
})


app.get('/superadmin/workspaces', async (req, res) => {
  const { uid } = req.query

  try {
    const connection = await pool.getConnection()

    // verify superadmin
    const [admin] = await connection.execute(
      `SELECT role FROM users WHERE uid=?`,
      [uid]
    )

    if (!admin.length || admin[0].role !== 'superadmin') {
      connection.release()
      return res.status(403).json({ message: 'Not allowed' })
    }

    const [rows] = await connection.execute(`
      SELECT 
        w.id AS workspaceId,
        w.name AS workspace,
        u.email AS adminEmail,
        u.name AS adminName,
        w.created_at
      FROM workspaces w
      JOIN workspace_users wu ON wu.workspace_id = w.id AND wu.role = 'admin'
      JOIN users u ON u.uid = wu.user_id
      ORDER BY w.created_at DESC
    `)

    connection.release()
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

app.delete('/superadmin/workspace', async (req, res) => {
  const { uid, workspaceId } = req.body

  const connection = await pool.getConnection()

  try {
    // Verify superadmin
    const [admin] = await connection.execute(
      `SELECT role FROM users WHERE uid=?`,
      [uid]
    )

    if (!admin.length || admin[0].role !== 'superadmin') {
      connection.release()
      return res.status(403).json({ message: 'Not allowed' })
    }

    await connection.beginTransaction()

    // Remove users from workspace
    await connection.execute(
      `DELETE FROM workspace_users WHERE workspace_id=?`,
      [workspaceId]
    )

    // Clear users workspace fields
    await connection.execute(
      `UPDATE users SET workspace=NULL, workspaceUid=NULL, role='member'
       WHERE workspaceUid=?`,
      [workspaceId]
    )

    // Delete workspace
    await connection.execute(
      `DELETE FROM workspaces WHERE id=?`,
      [workspaceId]
    )

    await connection.commit()
    res.json({ message: 'Workspace deleted' })
  } catch (e) {
    await connection.rollback()
    res.status(500).json({ message: e.message })
  } finally {
    connection.release()
  }
})


// const transporter = nodemailer.createTransport({
//   host: 'smtp.privateemail.com',
//   port: 465,
//   secure: true,
//   auth: {
//     user: 'no-reply@thub.tech',
//     pass: process.env.NO_REPLY_MAIL_PASSWORD,
//   },
// });

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
        : "http://localhost:5173";
    const resetURL = `${apiUrl}/auth/reset-password/${resetToken}?uid=${userId}`;

    await transporter.sendMail({
      from: '"THub" <no-reply@thub.tech>',
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

    const [user] = await connection.execute(
      `SELECT token_expiry, reset_token, password_hash FROM users WHERE uid = ? AND reset_token = ?`,
      [uid, token]
    );

    if (user.length === 0) {
      connection.release();
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // ✅ Compare using UTC timestamps directly in MySQL — avoids timezone issues entirely
    const [tokenCheck] = await connection.execute(
      `SELECT CASE WHEN token_expiry > UTC_TIMESTAMP() THEN 1 ELSE 0 END AS is_valid FROM users WHERE uid = ?`,
      [uid]
    );

    if (!tokenCheck[0].is_valid) {
      connection.release();
      return res.status(400).json({ message: "Reset token has expired" });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user[0].password_hash);
    if (isSamePassword) {
      connection.release();
      return res.status(400).json({ message: "New password must be different from your old password" });
    }

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
    res.status(500).json({ message: "Error resetting password", error: error.message });
  }
});

app.post('/subscription-webhook-endpoint', async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOKS_SECRET;
  // Verify Razorpay Signature
  const receivedSignature = req.headers['x-razorpay-signature'];
  const body = JSON.stringify(req.body);

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  if (expectedSignature !== receivedSignature) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = req.body.event;
  const subscriptionId = req.body.payload.subscription.entity.id;
  const status = req.body.payload.subscription.entity.status;

  switch (event) {
    case 'subscription.activated':
      console.log(`✅ Subscription Activated: ${subscriptionId}`);
      break;

    case 'subscription.charged':
      console.log(`💰 Payment Received for Subscription: ${subscriptionId}`);
      break;

    case 'subscription.completed':
      console.log(`🎉 Subscription Completed: ${subscriptionId}`);
      break;

    case 'subscription.cancelled':
      console.log(`❌ Subscription Cancelled: ${subscriptionId}`);
      break;

    default:
      console.log(`🔹 Unhandled event: ${event}`);
  }

  res.json({ status: 'success' });
});

// verify invite
inviteRoute.post("/verify-invite", (req, res) => {
  const { token } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    return res.status(200).json({
      workspaceId: decoded.workspaceId,
      email: decoded.email
    });

  } catch (err) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }
});


app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await loadScheduledJobs();
});
