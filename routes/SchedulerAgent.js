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
            const onceDate = new Date(config.OnceAt);
            const minute = onceDate.getMinutes();
            const hour = onceDate.getHours();
            const day = onceDate.getDate();
            const month = onceDate.getMonth() + 1;
            return `${minute} ${hour} ${day} ${month} *`;
        }
        case 'Every day': {
            const [h, m] = config.dailyTime.split(':').map(Number);
            return `${m} ${h} * * *`;
        }
        case 'Days of the week': {
            const [h, m] = config.weeklyTime.split(':').map(Number);
            const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
            const days = config.weekDays.map(d => dayMap[d]).filter(d => d !== undefined).join(',');
            return `${m} ${h} * * ${days}`;
        }
        case 'Days of the month': {
            const [h, m] = config.monthlyTime.split(':').map(Number);
            const days = config.monthDays.filter(d => d >= 1 && d <= 31).join(',');
            return `${m} ${h} ${days} * *`;
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
            return `${minute} ${hour} ${day} ${month} *`;
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
        if(response.status === 200) {
            console.log('Job triggered successfully:', response.data);
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
    try{
    const jobKey = `${job.flow_id}-${job.schedule_type}-${job.cron_expression}`;
    if (scheduledJobs.has(jobKey)) {
        scheduledJobs.get(jobKey).stop();
        scheduledJobs.delete(jobKey);
    }

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
    }catch(err){
        console.error('Error scheduling job:', err.message);
        return;
    }
   
}

// POST /api/schedules
router.post('/', async (req, res) => {
    console.log('Received schedule request:', req.body);
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

        scheduleJob(newJob);

        res.json({ success: true, message: `Schedule saved and started with cron: ${cronExp}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = {
    router,
    scheduleJob
};
