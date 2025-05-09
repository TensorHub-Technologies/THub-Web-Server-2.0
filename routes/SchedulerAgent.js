// backend/routes/schedules.js
const express = require('express');
const router = express.Router();
const cron = require('node-cron');
const axios = require('axios');
// Store jobs in memory for simplicity (use DB in production)

const scheduledJobs = new Map();

function getCronExpression(scheduleType, config) {
    switch (scheduleType) {
        case 'At Regular Intervals': {
            const minutes = parseInt(config.intervalMinutes, 10);
            console.log(minutes, "minutes");
            if (isNaN(minutes) || minutes <= 0 || minutes > 59) {
                throw new Error('Invalid intervalMinutes');
            }
            return `*/${minutes} * * * *`;
        }

        case 'Once': {
            if (!config.OnceAt) {
                throw new Error('Missing OnceAt datetime for Once schedule');
            }
            const onceDate = new Date(config.OnceAt);
            if (isNaN(onceDate.getTime())) {
                throw new Error('Invalid OnceAt datetime format');
            }
            const minute = onceDate.getMinutes();
            const hour = onceDate.getHours();
            const day = onceDate.getDate();
            const month = onceDate.getMonth() + 1;
            return `${minute} ${hour} ${day} ${month} *`;
        }

        case 'Every day': {
            if (!config.dailyTime || !/^\d{2}:\d{2}$/.test(config.dailyTime)) {
                throw new Error('Invalid or missing dailyTime format (expected HH:mm)');
            }
            const [dailyHour, dailyMinute] = config.dailyTime.split(':').map(Number);
            return `${dailyMinute} ${dailyHour} * * *`;
        }

        case 'Days of the week': {
            if (!config.weekDays || !Array.isArray(config.weekDays) || config.weekDays.length === 0) {
                throw new Error('Missing or invalid weekDays array');
            }
            if (!config.weeklyTime || !/^\d{2}:\d{2}$/.test(config.weeklyTime)) {
                throw new Error('Invalid or missing weeklyTime format (expected HH:mm)');
            }

            const [weekHour, weekMinute] = config.weeklyTime.split(':').map(Number);

            const dayMap = {
                Sunday: 0,
                Monday: 1,
                Tuesday: 2,
                Wednesday: 3,
                Thursday: 4,
                Friday: 5,
                Saturday: 6
            };

            const days = config.weekDays
                .map(day => dayMap[day])
                .filter(num => num !== undefined)
                .join(',');

            if (!days) {
                throw new Error('Invalid day names in weekDays');
            }

            return `${weekMinute} ${weekHour} * * ${days}`;
        }

        case 'Days of the month': {
            if (!config.monthDays || !Array.isArray(config.monthDays) || config.monthDays.length === 0) {
                throw new Error('Missing or invalid monthDays array');
            }
            if (!config.monthlyTime || !/^\d{2}:\d{2}$/.test(config.monthlyTime)) {
                throw new Error('Invalid or missing monthlyTime format (expected HH:mm)');
            }

            const [monthHour, monthMinute] = config.monthlyTime.split(':').map(Number);
            const daysOfMonth = config.monthDays.filter(day => Number.isInteger(day) && day >= 1 && day <= 31).join(',');

            if (!daysOfMonth) {
                throw new Error('Invalid days in monthDays');
            }

            return `${monthMinute} ${monthHour} ${daysOfMonth} * *`;
        }

        case 'Specified dates': {
            if (!config.specMonth || !config.specDate) {
                throw new Error('Missing specMonth or specDate');
            }

            const monthMap = {
                January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
                July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
            };

            const month = monthMap[config.specMonth];
            const day = parseInt(config.specDate, 10);

            if (!month || isNaN(day) || day < 1 || day > 31) {
                throw new Error('Invalid specMonth or specDate');
            }

            let hour = 0;
            let minute = 0;

            if (config.specTime && /^\d{2}:\d{2}$/.test(config.specTime)) {
                [hour, minute] = config.specTime.split(':').map(Number);
            }

            return `${minute} ${hour} ${day} ${month} *`;
        }

        default:
            throw new Error('Invalid schedule type');
    }
}

// POST /api/schedules
router.post('/', async (req, res) => {
    const { flowId, scheduleType, config, prompt } = req.body;

    console.log(flowId, scheduleType, config, prompt, "payload from body")

    if (!flowId || !scheduleType || !config) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const jobKey = `${flowId}-${scheduleType}-${JSON.stringify(config)}`;

    // Stop existing job if any
    if (scheduledJobs.has(jobKey)) {
        scheduledJobs.get(jobKey).stop();
        scheduledJobs.delete(jobKey);
    }

    try {
        const cronExp = getCronExpression(scheduleType, config);
        const job = cron.schedule(cronExp, async () => {

            try {
                const response = await axios.post(
                    `https://demo.thub.tech/api/v1/internal-prediction/${flowId}`,
                    {
                        question: prompt,         
                        chatId: flowId
                    },
                    {
                        headers: {
                            'Content-type': 'application/json',
                            'x-request-from': 'internal'
                        },
                        auth: {
                            username: process.env.FLOWISE_USERNAME,
                            password: process.env.FLOWISE_PASSWORD
                        }
                    }
                );
                
                console.log('Chatbot response:', response.data);
            } catch (err) {
                console.error('Error triggering chatflow:', err.message);
            }
        });


        scheduledJobs.set(jobKey, job);

        res.json({ success: true, message: `Schedule set with cron: ${cronExp}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
