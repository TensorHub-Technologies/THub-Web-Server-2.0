const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const crypto = require("crypto");
require('dotenv').config();

const {
  PAYU_MERCHANT_KEY,
  PAYU_MERCHANT_SALT,
  PAYU_BASE_URL,
  SUCCESS_URL,
  FAILURE_URL,
} = process.env;

router.post('/create-subscription', async (req, res) => {
  try {
    const { txnid, amount, firstname, email, phone, productinfo, planId, duration } = req.body;
    const transactionId = txnid || 'TXN' + new Date().getTime();
    
    const hashString = `${PAYU_MERCHANT_KEY}|${transactionId}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${PAYU_MERCHANT_SALT}`;
    const hash = crypto.createHash('sha512').update(hashString).digest('hex');

    const paymentData = {
      key: PAYU_MERCHANT_KEY,
      txnid: transactionId,
      amount,
      firstname,
      email,
      phone,
      productinfo,
      hash,
      surl: SUCCESS_URL,
      furl: FAILURE_URL, // URL on your server that handles failure
      action: PAYU_BASE_URL,
      // Additional recurring payment parameters can be added here, e.g.,
      // recurring_frequency: duration === 'monthly' ? '1M' : '12M',
      // planId: planId,
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
    // Log the payment success details; implement hash verification as needed
    console.log('Payment Success:', req.body);
    // Update subscription status in your database here if necessary
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
