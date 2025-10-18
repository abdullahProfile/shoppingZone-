const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  productImage: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  size: {
    type: String,
    required: true
  },
  color: {
    type: String,
    required: true
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  }
});

const shippingAddressSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  address1: { type: String, required: true, trim: true },
  address2: { type: String, trim: true },
  city: { type: String, required: true, trim: true },
  state: { type: String, required: true, trim: true },
  zipCode: { type: String, required: true, trim: true },
  country: { type: String, required: true, trim: true, default: 'US' }
});

const paymentSchema = new mongoose.Schema({
  method: {
    type: String,
    required: true,
    enum: ['credit_card', 'debit_card', 'paypal', 'stripe', 'mock_payment']
  },
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending'
  },
  gateway: {
    type: String,
    default: 'mock_gateway'
  },
  gatewayResponse: {
    type: mongoose.Schema.Types.Mixed
  },
  processedAt: Date,
  failureReason: String
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    sparse: true,
    index: true
  },
  items: [orderItemSchema],
  shippingAddress: {
    type: shippingAddressSchema,
    required: true
  },
  billingAddress: {
    type: shippingAddressSchema,
    required: false // Can be same as shipping
  },
  payment: {
    type: paymentSchema,
    required: true
  },
  pricing: {
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    tax: {
      type: Number,
      default: 0,
      min: 0
    },
    shipping: {
      type: Number,
      default: 0,
      min: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    }
  },
  status: {
    type: String,
    enum: [
      'pending',           // Order created, awaiting payment
      'payment_processing', // Payment in progress
      'payment_failed',    // Payment failed
      'confirmed',         // Payment successful, order confirmed
      'processing',        // Order being prepared
      'shipped',           // Order shipped
      'delivered',         // Order delivered
      'cancelled',         // Order cancelled
      'refunded'           // Order refunded
    ],
    default: 'pending',
    index: true
  },
  // Event-driven status tracking
  statusHistory: [{
    status: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: String,
    updatedBy: {
      type: String,
      default: 'system'
    }
  }],
  // Shipping information
  shipping: {
    method: {
      type: String,
      enum: ['standard', 'express', 'overnight'],
      default: 'standard'
    },
    carrier: String,
    trackingNumber: String,
    estimatedDelivery: Date,
    actualDelivery: Date
  },
  // Concurrency control
  version: {
    type: Number,
    default: 0
  },
  // Stock reservation info
  stockReservation: {
    reservationId: String,
    reservedAt: Date,
    expiresAt: Date,
    released: {
      type: Boolean,
      default: false
    }
  },
  // Customer notes
  customerNotes: String,
  adminNotes: String,
  // Flags
  isGuestOrder: {
    type: Boolean,
    default: true
  },
  requiresSignature: {
    type: Boolean,
    default: false
  },
  isGift: {
    type: Boolean,
    default: false
  },
  giftMessage: String,
  // Metadata
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

// Indexes for performance and queries
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ sessionId: 1, status: 1 });
orderSchema.index({ userId: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'payment.transactionId': 1 });
orderSchema.index({ 'payment.status': 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'stockReservation.expiresAt': 1 });

// Virtual for order summary
orderSchema.virtual('summary').get(function() {
  return {
    orderNumber: this.orderNumber,
    status: this.status,
    itemCount: this.items.reduce((total, item) => total + item.quantity, 0),
    total: this.pricing.total,
    createdAt: this.createdAt
  };
});

// Pre-save middleware
orderSchema.pre('save', function(next) {
  // Generate order number if not exists
  if (!this.orderNumber) {
    this.orderNumber = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
  }
  
  // Update version for optimistic locking
  if (this.isModified('status') || this.isModified('payment.status')) {
    this.version += 1;
  }
  
  // Add status to history if status changed
  if (this.isModified('status') && !this.isNew) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
      note: `Status changed to ${this.status}`
    });
  }
  
  next();
});

// Static methods for order management
orderSchema.statics.createFromCart = async function(cart, orderData, session = null) {
  const options = session ? { session } : {};
  
  // Validate cart
  if (!cart || !cart.items || cart.items.length === 0) {
    throw new Error('Cannot create order from empty cart');
  }
  
  // Create order items from cart items
  const orderItems = cart.items.map(cartItem => ({
    product: cartItem.product._id || cartItem.product,
    productName: cartItem.product.name,
    productImage: cartItem.product.images?.[0]?.url || '/placeholder-image.jpg',
    quantity: cartItem.quantity,
    size: cartItem.size,
    color: cartItem.color,
    unitPrice: cartItem.price,
    totalPrice: cartItem.price * cartItem.quantity
  }));
  
  // Calculate pricing
  const subtotal = orderItems.reduce((total, item) => total + item.totalPrice, 0);
  const tax = Math.round(subtotal * 0.08 * 100) / 100; // 8% tax
  const shipping = subtotal > 100 ? 0 : 9.99; // Free shipping over $100
  const total = subtotal + tax + shipping;
  
  // Create order
  const order = new this({
    sessionId: cart.sessionId,
    userId: cart.userId,
    items: orderItems,
    shippingAddress: orderData.shippingAddress,
    billingAddress: orderData.billingAddress || orderData.shippingAddress,
    payment: {
      method: orderData.payment.method,
      transactionId: 'TXN-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8).toUpperCase(),
      amount: total,
      currency: 'USD',
      status: 'pending',
      gateway: orderData.payment.gateway || 'mock_gateway'
    },
    pricing: {
      subtotal,
      tax,
      shipping,
      discount: 0,
      total
    },
    customerNotes: orderData.customerNotes,
    isGuestOrder: !cart.userId,
    metadata: orderData.metadata
  });
  
  await order.save(options);
  return order;
};

orderSchema.statics.updatePaymentStatus = async function(orderId, paymentStatus, gatewayResponse = null, session = null) {
  const options = session ? { session } : {};
  
  const updateData = {
    'payment.status': paymentStatus,
    'payment.processedAt': new Date(),
    $inc: { version: 1 }
  };
  
  if (gatewayResponse) {
    updateData['payment.gatewayResponse'] = gatewayResponse;
  }
  
  // Update order status based on payment status
  if (paymentStatus === 'completed') {
    updateData.status = 'confirmed';
  } else if (paymentStatus === 'failed') {
    updateData.status = 'payment_failed';
    updateData['payment.failureReason'] = gatewayResponse?.error || 'Payment processing failed';
  }
  
  const order = await this.findByIdAndUpdate(
    orderId,
    updateData,
    { new: true, ...options }
  );
  
  return order;
};

orderSchema.statics.updateStatus = async function(orderId, newStatus, note = null, session = null) {
  const options = session ? { session } : {};
  
  const order = await this.findByIdAndUpdate(
    orderId,
    {
      status: newStatus,
      $push: {
        statusHistory: {
          status: newStatus,
          timestamp: new Date(),
          note: note || `Status updated to ${newStatus}`
        }
      },
      $inc: { version: 1 }
    },
    { new: true, ...options }
  );
  
  return order;
};

// Instance methods
orderSchema.methods.validateVersion = function(expectedVersion) {
  return this.version === expectedVersion;
};

orderSchema.methods.canCancel = function() {
  const cancellableStatuses = ['pending', 'payment_processing', 'confirmed'];
  return cancellableStatuses.includes(this.status);
};

orderSchema.methods.canRefund = function() {
  const refundableStatuses = ['confirmed', 'processing', 'shipped'];
  return refundableStatuses.includes(this.status) && this.payment.status === 'completed';
};

orderSchema.methods.isPaymentPending = function() {
  return this.payment.status === 'pending' || this.payment.status === 'processing';
};

orderSchema.methods.reserve = function(reservationId, expiryMinutes = 15) {
  this.stockReservation = {
    reservationId,
    reservedAt: new Date(),
    expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
    released: false
  };
  return this;
};

orderSchema.methods.releaseReservation = function() {
  if (this.stockReservation) {
    this.stockReservation.released = true;
  }
  return this;
};

orderSchema.methods.isReservationExpired = function() {
  return this.stockReservation && 
         !this.stockReservation.released && 
         this.stockReservation.expiresAt < new Date();
};

// Static method to process expired orders
orderSchema.statics.processExpiredOrders = async function() {
  const now = new Date();
  
  const expiredOrders = await this.find({
    status: { $in: ['pending', 'payment_processing'] },
    'stockReservation.expiresAt': { $lt: now },
    'stockReservation.released': { $ne: true }
  });
  
  const results = [];
  for (const order of expiredOrders) {
    try {
      order.status = 'cancelled';
      order.releaseReservation();
      await order.save();
      results.push({ orderId: order._id, status: 'cancelled' });
    } catch (error) {
      console.error(`Error processing expired order ${order._id}:`, error);
      results.push({ orderId: order._id, status: 'error', error: error.message });
    }
  }
  
  return results;
};

module.exports = mongoose.model('Order', orderSchema);