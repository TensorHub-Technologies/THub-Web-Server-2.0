const mysql = require("mysql2/promise");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const creatingGoogleUser=async (req, res) => {
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
}

export const googleUser=creatingGoogleUser;