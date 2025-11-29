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
      "https://thub-app.wittysand-a4a5c89d.westus2.azurecontainerapps.io"
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
app.use("/api/invite",inviteRoute)

// invite Register user
app.use("/user/invite/register",inviteRegister)

// paypal subscription
app.use("/api/paypal/subscription",paypalRoutes)

// paypal webhook 
app.use("/paypal/webhook",paypalWebhookRoute)

// razorpay subscription
app.use("/create-subscription",createSubscriptionRoute)

app.use("/validate-subscription",validateSubscriptionRoute)

// payu money
app.use("/api/payments",payuPaymentRoute)

// agent email trigger
app.use("/api/agent/email",emailTriggerAgent)


app.use("/api/contactmail",contactMail)

// agent scheduler
app.use("/api/schedules", schedulerAgent)

app.use('/.well-known', express.static('public/.well-known', {
  dotfiles: 'allow',
  setHeaders: (res) => {
    res.setHeader("Content-Type", "application/json");
  }
}));

app.use(express.static('dist'));  // If Vite build folder is dist
app.get('*', (req, res) => {
  res.sendFile('dist/index.html', { root: '.' });
});

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

  console.log(origin,"origin",process.env.GITHUB_CLIENT_ID_DEMO);
  

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
    console.log(params.toString(),"params");

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
    const { email, firstName, lastName, phone, password, login_type, subscription_type, subscription_duration, subscription_date, workspace, company, department, role } = req.body;
    const uid = generateRandomID();
    const name = `${firstName} ${lastName}`;
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    const connection = await pool.getConnection();

    // Set the subscription date and calculate expiry date for free plan
    const current_date = new Date();
    const effective_subscription_date = subscription_date || current_date.toISOString().split("T")[0]; // Default to today's date if not provided
    let expiry_date = null;
    const subscription_status = "active";

    if (subscription_type === "free") {
      const expiryDateObj = new Date(effective_subscription_date);
      expiryDateObj.setDate(expiryDateObj.getDate() + 90); 
      expiry_date = expiryDateObj.toISOString().split("T")[0]; 
    }
    const insertUserQuery = `
    INSERT INTO users (uid, email, phone, login_type, name, password_hash, subscription_type, subscription_duration, subscription_date, expiry_date, workspace, company, department, role, subscription_status) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  await connection.execute(insertUserQuery, [
    uid || null,
    email || null,
    phone || null,
    login_type || null,
    name || null,
    password_hash || null,
    subscription_type || "free",
    subscription_duration || null,
    effective_subscription_date,
    expiry_date,
    workspace || null,
    company || null,
    department || null,
    role || null,
    subscription_status || 'active',
  ]);
  
    // Send welcome email to the new user
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
      console.log("Welcome email sent successfully");
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError.message);
    }

    res.status(200).json({ message: "User successfully added", userId: uid, workspace: workspace,email,name });
    connection.release();
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


app.get("/userdata", async (req, res) => {
  const { userId } = req.query;
  console.log(userId,"userId")
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


// update workspace 
app.post("/updateUser", async (req, res) => {
  const { uid, department, role, designation, company, workspace } = req.body;

  let workspaceName=workspace.toString().toLowerCase().trim();

  if (!uid || !workspaceName) {
    return res.status(400).json({ message: "User ID and workspace name are required" });
  }

  try {
    const connection = await pool.getConnection();

    // Check if workspace already exists
    const [workspaceResult] = await connection.execute(
      "SELECT id FROM workspaces WHERE name = ?",
      [workspaceName]
    );

    let workspaceId;
    if (workspaceResult.length > 0) {
      workspaceId = workspaceResult[0].id;
    } else {
      const newWorkspaceId = uuidv4();

      const [newWorkspaceResult] = await connection.execute(
        "INSERT INTO workspaces (id, name, created_by) VALUES (?, ?, ?)",
        [newWorkspaceId, workspaceName, uid]
      );

      workspaceId = newWorkspaceId;
    }

    const [userCountResult] = await connection.execute(
      "SELECT COUNT(*) AS userCount FROM workspace_users WHERE workspace_name = ?",
      [workspaceName]
    );

    const userCount = userCountResult[0].userCount;

    if (userCount >= 5) {
      connection.release();
      return res.status(400).json({ message: `Workspace "${workspaceName}" already has the maximum of 5 users.` });
    }

    const [userWorkspaceResult] = await connection.execute(
      "SELECT * FROM workspace_users WHERE workspace_id = ? AND user_id = ?",
      [workspaceId, uid]
    );

    if (userWorkspaceResult.length === 0) {
      await connection.execute(
        "INSERT INTO workspace_users (workspace_id, user_id, role, workspace_name) VALUES (?, ?, ?, ?)",
        [workspaceId, uid, role || "member", workspaceName]
      );
    } else {
      if (role) {
        await connection.execute(
          "UPDATE workspace_users SET role = ?, workspace_name = ? WHERE workspace_id = ? AND user_id = ?",
          [role, workspaceName, workspaceId, uid]
        );
      }
    }

    // Update user details in the `users` table
    const updateUserQuery = `
      UPDATE users 
      SET department = ?, designation = ?, company = ?, workspace = ?, workspaceUid = ?
      WHERE uid = ?
    `;
    await connection.execute(updateUserQuery, [
      department,
      designation,
      company,
      workspaceName,
      workspaceId,
      uid,
    ]);

    connection.release();

    res.status(200).send({ message: "User data updated successfully" });
  } catch (error) {
    console.error("Error updating user data:", error);
    res.status(500).json({ message: "Error updating user data", error: error.message });
  }
});


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
        : "https://thub.tech";
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


app.listen(PORT,async () => {
  console.log(`Server running on port ${PORT}`);
  await loadScheduledJobs();
});
