require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const {
  PAYU_MERCHANT_KEY_TEST,
  PAYU_MERCHANT_SALT_TEST,
  PAYU_BASE_URL_TEST,
  SUCCESS_URL,
  FAILURE_URL,
} = process.env;

// Create subscription route
// endpoint app.use("/api/payments",payuPaymentRoute)
router.post('/create-subscription', async (req, res) => {
  try {
    const { txnid, amount, firstname, email, phone, productinfo, planId, duration } = req.body;
    const transactionId = txnid || 'TXN' + new Date().getTime();
    const hashString = `${PAYU_MERCHANT_KEY_TEST}|${transactionId}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${PAYU_MERCHANT_SALT_TEST}`;
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
    };

    res.json(paymentData);
  } catch (error) {
    console.error('Error in /create-subscription:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


module.exports = router;
