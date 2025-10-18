const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

class InMemoryStorage {
  constructor() {
    this.users = new Map();
    this.products = new Map();
    this.carts = new Map();
    this.orders = new Map();
    this.sessions = new Map();
    
    // Initialize with sample data
    this.initializeSampleData();
  }

  async initializeSampleData() {
    // Sample products matching frontend expectations
    const sampleProducts = [
      {
        _id: '1',
        name: 'Premium Cotton T-Shirt',
        description: 'Comfortable premium cotton t-shirt with superior quality',
        price: 29.99,
        originalPrice: 39.99,
        sale: true,
        category: 'T-Shirts',
        size: ['S', 'M', 'L', 'XL'],
        color: ['Black', 'White', 'Gray'],
        stock: 50,
        images: ['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400'],
        brand: 'ClothStore',
        inStock: true,
        rating: { average: 4.5, count: 124 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '2',
        name: 'Vintage Graphic Tee',
        description: 'Retro-style graphic t-shirt with unique design',
        price: 24.99,
        category: 'T-Shirts',
        size: ['S', 'M', 'L', 'XL'],
        color: ['Black', 'Navy', 'Vintage'],
        stock: 30,
        images: ['https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=400'],
        brand: 'Vintage Co',
        inStock: true,
        rating: { average: 4.2, count: 89 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '3',
        name: 'Basic White Tee',
        description: 'Essential white t-shirt for everyday wear',
        price: 19.99,
        category: 'T-Shirts',
        size: ['XS', 'S', 'M', 'L', 'XL'],
        color: ['White'],
        stock: 100,
        images: ['https://images.unsplash.com/photo-1562157873-818bc0726f68?w=400'],
        brand: 'Basics',
        inStock: true,
        rating: { average: 4.7, count: 256 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '4',
        name: 'Classic Denim Jacket',
        description: 'Timeless denim jacket for any occasion',
        price: 89.99,
        originalPrice: 119.99,
        sale: true,
        category: 'Jackets',
        size: ['S', 'M', 'L', 'XL'],
        color: ['Blue', 'Black', 'Light Blue'],
        stock: 25,
        images: ['https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=400'],
        brand: 'Denim Co',
        inStock: true,
        rating: { average: 4.6, count: 198 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '5',
        name: 'Leather Biker Jacket',
        description: 'Edgy leather jacket with classic biker style',
        price: 199.99,
        category: 'Jackets',
        size: ['S', 'M', 'L', 'XL'],
        color: ['Black', 'Brown'],
        stock: 15,
        images: ['https://images.unsplash.com/photo-1520975954732-35dd22299614?w=400'],
        brand: 'Leather Works',
        inStock: true,
        rating: { average: 4.8, count: 87 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '6',
        name: 'Bomber Jacket',
        description: 'Trendy bomber jacket with modern fit',
        price: 79.99,
        category: 'Jackets',
        size: ['S', 'M', 'L', 'XL'],
        color: ['Black', 'Navy', 'Olive'],
        stock: 0,
        images: ['https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400'],
        brand: 'Modern Style',
        inStock: false,
        rating: { average: 4.3, count: 156 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '7',
        name: 'Elegant Summer Dress',
        description: 'Light and airy summer dress perfect for warm days',
        price: 59.99,
        category: 'Dresses',
        size: ['XS', 'S', 'M', 'L', 'XL'],
        color: ['Floral', 'Blue', 'Pink'],
        stock: 40,
        images: ['https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=400'],
        brand: 'Summer Collection',
        inStock: true,
        rating: { average: 4.4, count: 203 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '8',
        name: 'Little Black Dress',
        description: 'Classic little black dress for elegant occasions',
        price: 89.99,
        category: 'Dresses',
        size: ['XS', 'S', 'M', 'L'],
        color: ['Black'],
        stock: 20,
        images: ['https://images.unsplash.com/photo-1566479179817-c2aa6c5e8a59?w=400'],
        brand: 'Elegant',
        inStock: true,
        rating: { average: 4.9, count: 145 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '9',
        name: 'Floral Maxi Dress',
        description: 'Beautiful floral maxi dress for special events',
        price: 79.99,
        originalPrice: 99.99,
        sale: true,
        category: 'Dresses',
        size: ['S', 'M', 'L', 'XL'],
        color: ['Floral', 'Multi'],
        stock: 35,
        images: ['https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400'],
        brand: 'Floral Dreams',
        inStock: true,
        rating: { average: 4.5, count: 167 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '10',
        name: 'Casual Sneakers',
        description: 'Comfortable casual sneakers for daily wear',
        price: 79.99,
        category: 'Shoes',
        size: ['7', '8', '9', '10', '11', '12'],
        color: ['White', 'Black', 'Gray'],
        stock: 60,
        images: ['https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400'],
        brand: 'Comfort Walk',
        inStock: true,
        rating: { average: 4.6, count: 312 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '11',
        name: 'Running Shoes',
        description: 'High-performance running shoes with excellent cushioning',
        price: 119.99,
        category: 'Shoes',
        size: ['7', '8', '9', '10', '11', '12'],
        color: ['Blue', 'Red', 'Black'],
        stock: 45,
        images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400'],
        brand: 'RunFast',
        inStock: true,
        rating: { average: 4.7, count: 298 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '12',
        name: 'Elegant Heels',
        description: 'Sophisticated heels for formal occasions',
        price: 99.99,
        category: 'Shoes',
        size: ['6', '7', '8', '9', '10'],
        color: ['Black', 'Nude', 'Red'],
        stock: 25,
        images: ['https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400'],
        brand: 'Elegant Steps',
        inStock: true,
        rating: { average: 4.3, count: 156 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '13',
        name: 'Leather Handbag',
        description: 'Premium leather handbag with spacious interior',
        price: 129.99,
        category: 'Accessories',
        size: ['One Size'],
        color: ['Black', 'Brown', 'Tan'],
        stock: 30,
        images: ['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400'],
        brand: 'Luxury Bags',
        inStock: true,
        rating: { average: 4.8, count: 189 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '14',
        name: 'Designer Sunglasses',
        description: 'Stylish designer sunglasses with UV protection',
        price: 149.99,
        originalPrice: 199.99,
        sale: true,
        category: 'Accessories',
        size: ['One Size'],
        color: ['Black', 'Tortoise', 'Gold'],
        stock: 40,
        images: ['https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=400'],
        brand: 'Sun Style',
        inStock: true,
        rating: { average: 4.6, count: 234 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '15',
        name: 'Silk Scarf',
        description: 'Luxurious silk scarf with elegant patterns',
        price: 39.99,
        category: 'Accessories',
        size: ['One Size'],
        color: ['Blue', 'Red', 'Floral'],
        stock: 50,
        images: ['https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=400'],
        brand: 'Silk Collection',
        inStock: true,
        rating: { average: 4.4, count: 98 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '16',
        name: 'Wool Blend Sweater',
        description: 'Cozy wool blend sweater for cooler weather',
        price: 69.99,
        category: 'Sweaters',
        size: ['S', 'M', 'L', 'XL'],
        color: ['Gray', 'Navy', 'Cream'],
        stock: 35,
        images: ['https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=400'],
        brand: 'Cozy Wear',
        inStock: true,
        rating: { average: 4.5, count: 178 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '17',
        name: 'Cashmere Cardigan',
        description: 'Luxurious cashmere cardigan with soft texture',
        price: 159.99,
        category: 'Sweaters',
        size: ['S', 'M', 'L', 'XL'],
        color: ['Beige', 'Gray', 'Navy'],
        stock: 0,
        images: ['https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400'],
        brand: 'Cashmere Dreams',
        inStock: false,
        rating: { average: 4.9, count: 134 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '18',
        name: 'Slim Fit Jeans',
        description: 'Modern slim fit jeans with comfortable stretch',
        price: 89.99,
        category: 'Jeans',
        size: ['28', '30', '32', '34', '36', '38'],
        color: ['Blue', 'Black', 'Dark Blue'],
        stock: 70,
        images: ['https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400'],
        brand: 'Denim Works',
        inStock: true,
        rating: { average: 4.4, count: 267 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '19',
        name: 'High Waist Jeans',
        description: 'Trendy high waist jeans with flattering fit',
        price: 79.99,
        originalPrice: 99.99,
        sale: true,
        category: 'Jeans',
        size: ['26', '28', '30', '32', '34'],
        color: ['Blue', 'Black', 'Light Blue'],
        stock: 55,
        images: ['https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400'],
        brand: 'High Fashion',
        inStock: true,
        rating: { average: 4.6, count: 345 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: '20',
        name: 'Designer Watch',
        description: 'Elegant designer watch with precision movement',
        price: 249.99,
        category: 'Accessories',
        size: ['One Size'],
        color: ['Silver', 'Gold', 'Black'],
        stock: 20,
        images: ['https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=400'],
        brand: 'TimeStyle',
        inStock: true,
        rating: { average: 4.8, count: 123 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    // Store products
    sampleProducts.forEach(product => {
      this.products.set(product._id, product);
    });

    console.log('📦 Initialized with', sampleProducts.length, 'sample products');
  }

  // User operations
  async findUserByEmail(email) {
    for (const [id, user] of this.users.entries()) {
      if (user.email.toLowerCase() === email.toLowerCase()) {
        return { ...user, _id: id };
      }
    }
    return null;
  }

  async createUser(userData) {
    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(userData.password, 12);
    
    const user = {
      _id: id,
      email: userData.email.toLowerCase(),
      password: hashedPassword,
      profile: {
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone || '',
        avatar: null
      },
      addresses: [],
      preferences: {
        newsletter: true,
        marketing: false,
        smsUpdates: false,
        currency: 'USD',
        language: 'en'
      },
      role: 'customer',
      status: 'active',
      emailVerification: {
        verified: true
      },
      loginHistory: [],
      lastLogin: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.users.set(id, user);
    return { ...user };
  }

  async findUserById(id) {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  async updateUser(id, updateData) {
    const user = this.users.get(id);
    if (!user) return null;

    const updatedUser = {
      ...user,
      ...updateData,
      updatedAt: new Date()
    };

    this.users.set(id, updatedUser);
    return { ...updatedUser };
  }

  async updateUserProfile(id, profileData) {
    const user = this.users.get(id);
    if (!user) return null;

    user.profile = { ...user.profile, ...profileData };
    user.updatedAt = new Date();
    
    this.users.set(id, user);
    return { ...user };
  }

  async comparePassword(user, password) {
    return await bcrypt.compare(password, user.password);
  }

  // Product operations
  async getAllProducts(filters = {}) {
    let products = Array.from(this.products.values());

    // Apply filters
    if (filters.category && filters.category !== 'all') {
      products = products.filter(p => p.category.toLowerCase() === filters.category.toLowerCase());
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      products = products.filter(p => 
        p.name.toLowerCase().includes(search) ||
        p.description.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search)
      );
    }

    if (filters.sale === 'true') {
      products = products.filter(p => p.sale === true);
    }

    if (filters.minPrice) {
      products = products.filter(p => p.price >= parseFloat(filters.minPrice));
    }

    if (filters.maxPrice) {
      products = products.filter(p => p.price <= parseFloat(filters.maxPrice));
    }

    // Apply sorting
    if (filters.sortBy) {
      switch (filters.sortBy) {
        case 'price-asc':
          products.sort((a, b) => a.price - b.price);
          break;
        case 'price-desc':
          products.sort((a, b) => b.price - a.price);
          break;
        case 'name':
          products.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'rating':
          products.sort((a, b) => (b.rating?.average || 0) - (a.rating?.average || 0));
          break;
      }
    }

    return products;
  }

  async getProductById(id) {
    const product = this.products.get(id.toString());
    return product ? { ...product } : null;
  }

  // Cart operations
  async getCart(sessionId) {
    const cart = this.carts.get(sessionId);
    return cart ? { ...cart } : {
      sessionId,
      items: [],
      total: 0,
      itemCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async addToCart(sessionId, productId, quantity = 1, size, color) {
    const product = await this.getProductById(productId);
    if (!product) throw new Error('Product not found');
    if (!product.inStock || product.stock < quantity) throw new Error('Insufficient stock');

    let cart = await this.getCart(sessionId);
    
    const existingItemIndex = cart.items.findIndex(item => 
      item.productId === productId && item.size === size && item.color === color
    );

    if (existingItemIndex >= 0) {
      cart.items[existingItemIndex].quantity += quantity;
    } else {
      cart.items.push({
        productId,
        name: product.name,
        price: product.price,
        image: product.images[0],
        size,
        color,
        quantity
      });
    }

    // Recalculate totals
    cart.total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cart.itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    cart.updatedAt = new Date();

    this.carts.set(sessionId, cart);
    return cart;
  }

  async updateCartItem(sessionId, productId, size, color, quantity) {
    let cart = await this.getCart(sessionId);
    
    const itemIndex = cart.items.findIndex(item => 
      item.productId === productId && item.size === size && item.color === color
    );

    if (itemIndex === -1) throw new Error('Item not found in cart');

    if (quantity <= 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = quantity;
    }

    // Recalculate totals
    cart.total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cart.itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    cart.updatedAt = new Date();

    this.carts.set(sessionId, cart);
    return cart;
  }

  async removeFromCart(sessionId, productId, size, color) {
    return this.updateCartItem(sessionId, productId, size, color, 0);
  }

  async clearCart(sessionId) {
    const cart = {
      sessionId,
      items: [],
      total: 0,
      itemCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.carts.set(sessionId, cart);
    return cart;
  }

  // Order operations
  async createOrder(orderData) {
    const orderId = uuidv4();
    const orderNumber = `ORD-${Date.now()}`;
    
    const order = {
      _id: orderId,
      orderNumber,
      userId: orderData.userId,
      items: orderData.items,
      total: orderData.total,
      status: 'pending',
      paymentStatus: 'pending',
      shippingAddress: orderData.shippingAddress,
      billingAddress: orderData.billingAddress,
      paymentMethod: orderData.paymentMethod,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.orders.set(orderId, order);
    return { ...order };
  }

  async getOrdersByUserId(userId) {
    const orders = Array.from(this.orders.values()).filter(order => order.userId === userId);
    return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async getOrderById(orderId) {
    const order = this.orders.get(orderId);
    return order ? { ...order } : null;
  }
}

module.exports = new InMemoryStorage();