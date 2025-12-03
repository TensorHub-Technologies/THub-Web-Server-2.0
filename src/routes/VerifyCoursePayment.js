import crypto from "crypto";
import express from "express";

const verifyCoursePaymentRoute = express.Router();

verifyCoursePaymentRoute.post("/", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(sign)
      .digest("hex");

    if (expectedSign === razorpay_signature) {
      return res.json({
        success: true,
        message: "Payment verified successfully",
      });
    }

    res.status(400).json({ success: false, message: "Payment verification failed" });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default verifyCoursePaymentRoute;
