require("dotenv").config();
const bodyParser = require("body-parser");
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

// ✅ ONLY THIS (no duplicates anywhere)
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());
// ✅ Test route
app.get("/", (req, res) => {
  res.send("Backend is running");
});
// Needed for Stripe webhook
app.use("/webhook", bodyParser.raw({ type: "application/json" }));
// ✅ CREATE CHECKOUT SESSION (LIVE)
app.post("/create-checkout-session", async (req, res) => {
  const { cart } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],

      line_items: cart.map(item => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: item.name,
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      })),

      success_url: "http://127.0.0.1:5500/success.html",
      cancel_url: "http://127.0.0.1:5500/cancel.html",
    });

    // 🔥 ADD THIS LINE HERE
    console.log("SESSION CREATED:", session.id);

    res.json({ id: session.id });

  } catch (error) {
    console.error("STRIPE ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});
app.post("/webhook", (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log("❌ Webhook signature verification failed.", err.message);
    return res.sendStatus(400);
  }

  // ✅ Handle successful payment
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    console.log("💰 PAYMENT SUCCESS:", session.id);

    // 👉 HERE you save order to database (or array)
    const order = {
      id: Date.now(),
      stripeSessionId: session.id,
      amount: session.amount_total / 100,
      status: "paid"
    };

    console.log("📦 ORDER SAVED:", order);
  }

  res.json({ received: true });
});
// ✅ Start server
app.listen(5000, () => {
  console.log("🚀 Server running on port 5000");
});