import { EventEmitter } from 'events';
import Order from '../models/Order.js';
import paymentService from '../services/PaymentService.js';

class PaymentEventHandler extends EventEmitter {
  constructor() {
    super();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Payment started event
    paymentService.on('paymentStarted', async (data) => {
      console.log(`Payment started: Order ${data.orderId}, Transaction ${data.transactionId}`);
      
      try {
        await Order.findByIdAndUpdate(data.orderId, {
          paymentStatus: 'processing',
          paymentTransactionId: data.transactionId,
          $push: {
            statusHistory: {
              status: 'processing',
              timestamp: new Date(),
              note: 'Payment processing started'
            }
          }
        });
      } catch (error) {
        console.error(`Failed to update order status for payment start: ${error.message}`);
      }

      // Emit to frontend clients (if using WebSocket)
      this.emit('paymentUpdate', {
        orderId: data.orderId,
        status: 'processing',
        message: 'Payment is being processed...',
        transactionId: data.transactionId
      });
    });

    // Payment success event
    paymentService.on('paymentSuccess', async (data) => {
      console.log(`Payment successful: Order ${data.orderId}, Transaction ${data.transactionId}`);
      
      try {
        // Confirm the order
        const confirmedOrder = await Order.confirmOrder(data.orderId, data.transactionId);
        
        console.log(`Order confirmed: ${confirmedOrder.orderNumber}`);
        
        // Emit success event to frontend
        this.emit('paymentUpdate', {
          orderId: data.orderId,
          status: 'success',
          message: 'Payment successful! Order confirmed.',
          transactionId: data.transactionId,
          orderNumber: confirmedOrder.orderNumber
        });
        
        // Emit order confirmation event
        this.emit('orderConfirmed', {
          orderId: data.orderId,
          orderNumber: confirmedOrder.orderNumber,
          totalAmount: confirmedOrder.totalAmount,
          timestamp: new Date()
        });
        
      } catch (error) {
        console.error(`Failed to confirm order after successful payment: ${error.message}`);
        
        // Even though payment succeeded, order confirmation failed
        this.emit('paymentUpdate', {
          orderId: data.orderId,
          status: 'error',
          message: 'Payment successful but order confirmation failed. Contact support.',
          transactionId: data.transactionId,
          error: error.message
        });
      }
    });

    // Payment failed event
    paymentService.on('paymentFailed', async (data) => {
      console.log(`Payment failed: Order ${data.orderId}, Error: ${data.error}`);
      
      try {
        // Cancel the order and release stock
        const cancelledOrder = await Order.cancelOrder(data.orderId, `Payment failed: ${data.error}`);
        
        console.log(`Order cancelled due to payment failure: ${cancelledOrder.orderNumber}`);
        
        // Emit failure event to frontend
        this.emit('paymentUpdate', {
          orderId: data.orderId,
          status: 'failed',
          message: 'Payment failed. Your order has been cancelled.',
          error: data.error,
          transactionId: data.transactionId,
          retryable: data.retryable || false
        });
        
      } catch (error) {
        console.error(`Failed to cancel order after payment failure: ${error.message}`);
        
        this.emit('paymentUpdate', {
          orderId: data.orderId,
          status: 'error',
          message: 'Payment failed and order cancellation failed. Contact support.',
          error: error.message,
          transactionId: data.transactionId
        });
      }
    });

    // Payment retry event
    paymentService.on('paymentRetry', (data) => {
      console.log(`Payment retry: Order ${data.orderId}, Attempt ${data.attempt}, Error: ${data.error}`);
      
      this.emit('paymentUpdate', {
        orderId: data.orderId,
        status: 'retrying',
        message: `Payment retry attempt ${data.attempt}...`,
        attempt: data.attempt,
        error: data.error,
        transactionId: data.transactionId
      });
    });

    // Payment cancelled event
    paymentService.on('paymentCancelled', async (data) => {
      console.log(`Payment cancelled: Order ${data.orderId}, Transaction ${data.transactionId}`);
      
      try {
        // Cancel the order and release stock
        await Order.cancelOrder(data.orderId, 'Payment cancelled by user');
        
        this.emit('paymentUpdate', {
          orderId: data.orderId,
          status: 'cancelled',
          message: 'Payment cancelled. Your order has been cancelled.',
          transactionId: data.transactionId
        });
        
      } catch (error) {
        console.error(`Failed to cancel order after payment cancellation: ${error.message}`);
      }
    });

    // Refund processed event
    paymentService.on('refundProcessed', (data) => {
      console.log(`Refund processed: ${data.refundId} for transaction ${data.originalTransactionId}`);
      
      this.emit('refundUpdate', {
        orderId: data.orderId,
        refundId: data.refundId,
        amount: data.amount,
        success: data.success,
        timestamp: data.timestamp
      });
    });

    // Payment error event (technical errors)
    paymentService.on('paymentError', (data) => {
      console.error(`Payment error: Order ${data.orderId}, Error: ${data.error}`);
      
      this.emit('paymentUpdate', {
        orderId: data.orderId,
        status: 'error',
        message: 'A technical error occurred during payment processing.',
        error: data.error,
        transactionId: data.transactionId
      });
    });
  }

  // Method to manually trigger payment processing for an order
  async processOrderPayment(orderId, paymentMethod, customerInfo) {
    try {
      const order = await Order.findById(orderId);
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      if (order.paymentStatus !== 'pending') {
        throw new Error('Order payment is not in pending status');
      }
      
      // Start payment processing
      const paymentResult = await paymentService.processPayment(
        orderId,
        order.totalAmount,
        paymentMethod,
        customerInfo
      );
      
      return paymentResult;
      
    } catch (error) {
      console.error(`Failed to process payment for order ${orderId}: ${error.message}`);
      
      // Emit error event
      this.emit('paymentUpdate', {
        orderId,
        status: 'error',
        message: 'Failed to start payment processing.',
        error: error.message
      });
      
      throw error;
    }
  }

  // Method to cancel payment processing
  async cancelOrderPayment(orderId) {
    try {
      const cancelled = await paymentService.cancelPayment(orderId);
      
      if (cancelled) {
        console.log(`Payment processing cancelled for order: ${orderId}`);
      }
      
      return cancelled;
      
    } catch (error) {
      console.error(`Failed to cancel payment for order ${orderId}: ${error.message}`);
      throw error;
    }
  }

  // Method to request refund
  async requestRefund(transactionId, amount = null, reason = 'Customer request') {
    try {
      const refundResult = await paymentService.refundPayment(transactionId, amount);
      
      console.log(`Refund requested: ${refundResult.refundId} for transaction ${transactionId}`);
      
      return refundResult;
      
    } catch (error) {
      console.error(`Failed to process refund for transaction ${transactionId}: ${error.message}`);
      throw error;
    }
  }

  // Get payment status for an order
  async getOrderPaymentStatus(orderId) {
    try {
      const order = await Order.findById(orderId);
      
      if (!order) {
        return { error: 'Order not found' };
      }
      
      const paymentStatus = order.paymentTransactionId 
        ? paymentService.getPaymentStatus(order.paymentTransactionId)
        : null;
      
      return {
        order: {
          id: order._id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalAmount: order.totalAmount
        },
        payment: paymentStatus,
        processing: paymentService.getProcessingPayments().find(p => p.orderId === orderId)
      };
      
    } catch (error) {
      console.error(`Failed to get payment status for order ${orderId}: ${error.message}`);
      return { error: error.message };
    }
  }
}

// Singleton instance
const paymentEventHandler = new PaymentEventHandler();

export default paymentEventHandler;