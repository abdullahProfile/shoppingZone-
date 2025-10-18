const supabase = require('../config/supabase');
const productService = require('./productService');

class CartService {
  // Get cart by session ID
  async getCartBySessionId(sessionId, userId = null) {
    try {
      const { data, error } = await supabase
        .from('carts')
        .select(`
          *,
          cart_items (
            *,
            products (
              id, name, price, brand, stock, available_stock,
              product_images (url, alt)
            )
          )
        `)
        .eq('session_id', sessionId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (!data) {
        // Create new cart
        return await this.createCart(sessionId, userId);
      }

      return this.transformCart(data);
    } catch (error) {
      console.error('Error getting cart:', error);
      throw error;
    }
  }

  // Create new cart
  async createCart(sessionId, userId = null) {
    try {
      const { data, error } = await supabase
        .from('carts')
        .insert({
          session_id: sessionId,
          user_id: userId,
          status: 'active'
        })
        .select(`
          *,
          cart_items (
            *,
            products (
              id, name, price, brand, stock, available_stock,
              product_images (url, alt)
            )
          )
        `)
        .single();

      if (error) throw error;
      return this.transformCart(data);
    } catch (error) {
      console.error('Error creating cart:', error);
      throw error;
    }
  }

  // Add item to cart
  async addItem(sessionId, itemData) {
    try {
      // Get or create cart
      let cart = await this.getCartBySessionId(sessionId);
      
      // Check if item already exists with same product, size, color
      const existingItem = cart.items.find(item => 
        item.product_id === itemData.product &&
        item.size === itemData.size &&
        item.color === itemData.color
      );

      if (existingItem) {
        // Update existing item quantity
        const newQuantity = existingItem.quantity + itemData.quantity;
        if (newQuantity > 10) {
          throw new Error('Maximum quantity per item is 10');
        }

        const { data, error } = await supabase
          .from('cart_items')
          .update({
            quantity: newQuantity,
            added_at: new Date().toISOString()
          })
          .eq('id', existingItem.id)
          .select()
          .single();

        if (error) throw error;
      } else {
        // Add new item
        const { data, error } = await supabase
          .from('cart_items')
          .insert({
            cart_id: cart.id,
            product_id: itemData.product,
            quantity: itemData.quantity,
            size: itemData.size,
            color: itemData.color,
            price: itemData.price
          })
          .select()
          .single();

        if (error) throw error;
      }

      // Update cart version and totals
      await this.updateCartTotals(cart.id);

      return await this.getCartBySessionId(sessionId);
    } catch (error) {
      console.error('Error adding item to cart:', error);
      throw error;
    }
  }

  // Update item quantity
  async updateItemQuantity(sessionId, itemId, quantity) {
    try {
      if (quantity <= 0) {
        return await this.removeItem(sessionId, itemId);
      }

      if (quantity > 10) {
        throw new Error('Maximum quantity per item is 10');
      }

      // Get cart to verify ownership
      const cart = await this.getCartBySessionId(sessionId);
      const item = cart.items.find(item => item.id === itemId);
      
      if (!item) {
        throw new Error('Item not found in cart');
      }

      const { data, error } = await supabase
        .from('cart_items')
        .update({
          quantity,
          added_at: new Date().toISOString()
        })
        .eq('id', itemId)
        .select()
        .single();

      if (error) throw error;

      // Update cart totals
      await this.updateCartTotals(cart.id);

      return await this.getCartBySessionId(sessionId);
    } catch (error) {
      console.error('Error updating item quantity:', error);
      throw error;
    }
  }

  // Remove item from cart
  async removeItem(sessionId, itemId) {
    try {
      // Get cart to verify ownership
      const cart = await this.getCartBySessionId(sessionId);
      const item = cart.items.find(item => item.id === itemId);
      
      if (!item) {
        throw new Error('Item not found in cart');
      }

      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      // Update cart totals
      await this.updateCartTotals(cart.id);

      return await this.getCartBySessionId(sessionId);
    } catch (error) {
      console.error('Error removing item from cart:', error);
      throw error;
    }
  }

  // Clear cart
  async clearCart(sessionId) {
    try {
      const cart = await this.getCartBySessionId(sessionId);

      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('cart_id', cart.id);

      if (error) throw error;

      // Update cart totals
      await this.updateCartTotals(cart.id);

      return await this.getCartBySessionId(sessionId);
    } catch (error) {
      console.error('Error clearing cart:', error);
      throw error;
    }
  }

  // Update cart totals
  async updateCartTotals(cartId) {
    try {
      // Get all cart items
      const { data: items, error: itemsError } = await supabase
        .from('cart_items')
        .select('quantity, price')
        .eq('cart_id', cartId);

      if (itemsError) throw itemsError;

      const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
      const totalPrice = items.reduce((sum, item) => sum + (item.quantity * parseFloat(item.price)), 0);

      const { error } = await supabase
        .from('carts')
        .update({
          total_items: totalItems,
          total_price: totalPrice,
          version: supabase.raw('version + 1'),
          last_activity: new Date().toISOString()
        })
        .eq('id', cartId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating cart totals:', error);
      throw error;
    }
  }

  // Reserve items in cart
  async reserveCartItems(sessionId, reservationId, expiryMinutes = 15) {
    try {
      const cart = await this.getCartBySessionId(sessionId);
      const expiryTime = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

      // Reserve each item
      for (const item of cart.items) {
        // Reserve stock in products table
        await productService.reserveStock(item.product_id, item.quantity);

        // Update cart item with reservation info
        await supabase
          .from('cart_items')
          .update({
            reservation_id: reservationId,
            reserved_at: new Date().toISOString(),
            reservation_expiry: expiryTime
          })
          .eq('id', item.id);
      }

      return await this.getCartBySessionId(sessionId);
    } catch (error) {
      console.error('Error reserving cart items:', error);
      throw error;
    }
  }

  // Release reservation for cart items
  async releaseCartReservation(sessionId) {
    try {
      const cart = await this.getCartBySessionId(sessionId);

      for (const item of cart.items) {
        if (item.reservation_id) {
          // Release stock reservation
          await productService.releaseStock(item.product_id, item.quantity);

          // Clear reservation info
          await supabase
            .from('cart_items')
            .update({
              reservation_id: null,
              reserved_at: null,
              reservation_expiry: null
            })
            .eq('id', item.id);
        }
      }

      return await this.getCartBySessionId(sessionId);
    } catch (error) {
      console.error('Error releasing cart reservation:', error);
      throw error;
    }
  }

  // Convert cart to order format
  async getCartForOrder(sessionId) {
    try {
      const cart = await this.getCartBySessionId(sessionId);
      
      if (!cart || cart.items.length === 0) {
        throw new Error('Cart is empty');
      }

      // Validate stock availability
      for (const item of cart.items) {
        const product = await productService.getProductById(item.product_id);
        if (!product || product.availableStock < item.quantity) {
          throw new Error(`Product ${item.product?.name || item.product_id} is out of stock`);
        }
      }

      return cart;
    } catch (error) {
      console.error('Error getting cart for order:', error);
      throw error;
    }
  }

  // Mark cart as converted (after successful order)
  async markCartAsConverted(sessionId) {
    try {
      const cart = await this.getCartBySessionId(sessionId);

      const { error } = await supabase
        .from('carts')
        .update({
          status: 'converted',
          version: supabase.raw('version + 1')
        })
        .eq('id', cart.id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error marking cart as converted:', error);
      throw error;
    }
  }

  // Clean up expired reservations
  async cleanupExpiredReservations() {
    try {
      const now = new Date().toISOString();

      // Get expired reservations
      const { data: expiredItems, error: fetchError } = await supabase
        .from('cart_items')
        .select('id, product_id, quantity')
        .lt('reservation_expiry', now)
        .not('reservation_id', 'is', null);

      if (fetchError) throw fetchError;

      // Release stock for expired items
      for (const item of expiredItems) {
        try {
          await productService.releaseStock(item.product_id, item.quantity);
        } catch (releaseError) {
          console.error(`Error releasing stock for product ${item.product_id}:`, releaseError);
        }
      }

      // Clear reservation info
      const { error } = await supabase
        .from('cart_items')
        .update({
          reservation_id: null,
          reserved_at: null,
          reservation_expiry: null
        })
        .lt('reservation_expiry', now);

      if (error) throw error;

      return { cleaned: expiredItems.length };
    } catch (error) {
      console.error('Error cleaning up expired reservations:', error);
      throw error;
    }
  }

  // Transform Supabase cart data to MongoDB format
  transformCart(data) {
    if (!data) return null;

    return {
      id: data.id,
      sessionId: data.session_id,
      userId: data.user_id,
      items: data.cart_items?.map(item => ({
        id: item.id,
        product_id: item.product_id,
        product: item.products ? {
          id: item.products.id,
          name: item.products.name,
          price: parseFloat(item.products.price),
          brand: item.products.brand,
          stock: item.products.stock,
          availableStock: item.products.available_stock,
          images: item.products.product_images || []
        } : null,
        quantity: item.quantity,
        size: item.size,
        color: item.color,
        price: parseFloat(item.price),
        addedAt: item.added_at,
        reservation_id: item.reservation_id,
        reserved_at: item.reserved_at,
        reservation_expiry: item.reservation_expiry
      })) || [],
      totalItems: data.total_items,
      totalPrice: parseFloat(data.total_price),
      currency: data.currency,
      status: data.status,
      version: data.version,
      lastActivity: data.last_activity,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }
}

module.exports = new CartService();