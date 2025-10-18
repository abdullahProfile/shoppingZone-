const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Product name cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [0, 'Price cannot be negative']
  },
  originalPrice: {
    type: Number,
    min: [0, 'Original price cannot be negative']
  },
  category: {
    type: String,
    required: [true, 'Product category is required'],
    enum: ['shirts', 'jeans', 'jackets', 'dresses', 'shoes', 'accessories'],
    lowercase: true
  },
  size: [{
    type: String,
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36', '38', '40', '42'],
    required: true
  }],
  color: [{
    type: String,
    required: true,
    trim: true
  }],
  stock: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  // Reserved stock for pending orders (to prevent overselling)
  reservedStock: {
    type: Number,
    default: 0,
    min: [0, 'Reserved stock cannot be negative']
  },
  // Available stock calculation: stock - reservedStock
  availableStock: {
    type: Number,
    default: 0
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: {
      type: String,
      default: 'Product image'
    }
  }],
  brand: {
    type: String,
    required: [true, 'Brand is required'],
    trim: true
  },
  material: {
    type: String,
    trim: true
  },
  careInstructions: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  seo: {
    metaTitle: String,
    metaDescription: String,
    slug: {
      type: String,
      unique: true,
      sparse: true
    }
  },
  // Concurrency control
  version: {
    type: Number,
    default: 0
  },
  lastStockUpdate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance and concurrency
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ brand: 1, isActive: 1 });
productSchema.index({ price: 1 });
productSchema.index({ 'rating.average': -1 });
productSchema.index({ tags: 1 });
productSchema.index({ name: 'text', description: 'text', brand: 'text' });
productSchema.index({ createdAt: -1 });
productSchema.index({ slug: 1 }, { unique: true, sparse: true });

// Compound index for stock operations (critical for concurrency)
productSchema.index({ _id: 1, version: 1 });

// Virtual for available stock
productSchema.virtual('computedAvailableStock').get(function() {
  return Math.max(0, this.stock - this.reservedStock);
});

// Pre-save middleware to update availableStock and generate slug
productSchema.pre('save', function(next) {
  this.availableStock = Math.max(0, this.stock - this.reservedStock);
  
  if (!this.seo.slug && this.name) {
    this.seo.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  
  // Update version for optimistic locking
  if (this.isModified('stock') || this.isModified('reservedStock')) {
    this.version += 1;
    this.lastStockUpdate = new Date();
  }
  
  next();
});

// Static methods for atomic stock operations
productSchema.statics.reserveStock = async function(productId, quantity, session = null) {
  const options = session ? { session } : {};
  
  const result = await this.findOneAndUpdate(
    {
      _id: productId,
      availableStock: { $gte: quantity },
      isActive: true
    },
    {
      $inc: {
        reservedStock: quantity,
        version: 1
      },
      $set: {
        lastStockUpdate: new Date()
      }
    },
    { new: true, ...options }
  );
  
  if (!result) {
    throw new Error('Insufficient stock or product not available');
  }
  
  // Update availableStock
  result.availableStock = Math.max(0, result.stock - result.reservedStock);
  await result.save(options);
  
  return result;
};

productSchema.statics.releaseStock = async function(productId, quantity, session = null) {
  const options = session ? { session } : {};
  
  const result = await this.findOneAndUpdate(
    {
      _id: productId,
      reservedStock: { $gte: quantity }
    },
    {
      $inc: {
        reservedStock: -quantity,
        version: 1
      },
      $set: {
        lastStockUpdate: new Date()
      }
    },
    { new: true, ...options }
  );
  
  if (result) {
    // Update availableStock
    result.availableStock = Math.max(0, result.stock - result.reservedStock);
    await result.save(options);
  }
  
  return result;
};

productSchema.statics.confirmStock = async function(productId, quantity, session = null) {
  const options = session ? { session } : {};
  
  const result = await this.findOneAndUpdate(
    {
      _id: productId,
      reservedStock: { $gte: quantity }
    },
    {
      $inc: {
        stock: -quantity,
        reservedStock: -quantity,
        version: 1
      },
      $set: {
        lastStockUpdate: new Date()
      }
    },
    { new: true, ...options }
  );
  
  if (result) {
    // Update availableStock
    result.availableStock = Math.max(0, result.stock - result.reservedStock);
    await result.save(options);
  }
  
  return result;
};

// Instance method for stock validation
productSchema.methods.canReserve = function(quantity) {
  return this.availableStock >= quantity && this.isActive;
};

// Instance method for optimistic locking validation
productSchema.methods.validateVersion = function(expectedVersion) {
  return this.version === expectedVersion;
};

module.exports = mongoose.model('Product', productSchema);