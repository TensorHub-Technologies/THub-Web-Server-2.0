import pool from "../config/db.js"
import cron from "node-cron"

// ! notifying the user for subscription

// Function to notify the user for subscription renewal
async function sendNotification(userId, expiryDate) {
    try {
        const connection = await pool.getConnection();

        const [rows] = await connection.query(`SELECT email FROM users WHERE uid = ?`, [userId]);
        if (rows.length === 0) {
            console.error(`User with ID ${userId} not found`);
            return;
        }
        connection.release();

        const email = rows[0].email;

        const mailOptions = {
            from: 'no-reply@thub.tech',
            to: email,
            subject: 'Subscription Renewal Reminder',
            html: `
          <html>
            <head>
              <style>
                body {
                  font-family: Cambria Math,serif;
                  background-color: #f4f4f9;
                  margin: 0;
                  padding: 0;
                  color: #333;
                }
                .container {
                  width: 100%;
                  max-width: 600px;
                  margin: 0 auto;
                  background-color: #ffffff;
                  padding: 20px;
                  border-radius: 8px;
                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                .header {
                  text-align: center;
                  color: #e22a90;
                  margin-bottom: 20px;
                }
                .message {
                  font-size: 16px;
                  line-height: 1.6;
                  color: #555;
                }
                .cta-button {
                  display: inline-block;
                  margin-top: 20px;
                  padding: 12px 30px;
                  background-color: #e22a90;
                  text-decoration: none;
                  font-size: 16px;
                  border: 2px solid #e22a90;
                  border-radius: 5px;
                  text-align: center;
                  transition: background-color 0.3s, color 0.3s;
                }
                .cta-button:hover {
                  background-color: #e22a90;
                  color: white;
                }
                .footer {
                  font-size: 12px;
                  text-align: center;
                  margin-top: 40px;
                  color: #888;
                }
                .footer a {
                  color: #888;
                  text-decoration: none;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>THub Subscription Renewal Reminder</h1>
                </div>
                <div class="message">
                  <p>Dear Customer,</p>
                  <p>Your subscription is set to expire on <strong>${expiryDate}</strong>.</p>
                  <p>To ensure uninterrupted access to your services, we encourage you to renew your subscription at your earliest convenience.</p>
                  <p>Please click the button below to renew your subscription:</p>
                  <a 
                    href="https://thub.tech/auth/login" 
                    class="cta-button" 
                    style="display: inline-block; 
                            margin-top: 20px; 
                            padding: 10px 26px; 
                            background-color: #e22a90; 
                            text-decoration: none; 
                            font-size: 16px; 
                            border: 2px solid #e22a90; 
                            border-radius: 5px; 
                            text-align: center; 
                            color: white; 
                            transition: background-color 0.3s, color 0.3s;"
                    >
                    Renew Now
                    </a>
                </div>
                <div class="footer">
                  <p>If you did not request this email, please disregard it.</p>
                  <p>Thank you for being a valued part of the THub community.</p>
                  <p>Best Regards,</p>
                  <p><strong>Team THub</strong></p>
                </div>
              </div>
            </body>
          </html>
        `
        };



        // Send email
        await transporter.sendMail(mailOptions);
        console.log(`Notification sent to ${email}`);
    } catch (error) {
        console.error(`Error sending notification: ${error.message}`);
    }
}

// Adjust cron job to debug
cron.schedule('51 19 * * *', async () => {
    try {

        const today = new Date();
        const nearExpiryDate = new Date();
        nearExpiryDate.setDate(today.getDate() + 7);

        const formattedExpiryDate = nearExpiryDate.toISOString().split('T')[0];

        const connection = await pool.getConnection();

        const [expiringSubscriptions] = await connection.execute(
            `
          SELECT uid, subscription_type, expiry_date 
          FROM users 
          WHERE expiry_date = ? AND subscription_status = 'active'
        `,
            [formattedExpiryDate]
        );

        console.log(`Found ${expiringSubscriptions.length} expiring subscriptions.`);
        connection.release();


        for (const subscription of expiringSubscriptions) {
            console.log(`Notifying user ${subscription.uid}`);
            await sendNotification(subscription.uid, subscription.expiry_date);
        }
    } catch (error) {
        console.error(`Error in cron job: ${error.message}`);
    }
});
