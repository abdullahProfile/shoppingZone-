import mongoose from 'mongoose';
import Product from '../models/Product.js';

class InventoryService {
  constructor() {
    this.pendingReservations = new Map(); // Track pending stock reservations
    this.reservationTimeout = 10 * 60 * 1000; // 10 minutes
    this.cleanupInterval = 5 * 60 * 1000; // 5 minutes
    
    // Cleanup expired reservations periodically
    this.startCleanupScheduler();
  }

  // Reserve stock for a product atomically
  async reserveStock(productId, quantity, sessionId, timeout = this.reservationTimeout) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Find product with current stock
      const product = await Product.findById(productId).session(session);
      
      if (!product) {
        throw new Error('Product not found');
      }
      
      if (!product.isActive) {
        throw new Error('Product is not available');
      }
      
      if (product.availableStock < quantity) {
        throw new Error(`Insufficient stock. Available: ${product.availableStock}, Requested: ${quantity}`);
      }
      
      // Use the model's static method for atomic stock reservation
      const updatedProduct = await Product.reserveStock(productId, quantity, session);
      
      // Track the reservation for cleanup
      const reservationId = this.generateReservationId();
      const reservation = {
        id: reservationId,
        productId,
        quantity,
        sessionId,
        timestamp: new Date(),
        expiresAt: new Date(Date.now() + timeout)
      };
      
      this.pendingReservations.set(reservationId, reservation);
      
      await session.commitTransaction();
      
      console.log(`Stock reserved: Product ${productId}, Quantity: ${quantity}, Session: ${sessionId}`);
      
      return {
        reservationId,
        product: updatedProduct,
        expiresAt: reservation.expiresAt
      };
      
    } catch (error) {
      await session.abortTransaction();
      console.error(`Stock reservation failed: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Release reserved stock
  async releaseStock(reservationId) {
    const reservation = this.pendingReservations.get(reservationId);
    
    if (!reservation) {
      console.warn(`Reservation not found: ${reservationId}`);
      return false;
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Use the model's static method for atomic stock release
      await Product.releaseStock(reservation.productId, reservation.quantity, session);
      
      // Remove from pending reservations
      this.pendingReservations.delete(reservationId);
      
      await session.commitTransaction();
      
      console.log(`Stock released: Product ${reservation.productId}, Quantity: ${reservation.quantity}`);
      
      return true;
      
    } catch (error) {
      await session.abortTransaction();
      console.error(`Stock release failed: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Confirm stock (convert reservation to actual sale)
  async confirmStock(reservationId) {
    const reservation = this.pendingReservations.get(reservationId);
    
    if (!reservation) {
      throw new Error(`Reservation not found: ${reservationId}`);
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Use the model's static method for atomic stock confirmation
      const updatedProduct = await Product.confirmStock(
        reservation.productId, 
        reservation.quantity, 
        session
      );
      
      // Remove from pending reservations
      this.pendingReservations.delete(reservationId);
      
      await session.commitTransaction();
      
      console.log(`Stock confirmed: Product ${reservation.productId}, Quantity: ${reservation.quantity}`);
      
      return updatedProduct;
      
    } catch (error) {
      await session.abortTransaction();
      console.error(`Stock confirmation failed: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Check product availability
  async checkAvailability(productId, quantity) {
    try {
      const product = await Product.findById(productId);
      
      if (!product) {
        return {
          available: false,
          reason: 'Product not found'
        };
      }
      
      if (!product.isActive) {
        return {
          available: false,
          reason: 'Product is not active'
        };
      }
      
      if (product.availableStock < quantity) {
        return {
          available: false,
          reason: `Insufficient stock. Available: ${product.availableStock}, Requested: ${quantity}`,
          availableQuantity: product.availableStock
        };
      }
      
      return {
        available: true,
        product,
        availableQuantity: product.availableStock
      };
      
    } catch (error) {
      console.error(`Availability check failed: ${error.message}`);
      return {
        available: false,
        reason: 'Error checking availability',
        error: error.message
      };
    }
  }

  // Bulk stock reservation for multiple products
  async reserveMultipleStock(items, sessionId) {
    const reservations = [];
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Check availability for all items first
      for (const item of items) {
        const availability = await this.checkAvailability(item.productId, item.quantity);
        if (!availability.available) {
          throw new Error(`${availability.reason} for product ${item.productId}`);
        }
      }
      
      // Reserve all items
      for (const item of items) {
        const reservation = await this.reserveStock(
          item.productId, 
          item.quantity, 
          sessionId
        );
        reservations.push(reservation);
      }
      
      await session.commitTransaction();
      return reservations;
      
    } catch (error) {
      await session.abortTransaction();
      
      // Release any successful reservations
      for (const reservation of reservations) {
        try {
          await this.releaseStock(reservation.reservationId);
        } catch (releaseError) {
          console.error(`Failed to release reservation: ${releaseError.message}`);
        }
      }
      
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Update product stock (for restocking)
  async updateStock(productId, newStock) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const updatedProduct = await Product.findByIdAndUpdate(
        productId,
        {
          $set: { 
            stock: newStock,
            lastStockUpdate: new Date()
          },
          $inc: { version: 1 }
        },
        { 
          new: true, 
          session,
          runValidators: true 
        }
      );
      
      if (!updatedProduct) {
        throw new Error('Product not found');
      }
      
      await session.commitTransaction();
      
      console.log(`Stock updated: Product ${productId}, New stock: ${newStock}`);
      
      return updatedProduct;
      
    } catch (error) {
      await session.abortTransaction();
      console.error(`Stock update failed: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Get current inventory status
  async getInventoryStatus() {
    try {
      const products = await Product.find({ isActive: true });
      
      const inventory = products.map(product => ({
        id: product._id,
        name: product.name,
        category: product.category,
        totalStock: product.stock,
        reservedStock: product.reservedStock,
        availableStock: product.availableStock,
        lastUpdated: product.lastStockUpdate
      }));
      
      const lowStock = inventory.filter(item => item.availableStock < 5);
      const outOfStock = inventory.filter(item => item.availableStock === 0);
      
      return {
        totalProducts: inventory.length,
        lowStockCount: lowStock.length,
        outOfStockCount: outOfStock.length,
        pendingReservations: this.pendingReservations.size,
        inventory,
        lowStock,
        outOfStock
      };
      
    } catch (error) {
      console.error(`Failed to get inventory status: ${error.message}`);
      throw error;
    }
  }

  // Generate unique reservation ID
  generateReservationId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `RSV-${timestamp}-${random}`.toUpperCase();
  }

  // Start cleanup scheduler for expired reservations
  startCleanupScheduler() {
    setInterval(async () => {
      await this.cleanupExpiredReservations();
    }, this.cleanupInterval);
  }

  // Cleanup expired reservations
  async cleanupExpiredReservations() {
    const now = new Date();
    const expiredReservations = [];
    
    // Find expired reservations
    for (const [id, reservation] of this.pendingReservations) {
      if (reservation.expiresAt <= now) {
        expiredReservations.push(id);
      }
    }
    
    // Release expired reservations
    for (const reservationId of expiredReservations) {
      try {
        await this.releaseStock(reservationId);
        console.log(`Expired reservation cleaned up: ${reservationId}`);
      } catch (error) {
        console.error(`Failed to cleanup expired reservation ${reservationId}: ${error.message}`);
      }
    }
    
    if (expiredReservations.length > 0) {
      console.log(`Cleaned up ${expiredReservations.length} expired reservations`);
    }
  }

  // Get reservation details
  getReservation(reservationId) {
    return this.pendingReservations.get(reservationId);
  }

  // Get all pending reservations
  getPendingReservations() {
    return Array.from(this.pendingReservations.values());
  }
}

// Singleton instance
const inventoryService = new InventoryService();

export default inventoryService;