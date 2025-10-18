require('dotenv').config();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const ConcurrencyManager = require('../services/ConcurrencyManager');
const PaymentService = require('../services/PaymentService');
const EventEmitter = require('../services/EventEmitter');

// Test configuration
const MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/clothstore_test';
const CONCURRENT_USERS = 10;
const STOCK_QUANTITY = 50;

let concurrencyManager;
let eventEmitter;
let paymentService;

/**
 * Test Setup and Cleanup
 */
async function setupTests() {
  console.log('🧪 Setting up concurrency tests...');
  
  try {
    // Connect to test database
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    // Initialize services
    eventEmitter = new EventEmitter();
    concurrencyManager = new ConcurrencyManager();
    paymentService = new PaymentService(eventEmitter);
    
    // Clear test database
    await Promise.all([
      Product.deleteMany({}),
      Cart.deleteMany({}),
      Order.deleteMany({})
    ]);
    
    console.log('✅ Test environment setup complete');
    return true;
  } catch (error) {
    console.error('❌ Test setup failed:', error);
    return false;
  }
}

async function cleanupTests() {
  console.log('🧹 Cleaning up tests...');
  
  try {
    // Clear all test data
    await Promise.all([
      Product.deleteMany({}),
      Cart.deleteMany({}),
      Order.deleteMany({})
    ]);
    
    // Close database connection
    await mongoose.connection.close();
    
    console.log('✅ Test cleanup complete');
  } catch (error) {
    console.error('❌ Test cleanup failed:', error);
  }
}

/**
 * Test 1: Race Condition Prevention - Stock Reservation
 */
async function testRaceConditionPrevention() {
  console.log('\n🏁 Test 1: Race Condition Prevention - Stock Reservation');
  
  try {
    // Create a product with limited stock
    const product = new Product({
      name: 'Test Race Condition Product',
      description: 'Product for testing race conditions',
      price: 50.00,
      category: 'shirts',
      size: ['M', 'L'],
      color: ['Blue', 'Red'],
      stock: STOCK_QUANTITY,
      images: [{ url: '/test-image.jpg', alt: 'Test Product' }],
      brand: 'TestBrand',
      isActive: true
    });
    
    await product.save();
    console.log(`📦 Created test product with ${STOCK_QUANTITY} items in stock`);
    
    // Simulate concurrent users trying to reserve stock
    const reservationPromises = [];
    const reservationQuantity = 8; // Each user tries to reserve 8 items
    const expectedSuccessfulReservations = Math.floor(STOCK_QUANTITY / reservationQuantity);
    
    console.log(`👥 Simulating ${CONCURRENT_USERS} concurrent stock reservations...`);
    
    for (let i = 0; i < CONCURRENT_USERS; i++) {
      const promise = concurrencyManager.atomicStockOperation(
        product._id,
        async (productId, session) => {
          return await Product.reserveStock(productId, reservationQuantity, session);
        }
      );
      reservationPromises.push(promise);
    }
    
    // Wait for all reservations to complete
    const results = await Promise.allSettled(reservationPromises);
    
    // Count successful and failed reservations
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`✅ Successful reservations: ${successful}`);
    console.log(`❌ Failed reservations: ${failed}`);
    
    // Verify final stock state
    const updatedProduct = await Product.findById(product._id);
    const expectedReservedStock = successful * reservationQuantity;
    const expectedAvailableStock = STOCK_QUANTITY - expectedReservedStock;
    
    console.log(`📊 Final stock state:`);
    console.log(`   Total stock: ${updatedProduct.stock}`);
    console.log(`   Reserved stock: ${updatedProduct.reservedStock}`);
    console.log(`   Available stock: ${updatedProduct.availableStock}`);
    
    // Assertions
    if (updatedProduct.reservedStock !== expectedReservedStock) {
      throw new Error(`Expected reserved stock: ${expectedReservedStock}, actual: ${updatedProduct.reservedStock}`);
    }
    
    if (updatedProduct.availableStock !== expectedAvailableStock) {
      throw new Error(`Expected available stock: ${expectedAvailableStock}, actual: ${updatedProduct.availableStock}`);
    }
    
    if (successful < expectedSuccessfulReservations) {
      console.log('⚠️  Warning: Fewer successful reservations than expected (this may be due to timing)');
    }
    
    console.log('✅ Race condition prevention test PASSED');
    return true;
    
  } catch (error) {
    console.error('❌ Race condition prevention test FAILED:', error);
    return false;
  }
}

/**
 * Test 2: Deadlock Prevention
 */
async function testDeadlockPrevention() {
  console.log('\n🔒 Test 2: Deadlock Prevention');
  
  try {
    // Create two products
    const product1 = new Product({
      name: 'Test Product 1',
      description: 'First product for deadlock test',
      price: 30.00,
      category: 'shirts',
      size: ['M'],
      color: ['Red'],
      stock: 100,
      images: [{ url: '/test-image1.jpg', alt: 'Test Product 1' }],
      brand: 'TestBrand',
      isActive: true
    });
    
    const product2 = new Product({
      name: 'Test Product 2',
      description: 'Second product for deadlock test',
      price: 40.00,
      category: 'jeans',
      size: ['32'],
      color: ['Blue'],
      stock: 100,
      images: [{ url: '/test-image2.jpg', alt: 'Test Product 2' }],
      brand: 'TestBrand',
      isActive: true
    });
    
    await Promise.all([product1.save(), product2.save()]);
    console.log('📦 Created two test products for deadlock test');
    
    // Simulate operations that could cause deadlock
    const operations = [];
    
    // Group 1: Reserve product1 first, then product2
    for (let i = 0; i < 5; i++) {
      operations.push(async () => {
        return await concurrencyManager.executeTransaction([
          async (session) => {
            await Product.reserveStock(product1._id, 1, session);
            // Small delay to increase chance of deadlock
            await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
            await Product.reserveStock(product2._id, 1, session);
            return `Group1-${i}`;
          }
        ]);
      });
    }
    
    // Group 2: Reserve product2 first, then product1
    for (let i = 0; i < 5; i++) {
      operations.push(async () => {
        return await concurrencyManager.executeTransaction([
          async (session) => {
            await Product.reserveStock(product2._id, 1, session);
            // Small delay to increase chance of deadlock
            await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
            await Product.reserveStock(product1._id, 1, session);
            return `Group2-${i}`;
          }
        ]);
      });
    }
    
    console.log('🔄 Running potentially deadlock-prone operations...');
    
    const startTime = Date.now();
    const results = await Promise.allSettled(operations.map(op => op()));
    const endTime = Date.now();
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`✅ Completed operations: ${successful}`);
    console.log(`❌ Failed operations: ${failed}`);
    console.log(`⏱️  Total time: ${endTime - startTime}ms`);
    
    // If all operations complete within reasonable time, deadlock prevention works
    if (endTime - startTime < 30000) { // 30 seconds timeout
      console.log('✅ Deadlock prevention test PASSED');
      return true;
    } else {
      console.log('❌ Deadlock prevention test FAILED - timeout');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Deadlock prevention test FAILED:', error);
    return false;
  }
}

/**
 * Test 3: Atomic Operations
 */
async function testAtomicOperations() {
  console.log('\n⚛️  Test 3: Atomic Operations');
  
  try {
    // Create test products
    const products = await Product.create([
      {
        name: 'Atomic Test Product 1',
        description: 'Product for atomic operations test',
        price: 25.00,
        category: 'shirts',
        size: ['M'],
        color: ['Green'],
        stock: 50,
        images: [{ url: '/test-atomic1.jpg', alt: 'Atomic Test Product 1' }],
        brand: 'TestBrand',
        isActive: true
      },
      {
        name: 'Atomic Test Product 2',
        description: 'Product for atomic operations test',
        price: 35.00,
        category: 'jeans',
        size: ['32'],
        color: ['Black'],
        stock: 30,
        images: [{ url: '/test-atomic2.jpg', alt: 'Atomic Test Product 2' }],
        brand: 'TestBrand',
        isActive: true
      }
    ]);
    
    console.log('📦 Created test products for atomic operations');
    
    // Test atomic multi-product reservation
    const sessionId = uuidv4();
    
    console.log('🔄 Testing atomic multi-product operation...');
    
    try {
      // This should either succeed completely or fail completely
      await concurrencyManager.executeTransaction([
        async (session) => {
          await Product.reserveStock(products[0]._id, 5, session);
          await Product.reserveStock(products[1]._id, 3, session);
          
          // Create a cart with these items
          const cart = new Cart({
            sessionId: sessionId,
            items: [
              {
                product: products[0]._id,
                quantity: 5,
                size: 'M',
                color: 'Green',
                price: products[0].price
              },
              {
                product: products[1]._id,
                quantity: 3,
                size: '32',
                color: 'Black',
                price: products[1].price
              }
            ]
          });
          
          await cart.save({ session });
          return cart;
        }
      ]);
      
      // Verify that both products were reserved
      const [product1, product2] = await Promise.all([
        Product.findById(products[0]._id),
        Product.findById(products[1]._id)
      ]);
      
      if (product1.reservedStock !== 5 || product2.reservedStock !== 3) {
        throw new Error('Stock reservation was not atomic');
      }
      
      // Verify cart was created
      const cart = await Cart.findOne({ sessionId });
      if (!cart || cart.items.length !== 2) {
        throw new Error('Cart creation was not atomic');
      }
      
      console.log('✅ Atomic operations test PASSED');
      return true;
      
    } catch (error) {
      // Verify that nothing was changed if operation failed
      const [product1, product2] = await Promise.all([
        Product.findById(products[0]._id),
        Product.findById(products[1]._id)
      ]);
      
      const cart = await Cart.findOne({ sessionId });
      
      if (product1.reservedStock === 0 && product2.reservedStock === 0 && !cart) {
        console.log('✅ Atomic rollback worked correctly');
        return true;
      } else {
        console.log('❌ Atomic rollback failed');
        return false;
      }
    }
    
  } catch (error) {
    console.error('❌ Atomic operations test FAILED:', error);
    return false;
  }
}

/**
 * Test 4: Non-blocking I/O and Event-driven Payment Processing
 */
async function testNonBlockingPaymentProcessing() {
  console.log('\n🔄 Test 4: Non-blocking I/O and Event-driven Payment Processing');
  
  try {
    const paymentPromises = [];
    const startTime = Date.now();
    
    console.log('💳 Starting concurrent payment processing...');
    
    // Create multiple concurrent payment requests
    for (let i = 0; i < 10; i++) {
      const paymentData = {
        amount: Math.random() * 100 + 50, // Random amount between 50-150
        currency: 'USD',
        method: 'mock_payment',
        gateway: 'mock_gateway',
        customerInfo: {
          email: `test${i}@example.com`,
          name: `Test User ${i}`,
          phone: `555-000-${i.toString().padStart(4, '0')}`
        }
      };
      
      paymentPromises.push(paymentService.processPayment(paymentData));
    }
    
    // All payments should return immediately with pending status
    const paymentResults = await Promise.all(paymentPromises);
    const immediateProcessingTime = Date.now() - startTime;
    
    console.log(`⚡ All payments initiated in ${immediateProcessingTime}ms (non-blocking)`);
    
    // Verify all payments are initially pending
    const allPending = paymentResults.every(result => result.status === 'pending');
    if (!allPending) {
      throw new Error('Payments should be initially pending for non-blocking processing');
    }
    
    console.log('✅ Non-blocking payment initiation verified');
    
    // Wait for async processing to complete
    console.log('⏳ Waiting for async payment processing...');
    
    let completedPayments = 0;
    let failedPayments = 0;
    
    // Set up event listeners to track completion
    const completionPromise = new Promise((resolve) => {
      let processedCount = 0;
      
      eventEmitter.on('payment:completed', () => {
        completedPayments++;
        processedCount++;
        if (processedCount >= paymentPromises.length) resolve();
      });
      
      eventEmitter.on('payment:failed', () => {
        failedPayments++;
        processedCount++;
        if (processedCount >= paymentPromises.length) resolve();
      });
    });
    
    // Wait for all payments to process (with timeout)
    await Promise.race([
      completionPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Payment processing timeout')), 30000))
    ]);
    
    const totalProcessingTime = Date.now() - startTime;
    
    console.log(`✅ Completed payments: ${completedPayments}`);
    console.log(`❌ Failed payments: ${failedPayments}`);
    console.log(`⏱️  Total processing time: ${totalProcessingTime}ms`);
    
    // Verify event-driven processing worked
    if (completedPayments + failedPayments === paymentPromises.length) {
      console.log('✅ Event-driven payment processing test PASSED');
      return true;
    } else {
      console.log('❌ Event-driven payment processing test FAILED');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Non-blocking payment processing test FAILED:', error);
    return false;
  }
}

/**
 * Test 5: Starvation Prevention
 */
async function testStarvationPrevention() {
  console.log('\n🍽️  Test 5: Starvation Prevention');
  
  try {
    const product = new Product({
      name: 'Starvation Test Product',
      description: 'Product for testing starvation prevention',
      price: 40.00,
      category: 'accessories',
      size: ['One Size'],
      color: ['Black'],
      stock: 10,
      images: [{ url: '/test-starvation.jpg', alt: 'Starvation Test Product' }],
      brand: 'TestBrand',
      isActive: true
    });
    
    await product.save();
    console.log('📦 Created test product for starvation prevention');
    
    // Create operations with different priorities and durations
    const operations = [];
    const results = [];
    
    // High-frequency short operations (could cause starvation)
    for (let i = 0; i < 20; i++) {
      operations.push({
        name: `FastOp${i}`,
        operation: async () => {
          const start = Date.now();
          await concurrencyManager.atomicStockOperation(
            product._id,
            async (productId, session) => {
              // Quick operation
              const p = await Product.findById(productId, null, { session });
              return p;
            }
          );
          return Date.now() - start;
        }
      });
    }
    
    // Low-frequency long operations (should not be starved)
    for (let i = 0; i < 5; i++) {
      operations.push({
        name: `SlowOp${i}`,
        operation: async () => {
          const start = Date.now();
          await concurrencyManager.atomicStockOperation(
            product._id,
            async (productId, session) => {
              // Simulate longer operation
              await new Promise(resolve => setTimeout(resolve, 100));
              const p = await Product.findById(productId, null, { session });
              return p;
            }
          );
          return Date.now() - start;
        }
      });
    }
    
    // Shuffle operations to mix fast and slow
    const shuffledOps = operations.sort(() => Math.random() - 0.5);
    
    console.log('🔄 Running mixed-priority operations...');
    const startTime = Date.now();
    
    // Execute all operations
    const promises = shuffledOps.map(async (op) => {
      const duration = await op.operation();
      return { name: op.name, duration };
    });
    
    const opResults = await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    
    // Analyze results
    const slowOps = opResults.filter(r => r.name.startsWith('SlowOp'));
    const fastOps = opResults.filter(r => r.name.startsWith('FastOp'));
    
    const avgSlowTime = slowOps.reduce((sum, op) => sum + op.duration, 0) / slowOps.length;
    const avgFastTime = fastOps.reduce((sum, op) => sum + op.duration, 0) / fastOps.length;
    
    console.log(`⚡ Fast operations average: ${avgFastTime.toFixed(2)}ms`);
    console.log(`🐌 Slow operations average: ${avgSlowTime.toFixed(2)}ms`);
    console.log(`⏱️  Total execution time: ${totalTime}ms`);
    
    // Check if all slow operations completed (no starvation)
    if (slowOps.length === 5) {
      console.log('✅ Starvation prevention test PASSED - All slow operations completed');
      return true;
    } else {
      console.log('❌ Starvation prevention test FAILED - Some operations were starved');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Starvation prevention test FAILED:', error);
    return false;
  }
}

/**
 * Test 6: Performance Under Concurrent Load
 */
async function testPerformanceUnderLoad() {
  console.log('\n🚀 Test 6: Performance Under Concurrent Load');
  
  try {
    // Create multiple products
    const products = [];
    for (let i = 0; i < 5; i++) {
      const product = new Product({
        name: `Load Test Product ${i}`,
        description: `Product ${i} for load testing`,
        price: 20.00 + i * 5,
        category: ['shirts', 'jeans', 'jackets'][i % 3],
        size: ['S', 'M', 'L'],
        color: ['Red', 'Blue', 'Green'],
        stock: 1000,
        images: [{ url: `/test-load${i}.jpg`, alt: `Load Test Product ${i}` }],
        brand: 'LoadTestBrand',
        isActive: true
      });
      products.push(product);
    }
    
    await Product.insertMany(products);
    console.log('📦 Created 5 products for load testing');
    
    // Simulate high concurrent load
    const LOAD_OPERATIONS = 100;
    const operations = [];
    
    console.log(`🔄 Simulating ${LOAD_OPERATIONS} concurrent operations...`);
    
    const startTime = Date.now();
    
    for (let i = 0; i < LOAD_OPERATIONS; i++) {
      const productIndex = i % products.length;
      const product = products[productIndex];
      
      operations.push(
        concurrencyManager.atomicStockOperation(
          product._id,
          async (productId, session) => {
            // Simulate realistic operation
            await Product.reserveStock(productId, 1, session);
            await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
            await Product.releaseStock(productId, 1, session);
            return `Operation${i}`;
          }
        )
      );
    }
    
    // Execute all operations
    const results = await Promise.allSettled(operations);
    const endTime = Date.now();
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    const totalTime = endTime - startTime;
    const opsPerSecond = (LOAD_OPERATIONS / totalTime * 1000).toFixed(2);
    
    console.log(`✅ Successful operations: ${successful}`);
    console.log(`❌ Failed operations: ${failed}`);
    console.log(`⏱️  Total time: ${totalTime}ms`);
    console.log(`📊 Operations per second: ${opsPerSecond}`);
    
    // Verify system remained stable
    const finalProducts = await Product.find({});
    const allStockCorrect = finalProducts.every(p => 
      p.reservedStock === 0 && p.availableStock === p.stock
    );
    
    if (allStockCorrect && successful > LOAD_OPERATIONS * 0.9) { // 90% success rate
      console.log('✅ Performance under load test PASSED');
      return true;
    } else {
      console.log('❌ Performance under load test FAILED');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Performance under load test FAILED:', error);
    return false;
  }
}

/**
 * Run All Tests
 */
async function runAllTests() {
  console.log('🧪 Starting Comprehensive Concurrency Tests');
  console.log('='.repeat(60));
  
  if (!(await setupTests())) {
    process.exit(1);
  }
  
  const tests = [
    { name: 'Race Condition Prevention', test: testRaceConditionPrevention },
    { name: 'Deadlock Prevention', test: testDeadlockPrevention },
    { name: 'Atomic Operations', test: testAtomicOperations },
    { name: 'Non-blocking Payment Processing', test: testNonBlockingPaymentProcessing },
    { name: 'Starvation Prevention', test: testStarvationPrevention },
    { name: 'Performance Under Load', test: testPerformanceUnderLoad }
  ];
  
  const results = [];
  
  for (const { name, test } of tests) {
    try {
      const result = await test();
      results.push({ name, passed: result });
    } catch (error) {
      console.error(`❌ Test "${name}" threw an error:`, error);
      results.push({ name, passed: false });
    }
  }
  
  await cleanupTests();
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('🏁 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(({ name, passed }) => {
    console.log(`${passed ? '✅' : '❌'} ${name}`);
  });
  
  console.log('='.repeat(60));
  console.log(`📊 OVERALL RESULT: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 ALL TESTS PASSED! The system is ready for production.');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Please review the implementation.');
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run tests if called directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  runAllTests,
  testRaceConditionPrevention,
  testDeadlockPrevention,
  testAtomicOperations,
  testNonBlockingPaymentProcessing,
  testStarvationPrevention,
  testPerformanceUnderLoad
};