import Product from '../models/Product.js';
import inventoryService from '../services/InventoryService.js';

// Get all products with filtering and pagination
export const getAllProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      brand,
      minPrice,
      maxPrice,
      size,
      color,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      inStock = true
    } = req.query;

    // Build filter object
    const filter = { isActive: true };

    if (category) filter.category = category;
    if (brand) filter.brand = new RegExp(brand, 'i');
    if (size) filter.size = { $in: Array.isArray(size) ? size : [size] };
    if (color) filter.color = { $in: Array.isArray(color) ? color : [color] };
    if (inStock === 'true') filter.availableStock = { $gt: 0 };

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    if (search) {
      filter.$text = { $search: search };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const products = await Product.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-version -__v');

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / parseInt(limit));

    // Log request for concurrency tracking
    console.log(`Products fetched: ${products.length} items for session ${req.sessionID}`);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalProducts,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Error fetching products:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
};

// Get single product by ID
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id).select('-version -__v');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (!product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product is not available'
      });
    }

    console.log(`Product viewed: ${product.name} by session ${req.sessionID}`);

    res.json({
      success: true,
      data: { product }
    });

  } catch (error) {
    console.error('Error fetching product:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error.message
    });
  }
};

// Check product availability
export const checkProductAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity = 1 } = req.query;

    const availability = await inventoryService.checkAvailability(id, parseInt(quantity));

    res.json({
      success: true,
      data: availability
    });

  } catch (error) {
    console.error('Error checking product availability:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to check product availability',
      error: error.message
    });
  }
};

// Get products by category
export const getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const filter = { 
      category: category.toLowerCase(), 
      isActive: true,
      availableStock: { $gt: 0 }
    };

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const products = await Product.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-version -__v');

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / parseInt(limit));

    console.log(`Category products fetched: ${category}, ${products.length} items for session ${req.sessionID}`);

    res.json({
      success: true,
      data: {
        category,
        products,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalProducts,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Error fetching products by category:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products by category',
      error: error.message
    });
  }
};

// Search products
export const searchProducts = async (req, res) => {
  try {
    const { query, page = 1, limit = 20 } = req.query;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const filter = {
      isActive: true,
      availableStock: { $gt: 0 },
      $text: { $search: query.trim() }
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const products = await Product.find(filter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-version -__v');

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / parseInt(limit));

    console.log(`Search performed: "${query}", ${products.length} results for session ${req.sessionID}`);

    res.json({
      success: true,
      data: {
        query,
        products,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalProducts,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Error searching products:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to search products',
      error: error.message
    });
  }
};

// Get featured products
export const getFeaturedProducts = async (req, res) => {
  try {
    const { limit = 8 } = req.query;

    const products = await Product.find({
      isActive: true,
      isFeatured: true,
      availableStock: { $gt: 0 }
    })
      .sort({ 'rating.average': -1, createdAt: -1 })
      .limit(parseInt(limit))
      .select('-version -__v');

    console.log(`Featured products fetched: ${products.length} items for session ${req.sessionID}`);

    res.json({
      success: true,
      data: { products }
    });

  } catch (error) {
    console.error('Error fetching featured products:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured products',
      error: error.message
    });
  }
};

// Get low stock products (admin endpoint)
export const getLowStockProducts = async (req, res) => {
  try {
    const { threshold = 5 } = req.query;

    const products = await Product.find({
      isActive: true,
      availableStock: { $lt: parseInt(threshold), $gt: 0 }
    })
      .sort({ availableStock: 1 })
      .select('name category availableStock stock reservedStock lastStockUpdate');

    res.json({
      success: true,
      data: {
        threshold: parseInt(threshold),
        count: products.length,
        products
      }
    });

  } catch (error) {
    console.error('Error fetching low stock products:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch low stock products',
      error: error.message
    });
  }
};

// Get inventory status
export const getInventoryStatus = async (req, res) => {
  try {
    const inventoryStatus = await inventoryService.getInventoryStatus();

    res.json({
      success: true,
      data: inventoryStatus
    });

  } catch (error) {
    console.error('Error fetching inventory status:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory status',
      error: error.message
    });
  }
};

// Get product categories
export const getCategories = async (req, res) => {
  try {
    const categories = await Product.distinct('category', { isActive: true });

    res.json({
      success: true,
      data: { categories }
    });

  } catch (error) {
    console.error('Error fetching categories:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
};

// Get product brands
export const getBrands = async (req, res) => {
  try {
    const brands = await Product.distinct('brand', { isActive: true });

    res.json({
      success: true,
      data: { brands }
    });

  } catch (error) {
    console.error('Error fetching brands:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brands',
      error: error.message
    });
  }
};