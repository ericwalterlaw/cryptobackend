import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['buy', 'sell', 'deposit', 'withdrawal'],
    lowercase: true
  },
  symbol: {
    type: String,
    required: function() {
      return this.type === 'buy' || this.type === 'sell';
    },
    uppercase: true
  },
  name: {
    type: String,
    required: function() {
      return this.type === 'buy' || this.type === 'sell';
    }
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  price: {
    type: Number,
    required: function() {
      return this.type === 'buy' || this.type === 'sell';
    },
    min: 0
  },
  fee: {
    type: Number,
    default: 0,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  notes: {
    type: String,
    maxlength: 500
  },
  transactionHash: {
    type: String,
    sparse: true
  },
  exchangeOrderId: {
    type: String,
    sparse: true
  }
}, {
  timestamps: true
});

// Calculate total before saving
transactionSchema.pre('save', function(next) {
  if (this.type === 'buy') {
    this.total = (this.amount * this.price) + this.fee;
  } else if (this.type === 'sell') {
    this.total = (this.amount * this.price) - this.fee;
  }
  next();
});

// Static method to get user transaction history
transactionSchema.statics.getUserTransactions = function(userId, options = {}) {
  const {
    page = 1,
    limit = 50,
    type,
    symbol,
    status,
    startDate,
    endDate
  } = options;

  const query = { userId };

  if (type) query.type = type;
  if (symbol) query.symbol = symbol.toUpperCase();
  if (status) query.status = status;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
};

// Static method to get transaction stats
transactionSchema.statics.getTransactionStats = function(userId, period = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalAmount: { $sum: '$total' }
      }
    }
  ]);
};

export default mongoose.model('Transaction', transactionSchema);