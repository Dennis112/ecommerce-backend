require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const Stripe = require("stripe");

const app = express();

// 🔐 Stripe
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// 🔥 MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log("❌ DB error:", err));

// 🔥 IMPORTANT ORDER
app.use("/webhook", bodyParser.raw({ type: "application/json" }));
app.use(cors());
app.use(express.json());

// ✅ TEST ROUTE
app.get("/", (req, res) => {
  res.send("🚀 Backend is running");
});

// 🧱 ORDER MODEL (your “table”)
const orderSchema = new mongoose.Schema({
  stripeSessionId: String,
  amount: Number,
  status: String,

  name: String,
  email: String,
  phone: String,

  address: String,
  city: String,
  state: String,
  zip: String,
  country: String,

  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Order = mongoose.model("Order", orderSchema);

// 💳 CREATE CHECKOUT SESSION
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

      success_url: "https://apexstudiosltd.shop/pickup.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://apexstudiosltd.shop/cancel.html",
    });

    console.log("🟢 SESSION CREATED:", session.id);

    res.json({ id: session.id });

  } catch (error) {
    console.error("❌ STRIPE ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// 💰 WEBHOOK (SAVE PAYMENT)
app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log("❌ Webhook error:", err.message);
    return res.sendStatus(400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    console.log("💰 PAYMENT SUCCESS:", session.id);

    await Order.create({
      stripeSessionId: session.id,
      amount: session.amount_total / 100,
      status: "paid"
    });
  }

  res.json({ received: true });
});

// 📦 SAVE PICKUP DETAILS
app.post("/save-order-details", async (req, res) => {
  const { name, email, phone, address, city, state, zip, country, sessionId } = req.body;

  try {
    await Order.findOneAndUpdate(
      { stripeSessionId: sessionId },
      { name, email, phone, address, city, state, zip, country }
    );

    res.json({ message: "✅ Details saved" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🚀 START SERVER
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
