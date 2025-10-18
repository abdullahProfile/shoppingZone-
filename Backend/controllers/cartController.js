import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import inventoryService from '../services/InventoryService.js';

// Get current cart for session
export const getCart = async (req, res) => {
  try {
    const sessionId = req.sessionID;

    const cart = await Cart.findOrCreate(sessionId).populate({
      path: 'items.product',
      select: 'name price images availableStock isActive category brand'
    });

    console.log(`Cart retrieved for session: ${sessionId}, ${cart.items.length} items`);

    res.json({
      success: true,
      data: { cart }
    });

  } catch (error) {
    console.error('Error getting cart:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get cart',
      error: error.message
    });
  }
};

// Add item to cart with concurrency safety
export const addToCart = async (req, res) => {
  try {
    const sessionId = req.sessionID;
    const { productId, quantity = 1, size, color } = req.body;

    // Validate required fields
    if (!productId || !size || !color) {
      return res.status(400).json({
        success: false,
        message: 'Product ID, size, and color are required'
      });
    }

    // Validate quantity
    const qty = parseInt(quantity);
    if (qty < 1 || qty > 10) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be between 1 and 10'
      });
    }

    // Check product availability
    const availability = await inventoryService.checkAvailability(productId, qty);
    if (!availability.available) {
      return res.status(400).json({
        success: false,
        message: availability.reason,
        data: { availableQuantity: availability.availableQuantity }
      });
    }

    const product = availability.product;

    // Validate size and color options
    if (!product.size.includes(size)) {
      return res.status(400).json({
        success: false,
        message: `Size ${size} is not available for this product`,
        data: { availableSizes: product.size }
      });
    }

    if (!product.color.includes(color)) {
      return res.status(400).json({
        success: false,
        message: `Color ${color} is not available for this product`,
        data: { availableColors: product.color }
      });
    }

    // Add item to cart atomically
    const updatedCart = await Cart.addItem(
      sessionId,
      productId,
      qty,
      size,
      color,
      product.price
    );

    console.log(`Item added to cart: ${product.name} (${qty}x) for session ${sessionId}`);

    res.json({
      success: true,
      message: 'Item added to cart successfully',
      data: { cart: updatedCart }
    });

  } catch (error) {
    console.error('Error adding item to cart:', error.message);
    
    if (error.message.includes('Maximum 10 items')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to add item to cart',
      error: error.message
    });
  }
};

// Update item quantity in cart
export const updateCartItem = async (req, res) => {
  try {
    const sessionId = req.sessionID;
    const { productId, size, color, quantity } = req.body;

    // Validate required fields
    if (!productId || !size || !color || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Product ID, size, color, and quantity are required'
      });
    }

    const qty = parseInt(quantity);

    // If quantity is 0, remove the item
    if (qty === 0) {
      const updatedCart = await Cart.removeItem(sessionId, productId, size, color);
      
      console.log(`Item removed from cart: ${productId} for session ${sessionId}`);
      
      return res.json({
        success: true,
        message: 'Item removed from cart',
        data: { cart: updatedCart }
      });
    }

    // Validate quantity range
    if (qty < 1 || qty > 10) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be between 1 and 10'
      });
    }

    // Check product availability for the new quantity
    const availability = await inventoryService.checkAvailability(productId, qty);
    if (!availability.available) {
      return res.status(400).json({
        success: false,
        message: availability.reason,
        data: { availableQuantity: availability.availableQuantity }
      });
    }

    // Update item quantity atomically
    const updatedCart = await Cart.updateItemQuantity(
      sessionId,
      productId,
      size,
      color,
      qty
    );

    console.log(`Cart item updated: ${productId} quantity to ${qty} for session ${sessionId}`);

    res.json({
      success: true,
      message: 'Cart item updated successfully',
      data: { cart: updatedCart }
    });

  } catch (error) {
    console.error('Error updating cart item:', error.message);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update cart item',
      error: error.message
    });
  }
};

// Remove item from cart
export const removeFromCart = async (req, res) => {
  try {
    const sessionId = req.sessionID;
    const { productId, size, color } = req.body;

    // Validate required fields
    if (!productId || !size || !color) {
      return res.status(400).json({
        success: false,
        message: 'Product ID, size, and color are required'
      });
    }

    // Remove item from cart atomically
    const updatedCart = await Cart.removeItem(sessionId, productId, size, color);

    console.log(`Item removed from cart: ${productId} for session ${sessionId}`);

    res.json({
      success: true,
      message: 'Item removed from cart successfully',
      data: { cart: updatedCart }
    });

  } catch (error) {
    console.error('Error removing item from cart:', error.message);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to remove item from cart',
      error: error.message
    });
  }
};

// Clear entire cart
export const clearCart = async (req, res) => {
  try {
    const sessionId = req.sessionID;

    const clearedCart = await Cart.clearCart(sessionId);

    console.log(`Cart cleared for session: ${sessionId}`);

    res.json({
      success: true,
      message: 'Cart cleared successfully',
      data: { cart: clearedCart }
    });

  } catch (error) {
    console.error('Error clearing cart:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cart',
      error: error.message
    });
  }
};

// Validate cart before checkout
export const validateCart = async (req, res) => {
  try {
    const sessionId = req.sessionID;

    const cart = await Cart.findOne({ sessionId, isActive: true })
      .populate('items.product');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Validate stock availability for all items
    const validation = await cart.validateStock();

    console.log(`Cart validation for session ${sessionId}: ${validation.isValid ? 'PASSED' : 'FAILED'}`);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Some items in your cart are no longer available',
        data: {
          unavailableItems: validation.unavailableItems,
          cart
        }
      });
    }

    res.json({
      success: true,
      message: 'Cart validation passed',
      data: {
        cart,
        totalItems: cart.totalItems,
        totalPrice: cart.totalPrice,
        readyForCheckout: true
      }
    });

  } catch (error) {
    console.error('Error validating cart:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to validate cart',
      error: error.message
    });
  }
};

// Get cart summary
export const getCartSummary = async (req, res) => {
  try {
    const sessionId = req.sessionID;

    const cart = await Cart.findOne({ sessionId, isActive: true });

    const summary = cart ? cart.summary : {
      totalItems: 0,
      totalPrice: 0,
      itemCount: 0
    };

    res.json({
      success: true,
      data: { summary }
    });

  } catch (error) {
    console.error('Error getting cart summary:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get cart summary',
      error: error.message
    });
  }
};

// Sync cart with product updates (handle price/availability changes)
export const syncCart = async (req, res) => {
  try {
    const sessionId = req.sessionID;

    const cart = await Cart.findOne({ sessionId, isActive: true })
      .populate('items.product');

    if (!cart || cart.items.length === 0) {
      return res.json({
        success: true,
        message: 'No cart to sync',
        data: { cart: null, changes: [] }
      });
    }

    const changes = [];
    let cartUpdated = false;

    // Check each item for changes
    for (const item of cart.items) {
      const currentProduct = await Product.findById(item.product._id);
      
      if (!currentProduct || !currentProduct.isActive) {
        // Product no longer available
        cart.items = cart.items.filter(i => i._id.toString() !== item._id.toString());
        cartUpdated = true;
        changes.push({
          type: 'removed',
          product: item.product.name,
          reason: 'Product no longer available'
        });
      } else if (currentProduct.price !== item.price) {
        // Price changed
        item.price = currentProduct.price;
        cartUpdated = true;
        changes.push({
          type: 'price_updated',
          product: item.product.name,
          oldPrice: item.price,
          newPrice: currentProduct.price
        });
      } else if (currentProduct.availableStock < item.quantity) {
        // Insufficient stock
        const oldQuantity = item.quantity;
        item.quantity = Math.min(item.quantity, currentProduct.availableStock);
        if (item.quantity === 0) {
          cart.items = cart.items.filter(i => i._id.toString() !== item._id.toString());
        }
        cartUpdated = true;
        changes.push({
          type: 'quantity_reduced',
          product: item.product.name,
          oldQuantity,
          newQuantity: item.quantity,
          reason: 'Insufficient stock'
        });
      }
    }

    if (cartUpdated) {
      await cart.save();
      console.log(`Cart synced for session ${sessionId}: ${changes.length} changes`);
    }

    res.json({
      success: true,
      message: cartUpdated ? 'Cart synchronized with updates' : 'Cart is up to date',
      data: {
        cart,
        changes,
        hasChanges: cartUpdated
      }
    });

  } catch (error) {
    console.error('Error syncing cart:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to sync cart',
      error: error.message
    });
  }
};