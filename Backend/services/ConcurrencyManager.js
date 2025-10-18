const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * ConcurrencyManager handles atomic operations, deadlock prevention,
 * and provides thread-safe operations for the cloth store application
 */
class ConcurrencyManager {
  constructor() {
    this.locks = new Map(); // Resource locks
    this.transactions = new Map(); // Active transactions
    this.operationQueue = new Map(); // Queued operations to prevent starvation
    this.lockTimeout = 30000; // 30 seconds timeout for locks
    this.maxRetries = 3;
    
    // Start cleanup interval for expired locks and transactions
    setInterval(() => this.cleanup(), 10000); // Cleanup every 10 seconds
  }

  /**
   * Acquire a lock on a resource with timeout and deadlock detection
   */
  async acquireLock(resourceId, operationId = null, timeout = this.lockTimeout) {
    operationId = operationId || uuidv4();
    const lockKey = `lock:${resourceId}`;
    
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const tryLock = () => {
        // Check if resource is already locked
        if (this.locks.has(lockKey)) {
          const existingLock = this.locks.get(lockKey);
          
          // Check if lock has expired
          if (Date.now() - existingLock.timestamp > timeout) {
            console.warn(`Lock expired for resource ${resourceId}, releasing...`);
            this.releaseLock(resourceId, existingLock.operationId);
          } else {
            // Check for timeout
            if (Date.now() - startTime > timeout) {
              return reject(new Error(`Lock acquisition timeout for resource ${resourceId}`));
            }
            
            // Queue this operation to prevent starvation
            if (!this.operationQueue.has(lockKey)) {
              this.operationQueue.set(lockKey, []);
            }
            this.operationQueue.get(lockKey).push({ operationId, resolve, reject, timestamp: Date.now() });
            return;
          }
        }
        
        // Acquire the lock
        this.locks.set(lockKey, {
          operationId,
          timestamp: Date.now(),
          resourceId
        });
        
        console.log(`Lock acquired for resource ${resourceId} by operation ${operationId}`);
        resolve(operationId);
      };
      
      tryLock();
      
      // If we couldn't get the lock immediately, try again periodically
      if (this.locks.has(lockKey)) {
        const interval = setInterval(() => {
          if (!this.locks.has(lockKey) || Date.now() - startTime > timeout) {
            clearInterval(interval);
            if (this.locks.has(lockKey)) {
              reject(new Error(`Lock acquisition timeout for resource ${resourceId}`));
            } else {
              tryLock();
            }
          }
        }, 100); // Check every 100ms
      }
    });
  }

  /**
   * Release a lock on a resource
   */
  releaseLock(resourceId, operationId) {
    const lockKey = `lock:${resourceId}`;
    const lock = this.locks.get(lockKey);
    
    if (lock && lock.operationId === operationId) {
      this.locks.delete(lockKey);
      console.log(`Lock released for resource ${resourceId} by operation ${operationId}`);
      
      // Process queued operations for this resource (FIFO to prevent starvation)
      if (this.operationQueue.has(lockKey) && this.operationQueue.get(lockKey).length > 0) {
        const queue = this.operationQueue.get(lockKey);
        const nextOperation = queue.shift();
        
        if (queue.length === 0) {
          this.operationQueue.delete(lockKey);
        }
        
        // Give the lock to the next waiting operation
        this.locks.set(lockKey, {
          operationId: nextOperation.operationId,
          timestamp: Date.now(),
          resourceId
        });
        
        nextOperation.resolve(nextOperation.operationId);
      }
      
      return true;
    }
    
    console.warn(`Attempted to release lock for resource ${resourceId} with invalid operation ID ${operationId}`);
    return false;
  }

  /**
   * Execute an atomic transaction with proper rollback support
   */
  async executeTransaction(operations, options = {}) {
    const transactionId = uuidv4();
    const session = await mongoose.startSession();
    
    try {
      console.log(`Starting transaction ${transactionId}`);
      
      const result = await session.withTransaction(async () => {
        this.transactions.set(transactionId, {
          session,
          timestamp: Date.now(),
          operations: operations.length
        });
        
        const results = [];
        
        // Execute all operations within the transaction
        for (let i = 0; i < operations.length; i++) {
          const operation = operations[i];
          try {
            const operationResult = await operation(session);
            results.push(operationResult);
          } catch (error) {
            console.error(`Operation ${i} failed in transaction ${transactionId}:`, error);
            throw error; // This will cause the transaction to abort
          }
        }
        
        return results;
      }, {
        readPreference: 'primary',
        readConcern: { level: 'local' },
        writeConcern: { w: 'majority', j: true }
      });
      
      console.log(`Transaction ${transactionId} completed successfully`);
      return result;
      
    } catch (error) {
      console.error(`Transaction ${transactionId} failed:`, error);
      throw error;
    } finally {
      this.transactions.delete(transactionId);
      await session.endSession();
    }
  }

  /**
   * Execute atomic stock operations with retry logic and deadlock detection
   */
  async atomicStockOperation(productId, operation, retryCount = 0) {
    const operationId = uuidv4();
    
    try {
      // Acquire lock on the product
      await this.acquireLock(productId, operationId);
      
      try {
        // Execute the operation within a transaction
        const result = await this.executeTransaction([
          async (session) => {
            return await operation(productId, session);
          }
        ]);
        
        return result[0]; // Return the first (and only) result
        
      } finally {
        // Always release the lock
        this.releaseLock(productId, operationId);
      }
      
    } catch (error) {
      // Handle retries for transient errors
      if (retryCount < this.maxRetries && this.isRetryableError(error)) {
        console.log(`Retrying stock operation for product ${productId}, attempt ${retryCount + 1}`);
        
        // Exponential backoff
        await this.delay(Math.pow(2, retryCount) * 100);
        
        return this.atomicStockOperation(productId, operation, retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * Execute multiple atomic operations in parallel with concurrency control
   */
  async executeParallelOperations(operations, maxConcurrency = 10) {
    const semaphore = new Semaphore(maxConcurrency);
    
    const executeWithSemaphore = async (operation) => {
      await semaphore.acquire();
      try {
        return await operation();
      } finally {
        semaphore.release();
      }
    };
    
    return Promise.all(operations.map(op => executeWithSemaphore(op)));
  }

  /**
   * Check if an error is retryable
   */
  isRetryableError(error) {
    const retryableErrors = [
      'WriteConflict',
      'LockTimeout',
      'TransientTransactionError',
      'UnknownTransactionCommitResult'
    ];
    
    return retryableErrors.some(errorType => 
      error.message.includes(errorType) || 
      error.codeName === errorType ||
      error.code === 11000 // Duplicate key error
    );
  }

  /**
   * Delay utility for retry backoff
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup expired locks and transactions
   */
  cleanup() {
    const now = Date.now();
    
    // Clean up expired locks
    for (const [lockKey, lock] of this.locks.entries()) {
      if (now - lock.timestamp > this.lockTimeout) {
        console.warn(`Cleaning up expired lock: ${lockKey}`);
        this.locks.delete(lockKey);
        
        // Process queued operations for this resource
        if (this.operationQueue.has(lockKey) && this.operationQueue.get(lockKey).length > 0) {
          const queue = this.operationQueue.get(lockKey);
          const nextOperation = queue.shift();
          
          if (queue.length === 0) {
            this.operationQueue.delete(lockKey);
          }
          
          // Give the lock to the next waiting operation
          this.locks.set(lockKey, {
            operationId: nextOperation.operationId,
            timestamp: Date.now(),
            resourceId: lock.resourceId
          });
          
          nextOperation.resolve(nextOperation.operationId);
        }
      }
    }
    
    // Clean up expired queued operations
    for (const [lockKey, queue] of this.operationQueue.entries()) {
      const validOperations = queue.filter(op => now - op.timestamp < this.lockTimeout);
      
      if (validOperations.length === 0) {
        this.operationQueue.delete(lockKey);
      } else if (validOperations.length !== queue.length) {
        this.operationQueue.set(lockKey, validOperations);
      }
    }
    
    // Clean up long-running transactions
    for (const [transactionId, transaction] of this.transactions.entries()) {
      if (now - transaction.timestamp > 300000) { // 5 minutes
        console.warn(`Long-running transaction detected: ${transactionId}`);
        // Note: We don't automatically abort transactions as they might be legitimate
      }
    }
  }

  /**
   * Get current system status for monitoring
   */
  getStatus() {
    return {
      activeLocks: this.locks.size,
      activeTransactions: this.transactions.size,
      queuedOperations: Array.from(this.operationQueue.values())
        .reduce((total, queue) => total + queue.length, 0),
      timestamp: Date.now()
    };
  }
}

/**
 * Semaphore implementation for controlling concurrency
 */
class Semaphore {
  constructor(capacity) {
    this.capacity = capacity;
    this.current = 0;
    this.queue = [];
  }
  
  async acquire() {
    return new Promise((resolve) => {
      if (this.current < this.capacity) {
        this.current++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }
  
  release() {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      resolve();
    } else {
      this.current--;
    }
  }
}

module.exports = ConcurrencyManager;