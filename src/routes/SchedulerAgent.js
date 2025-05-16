const express = require("express");
const router = express.Router();
const cron = require('node-cron');
const axios = require('axios');
const pool = require('../config/db');

const scheduledJobs = new Map();

function getCronExpression(scheduleType, config) {
    switch (scheduleType) {
        case 'At Regular Intervals': {
            const minutes = parseInt(config.intervalMinutes, 10);
            if (isNaN(minutes) || minutes <= 0 || minutes > 59) {
                throw new Error('Invalid intervalMinutes');
            }
            return `*/${minutes} * * * *`;
        }
        case 'Once': {
            const istDate = new Date(config.OnceAt);
            const utcDate = new Date(istDate.getTime() - (5.5 * 60 * 60 * 1000));

            const minute = utcDate.getMinutes();
            const hour = utcDate.getHours();
            const day = utcDate.getDate();
            const month = utcDate.getMonth() + 1;

            console.log('Server timezone:', new Date().toString());
            console.log(`Scheduling Once job at UTC: ${hour}:${minute} on ${day}-${month}`);
            return `${minute} ${hour} ${day} ${month} *`;
        }
        case 'Every day': {
            const [h, m] = config.dailyTime.split(':').map(Number);
            const istDate = new Date();
            istDate.setHours(h, m, 0, 0);
            const utcDate = new Date(istDate.getTime() - (5.5 * 60 * 60 * 1000));
            return `${utcDate.getMinutes()} ${utcDate.getHours()} * * *`;
        }
        case 'Days of the week': {
            const [h, m] = config.weeklyTime.split(':').map(Number);
            const istDate = new Date();
            istDate.setHours(h, m, 0, 0);
            const utcDate = new Date(istDate.getTime() - (5.5 * 60 * 60 * 1000));

            const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
            const days = config.weekDays.map(d => dayMap[d]).filter(d => d !== undefined).join(',');

            return `${utcDate.getMinutes()} ${utcDate.getHours()} * * ${days}`;
        }

        case 'Days of the month': {
            const [h, m] = config.monthlyTime.split(':').map(Number);
            const istDate = new Date();
            istDate.setHours(h, m, 0, 0);
            const utcDate = new Date(istDate.getTime() - (5.5 * 60 * 60 * 1000));

            const days = config.monthDays.filter(d => d >= 1 && d <= 31).join(',');
            return `${utcDate.getMinutes()} ${utcDate.getHours()} ${days} * *`;
        }

        case 'Specified dates': {
            const monthMap = {
                January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
                July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
            };
            const month = monthMap[config.specMonth];
            const day = parseInt(config.specDate, 10);

            let hour = 0, minute = 0;
            if (config.specTime) [hour, minute] = config.specTime.split(':').map(Number);

            const istDate = new Date();
            istDate.setHours(hour, minute, 0, 0);
            const utcDate = new Date(istDate.getTime() - (5.5 * 60 * 60 * 1000));

            return `${utcDate.getMinutes()} ${utcDate.getHours()} ${day} ${month} *`;
        }

        default:
            throw new Error('Invalid schedule type');
    }
}

async function triggerJob(flowId, prompt) {
    console.log('Triggering job for flowId:', flowId);
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
        if (response.status === 200) {
        }
    } catch (err) {
        console.error('Error triggering chatflow:', err.message);
    }
}

function scheduleJob(job) {
    console.log('Scheduling job:', job);
    // Validate job object
    if (!cron.validate(job.cron_expression)) {
        console.error('Invalid cron expression:', job.cron_expression);
        return;
    }
    try {
        const jobKey = `${job.flow_id}-${job.schedule_type}-${job.cron_expression}`;
        if (scheduledJobs.has(jobKey)) {
            scheduledJobs.get(jobKey).stop();
            scheduledJobs.delete(jobKey);
        }
        console.log('Setting up cron job for key:', jobKey, 'with cron:', job.cron_expression);
        const cronJob = cron.schedule(job.cron_expression, async () => {
            await triggerJob(job.flow_id, job.prompt);

            // If 'Once', deactivate it after run
            if (job.schedule_type === 'Once') {
                cronJob.stop();
                scheduledJobs.delete(jobKey);
                await pool.query(`UPDATE scheduled_jobs SET status = 'inactive' WHERE id = ?`, [job.id]);
            }
        });

        scheduledJobs.set(jobKey, cronJob);
    } catch (err) {
        console.error('Error scheduling job:', err.message);
        return;
    }

}

// POST /api/schedules
router.post('/', async (req, res) => {
    // Validate request body
    const { flowId, scheduleType, config, prompt } = req.body;
    if (!flowId || !scheduleType || !config || !prompt) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const cronExp = getCronExpression(scheduleType, config);
        // Save to DB
        const [result] = await pool.query(
            'INSERT INTO scheduled_jobs (flow_id, schedule_type, config, prompt, cron_expression) VALUES (?, ?, ?, ?, ?)',
            [flowId, scheduleType, JSON.stringify(config), prompt, cronExp]
        );
        const newJob = {
            id: result.insertId,
            flow_id: flowId,
            schedule_type: scheduleType,
            config,
            prompt,
            cron_expression: cronExp,
            status: 'active'
        };
        console.log('New job created:', newJob);
        scheduleJob(newJob);

        res.json({ success: true, message: `Schedule saved and started with cron: ${cronExp}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.get('/:flowId', async (req, res) => {
    console.log(req.params,"flowId")
    const { flowId } = req.params;
    console.log(flowId)
    if (!flowId) return res.status(400).json({ error: 'flowId is required' });

    try {
        const [rows] = await pool.query(
            'SELECT * FROM scheduled_jobs WHERE flow_id = ? AND status = "active"',
            [flowId]
        );
        if (!rows.length) return res.status(400).json({ error: 'No active schedules found' });

        return res.status(200).json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post("/cancel", async (req, res) => {
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({ error: "id not available" });
    }

    try {
        const [result] = await pool.query(
            'UPDATE scheduled_jobs SET status = ? WHERE id = ?',
            ['inactive', id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Schedule not found or already cancelled" });
        }

        return res.status(200).json({ message: "Schedule cancelled successfully" });
    } catch (error) {
        console.error("Error cancelling schedule:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});



module.exports = {
    router,
    scheduleJob
};
