const express = require("express");
const app = express();
const mysql = require("mysql2/promise");
const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid"); 
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { validatePaymentVerification } = require('razorpay/dist/utils/razorpay-utils');

// routes imports
require("./routes/NotifyMail")

const imageUploadRoute = require("./routes/ImageUpload")

//routes update user edit
const userUpdateRoute = require("./routes/UpdateUser")

const enterpriceRoute = require("./routes/EnterpriceMail");

// routes workspace invite
const inviteRoute=require("./routes/InviteUser")

// routes invite register
const inviteRegister=require("./routes/InviteRegister")

// routes paypal
const paypalRoutes=require("./routes/Paypal")

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
      "http://35.193.70.249",
      "http://34.122.113.191",
      "http://20.207.65.5:3000"
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
      `SELECT subscription_type, expiry_date, workspace FROM users WHERE email = ?`,
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
      subscription_type = rows[0].subscription_type;
      expiry_date = rows[0].expiry_date;
      workspace = rows[0].workspace; // Retrieve the workspace for existing users
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
        const transporter = nodemailer.createTransport({
          host: "smtp.privateemail.com",
          port: 465,
          secure: true,
          auth: {
            user: "no-reply@thub.tech",
            pass: process.env.NO_REPLY_MAIL_PASSWORD,
          },
        });
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
      await connection.release();
      return res.json({
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
      const transporter = nodemailer.createTransport({
        host: "smtp.privateemail.com",
        port: 465,
        secure: true,
        auth: {
          user: "no-reply@thub.tech",
          pass: process.env.NO_REPLY_MAIL_PASSWORD,
        },
      });
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
  console.log(origin, "origin");

  try {
    let params;
    if (origin === "http://localhost:5173") {
      params = new URLSearchParams({
        client_id: process.env.Github_ClientId_Local,
        client_secret: process.env.Github_Secret_Local,
        code: req.query.code,
      });
    } else if (origin === "https://thub.tech") {
      params = new URLSearchParams({
        client_id: process.env.Github_ClientId_app,
        client_secret: process.env.Github_Secret_App,
        code: req.query.code,
      });
    } else if (origin === "https://thub-web-2-0-0-378678297066.us-central1.run.app") {
      params = new URLSearchParams({
        client_id: process.env.Github_ClientId_demo,
        client_secret: process.env.Github_Secret_Demo,
        code: req.query.code,
      });
    } else {
      return res.status(400).json({ error: "Invalid Github hostname" });
    }

    console.log('Sending request to GitHub with params:', params.toString());
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

    console.log('GitHub Response:', data);

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
      const [rows] = await connection.execute(
        "SELECT COUNT(*) as count FROM users WHERE email = ?",
        [login]
      );

      let userData;
      const current_date = new Date();
      const effective_subscription_date = current_date.toISOString().split("T")[0]; 
      let expiry_date = null;
      let subscription_type = null;
      let subscription_status = null;

      if (rows[0].count === 0) {
        subscription_type = "free";
        subscription_status = "active";

        const expiryDateObj = new Date(effective_subscription_date);
        expiryDateObj.setDate(expiryDateObj.getDate() + 90);
        expiry_date = expiryDateObj.toISOString().split("T")[0];

        const query = `
          INSERT INTO users 
          (uid, email, access_token, name, login_type, picture, subscription_type, subscription_status, subscription_date, expiry_date, workspace) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

        userData = {
          uid: id,
          email: login,
          access_token: node_id,
          name,
          login_type: "github",
          picture: avatar_url,
          subscription_type,
          subscription_status,
          subscription_date: effective_subscription_date,
          expiry_date,
          workspace: workspace || null,
        };

      } else {

        const [existingUser] = await connection.execute(
          "SELECT * FROM users WHERE email = ?",
          [login]
        );

        const existingData = existingUser[0];

        // Use existing subscription details
        userData = {
          uid: existingData.uid,
          email: existingData.email,
          access_token: existingData.access_token,
          name: existingData.name,
          login_type: existingData.login_type,
          picture: existingData.picture,
          subscription_type: existingData.subscription_type,
          subscription_status: existingData.subscription_status,
          subscription_date: existingData.subscription_date,
          expiry_date: existingData.expiry_date,
          workspace: existingData.workspace,
        };
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

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        return reject(error);
      }
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
      const transporter = nodemailer.createTransport({
        host: 'smtp.privateemail.com',
        port: 465,
        secure: true,
        auth: {
          user: "no-reply@thub.tech",
          pass: process.env.NO_REPLY_MAIL_PASSWORD,
        },
      });

      await transporter.sendMail(mailOptions);
      console.log("Welcome email sent successfully");
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError.message);
    }

    res.status(200).json({ message: "User successfully added", userId: uid, workspace: workspace });
    connection.release();
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


app.post("/userdata", async (req, res) => {
  const { userId } = req.body;

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
      email:email
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// update workspace 


app.post("/updateUser", async (req, res) => {
  const { uid, department, role, designation, company, workspace } = req.body;

  if (!uid || !workspace) {
    return res.status(400).json({ message: "User ID and workspace name are required" });
  }

  try {
    const connection = await pool.getConnection();

    // Check if workspace already exists
    const [workspaceResult] = await connection.execute(
      "SELECT id FROM workspaces WHERE name = ?",
      [workspace]
    );

    let workspaceId;
    if (workspaceResult.length > 0) {
      workspaceId = workspaceResult[0].id;
    } else {
      const newWorkspaceId = uuidv4();

      const [newWorkspaceResult] = await connection.execute(
        "INSERT INTO workspaces (id, name, created_by) VALUES (?, ?, ?)",
        [newWorkspaceId, workspace, uid]
      );

      workspaceId = newWorkspaceId;
    }

    const [userCountResult] = await connection.execute(
      "SELECT COUNT(*) AS userCount FROM workspace_users WHERE workspace_name = ?",
      [workspace]
    );

    const userCount = userCountResult[0].userCount;

    if (userCount >= 5) {
      connection.release();
      return res.status(400).json({ message: `Workspace "${workspace}" already has the maximum of 5 users.` });
    }

    const [userWorkspaceResult] = await connection.execute(
      "SELECT * FROM workspace_users WHERE workspace_id = ? AND user_id = ?",
      [workspaceId, uid]
    );

    if (userWorkspaceResult.length === 0) {
      await connection.execute(
        "INSERT INTO workspace_users (workspace_id, user_id, role, workspace_name) VALUES (?, ?, ?, ?)",
        [workspaceId, uid, role || "member", workspace]
      );
    } else {
      if (role) {
        await connection.execute(
          "UPDATE workspace_users SET role = ?, workspace_name = ? WHERE workspace_id = ? AND user_id = ?",
          [role, workspace, workspaceId, uid]
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
      workspace,
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

//razorpay Code
app.use(express.urlencoded({ extended: false }));
const updateSubscriptionInDB = async (subscriptionId, userId, subscriptionType, duration) => {
  const subscription_date = new Date().toISOString().split('T')[0];
  const expiry_date = new Date(subscription_date);

  if (duration === 'monthly') {
    expiry_date.setMonth(expiry_date.getMonth() + 1);
  } else if (duration === 'yearly') {
    expiry_date.setFullYear(expiry_date.getFullYear() + 1);
  }

  const query = `
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
  await connection.execute(query, [
    subscriptionType,
    duration,
    subscription_date,
    expiry_date,
    subscriptionId,
    userId
  ]);
  connection.release();
};

app.post('/create-subscription', async (req, res) => {
  try {
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_SECRET,
    });

    const { planId, customerEmail } = req.body;
    const planDetails = await razorpay.plans.fetch(planId);
    const planAmount = planDetails.item.amount / 100; 

    // Map Plan ID to Subscription Type and Duration
    let subscriptionType, duration;
    if (planId ==='plan_PhdG5GMrYCqm6Z') {
      subscriptionType = 'pro';
      duration = 'monthly';
    } else if (planId === 'plan_PhdbTzJPTel2e3') {
      subscriptionType = 'pro';
      duration = 'yearly';
    } else {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    const interval = duration === 'monthly' ? 12 : 1;

    // Calculate subscription_date and expiry_date
    const subscription_date = new Date();
    let expiry_date = new Date(subscription_date);

    if (duration === 'monthly') {
      expiry_date.setDate(expiry_date.getDate() + 30); // 30 days for monthly
    } else {
      expiry_date.setFullYear(expiry_date.getFullYear() + 1); // 12 months for yearly
    }

    // Format dates as YYYY-MM-DD
    const formatted_subscription_date = subscription_date.toISOString().split('T')[0];
    const formatted_expiry_date = expiry_date.toISOString().split('T')[0];

    // Create a subscription on Razorpay
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      total_count: interval,
      customer_notify: 1,
    });

    res.json({
      id: subscription.id,
      status: subscription.status,
      message: 'Subscription created successfully',
      subscriptionType,
      duration,
      subscription_date: formatted_subscription_date,
      expiry_date: formatted_expiry_date,
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});


app.post('/razorpay-webhook', async (req, res) => {
  const secret = process.env.RAZORPAY_TEST_KEY_SECRET;

  try {
    const signature = req.headers['x-razorpay-signature'];
    const isValid = validatePaymentVerification(req.body, signature, secret);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body.event;

    if (event === 'subscription.activated') {
      const { subscription_id, customer_id } = req.body.payload.subscription.entity;
    } else if (event === 'payment.failed') {
      const { payment_id, error } = req.body.payload.payment.entity;

      console.error(`Payment failed: ${payment_id}, Reason: ${error.reason}`);
    }

    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

    const secret = process.env.RAZORPAY_TEST_KEY_SECRET;

    // Validate the signature
    const isValid = validatePaymentVerification(respBody, razorpay_signature, secret);

    if (isValid) {
      const subscriptionType = 'pro';
      const duration = planId === 'plan_PguBI476fHCWGG' ? 'monthly' : 'yearly';

      await updateSubscriptionInDB(razorpay_subscription_id, user_id, subscriptionType, duration);

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
