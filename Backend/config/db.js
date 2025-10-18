import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    // MongoDB connection string - using local MongoDB instance
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cloth_store';
    
    const conn = await mongoose.connect(MONGO_URI, {
      useUnifiedTopology: true,
      useNewUrlParser: true,
      serverSelectionTimeoutMS: 5000, // 5 second timeout
      maxPoolSize: 10, // Maintain up to 10 socket connections
      bufferMaxEntries: 0,
      bufferCommands: false,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

export default connectDB;