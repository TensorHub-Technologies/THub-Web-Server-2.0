const express = require("express");
const router = express.Router();
const pool = require("../config/db"); 

const { validatePaymentVerification } = require('razorpay/dist/utils/razorpay-utils');


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

router.post('/', async (req, res) => {
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

    const secret = process.env.RAZORPAY_SECRET;

    // Validate the signature
    const isValid = validatePaymentVerification(respBody, razorpay_signature, secret);

    if (isValid) {
      const subscriptionType = 'pro';
      const duration = planId === 'plan_PhdG5GMrYCqm6Z' ? 'monthly' : 'yearly';

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

module.exports = router;
