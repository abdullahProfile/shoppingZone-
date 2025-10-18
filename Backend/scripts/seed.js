require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

// Sample product data
const sampleProducts = [
  // Shirts
  {
    name: 'Classic Cotton T-Shirt',
    description: 'Comfortable 100% cotton t-shirt perfect for everyday wear. Soft fabric with excellent breathability.',
    price: 19.99,
    originalPrice: 24.99,
    category: 'shirts',
    size: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    color: ['White', 'Black', 'Navy', 'Gray'],
    stock: 150,
    images: [
      { url: '/images/products/tshirt-1.jpg', alt: 'Classic Cotton T-Shirt' },
      { url: '/images/products/tshirt-1-back.jpg', alt: 'Classic Cotton T-Shirt Back' }
    ],
    brand: 'ComfortWear',
    material: '100% Cotton',
    careInstructions: 'Machine wash cold, tumble dry low',
    isActive: true,
    isFeatured: true,
    tags: ['casual', 'everyday', 'cotton', 'comfortable']
  },
  {
    name: 'Formal Dress Shirt',
    description: 'Professional dress shirt made from premium cotton blend. Perfect for business meetings and formal occasions.',
    price: 49.99,
    originalPrice: 59.99,
    category: 'shirts',
    size: ['S', 'M', 'L', 'XL', 'XXL'],
    color: ['White', 'Light Blue', 'Pinstripe'],
    stock: 75,
    images: [
      { url: '/images/products/dress-shirt-1.jpg', alt: 'Formal Dress Shirt' }
    ],
    brand: 'BusinessClass',
    material: '60% Cotton, 40% Polyester',
    careInstructions: 'Dry clean recommended',
    isActive: true,
    isFeatured: true,
    tags: ['formal', 'business', 'professional', 'dress']
  },
  {
    name: 'Casual Flannel Shirt',
    description: 'Cozy flannel shirt perfect for cooler weather. Soft and warm with a relaxed fit.',
    price: 39.99,
    category: 'shirts',
    size: ['S', 'M', 'L', 'XL'],
    color: ['Red Plaid', 'Blue Plaid', 'Green Plaid'],
    stock: 60,
    images: [
      { url: '/images/products/flannel-1.jpg', alt: 'Casual Flannel Shirt' }
    ],
    brand: 'OutdoorStyle',
    material: '100% Cotton Flannel',
    careInstructions: 'Machine wash warm, tumble dry medium',
    isActive: true,
    tags: ['casual', 'flannel', 'cozy', 'plaid']
  },

  // Jeans
  {
    name: 'Skinny Fit Jeans',
    description: 'Modern skinny fit jeans with stretch fabric for comfort and style. Features classic 5-pocket design.',
    price: 79.99,
    originalPrice: 89.99,
    category: 'jeans',
    size: ['28', '30', '32', '34', '36', '38'],
    color: ['Dark Blue', 'Black', 'Light Blue'],
    stock: 120,
    images: [
      { url: '/images/products/skinny-jeans-1.jpg', alt: 'Skinny Fit Jeans' }
    ],
    brand: 'DenimCraft',
    material: '98% Cotton, 2% Elastane',
    careInstructions: 'Machine wash cold, hang dry',
    isActive: true,
    isFeatured: true,
    tags: ['jeans', 'skinny', 'stretch', 'modern']
  },
  {
    name: 'Straight Leg Jeans',
    description: 'Classic straight leg jeans with a timeless fit. Durable denim construction for everyday wear.',
    price: 69.99,
    category: 'jeans',
    size: ['30', '32', '34', '36', '38', '40'],
    color: ['Medium Blue', 'Dark Blue', 'Black'],
    stock: 90,
    images: [
      { url: '/images/products/straight-jeans-1.jpg', alt: 'Straight Leg Jeans' }
    ],
    brand: 'ClassicDenim',
    material: '100% Cotton Denim',
    careInstructions: 'Machine wash cold, tumble dry low',
    isActive: true,
    tags: ['jeans', 'straight', 'classic', 'durable']
  },

  // Jackets
  {
    name: 'Leather Motorcycle Jacket',
    description: 'Premium genuine leather motorcycle jacket with classic biker styling. Features multiple zippers and pockets.',
    price: 249.99,
    originalPrice: 299.99,
    category: 'jackets',
    size: ['S', 'M', 'L', 'XL', 'XXL'],
    color: ['Black', 'Brown'],
    stock: 25,
    images: [
      { url: '/images/products/leather-jacket-1.jpg', alt: 'Leather Motorcycle Jacket' }
    ],
    brand: 'RiderGear',
    material: 'Genuine Leather',
    careInstructions: 'Professional leather cleaning only',
    isActive: true,
    isFeatured: true,
    tags: ['leather', 'motorcycle', 'biker', 'premium']
  },
  {
    name: 'Denim Jacket',
    description: 'Classic denim jacket with vintage styling. Perfect layering piece for casual outfits.',
    price: 89.99,
    category: 'jackets',
    size: ['XS', 'S', 'M', 'L', 'XL'],
    color: ['Light Blue', 'Dark Blue', 'Black'],
    stock: 45,
    images: [
      { url: '/images/products/denim-jacket-1.jpg', alt: 'Denim Jacket' }
    ],
    brand: 'VintageStyle',
    material: '100% Cotton Denim',
    careInstructions: 'Machine wash cold, air dry',
    isActive: true,
    tags: ['denim', 'vintage', 'classic', 'layering']
  },
  {
    name: 'Windbreaker Jacket',
    description: 'Lightweight windbreaker jacket perfect for outdoor activities. Water-resistant and packable.',
    price: 59.99,
    category: 'jackets',
    size: ['S', 'M', 'L', 'XL', 'XXL'],
    color: ['Navy', 'Black', 'Red', 'Green'],
    stock: 80,
    images: [
      { url: '/images/products/windbreaker-1.jpg', alt: 'Windbreaker Jacket' }
    ],
    brand: 'ActiveWear',
    material: '100% Nylon',
    careInstructions: 'Machine wash cold, air dry',
    isActive: true,
    tags: ['windbreaker', 'outdoor', 'lightweight', 'packable']
  },

  // Dresses
  {
    name: 'Summer Floral Dress',
    description: 'Beautiful floral print dress perfect for summer occasions. Flowing fabric with comfortable fit.',
    price: 69.99,
    originalPrice: 79.99,
    category: 'dresses',
    size: ['XS', 'S', 'M', 'L', 'XL'],
    color: ['Blue Floral', 'Pink Floral', 'Yellow Floral'],
    stock: 55,
    images: [
      { url: '/images/products/floral-dress-1.jpg', alt: 'Summer Floral Dress' }
    ],
    brand: 'FloralFashion',
    material: '95% Viscose, 5% Elastane',
    careInstructions: 'Machine wash cold, hang dry',
    isActive: true,
    isFeatured: true,
    tags: ['dress', 'floral', 'summer', 'feminine']
  },
  {
    name: 'Little Black Dress',
    description: 'Elegant little black dress suitable for cocktail parties and evening events. Classic and timeless.',
    price: 129.99,
    category: 'dresses',
    size: ['XS', 'S', 'M', 'L', 'XL'],
    color: ['Black'],
    stock: 35,
    images: [
      { url: '/images/products/black-dress-1.jpg', alt: 'Little Black Dress' }
    ],
    brand: 'ElegantEvening',
    material: '92% Polyester, 8% Spandex',
    careInstructions: 'Dry clean only',
    isActive: true,
    tags: ['dress', 'elegant', 'cocktail', 'evening']
  },

  // Shoes
  {
    name: 'Running Sneakers',
    description: 'High-performance running sneakers with advanced cushioning technology. Breathable mesh upper.',
    price: 119.99,
    originalPrice: 139.99,
    category: 'shoes',
    size: ['7', '8', '9', '10', '11', '12'],
    color: ['White/Blue', 'Black/Red', 'Gray/Orange'],
    stock: 100,
    images: [
      { url: '/images/products/running-shoes-1.jpg', alt: 'Running Sneakers' }
    ],
    brand: 'SportTech',
    material: 'Mesh Upper, Rubber Sole',
    careInstructions: 'Spot clean with damp cloth',
    isActive: true,
    isFeatured: true,
    tags: ['shoes', 'running', 'athletic', 'comfortable']
  },
  {
    name: 'Casual Canvas Sneakers',
    description: 'Classic canvas sneakers perfect for everyday casual wear. Comfortable and versatile.',
    price: 49.99,
    category: 'shoes',
    size: ['6', '7', '8', '9', '10', '11', '12'],
    color: ['White', 'Black', 'Navy', 'Red'],
    stock: 150,
    images: [
      { url: '/images/products/canvas-shoes-1.jpg', alt: 'Casual Canvas Sneakers' }
    ],
    brand: 'CasualStep',
    material: 'Canvas Upper, Rubber Sole',
    careInstructions: 'Machine washable, air dry',
    isActive: true,
    tags: ['shoes', 'casual', 'canvas', 'versatile']
  },

  // Accessories
  {
    name: 'Leather Belt',
    description: 'Premium genuine leather belt with classic buckle. Available in multiple sizes.',
    price: 39.99,
    category: 'accessories',
    size: ['32', '34', '36', '38', '40', '42'],
    color: ['Black', 'Brown', 'Tan'],
    stock: 75,
    images: [
      { url: '/images/products/leather-belt-1.jpg', alt: 'Leather Belt' }
    ],
    brand: 'LeatherCraft',
    material: 'Genuine Leather',
    careInstructions: 'Clean with leather conditioner',
    isActive: true,
    tags: ['accessories', 'belt', 'leather', 'classic']
  },
  {
    name: 'Cotton Baseball Cap',
    description: 'Comfortable cotton baseball cap with adjustable strap. Perfect for casual wear and sun protection.',
    price: 24.99,
    category: 'accessories',
    size: ['One Size'],
    color: ['Black', 'Navy', 'White', 'Gray', 'Red'],
    stock: 120,
    images: [
      { url: '/images/products/baseball-cap-1.jpg', alt: 'Cotton Baseball Cap' }
    ],
    brand: 'CapStyle',
    material: '100% Cotton',
    careInstructions: 'Hand wash, air dry',
    isActive: true,
    tags: ['accessories', 'hat', 'casual', 'adjustable']
  }
];

/**
 * Seed the database with sample products
 */
async function seedProducts() {
  try {
    console.log('🌱 Starting database seeding...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/clothstore', {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('✅ Connected to MongoDB');

    // Clear existing products
    await Product.deleteMany({});
    console.log('🗑️  Cleared existing products');

    // Insert sample products
    const products = await Product.insertMany(sampleProducts);
    console.log(`✅ Inserted ${products.length} sample products`);

    // Update stock calculations
    for (const product of products) {
      product.availableStock = Math.max(0, product.stock - product.reservedStock);
      await product.save();
    }

    console.log('✅ Updated stock calculations');

    // Create text indexes
    await Product.createIndexes();
    console.log('✅ Created database indexes');

    console.log('🎉 Database seeding completed successfully!');
    
    // Log summary
    const categories = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    console.log('\n📊 Seeded Products Summary:');
    categories.forEach(cat => {
      console.log(`  ${cat._id}: ${cat.count} products`);
    });

    const totalStock = await Product.aggregate([
      { $group: { _id: null, totalStock: { $sum: '$stock' } } }
    ]);
    
    console.log(`\n📦 Total Stock Items: ${totalStock[0]?.totalStock || 0}`);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

/**
 * Clear all products from database
 */
async function clearProducts() {
  try {
    console.log('🧹 Clearing all products from database...');

    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/clothstore');
    
    const result = await Product.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} products`);

  } catch (error) {
    console.error('❌ Error clearing database:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
  }
}

/**
 * Get database statistics
 */
async function getStats() {
  try {
    console.log('📊 Getting database statistics...');

    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/clothstore');
    
    const totalProducts = await Product.countDocuments();
    const activeProducts = await Product.countDocuments({ isActive: true });
    const featuredProducts = await Product.countDocuments({ isFeatured: true });
    
    const categories = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const stockInfo = await Product.aggregate([
      { 
        $group: { 
          _id: null, 
          totalStock: { $sum: '$stock' },
          totalReserved: { $sum: '$reservedStock' },
          avgPrice: { $avg: '$price' }
        } 
      }
    ]);

    console.log('\n📈 Database Statistics:');
    console.log(`  Total Products: ${totalProducts}`);
    console.log(`  Active Products: ${activeProducts}`);
    console.log(`  Featured Products: ${featuredProducts}`);
    console.log(`  Total Stock: ${stockInfo[0]?.totalStock || 0}`);
    console.log(`  Reserved Stock: ${stockInfo[0]?.totalReserved || 0}`);
    console.log(`  Average Price: $${(stockInfo[0]?.avgPrice || 0).toFixed(2)}`);
    
    console.log('\n📂 Products by Category:');
    categories.forEach(cat => {
      console.log(`  ${cat._id}: ${cat.count} products`);
    });

  } catch (error) {
    console.error('❌ Error getting statistics:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
  }
}

// Handle command line arguments
const command = process.argv[2];

switch (command) {
  case 'seed':
    seedProducts().catch(process.exit);
    break;
  case 'clear':
    clearProducts().catch(process.exit);
    break;
  case 'stats':
    getStats().catch(process.exit);
    break;
  default:
    console.log('\n📖 Available commands:');
    console.log('  npm run seed          - Seed database with sample products');
    console.log('  node scripts/seed.js seed    - Seed database');
    console.log('  node scripts/seed.js clear   - Clear all products');
    console.log('  node scripts/seed.js stats   - Show database statistics');
    console.log('\nExample usage:');
    console.log('  npm run seed');
    console.log('  node scripts/seed.js seed');
    break;
}

module.exports = {
  seedProducts,
  clearProducts,
  getStats,
  sampleProducts
};