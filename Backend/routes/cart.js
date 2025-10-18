const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const asyncHandler = require('../middleware/asyncHandler');
const { v4: uuidv4 } = require('uuid');
const inMemoryStorage = require('../services/InMemoryStorage');

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

// Apply session middleware to all routes
router.use(ensureSessionId);

/**
 * GET /api/cart
 * Get current user's cart
 */
router.get('/', asyncHandler(async (req, res) => {
  let cart;

  if (global.dbConnected) {
    cart = await Cart.findOne({ sessionId: req.sessionId })
      .populate({
        path: 'items.product',
        select: 'name price images brand availableStock isActive',
        match: { isActive: true }
      });

    if (!cart) {
      cart = new Cart({
        sessionId: req.sessionId,
        items: []
      });
      await cart.save();
    } else {
      cart.items = cart.items.filter(item => item.product);
      await cart.save();
    }
  } else {
    cart = await inMemoryStorage.getCart(req.sessionId);
  }

  res.json({
    success: true,
    data: { 
      cart,
      sessionId: req.sessionId
    }
  });
}));

/**
 * POST /api/cart/add
 * Add item to cart with stock validation
 */
router.post('/add', asyncHandler(async (req, res) => {
  const { productId, quantity, size, color } = req.body;

  // Validate input
  if (!productId || !quantity || !size || !color) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: productId, quantity, size, color'
    });
  }

  if (quantity < 1 || quantity > 10) {
    return res.status(400).json({
      success: false,
      error: 'Quantity must be between 1 and 10'
    });
  }

  // Check product availability
  let product;
  
  if (global.dbConnected) {
    product = await Product.findOne({
      _id: productId,
      isActive: true
    }).select('name price images brand availableStock stock reservedStock size color');
  } else {
    product = await inMemoryStorage.getProductById(productId);
  }

  if (!product) {
    return res.status(404).json({
      success: false,
      error: 'Product not found or not available'
    });
  }

  // Validate size and color
  if (!product.size.includes(size)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid size for this product'
    });
  }

  if (!product.color.includes(color)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid color for this product'
    });
  }

  // Check stock availability
  const currentStock = global.dbConnected 
    ? Math.max(0, product.stock - (product.reservedStock || 0))
    : product.stock;
    
  if (currentStock < quantity) {
    return res.status(400).json({
      success: false,
      error: `Only ${currentStock} items available in stock`
    });
  }

  try {
    let cart;

    if (global.dbConnected) {
      // Use MongoDB with transactions
      const cartResult = await global.concurrencyManager.executeTransaction([
        async (session) => {
          const itemData = {
            product: productId,
            quantity,
            size,
            color,
            price: product.price
          };

          return await Cart.addItem(req.sessionId, itemData, session);
        }
      ]);
      cart = cartResult[0];
    } else {
      // Use in-memory storage
      cart = await inMemoryStorage.addToCart(req.sessionId, productId, quantity, size, color);
    }

    // Emit real-time cart update
    if (global.io) {
      global.io.to(req.sessionId).emit('cart-updated', {
        sessionId: req.sessionId,
        action: 'item-added',
        cart: global.dbConnected ? cart.summary : cart
      });
    }

    res.json({
      success: true,
      data: {
        cart,
        message: 'Item added to cart successfully'
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
 * PUT /api/cart/update/:itemId
 * Update cart item quantity
 */
router.put('/update/:itemId', asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const { itemId } = req.params;

  if (quantity !== undefined && (quantity < 0 || quantity > 10)) {
    return res.status(400).json({
      success: false,
      error: 'Quantity must be between 0 and 10'
    });
  }

  try {
    // Update cart item atomically
    const cart = await global.concurrencyManager.executeTransaction([
      async (session) => {
        return await Cart.updateItemQuantity(req.sessionId, itemId, quantity, session);
      }
    ]);

    // Emit real-time cart update
    global.io.to(req.sessionId).emit('cart-updated', {
      sessionId: req.sessionId,
      action: quantity === 0 ? 'item-removed' : 'item-updated',
      cart: cart[0].summary
    });

    res.json({
      success: true,
      data: {
        cart: cart[0],
        message: quantity === 0 ? 'Item removed from cart' : 'Cart updated successfully'
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
 * DELETE /api/cart/remove/:itemId
 * Remove item from cart
 */
router.delete('/remove/:itemId', asyncHandler(async (req, res) => {
  const { itemId } = req.params;

  try {
    // Remove item from cart atomically
    const cart = await global.concurrencyManager.executeTransaction([
      async (session) => {
        return await Cart.removeItem(req.sessionId, itemId, session);
      }
    ]);

    // Emit real-time cart update
    global.io.to(req.sessionId).emit('cart-updated', {
      sessionId: req.sessionId,
      action: 'item-removed',
      cart: cart[0].summary
    });

    res.json({
      success: true,
      data: {
        cart: cart[0],
        message: 'Item removed from cart successfully'
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
 * DELETE /api/cart/clear
 * Clear entire cart
 */
router.delete('/clear', asyncHandler(async (req, res) => {
  try {
    // Clear cart atomically
    const cart = await global.concurrencyManager.executeTransaction([
      async (session) => {
        return await Cart.clearCart(req.sessionId, session);
      }
    ]);

    // Emit real-time cart update
    global.io.to(req.sessionId).emit('cart-updated', {
      sessionId: req.sessionId,
      action: 'cart-cleared',
      cart: cart[0].summary
    });

    res.json({
      success: true,
      data: {
        cart: cart[0],
        message: 'Cart cleared successfully'
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
 * POST /api/cart/validate
 * Validate cart items and check stock availability
 */
router.post('/validate', asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ sessionId: req.sessionId })
    .populate({
      path: 'items.product',
      select: 'name price images brand stock reservedStock availableStock isActive'
    });

  if (!cart || cart.items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Cart is empty'
    });
  }

  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    totalItems: 0,
    totalPrice: 0
  };

  // Check each item
  for (const item of cart.items) {
    if (!item.product || !item.product.isActive) {
      validation.isValid = false;
      validation.errors.push({
        itemId: item._id,
        error: 'Product no longer available'
      });
      continue;
    }

    const product = item.product;
    const currentStock = Math.max(0, product.stock - product.reservedStock);

    // Check stock availability
    if (currentStock < item.quantity) {
      if (currentStock === 0) {
        validation.isValid = false;
        validation.errors.push({
          itemId: item._id,
          productName: product.name,
          error: 'Product out of stock'
        });
      } else {
        validation.warnings.push({
          itemId: item._id,
          productName: product.name,
          requestedQuantity: item.quantity,
          availableQuantity: currentStock,
          message: `Only ${currentStock} items available`
        });
      }
    }

    // Check price changes
    if (Math.abs(item.price - product.price) > 0.01) {
      validation.warnings.push({
        itemId: item._id,
        productName: product.name,
        oldPrice: item.price,
        newPrice: product.price,
        message: 'Price has changed'
      });
    }

    if (validation.isValid || currentStock > 0) {
      const quantityToUse = Math.min(item.quantity, currentStock);
      validation.totalItems += quantityToUse;
      validation.totalPrice += quantityToUse * product.price;
    }
  }

  res.json({
    success: true,
    data: {
      validation,
      cart
    }
  });
}));

/**
 * POST /api/cart/reserve
 * Reserve cart items for checkout
 */
router.post('/reserve', asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ sessionId: req.sessionId })
    .populate('items.product');

  if (!cart || cart.items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Cart is empty'
    });
  }

  const reservationId = uuidv4();
  const expiryMinutes = 15; // 15 minutes reservation

  try {
    // Reserve stock for all items atomically
    await global.concurrencyManager.executeTransaction([
      async (session) => {
        // Reserve stock for each product
        for (const item of cart.items) {
          if (item.product && item.product.isActive) {
            await Product.reserveStock(item.product._id, item.quantity, session);
          }
        }

        // Mark cart items as reserved
        await cart.reserveItems(reservationId, expiryMinutes);
        
        return cart;
      }
    ]);

    // Schedule automatic release of reservation
    setTimeout(async () => {
      try {
        const currentCart = await Cart.findOne({ sessionId: req.sessionId });
        if (currentCart && 
            currentCart.items.some(item => item.reservationId === reservationId)) {
          console.log(`⏰ Auto-releasing reservation ${reservationId}`);
          await currentCart.releaseReservation();
          
          // Release product stock
          for (const item of currentCart.items) {
            if (item.product) {
              await Product.releaseStock(item.product._id, item.quantity);
            }
          }
        }
      } catch (error) {
        console.error('Error auto-releasing reservation:', error);
      }
    }, expiryMinutes * 60 * 1000);

    res.json({
      success: true,
      data: {
        reservationId,
        expiryMinutes,
        message: 'Items reserved successfully',
        cart
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
 * POST /api/cart/release-reservation
 * Release cart item reservations
 */
router.post('/release-reservation', asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ sessionId: req.sessionId });

  if (!cart) {
    return res.status(404).json({
      success: false,
      error: 'Cart not found'
    });
  }

  try {
    // Release reservations atomically
    await global.concurrencyManager.executeTransaction([
      async (session) => {
        // Release product stock
        for (const item of cart.items) {
          if (item.reservationId && item.product) {
            await Product.releaseStock(item.product._id, item.quantity, session);
          }
        }

        // Release cart reservations
        await cart.releaseReservation();
        
        return cart;
      }
    ]);

    res.json({
      success: true,
      data: {
        message: 'Reservations released successfully',
        cart
      }
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}));

module.exports = router;