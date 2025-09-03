import express from 'express';
import { body, validationResult } from 'express-validator';
import auth from '../middleware/auth.js';
import Portfolio from '../models/Portfolio.js';
import Transaction from '../models/Transaction.js';

const router = express.Router();

// Mock crypto price data (in a real app, you'd fetch from CoinGecko or similar)
const mockPrices = {
  'BTC': { price: 43250.00, change: 2.5 },
  'ETH': { price: 2650.00, change: -1.2 },
  'BNB': { price: 315.50, change: 3.8 },
  'SOL': { price: 98.75, change: 7.2 },
  'ADA': { price: 0.52, change: -0.8 },
  'DOT': { price: 7.45, change: 4.1 }
};

// @route   GET /api/portfolio
// @desc    Get user's portfolio
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    let portfolio = await Portfolio.findOne({ userId: req.user.id });

    if (!portfolio) {
      // Create empty portfolio if it doesn't exist
      portfolio = await Portfolio.create({
        userId: req.user.id,
        holdings: []
      });
    }

    // Update current prices
    portfolio.updateCurrentPrices(mockPrices);
    await portfolio.save();

    // Format response data
    const portfolioData = {
      totalValue: portfolio.totalValue,
      totalInvested: portfolio.totalInvested,
      totalGain: portfolio.totalGainLoss,
      gainPercentage: portfolio.totalGainLossPercentage,
      assets: portfolio.holdings.map(holding => ({
        symbol: holding.symbol,
        name: holding.name,
        amount: holding.amount,
        avgPrice: holding.averagePrice,
        currentPrice: holding.currentPrice || holding.averagePrice,
        value: holding.amount * (holding.currentPrice || holding.averagePrice),
        change: mockPrices[holding.symbol]?.change || 0,
        allocation: portfolio.totalValue > 0 ? 
          ((holding.amount * (holding.currentPrice || holding.averagePrice)) / portfolio.totalValue) * 100 : 0
      }))
    };

    res.json({
      success: true,
      portfolio: portfolioData
    });
  } catch (error) {
    console.error('Get portfolio error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/portfolio/trade
// @desc    Execute a trade (buy/sell)
// @access  Private
router.post('/trade', auth, [
  body('type').isIn(['buy', 'sell']).withMessage('Type must be buy or sell'),
  body('symbol').trim().toUpperCase().notEmpty().withMessage('Symbol is required'),
  body('name').trim().notEmpty().withMessage('Cryptocurrency name is required'),
  body('amount').isFloat({ min: 0.000001 }).withMessage('Amount must be a positive number'),
  body('price').isFloat({ min: 0.01 }).withMessage('Price must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { type, symbol, name, amount, price } = req.body;
    const fee = (amount * price) * 0.005; // 0.5% fee
    const total = type === 'buy' ? (amount * price) + fee : (amount * price) - fee;

    // Get or create portfolio
    let portfolio = await Portfolio.findOne({ userId: req.user.id });
    if (!portfolio) {
      portfolio = await Portfolio.create({
        userId: req.user.id,
        holdings: []
      });
    }

    // Execute trade
    try {
      portfolio.addOrUpdateHolding(symbol, name, amount, price, type);
      await portfolio.save();

      // Create transaction record
      const transaction = await Transaction.create({
        userId: req.user.id,
        type,
        symbol: symbol.toUpperCase(),
        name,
        amount,
        price,
        fee,
        total,
        status: 'completed'
      });

      res.json({
        success: true,
        message: `${type === 'buy' ? 'Purchase' : 'Sale'} completed successfully`,
        transaction: {
          id: transaction._id,
          type: transaction.type,
          symbol: transaction.symbol,
          amount: transaction.amount,
          price: transaction.price,
          fee: transaction.fee,
          total: transaction.total,
          date: transaction.createdAt
        },
        portfolio: {
          totalValue: portfolio.totalValue,
          totalInvested: portfolio.totalInvested,
          totalGain: portfolio.totalGainLoss,
          gainPercentage: portfolio.totalGainLossPercentage
        }
      });
    } catch (tradeError) {
      return res.status(400).json({
        success: false,
        message: tradeError.message
      });
    }
  } catch (error) {
    console.error('Trade execution error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during trade execution'
    });
  }
});

// @route   GET /api/portfolio/performance
// @desc    Get portfolio performance metrics
// @access  Private
router.get('/performance', auth, async (req, res) => {
  try {
    const portfolio = await Portfolio.findOne({ userId: req.user.id });
    
    if (!portfolio) {
      return res.json({
        success: true,
        performance: {
          totalReturn: 0,
          totalReturnPercentage: 0,
          bestPerformer: null,
          worstPerformer: null,
          diversificationScore: 0
        }
      });
    }

    // Update current prices
    portfolio.updateCurrentPrices(mockPrices);

    let bestPerformer = null;
    let worstPerformer = null;
    let bestGain = -Infinity;
    let worstGain = Infinity;

    portfolio.holdings.forEach(holding => {
      const currentPrice = holding.currentPrice || holding.averagePrice;
      const gainLoss = ((currentPrice - holding.averagePrice) / holding.averagePrice) * 100;

      if (gainLoss > bestGain) {
        bestGain = gainLoss;
        bestPerformer = {
          symbol: holding.symbol,
          name: holding.name,
          gain: gainLoss
        };
      }

      if (gainLoss < worstGain) {
        worstGain = gainLoss;
        worstPerformer = {
          symbol: holding.symbol,
          name: holding.name,
          gain: gainLoss
        };
      }
    });

    // Calculate diversification score (simplified)
    const diversificationScore = Math.min(portfolio.holdings.length * 20, 100);

    res.json({
      success: true,
      performance: {
        totalReturn: portfolio.totalGainLoss,
        totalReturnPercentage: portfolio.totalGainLossPercentage,
        bestPerformer,
        worstPerformer,
        diversificationScore,
        holdingsCount: portfolio.holdings.length,
        lastUpdated: portfolio.lastUpdated
      }
    });
  } catch (error) {
    console.error('Get portfolio performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

export default router;