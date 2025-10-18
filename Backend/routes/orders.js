const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const PaymentService = require('../services/PaymentService');
const asyncHandler = require('../middleware/asyncHandler');
const { validateOrder } = require('../middleware/validation');
const { v4: uuidv4 } = require('uuid');

// Lazy initialization of PaymentService
let paymentService = null;

// Function to get PaymentService instance
const getPaymentService = () => {
  if (!paymentService) {
    paymentService = new PaymentService(global.eventEmitter);
  }
  return paymentService;
};

/**
 * Middleware to ensure session ID exists
 */
const ensureSessionId = (req, res, next) => {
  if (!req.session.id) {
    req.session.id = uuidv4();
    req.session.save();
  }
  req.sessionId = req.session.id;
  next();
};

router.use(ensureSessionId);

/**
 * GET /api/orders
 * Get orders for current session/user
 */
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  
  const query = { sessionId: req.sessionId };
  if (status) {
    query.status = status;
  }

  const skip = (Number(page) - 1) * Number(limit);
  
  const [orders, total] = await Promise.all([
    Order.find(query)
      .select('-__v')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Order.countDocuments(query)
  ]);

  const totalPages = Math.ceil(total / Number(limit));

  res.json({
    success: true,
    data: {
      orders,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalOrders: total,
        limit: Number(limit)
      }
    }
  });
}));

/**
 * GET /api/orders/:orderId
 * Get single order details
 */
router.get('/:orderId', asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    $or: [
      { _id: req.params.orderId },
      { orderNumber: req.params.orderId }
    ],
    sessionId: req.sessionId
  }).select('-__v');

  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'Order not found'
    });
  }

  res.json({
    success: true,
    data: { order }
  });
}));

/**
 * POST /api/orders/create
 * Create order from cart with payment processing
 */
router.post('/create', validateOrder, asyncHandler(async (req, res) => {
  const {
    shippingAddress,
    billingAddress,
    payment,
    customerNotes,
    metadata
  } = req.body;

  try {
    // Get cart with populated products
    const cart = await Cart.findOne({ sessionId: req.sessionId })
      .populate('items.product');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Cart is empty'
      });
    }

    // Validate cart items and stock
    const stockValidation = [];
    for (const item of cart.items) {
      if (!item.product || !item.product.isActive) {
        return res.status(400).json({
          success: false,
          error: `Product ${item.product?.name || 'unknown'} is no longer available`
        });
      }

      const currentStock = Math.max(0, item.product.stock - item.product.reservedStock);
      if (currentStock < item.quantity) {
        stockValidation.push({
          product: item.product.name,
          requested: item.quantity,
          available: currentStock
        });
      }
    }

    if (stockValidation.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient stock for some items',
        details: stockValidation
      });
    }

    // Create order and process payment atomically
    const result = await global.concurrencyManager.executeTransaction([
      async (session) => {
        // Create order from cart
        const orderData = {
          shippingAddress,
          billingAddress,
          payment,
          customerNotes,
          metadata: {
            ...metadata,
            userAgent: req.get('User-Agent'),
            ipAddress: req.ip,
            referrer: req.get('Referrer')
          }
        };

        const order = await Order.createFromCart(cart, orderData, session);
        
        // Reserve stock for all items
        const reservationId = uuidv4();
        order.reserve(reservationId, 15); // 15 minutes reservation
        await order.save({ session });

        // Reserve stock for each product
        for (const item of cart.items) {
          await Product.reserveStock(item.product._id, item.quantity, session);
        }

        return order;
      }
    ]);

    const order = result[0];

    // Process payment asynchronously
    try {
      const paymentResult = await getPaymentService().processPayment({
        transactionId: order.payment.transactionId,
        amount: order.pricing.total,
        currency: 'USD',
        method: payment.method,
        gateway: payment.gateway || 'mock_gateway',
        orderId: order._id.toString(),
        customerInfo: {
          email: shippingAddress.email,
          name: `${shippingAddress.firstName} ${shippingAddress.lastName}`,
          phone: shippingAddress.phone
        }
      });

      console.log(`💳 Payment initiated for order ${order.orderNumber}: ${paymentResult.transactionId}`);

    } catch (paymentError) {
      console.error(`Payment initiation failed for order ${order.orderNumber}:`, paymentError);
      
      // Update order status to payment failed
      order.status = 'payment_failed';
      order.payment.status = 'failed';
      order.payment.failureReason = paymentError.message;
      await order.save();
    }

    // Set up event listeners for this order
    setupOrderEventListeners(order._id.toString());

    // Clear cart after successful order creation
    await Cart.clearCart(req.sessionId);

    // Emit real-time order creation event
    global.io.to(req.sessionId).emit('order-created', {
      orderNumber: order.orderNumber,
      orderId: order._id,
      status: order.status,
      total: order.pricing.total
    });

    res.status(201).json({
      success: true,
      data: {
        order,
        message: 'Order created successfully. Payment is being processed.'
      }
    });

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * GET /api/orders/:orderId/status
 * Get order status with payment information
 */
router.get('/:orderId/status', asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    $or: [
      { _id: req.params.orderId },
      { orderNumber: req.params.orderId }
    ],
    sessionId: req.sessionId
  }).select('orderNumber status payment.status payment.transactionId statusHistory');

  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'Order not found'
    });
  }

  // Get payment status
  let paymentStatus = null;
  if (order.payment.transactionId) {
    paymentStatus = getPaymentService().getPaymentStatus(order.payment.transactionId);
  }

  res.json({
    success: true,
    data: {
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      paymentStatus: paymentStatus?.status || order.payment.status,
      statusHistory: order.statusHistory,
      lastUpdate: order.updatedAt
    }
  });
}));

/**
 * POST /api/orders/:orderId/cancel
 * Cancel an order (if allowed)
 */
router.post('/:orderId/cancel', asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    $or: [
      { _id: req.params.orderId },
      { orderNumber: req.params.orderId }
    ],
    sessionId: req.sessionId
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'Order not found'
    });
  }

  if (!order.canCancel()) {
    return res.status(400).json({
      success: false,
      error: 'Order cannot be cancelled in its current status'
    });
  }

  try {
    // Cancel order and release stock atomically
    await global.concurrencyManager.executeTransaction([
      async (session) => {
        // Update order status
        await Order.updateStatus(order._id, 'cancelled', 'Cancelled by customer', session);

        // Release reserved stock
        for (const item of order.items) {
          await Product.releaseStock(item.product, item.quantity, session);
        }

        return order;
      }
    ]);

    // Emit real-time order update
    global.io.to(req.sessionId).emit('order-updated', {
      orderNumber: order.orderNumber,
      orderId: order._id,
      status: 'cancelled'
    });

    res.json({
      success: true,
      data: {
        message: 'Order cancelled successfully'
      }
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * Setup event listeners for order processing
 */
function setupOrderEventListeners(orderId) {
  // Handle payment completion
  global.eventEmitter.onceAsync('payment:completed', async (paymentData) => {
    if (paymentData.orderId === orderId) {
      try {
        console.log(`✅ Payment completed for order ${orderId}`);
        
        // Update order status
        const order = await Order.updatePaymentStatus(
          orderId,
          'completed',
          paymentData.gatewayResponse
        );

        if (order) {
          // Confirm stock (move from reserved to sold)
          await global.concurrencyManager.executeTransaction([
            async (session) => {
              for (const item of order.items) {
                await Product.confirmStock(item.product, item.quantity, session);
              }
            }
          ]);

          // Emit real-time order update
          global.io.to(order.sessionId).emit('order-updated', {
            orderNumber: order.orderNumber,
            orderId: order._id,
            status: order.status,
            paymentStatus: 'completed'
          });

          // Send order confirmation (in real app, send email)
          console.log(`📧 Order confirmation sent for ${order.orderNumber}`);
        }

      } catch (error) {
        console.error(`Error handling payment completion for order ${orderId}:`, error);
      }
    }
  });

  // Handle payment failure
  global.eventEmitter.onceAsync('payment:failed', async (paymentData) => {
    if (paymentData.orderId === orderId) {
      try {
        console.log(`❌ Payment failed for order ${orderId}`);
        
        // Update order status
        const order = await Order.updatePaymentStatus(
          orderId,
          'failed',
          paymentData.gatewayResponse
        );

        if (order) {
          // Release reserved stock
          await global.concurrencyManager.executeTransaction([
            async (session) => {
              for (const item of order.items) {
                await Product.releaseStock(item.product, item.quantity, session);
              }
            }
          ]);

          // Emit real-time order update
          global.io.to(order.sessionId).emit('order-updated', {
            orderNumber: order.orderNumber,
            orderId: order._id,
            status: order.status,
            paymentStatus: 'failed',
            error: paymentData.failureReason
          });
        }

      } catch (error) {
        console.error(`Error handling payment failure for order ${orderId}:`, error);
      }
    }
  });
}

/**
 * GET /api/orders/stats/summary
 * Get order statistics (for admin/debugging)
 */
router.get('/stats/summary', asyncHandler(async (req, res) => {
  const stats = await Order.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalValue: { $sum: '$pricing.total' }
      }
    }
  ]);

  const paymentStats = paymentService.getStats();

  res.json({
    success: true,
    data: {
      orderStats: stats,
      paymentStats,
      concurrencyStats: global.concurrencyManager.getStatus()
    }
  });
}));

module.exports = router;