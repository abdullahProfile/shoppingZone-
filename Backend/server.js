require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const morgan = require('morgan');

// Import routes
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const userRoutes = require('./routes/users');

// Import services
const ConcurrencyManager = require('./services/ConcurrencyManager');
const EventEmitter = require('./services/EventEmitter');
const MonitoringService = require('./services/MonitoringService');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO for real-time features
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

// Initialize global services
global.concurrencyManager = new ConcurrencyManager();
global.eventEmitter = new EventEmitter();
global.monitoringService = new MonitoringService();
global.io = io;

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Monitoring middleware
app.use((req, res, next) => global.monitoringService.trackRequest(req, res, next));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Session configuration (using memory store for development)
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
  // Note: Using memory store for development. In production, configure MongoDB store.
}));

// Global database state
global.dbConnected = false;

// MongoDB connection with proper error handling (non-blocking)
(async () => {
  try {
    console.log('🔄 Attempting to connect to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/clothstore', {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 2000, // Reduce timeout further
      socketTimeoutMS: 30000, // Close sockets after 30 seconds of inactivity
      bufferCommands: false, // Disable mongoose buffering
      bufferMaxEntries: 0 // Disable mongoose buffering
    });
    global.dbConnected = true;
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message.split('\n')[0]);
    console.log('📝 Server will continue with in-memory storage for development.');
    console.log('📝 To use MongoDB, install it and start the service.');
    global.dbConnected = false;
  }
})();

mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connected successfully');
  global.dbConnected = true;
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
  console.log('📝 Note: Server will continue running with in-memory storage.');
  global.dbConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected - switching to in-memory storage');
  global.dbConnected = false;
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Gracefully shutting down...');
  await mongoose.connection.close();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// API Routes
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  const healthData = global.monitoringService.getSystemHealth();
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    ...healthData
  });
});

// Monitoring endpoints
app.get('/api/monitoring/report', (req, res) => {
  const report = global.monitoringService.generateReport();
  res.json({
    success: true,
    data: report
  });
});

app.get('/api/monitoring/performance/:operation?', (req, res) => {
  const { operation } = req.params;
  const stats = global.monitoringService.getPerformanceStats(operation);
  res.json({
    success: true,
    data: stats
  });
});

app.get('/api/monitoring/concurrency', (req, res) => {
  const stats = global.monitoringService.getConcurrencyStats();
  res.json({
    success: true,
    data: stats
  });
});

// Socket.IO connection handling for real-time features
io.on('connection', (socket) => {
  console.log(`👤 Client connected: ${socket.id}`);

  // Join room based on user session
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`👤 User ${sessionId} joined their session room`);
  });

  // Handle real-time cart updates
  socket.on('cart-update', (data) => {
    socket.to(data.sessionId).emit('cart-updated', data);
  });

  // Handle stock notifications
  socket.on('subscribe-stock', (productId) => {
    socket.join(`stock-${productId}`);
  });

  socket.on('disconnect', () => {
    console.log(`👋 Client disconnected: ${socket.id}`);
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Global error:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: error.message
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid ID format',
      details: error.message
    });
  }
  
  if (error.code === 11000) {
    return res.status(409).json({
      error: 'Duplicate key error',
      details: 'Resource already exists'
    });
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : error.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

module.exports = { app, server, io };