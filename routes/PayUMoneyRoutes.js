require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const pool = require("../config/db"); 
const router = express.Router();

const {
  PAYU_MERCHANT_KEY_TEST,
  PAYU_MERCHANT_SALT_TEST,
  PAYU_BASE_URL_TEST,
  SUCCESS_URL,
  FAILURE_URL,
} = process.env;

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

// Create subscription route
// endpoint app.use("/api/payments",payuPaymentRoute)
router.post('/create-subscription', async (req, res) => {
  try {
    const { txnid, amount, firstname, email, phone, productinfo, planId, duration, user_id } = req.body;
    const transactionId = txnid || 'TXN' + new Date().getTime();
    const hashString = `${PAYU_MERCHANT_KEY_TEST}|${transactionId}|${amount}|${productinfo}|${firstname}|${email}|${planId}|${duration}|${user_id}||||||||${PAYU_MERCHANT_SALT_TEST}`;
    const hash = crypto.createHash('sha512').update(hashString).digest('hex');

    // Prepare the payment data object
    const paymentData = {
      key: PAYU_MERCHANT_KEY_TEST,
      txnid: transactionId,
      amount,
      firstname,
      email,
      phone,
      productinfo,
      hash,
      surl: SUCCESS_URL,
      furl: FAILURE_URL,
      action: PAYU_BASE_URL_TEST,
      udf1: planId,
      udf2: duration,
      udf3: user_id,
    };
    

    res.json(paymentData);
  } catch (error) {
    console.error('Error in /create-subscription:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Payment success route
router.post('/payment-success', async (req, res) => {
  try {
    console.log('Payment Success:', req.body);
    const { udf1: planId, udf2: duration ,udf3:user_id, productinfo} = req.body;
    await updateSubscriptionInDB(planId, user_id, productinfo, duration);
    res.send('Payment Successful');
  } catch (error) {
    console.error('Error in /payment-success:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Payment failure route
router.post('/payment-failure', async (req, res) => {
  try {
    console.log('Payment Failed:', req.body);
    res.send('Payment Failed');
  } catch (error) {
    console.error('Error in /payment-failure:', error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
