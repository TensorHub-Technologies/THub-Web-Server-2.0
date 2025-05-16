const express = require("express");
const router = express.Router();
const pool = require("../config/db");

const PAYPAL_CLIENT_ID = 'YOUR_PAYPAL_CLIENT_ID';
const PAYPAL_SECRET = 'YOUR_PAYPAL_SECRET';
const PAYPAL_API_BASE = 'https://api-m.sandbox.paypal.com'; 

const getAccessToken = async () => {
    try {
        const response = await axios.post(
            `${PAYPAL_API_BASE}/v1/oauth2/token`,
            'grant_type=client_credentials',
            {
                auth: {
                    username: PAYPAL_CLIENT_ID,
                    password: PAYPAL_SECRET,
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );
        return response.data.access_token;
    } catch (error) {
        console.error('Error generating access token:', error.response.data);
        throw new Error('Failed to generate access token');
    }
};

// Route to create a subscription
router.post('/', async (req, res) => {
    const { planId } = req.body;
    try {
        const accessToken = await getAccessToken();

        const subscriptionResponse = await axios.post(
            `${PAYPAL_API_BASE}/v1/billing/subscriptions`,
            {
                plan_id: planId,
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const subscriptionId = subscriptionResponse.data.id;
        res.json({ subscriptionId });
    } catch (error) {
        console.error('Error creating subscription:', error.response.data);
        res.status(500).json({ error: 'Failed to create subscription' });
    }
});

module.exports = router;
