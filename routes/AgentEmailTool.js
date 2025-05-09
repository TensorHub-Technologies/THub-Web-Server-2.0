const express = require("express");
// const cron = require("node-cron");
// const { parse, format, isMatch } = require("date-fns");
const transporter = require("../config/mailer");

const router = express.Router();
const scheduledJobs = new Map(); 

const sendEmail = async ({ email, message, subject }) => {
  await transporter.sendMail({
    from: 'no-reply@thub.tech',
    to: email,
    subject: subject || 'Scheduled Email',
    html: message,
  });
};

const getCronExpression = (type, config) => {
  switch (type) {
    case "interval":
      return `*/${config.minutes} * * * *`; 
    case "hourly":
      return `0 */${config.hours} * * *`;
    case "daily":
      return `${config.time.minute} ${config.time.hour} * * *`; 
    case "weekly":
      return `${config.time.minute} ${config.time.hour} * * ${config.day}`; 
    case "monthly":
      return `${config.time.minute} ${config.time.hour} ${config.date} * *`; 
    default:
      return null;
  }
};

router.post("/", async (req, res) => {
  console.log("Email scheduling triggered");
  const { email, message, subject, scheduleType, scheduleConfig } = req.body;

  if (!email || !message || !scheduleType || !scheduleConfig) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    if (scheduleType === "once") {
      const dateTime = new Date(scheduleConfig.datetime);
      const delay = dateTime.getTime() - Date.now();

      if (delay < 0) {
        return res.status(400).json({ message: "Scheduled time is in the past." });
      }

      setTimeout(() => {
        sendEmail({ email, message, subject });
      }, delay);
    } else {
      const cronExpr = getCronExpression(scheduleType, scheduleConfig);
      if (!cronExpr) {
        return res.status(400).json({ message: "Invalid schedule type or config." });
      }

      const job = cron.schedule(cronExpr, () => {
        sendEmail({ email, message, subject });
      });

      scheduledJobs.set(email + subject, job);
    }

    res.status(200).json({ message: "Email scheduled successfully." });
  } catch (err) {
    console.error("Error scheduling email:", err);
    res.status(500).json({ message: "Server error while scheduling email." });
  }
});

module.exports = router;
