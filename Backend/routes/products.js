const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const asyncHandler = require('../middleware/asyncHandler');
const inMemoryStorage = require('../services/InMemoryStorage');
// const { validateProduct } = require('../middleware/validation');

/**
 * GET /api/products
 * Get all products with pagination, filtering, and sorting
 */
router.get('/', asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 12,
    category,
    brand,
    minPrice,
    maxPrice,
    sortBy = 'name',
    sortOrder = 'asc',
    search,
    sale
  } = req.query;

  let products;
  let total;

  if (global.dbConnected) {
    // Use MongoDB
    const query = { isActive: true };

    if (category) {
      query.category = category.toLowerCase();
    }

    if (brand) {
      query.brand = new RegExp(brand, 'i');
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    if (search) {
      query.$text = { $search: search };
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (Number(page) - 1) * Number(limit);
    
    const [dbProducts, dbTotal] = await Promise.all([
      Product.find(query)
        .select('-__v')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Product.countDocuments(query)
    ]);

    products = dbProducts;
    total = dbTotal;
  } else {
    // Use in-memory storage
    const filters = {
      category,
      search,
      sale,
      minPrice,
      maxPrice,
      sortBy: sortBy === 'createdAt' ? 'name' : sortBy
    };

    const allProducts = await inMemoryStorage.getAllProducts(filters);
    total = allProducts.length;

    // Apply pagination
    const skip = (Number(page) - 1) * Number(limit);
    products = allProducts.slice(skip, skip + Number(limit));
  }

  // Calculate pagination info
  const totalPages = Math.ceil(total / Number(limit));
  const hasNextPage = Number(page) < totalPages;
  const hasPrevPage = Number(page) > 1;

  res.json({
    success: true,
    data: {
      products,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalProducts: total,
        limit: Number(limit),
        hasNextPage,
        hasPrevPage
      }
    }
  });
}));

/**
 * GET /api/products/featured
 * Get featured products
 */
router.get('/featured', asyncHandler(async (req, res) => {
  const products = await Product.find({
    isActive: true,
    isFeatured: true,
    availableStock: { $gt: 0 }
  })
  .select('-__v')
  .sort({ createdAt: -1 })
  .limit(8)
  .lean();

  res.json({
    success: true,
    data: { products }
  });
}));

/**
 * GET /api/products/categories
 * Get all product categories with counts
 */
router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await Product.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        avgPrice: { $avg: '$price' },
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' }
      }
    },
    { $sort: { count: -1 } }
  ]);

  res.json({
    success: true,
    data: { categories }
  });
}));

/**
 * GET /api/products/:id
 * Get single product by ID with stock check
 */
router.get('/:id', asyncHandler(async (req, res) => {
  let product;

  if (global.dbConnected) {
    product = await Product.findOne({
      _id: req.params.id,
      isActive: true
    }).select('-__v');

    if (product) {
      // Real-time stock check
      const currentStock = Math.max(0, product.stock - (product.reservedStock || 0));
      product.availableStock = currentStock;
    }
  } else {
    product = await inMemoryStorage.getProductById(req.params.id);
  }

  if (!product) {
    return res.status(404).json({
      success: false,
      error: 'Product not found'
    });
  }

  res.json({
    success: true,
    data: { product }
  });
}));

/**
 * GET /api/products/:id/stock
 * Get real-time stock information for a product
 */
router.get('/:id/stock', asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .select('stock reservedStock availableStock lastStockUpdate version')
    .lean();

  if (!product) {
    return res.status(404).json({
      success: false,
      error: 'Product not found'
    });
  }

  const availableStock = Math.max(0, product.stock - product.reservedStock);

  res.json({
    success: true,
    data: {
      productId: req.params.id,
      totalStock: product.stock,
      reservedStock: product.reservedStock,
      availableStock,
      lastUpdate: product.lastStockUpdate,
      version: product.version
    }
  });
}));

/**
 * POST /api/products/:id/reserve-stock
 * Reserve stock for a product (atomic operation)
 */
router.post('/:id/reserve-stock', asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  
  if (!quantity || quantity < 1) {
    return res.status(400).json({
      success: false,
      error: 'Invalid quantity'
    });
  }

  try {
    // Use atomic stock operation through concurrency manager
    const result = await global.concurrencyManager.atomicStockOperation(
      req.params.id,
      async (productId, session) => {
        return await Product.reserveStock(productId, quantity, session);
      }
    );

    // Emit real-time stock update
    global.io.to(`stock-${req.params.id}`).emit('stock-updated', {
      productId: req.params.id,
      availableStock: result.availableStock,
      totalStock: result.stock,
      reservedStock: result.reservedStock
    });

    res.json({
      success: true,
      data: {
        productId: req.params.id,
        quantity,
        availableStock: result.availableStock,
        message: 'Stock reserved successfully'
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
 * POST /api/products/:id/release-stock
 * Release reserved stock for a product (atomic operation)
 */
router.post('/:id/release-stock', asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  
  if (!quantity || quantity < 1) {
    return res.status(400).json({
      success: false,
      error: 'Invalid quantity'
    });
  }

  try {
    // Use atomic stock operation through concurrency manager
    const result = await global.concurrencyManager.atomicStockOperation(
      req.params.id,
      async (productId, session) => {
        return await Product.releaseStock(productId, quantity, session);
      }
    );

    // Emit real-time stock update
    global.io.to(`stock-${req.params.id}`).emit('stock-updated', {
      productId: req.params.id,
      availableStock: result.availableStock,
      totalStock: result.stock,
      reservedStock: result.reservedStock
    });

    res.json({
      success: true,
      data: {
        productId: req.params.id,
        quantity,
        availableStock: result.availableStock,
        message: 'Stock released successfully'
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
 * GET /api/products/search/:term
 * Search products with text search
 */
router.get('/search/:term', asyncHandler(async (req, res) => {
  const { term } = req.params;
  const { page = 1, limit = 12 } = req.query;

  if (!term || term.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Search term must be at least 2 characters'
    });
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [products, total] = await Promise.all([
    Product.find({
      $text: { $search: term },
      isActive: true
    })
    .select('-__v')
    .sort({ score: { $meta: 'textScore' } })
    .skip(skip)
    .limit(Number(limit))
    .lean(),
    
    Product.countDocuments({
      $text: { $search: term },
      isActive: true
    })
  ]);

  const totalPages = Math.ceil(total / Number(limit));

  res.json({
    success: true,
    data: {
      products,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalResults: total,
        limit: Number(limit),
        searchTerm: term
      }
    }
  });
}));

/**
 * GET /api/products/:id/similar
 * Get similar products based on category and price range
 */
router.get('/:id/similar', asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .select('category price brand')
    .lean();

  if (!product) {
    return res.status(404).json({
      success: false,
      error: 'Product not found'
    });
  }

  // Find similar products
  const priceRange = product.price * 0.3; // 30% price range
  
  const similarProducts = await Product.find({
    _id: { $ne: req.params.id },
    isActive: true,
    availableStock: { $gt: 0 },
    category: product.category,
    price: {
      $gte: product.price - priceRange,
      $lte: product.price + priceRange
    }
  })
  .select('-__v')
  .sort({ 'rating.average': -1 })
  .limit(6)
  .lean();

  res.json({
    success: true,
    data: { products: similarProducts }
  });
}));

module.exports = router;