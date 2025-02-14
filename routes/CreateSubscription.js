const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");


router.post('/', async (req, res) => {
    try {
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_SECRET,
      });
  
      const { planId, customerEmail } = req.body;
      const planDetails = await razorpay.plans.fetch(planId);
      const planAmount = planDetails.item.amount / 100; 
  
      // Map Plan ID to Subscription Type and Duration
      let subscriptionType, duration;
      if (planId ==='plan_PhdG5GMrYCqm6Z') {
        subscriptionType = 'pro';
        duration = 'monthly';
      } else if (planId === 'plan_PhdbTzJPTel2e3') {
        subscriptionType = 'pro';
        duration = 'yearly';
      } else {
        return res.status(400).json({ error: 'Invalid plan ID' });
      }
  
      const interval = duration === 'monthly' ? 12 : 1;
  
      // Calculate subscription_date and expiry_date
      const subscription_date = new Date();
      let expiry_date = new Date(subscription_date);
  
      if (duration === 'monthly') {
        expiry_date.setDate(expiry_date.getDate() + 30); 
      } else {
        expiry_date.setFullYear(expiry_date.getFullYear() + 1);
      }
  
      // Format dates as YYYY-MM-DD
      const formatted_subscription_date = subscription_date.toISOString().split('T')[0];
      const formatted_expiry_date = expiry_date.toISOString().split('T')[0];
  
      // Create a subscription on Razorpay
      const subscription = await razorpay.subscriptions.create({
        plan_id: planId,
        total_count: interval,
        customer_notify: 1,
      });
      res.json({
        id: subscription.id,
        status: subscription.status,
        message: 'Subscription created successfully',
        subscriptionType,
        duration,
        subscription_date: formatted_subscription_date,
        expiry_date: formatted_expiry_date,
      });
    } catch (error) {
      console.error('Error creating subscription:', error);
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  });

module.exports = router;
