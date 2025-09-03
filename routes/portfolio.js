import express from 'express';
import { body, validationResult } from 'express-validator';
import auth from '../middleware/auth.js';
import Portfolio from '../models/Portfolio.js';
import Transaction from '../models/Transaction.js';
import axios from 'axios';


const router = express.Router();

// Fetch top coins prices
async function fetchCryptoPrices(symbols = ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'DOT']) {
  try {
    const idsMap = {
      BTC: 'bitcoin',
      ETH: 'ethereum',
      BNB: 'binancecoin',
      SOL: 'solana',
      ADA: 'cardano',
      DOT: 'polkadot'
    };

    const ids = symbols.map(s => idsMap[s]).join(',');

    const { data } = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price`,
      {
        params: {
          ids,
          vs_currencies: 'usd',
          include_24hr_change: 'true'
        }
      }
    );

    // Format like your mockPrices
    const prices = {};
    symbols.forEach(symbol => {
      const id = idsMap[symbol];
      prices[symbol] = {
        price: data[id].usd,
        change: data[id].usd_24h_change
      };
    });

    return prices;
  } catch (err) {
    console.error('Error fetching live prices:', err.message);
    return {};
  }
}




// @route   GET /api/portfolio
// @desc    Get user's portfolio with live prices
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    let portfolio = await Portfolio.findOne({ userId: req.user.id });

    if (!portfolio) {
      portfolio = await Portfolio.create({
        userId: req.user.id,
        holdings: []
      });
    }

    const symbols = portfolio.holdings.map((h) => h.symbol);
    const livePrices = await fetchCryptoPrices(symbols);

    // Update current prices in holdings
    portfolio.holdings.forEach((holding) => {
      const priceData = livePrices[holding.symbol];
      if (priceData) {
        holding.currentPrice = priceData.price;
        holding.change = priceData.change;
      } else {
        // fallback to average price if API didn’t return data
        holding.currentPrice = holding.averagePrice;
        holding.change = 0;
      }
    });

    await portfolio.save();

    // Build portfolio response
    const portfolioData = {
      totalValue: portfolio.totalValue,
      totalInvested: portfolio.totalInvested,
      totalGain: portfolio.totalGainLoss,
      gainPercentage: portfolio.totalGainLossPercentage,
      assets: portfolio.holdings.map((holding) => ({
        symbol: holding.symbol,
        name: holding.name,
        amount: holding.amount,
        avgPrice: holding.averagePrice,
        currentPrice: holding.currentPrice,
        value: holding.amount * holding.currentPrice,
        change: holding.change,
        allocation:
          portfolio.totalValue > 0
            ? (holding.amount * holding.currentPrice / portfolio.totalValue) * 100
            : 0
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