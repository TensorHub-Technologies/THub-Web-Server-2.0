const express = require("express");
const router = express.Router();
const pool = require("../config/db");

router.post('/', async (req, res) => {
    try {
        const event = req.body; 

        if (event.event_type === "BILLING.SUBSCRIPTION.ACTIVATED") {
            const subscriptionId = event.resource.id;
            const userId = event.resource.custom_id; 
            
            await pool.query(
                `UPDATE test_users SET 
                subscription_type = 'pro', 
                subscription_duration = 'monthly', 
                subscription_date = NOW(), 
                expiry_date = DATE_ADD(NOW(), INTERVAL 1 MONTH),
                subscription_status = 'active',
                paypal_subscription_id = ? 
                WHERE uid = ?`,
                [subscriptionId, userId]
            );

            console.log("PayPal Subscription Activated:", subscriptionId);
        }

        res.sendStatus(200);
    } catch (error) {
        console.error("PayPal Webhook Error:", error);
        res.sendStatus(500);
    }
});


module.exports = router;
