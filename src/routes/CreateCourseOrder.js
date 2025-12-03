import Razorpay from "razorpay";
import express from "express";

const createCourseOrderRoute = express.Router();

createCourseOrderRoute.post("/", async (req, res) => {
  try {
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_SECRET,
    });

    const { courseName, amount } = req.body;

    if (!courseName || !amount) {
      return res.status(400).json({ error: "Missing course name or amount" });
    }

    // Razorpay requires the amount in paise
    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now(),
      notes: {
        course: courseName,
      },
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      courseName,
    });
  } catch (error) {
    console.log("Order creation error", error);
    res.status(500).json({ error: "Failed to create course order" });
  }
});

export default createCourseOrderRoute;
