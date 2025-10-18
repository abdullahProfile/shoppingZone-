const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1'],
    max: [10, 'Maximum quantity per item is 10']
  },
  size: {
    type: String,
    required: true,
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36', '38', '40', '42']
  },
  color: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  // Reservation info for concurrency control
  reservationId: {
    type: String,
    sparse: true
  },
  reservedAt: {
    type: Date,
    sparse: true
  },
  reservationExpiry: {
    type: Date,
    sparse: true
  }
});

const cartSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    sparse: true,
    index: true
  },
  items: [cartItemSchema],
  totalItems: {
    type: Number,
    default: 0
  },
  totalPrice: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['active', 'abandoned', 'converted', 'expired'],
    default: 'active'
  },
  // Concurrency control
  version: {
    type: Number,
    default: 0
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  // Cart expiration (for cleanup)
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    expires: 0
  },
  // Metadata for analytics
  metadata: {
    userAgent: String,
    ipAddress: String,
    referrer: String,
    utm: {
      source: String,
      medium: String,
      campaign: String
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
cartSchema.index({ sessionId: 1, status: 1 });
cartSchema.index({ userId: 1, status: 1 });
cartSchema.index({ lastActivity: -1 });
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
cartSchema.index({ 'items.product': 1 });

// Virtual for cart summary
cartSchema.virtual('summary').get(function() {
  return {
    itemCount: this.totalItems,
    totalPrice: this.totalPrice,
    currency: this.currency,
    isEmpty: this.totalItems === 0
  };
});

// Pre-save middleware to update totals and version
cartSchema.pre('save', function(next) {
  // Calculate totals
  this.totalItems = this.items.reduce((total, item) => total + item.quantity, 0);
  this.totalPrice = this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
  
  // Update activity timestamp
  this.lastActivity = new Date();
  
  // Increment version for optimistic locking
  if (this.isModified('items')) {
    this.version += 1;
  }
  
  next();
});

// Static methods for atomic cart operations
cartSchema.statics.addItem = async function(sessionId, itemData, session = null) {
  const options = session ? { session } : {};
  
  // Find or create cart
  let cart = await this.findOne({ sessionId }, null, options);
  
  if (!cart) {
    cart = new this({ sessionId, items: [] });
  }
  
  // Check if item already exists (same product, size, color)
  const existingItemIndex = cart.items.findIndex(item => 
    item.product.toString() === itemData.product.toString() &&
    item.size === itemData.size &&
    item.color === itemData.color
  );
  
  if (existingItemIndex > -1) {
    // Update existing item quantity
    const newQuantity = cart.items[existingItemIndex].quantity + itemData.quantity;
    if (newQuantity > 10) {
      throw new Error('Maximum quantity per item is 10');
    }
    cart.items[existingItemIndex].quantity = newQuantity;
    cart.items[existingItemIndex].addedAt = new Date();
  } else {
    // Add new item
    cart.items.push({
      ...itemData,
      addedAt: new Date()
    });
  }
  
  await cart.save(options);
  await cart.populate('items.product');
  
  return cart;
};

cartSchema.statics.updateItemQuantity = async function(sessionId, itemId, quantity, session = null) {
  const options = session ? { session } : {};
  
  if (quantity <= 0) {
    return this.removeItem(sessionId, itemId, session);
  }
  
  if (quantity > 10) {
    throw new Error('Maximum quantity per item is 10');
  }
  
  const cart = await this.findOneAndUpdate(
    {
      sessionId,
      'items._id': itemId
    },
    {
      $set: {
        'items.$.quantity': quantity,
        'items.$.addedAt': new Date()
      },
      $inc: { version: 1 }
    },
    { new: true, ...options }
  );
  
  if (!cart) {
    throw new Error('Cart or item not found');
  }
  
  await cart.populate('items.product');
  return cart;
};

cartSchema.statics.removeItem = async function(sessionId, itemId, session = null) {
  const options = session ? { session } : {};
  
  const cart = await this.findOneAndUpdate(
    { sessionId },
    {
      $pull: { items: { _id: itemId } },
      $inc: { version: 1 }
    },
    { new: true, ...options }
  );
  
  if (!cart) {
    throw new Error('Cart not found');
  }
  
  await cart.populate('items.product');
  return cart;
};

cartSchema.statics.clearCart = async function(sessionId, session = null) {
  const options = session ? { session } : {};
  
  const cart = await this.findOneAndUpdate(
    { sessionId },
    {
      $set: { items: [] },
      $inc: { version: 1 }
    },
    { new: true, ...options }
  );
  
  return cart;
};

// Instance methods
cartSchema.methods.validateVersion = function(expectedVersion) {
  return this.version === expectedVersion;
};

cartSchema.methods.hasItem = function(productId, size, color) {
  return this.items.some(item => 
    item.product.toString() === productId.toString() &&
    item.size === size &&
    item.color === color
  );
};

cartSchema.methods.getItem = function(itemId) {
  return this.items.find(item => item._id.toString() === itemId.toString());
};

cartSchema.methods.reserveItems = async function(reservationId, expiryMinutes = 15) {
  const expiryTime = new Date(Date.now() + expiryMinutes * 60 * 1000);
  
  this.items.forEach(item => {
    item.reservationId = reservationId;
    item.reservedAt = new Date();
    item.reservationExpiry = expiryTime;
  });
  
  this.version += 1;
  await this.save();
  return this;
};

cartSchema.methods.releaseReservation = async function() {
  this.items.forEach(item => {
    item.reservationId = undefined;
    item.reservedAt = undefined;
    item.reservationExpiry = undefined;
  });
  
  this.version += 1;
  await this.save();
  return this;
};

cartSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

cartSchema.methods.extend = function(days = 7) {
  this.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return this;
};

// Static method to clean up expired reservations
cartSchema.statics.cleanupExpiredReservations = async function() {
  const now = new Date();
  
  const result = await this.updateMany(
    {
      'items.reservationExpiry': { $lt: now }
    },
    {
      $unset: {
        'items.$[elem].reservationId': '',
        'items.$[elem].reservedAt': '',
        'items.$[elem].reservationExpiry': ''
      },
      $inc: { version: 1 }
    },
    {
      arrayFilters: [{ 'elem.reservationExpiry': { $lt: now } }]
    }
  );
  
  return result;
};

module.exports = mongoose.model('Cart', cartSchema);