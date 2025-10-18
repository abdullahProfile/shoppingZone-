const { v4: uuidv4 } = require('uuid');

/**
 * PaymentService handles payment processing with async operations
 * and event-driven architecture to simulate real payment gateways
 */
class PaymentService {
  constructor(eventEmitter) {
    this.eventEmitter = eventEmitter;
    this.pendingPayments = new Map();
    this.paymentHistory = new Map();
    
    // Simulate different payment gateway response times and success rates
    this.gateways = {
      stripe: {
        name: 'Stripe',
        processingTime: [1000, 3000], // 1-3 seconds
        successRate: 0.95,
        errors: ['card_declined', 'insufficient_funds', 'network_error']
      },
      paypal: {
        name: 'PayPal',
        processingTime: [2000, 5000], // 2-5 seconds
        successRate: 0.92,
        errors: ['account_limited', 'insufficient_funds', 'network_error']
      },
      mock_gateway: {
        name: 'Mock Gateway',
        processingTime: [500, 2000], // 0.5-2 seconds
        successRate: 0.90,
        errors: ['card_declined', 'expired_card', 'network_error']
      }
    };

    // Set up event handlers for different payment events (only if eventEmitter exists)
    if (this.eventEmitter) {
      this.setupEventHandlers();
    }
  }

  /**
   * Setup event handlers for payment processing
   */
 setupEventHandlers() {
    if (!this.eventEmitter) {
      console.warn('⚠️  EventEmitter not available, payment events will be disabled');
      return;
    }

    this.eventEmitter.on('payment:initiated', async (paymentData) => {
      console.log(`💳 Payment initiated: ${paymentData.transactionId}`);
      await this.processPaymentAsync(paymentData);
    });

    this.eventEmitter.on('payment:completed', async (paymentData) => {
      console.log(`✅ Payment completed: ${paymentData.transactionId}`);
      // Additional post-completion processing can be added here
    });

    this.eventEmitter.on('payment:failed', async (paymentData) => {
      console.log(`❌ Payment failed: ${paymentData.transactionId}`);
      await this.handlePaymentFailure(paymentData);
    });
  }


  /**
   * Process payment synchronously (returns immediately with pending status)
   */
  async processPayment(paymentData) {
    const {
      amount,
      currency = 'USD',
      method = 'credit_card',
      gateway = 'mock_gateway',
      customerInfo,
      orderId
    } = paymentData;

    // Generate transaction ID if not provided
    const transactionId = paymentData.transactionId || this.generateTransactionId();

    // Validate payment data
    const validation = this.validatePaymentData({
      ...paymentData,
      transactionId
    });
    
    if (!validation.valid) {
      throw new Error(`Payment validation failed: ${validation.errors.join(', ')}`);
    }

    // Create payment record
    const payment = {
      transactionId,
      amount,
      currency,
      method,
      gateway,
      status: 'pending',
      orderId,
      customerInfo,
      createdAt: new Date(),
      metadata: paymentData.metadata || {}
    };

    // Store pending payment
    this.pendingPayments.set(transactionId, payment);

    // Emit payment initiated event (async processing will start)
    if (this.eventEmitter) {
      this.eventEmitter.emit('payment:initiated', payment);
    }

    return {
      transactionId,
      status: 'pending',
      message: 'Payment processing initiated'
    };
  }

  /**
   * Process payment asynchronously (simulates real gateway processing)
   */
  async processPaymentAsync(paymentData) {
    const { transactionId, gateway } = paymentData;
    
    try {
      // Get gateway configuration
      const gatewayConfig = this.gateways[gateway] || this.gateways.mock_gateway;
      
      // Simulate network delay
      const processingTime = this.getRandomInRange(
        gatewayConfig.processingTime[0],
        gatewayConfig.processingTime[1]
      );
      
      console.log(`⏳ Processing payment ${transactionId} via ${gatewayConfig.name} (${processingTime}ms)`);
      
      await this.delay(processingTime);

      // Simulate payment gateway response
      const success = Math.random() < gatewayConfig.successRate;
      
      if (success) {
        await this.completePayment(transactionId, {
          gatewayTransactionId: `${gateway}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
          gatewayResponse: {
            status: 'approved',
            authCode: this.generateAuthCode(),
            timestamp: new Date().toISOString()
          }
        });
      } else {
        // Simulate failure
        const errorType = gatewayConfig.errors[Math.floor(Math.random() * gatewayConfig.errors.length)];
        await this.failPayment(transactionId, {
          error: errorType,
          message: this.getErrorMessage(errorType),
          gatewayResponse: {
            status: 'declined',
            errorCode: errorType,
            timestamp: new Date().toISOString()
          }
        });
      }

    } catch (error) {
      console.error(`💥 Error processing payment ${transactionId}:`, error);
      await this.failPayment(transactionId, {
        error: 'processing_error',
        message: error.message,
        gatewayResponse: {
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Complete a payment successfully
   */
  async completePayment(transactionId, completionData) {
    const payment = this.pendingPayments.get(transactionId);
    
    if (!payment) {
      throw new Error(`Payment ${transactionId} not found`);
    }

    // Update payment status
    payment.status = 'completed';
    payment.completedAt = new Date();
    payment.gatewayTransactionId = completionData.gatewayTransactionId;
    payment.gatewayResponse = completionData.gatewayResponse;

    // Move from pending to history
    this.pendingPayments.delete(transactionId);
    this.paymentHistory.set(transactionId, payment);

    // Emit completion event
    if (this.eventEmitter) {
      this.eventEmitter.emit('payment:completed', payment);
    }

    return payment;
  }

  /**
   * Fail a payment
   */
  async failPayment(transactionId, failureData) {
    const payment = this.pendingPayments.get(transactionId);
    
    if (!payment) {
      throw new Error(`Payment ${transactionId} not found`);
    }

    // Update payment status
    payment.status = 'failed';
    payment.failedAt = new Date();
    payment.failureReason = failureData.message;
    payment.errorCode = failureData.error;
    payment.gatewayResponse = failureData.gatewayResponse;

    // Move from pending to history
    this.pendingPayments.delete(transactionId);
    this.paymentHistory.set(transactionId, payment);

    // Emit failure event
    if (this.eventEmitter) {
      this.eventEmitter.emit('payment:failed', payment);
    }

    return payment;
  }

  /**
   * Get payment status
   */
  getPaymentStatus(transactionId) {
    // Check pending payments first
    const pendingPayment = this.pendingPayments.get(transactionId);
    if (pendingPayment) {
      return {
        ...pendingPayment,
        isPending: true
      };
    }

    // Check payment history
    const historicalPayment = this.paymentHistory.get(transactionId);
    if (historicalPayment) {
      return {
        ...historicalPayment,
        isPending: false
      };
    }

    return null;
  }

  /**
   * Process refund
   */
  async processRefund(transactionId, refundAmount = null) {
    const payment = this.paymentHistory.get(transactionId);
    
    if (!payment || payment.status !== 'completed') {
      throw new Error(`Payment ${transactionId} cannot be refunded`);
    }

    const refundId = this.generateTransactionId('REF');
    const amount = refundAmount || payment.amount;

    if (amount > payment.amount) {
      throw new Error('Refund amount cannot exceed original payment amount');
    }

    // Create refund record
    const refund = {
      refundId,
      originalTransactionId: transactionId,
      amount,
      currency: payment.currency,
      status: 'pending',
      createdAt: new Date(),
      gateway: payment.gateway
    };

    // Store pending refund
    this.pendingPayments.set(refundId, refund);

    // Emit refund initiated event
    if (this.eventEmitter) {
      this.eventEmitter.emit('refund:initiated', refund);
    }

    // Process refund asynchronously
    setTimeout(async () => {
      try {
        // Simulate refund processing
        await this.delay(2000);
        
        refund.status = 'completed';
        refund.completedAt = new Date();
        refund.gatewayRefundId = `REF_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

        // Move from pending to history
        this.pendingPayments.delete(refundId);
        this.paymentHistory.set(refundId, refund);

        // Update original payment
        payment.refunds = payment.refunds || [];
        payment.refunds.push(refund);

        if (this.eventEmitter) {
          this.eventEmitter.emit('refund:completed', refund);
        }

      } catch (error) {
        console.error(`Error processing refund ${refundId}:`, error);
        refund.status = 'failed';
        refund.failureReason = error.message;
        
        this.pendingPayments.delete(refundId);
        this.paymentHistory.set(refundId, refund);
        
        if (this.eventEmitter) {
          this.eventEmitter.emit('refund:failed', refund);
        }
      }
    }, 100);

    return {
      refundId,
      status: 'pending',
      message: 'Refund processing initiated'
    };
  }

  /**
   * Handle payment failure cleanup
   */
  async handlePaymentFailure(paymentData) {
    // Emit stock release event if order is associated
    if (paymentData.orderId && this.eventEmitter) {
      this.eventEmitter.emit('order:payment_failed', {
        orderId: paymentData.orderId,
        transactionId: paymentData.transactionId,
        reason: paymentData.failureReason
      });
    }

    // Log for analytics
    console.log(`📊 Payment failure logged: ${paymentData.transactionId}`);
  }

  /**
   * Validate payment data
   */
  validatePaymentData(paymentData) {
    const errors = [];
    
    if (!paymentData.amount || paymentData.amount <= 0) {
      errors.push('Invalid payment amount');
    }

    if (!paymentData.currency) {
      errors.push('Currency is required');
    }

    if (!paymentData.method) {
      errors.push('Payment method is required');
    }

    if (!paymentData.customerInfo) {
      errors.push('Customer information is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate transaction ID
   */
  generateTransactionId(prefix = 'TXN') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
  }

  /**
   * Generate authorization code
   */
  generateAuthCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  /**
   * Get random number in range
   */
  getRandomInRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Get error message for error type
   */
  getErrorMessage(errorType) {
    const messages = {
      card_declined: 'Your card was declined. Please try a different payment method.',
      insufficient_funds: 'Insufficient funds available for this transaction.',
      expired_card: 'Your card has expired. Please use a valid card.',
      network_error: 'Network error occurred. Please try again later.',
      account_limited: 'Your account has limitations. Please contact support.',
      processing_error: 'An error occurred while processing your payment.'
    };

    return messages[errorType] || 'Payment processing failed';
  }

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get payment statistics
   */
  getStats() {
    return {
      pendingPayments: this.pendingPayments.size,
      completedPayments: Array.from(this.paymentHistory.values())
        .filter(p => p.status === 'completed').length,
      failedPayments: Array.from(this.paymentHistory.values())
        .filter(p => p.status === 'failed').length,
      totalVolume: Array.from(this.paymentHistory.values())
        .filter(p => p.status === 'completed')
        .reduce((total, payment) => total + payment.amount, 0)
    };
  }
}

module.exports = PaymentService;