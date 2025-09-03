import express from 'express';
import { body, validationResult, query } from 'express-validator';
import auth from '../middleware/auth.js';
import Transaction from '../models/Transaction.js';

const router = express.Router();

// @route   GET /api/transactions
// @desc    Get user's transaction history
// @access  Private
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('type').optional().isIn(['buy', 'sell', 'deposit', 'withdrawal']).withMessage('Invalid transaction type'),
  query('status').optional().isIn(['pending', 'completed', 'failed', 'cancelled']).withMessage('Invalid status')
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

    const {
      page = 1,
      limit = 20,
      type,
      symbol,
      status,
      startDate,
      endDate
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      type,
      symbol,
      status,
      startDate,
      endDate
    };

    const transactions = await Transaction.getUserTransactions(req.user.id, options);
    
    // Get total count for pagination
    const query = { userId: req.user.id };
    if (type) query.type = type;
    if (symbol) query.symbol = symbol.toUpperCase();
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const totalTransactions = await Transaction.countDocuments(query);
    const totalPages = Math.ceil(totalTransactions / limit);

    res.json({
      success: true,
      transactions: transactions.map(tx => ({
        id: tx._id,
        type: tx.type,
        symbol: tx.symbol,
        name: tx.name,
        amount: tx.amount,
        price: tx.price,
        fee: tx.fee,
        total: tx.total,
        status: tx.status,
        date: tx.createdAt,
        notes: tx.notes
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalTransactions,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/transactions/recent
// @desc    Get recent transactions
// @access  Private
router.get('/recent', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      transactions: transactions.map(tx => ({
        id: tx._id,
        type: tx.type,
        symbol: tx.symbol,
        amount: tx.amount,
        price: tx.price,
        date: tx.createdAt.toISOString().split('T')[0],
        status: tx.status
      }))
    });
  } catch (error) {
    console.error('Get recent transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/transactions/stats
// @desc    Get transaction statistics
// @access  Private
router.get('/stats', auth, [
  query('period').optional().isInt({ min: 1, max: 365 }).withMessage('Period must be between 1 and 365 days')
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

    const { period = 30 } = req.query;
    const stats = await Transaction.getTransactionStats(req.user.id, parseInt(period));

    // Format stats
    const formattedStats = {
      period: parseInt(period),
      totalTransactions: 0,
      totalVolume: 0,
      buyTransactions: 0,
      sellTransactions: 0,
      buyVolume: 0,
      sellVolume: 0
    };

    stats.forEach(stat => {
      formattedStats.totalTransactions += stat.count;
      formattedStats.totalVolume += stat.totalAmount;

      if (stat._id === 'buy') {
        formattedStats.buyTransactions = stat.count;
        formattedStats.buyVolume = stat.totalAmount;
      } else if (stat._id === 'sell') {
        formattedStats.sellTransactions = stat.count;
        formattedStats.sellVolume = stat.totalAmount;
      }
    });

    res.json({
      success: true,
      stats: formattedStats
    });
  } catch (error) {
    console.error('Get transaction stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/transactions/:id
// @desc    Get specific transaction details
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      transaction: {
        id: transaction._id,
        type: transaction.type,
        symbol: transaction.symbol,
        name: transaction.name,
        amount: transaction.amount,
        price: transaction.price,
        fee: transaction.fee,
        total: transaction.total,
        status: transaction.status,
        notes: transaction.notes,
        transactionHash: transaction.transactionHash,
        exchangeOrderId: transaction.exchangeOrderId,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt
      }
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/transactions/:id/cancel
// @desc    Cancel a pending transaction
// @access  Private
router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user.id,
      status: 'pending'
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Pending transaction not found'
      });
    }

    transaction.status = 'cancelled';
    await transaction.save();

    res.json({
      success: true,
      message: 'Transaction cancelled successfully',
      transaction: {
        id: transaction._id,
        status: transaction.status,
        updatedAt: transaction.updatedAt
      }
    });
  } catch (error) {
    console.error('Cancel transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

export default router;