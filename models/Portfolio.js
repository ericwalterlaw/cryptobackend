import mongoose from 'mongoose';

const holdingSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  averagePrice: {
    type: Number,
    required: true,
    min: 0
  },
  totalInvested: {
    type: Number,
    required: true,
    min: 0
  },
  currentPrice: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  _id: false
});

const portfolioSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  holdings: [holdingSchema],
  totalValue: {
    type: Number,
    default: 0
  },
  totalInvested: {
    type: Number,
    default: 0
  },
  totalGainLoss: {
    type: Number,
    default: 0
  },
  totalGainLossPercentage: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Calculate portfolio totals
portfolioSchema.methods.calculateTotals = function() {
  let totalValue = 0;
  let totalInvested = 0;

  this.holdings.forEach(holding => {
    const currentValue = holding.amount * (holding.currentPrice || holding.averagePrice);
    totalValue += currentValue;
    totalInvested += holding.totalInvested;
  });

  this.totalValue = totalValue;
  this.totalInvested = totalInvested;
  this.totalGainLoss = totalValue - totalInvested;
  this.totalGainLossPercentage = totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0;
  this.lastUpdated = Date.now();

  return this;
};

// Add or update holding
portfolioSchema.methods.addOrUpdateHolding = function(symbol, name, amount, price, type = 'buy') {
  const existingHolding = this.holdings.find(h => h.symbol === symbol.toUpperCase());

  if (existingHolding) {
    if (type === 'buy') {
      // Calculate new average price
      const totalAmount = existingHolding.amount + amount;
      const totalValue = existingHolding.totalInvested + (amount * price);
      
      existingHolding.averagePrice = totalValue / totalAmount;
      existingHolding.amount = totalAmount;
      existingHolding.totalInvested = totalValue;
    } else if (type === 'sell') {
      if (existingHolding.amount < amount) {
        throw new Error('Insufficient holdings to sell');
      }
      
      // Reduce holdings proportionally
      const sellRatio = amount / existingHolding.amount;
      existingHolding.totalInvested *= (1 - sellRatio);
      existingHolding.amount -= amount;
      
      // Remove holding if amount becomes 0
      if (existingHolding.amount === 0) {
        this.holdings = this.holdings.filter(h => h.symbol !== symbol.toUpperCase());
      }
    }
  } else if (type === 'buy') {
    // Add new holding
    this.holdings.push({
      symbol: symbol.toUpperCase(),
      name,
      amount,
      averagePrice: price,
      totalInvested: amount * price
    });
  }

  return this.calculateTotals();
};

// Update current prices for all holdings
portfolioSchema.methods.updateCurrentPrices = function(priceData) {
  this.holdings.forEach(holding => {
    const priceInfo = priceData[holding.symbol];
    if (priceInfo) {
      holding.currentPrice = priceInfo.price;
      holding.lastUpdated = Date.now();
    }
  });

  return this.calculateTotals();
};

export default mongoose.model('Portfolio', portfolioSchema);