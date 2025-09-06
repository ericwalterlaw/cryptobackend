import express from "express";
import auth, { adminMiddleware } from "../middleware/auth.js";
import User from "../models/User.js";
import Portfolio from "../models/Portfolio.js";
import Transaction from "../models/Transaction.js";

const router = express.Router();

// 🔐 All admin routes protected
router.use(auth, adminMiddleware);

// 📌 Get all users
router.get("/users", async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching users", error: error.message });
  }
});

// 📌 Get a user portfolio
router.get("/portfolio/:userId", async (req, res) => {
  try {
    const portfolio = await Portfolio.findOne({ userId: req.params.userId });
    if (!portfolio) {
      return res.status(404).json({ success: false, message: "Portfolio not found" });
    }
    res.json({ success: true, portfolio });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching portfolio", error: error.message });
  }
});

// 📌 Admin can add/update holdings in a portfolio
router.post("/portfolio/:userId/holdings", async (req, res) => {
  try {
    const { symbol, name, amount, price, type } = req.body;
    let portfolio = await Portfolio.findOne({ userId: req.params.userId });

    if (!portfolio) {
      portfolio = new Portfolio({ userId: req.params.userId, holdings: [] });
    }

    portfolio.addOrUpdateHolding(symbol, name, amount, price, type);
    await portfolio.save();

    res.json({ success: true, message: "Portfolio updated", portfolio });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating portfolio", error: error.message });
  }
});

// 📌 Admin can create a transaction
router.post("/transactions", async (req, res) => {
  try {
    const { userId, type, symbol, name, amount, price, fee, notes } = req.body;

    const transaction = new Transaction({
      userId,
      type,
      symbol,
      name,
      amount,
      price,
      fee,
      total: (type === "buy" ? amount * price + (fee || 0) : amount * price - (fee || 0)),
      status: "completed",
      notes
    });

    await transaction.save();
    res.status(201).json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating transaction", error: error.message });
  }
});

export default router;
