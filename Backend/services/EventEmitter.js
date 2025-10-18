const { EventEmitter: NodeEventEmitter } = require('events');

/**
 * Custom EventEmitter for handling application events with enhanced features
 * Supports async event handling, event priorities, and error handling
 */
class EventEmitter extends NodeEventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Increase default listener limit
    this.eventHistory = new Map(); // Store recent events for debugging
    this.maxHistorySize = 1000;
    this.asyncHandlers = new Map(); // Track async event handlers
  }

  /**
   * Emit an event with enhanced error handling and logging
   */
  emit(eventName, ...args) {
    try {
      // Store event in history
      this.addToHistory(eventName, args);
      
      console.log(`📡 Event emitted: ${eventName}`, { 
        timestamp: new Date().toISOString(),
        argsCount: args.length 
      });

      // Call the parent emit method
      return super.emit(eventName, ...args);
    } catch (error) {
      console.error(`❌ Error emitting event ${eventName}:`, error);
      this.emit('error', error, eventName, args);
      return false;
    }
  }

  /**
   * Emit an async event and wait for all handlers to complete
   */
  async emitAsync(eventName, ...args) {
    try {
      this.addToHistory(eventName, args);
      
      console.log(`📡 Async event emitted: ${eventName}`, { 
        timestamp: new Date().toISOString(),
        argsCount: args.length 
      });

      const listeners = this.listeners(eventName);
      const promises = [];

      for (const listener of listeners) {
        try {
          const result = listener.apply(this, args);
          // If the handler returns a promise, add it to the promises array
          if (result && typeof result.then === 'function') {
            promises.push(result);
          }
        } catch (error) {
          console.error(`❌ Error in sync handler for event ${eventName}:`, error);
          this.emit('error', error, eventName, args);
        }
      }

      // Wait for all async handlers to complete
      if (promises.length > 0) {
        const results = await Promise.allSettled(promises);
        
        // Log any rejections
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error(`❌ Async handler ${index} failed for event ${eventName}:`, result.reason);
            this.emit('error', result.reason, eventName, args);
          }
        });
      }

      return true;
    } catch (error) {
      console.error(`❌ Error emitting async event ${eventName}:`, error);
      this.emit('error', error, eventName, args);
      return false;
    }
  }

  /**
   * Add an async event handler with error handling
   */
  onAsync(eventName, handler) {
    const wrappedHandler = async (...args) => {
      try {
        await handler.apply(this, args);
      } catch (error) {
        console.error(`❌ Async handler error for event ${eventName}:`, error);
        this.emit('error', error, eventName, args);
      }
    };

    this.on(eventName, wrappedHandler);
    
    // Track async handlers
    if (!this.asyncHandlers.has(eventName)) {
      this.asyncHandlers.set(eventName, []);
    }
    this.asyncHandlers.get(eventName).push(handler);

    return this;
  }

  /**
   * Add a one-time async event handler
   */
  onceAsync(eventName, handler) {
    const wrappedHandler = async (...args) => {
      try {
        await handler.apply(this, args);
      } catch (error) {
        console.error(`❌ Async once handler error for event ${eventName}:`, error);
        this.emit('error', error, eventName, args);
      }
    };

    this.once(eventName, wrappedHandler);
    return this;
  }

  /**
   * Emit event with priority handling
   */
  emitWithPriority(eventName, priority = 'normal', ...args) {
    const priorityLevels = {
      'high': 0,
      'normal': 1,
      'low': 2
    };

    const currentPriority = priorityLevels[priority] || 1;
    
    // Add priority to event history
    this.addToHistory(eventName, args, { priority });

    // For high priority events, process immediately
    if (currentPriority === 0) {
      return this.emit(eventName, ...args);
    }

    // For normal and low priority, we can add queuing logic if needed
    // For now, just emit normally
    return this.emit(eventName, ...args);
  }

  /**
   * Add event to history for debugging
   */
  addToHistory(eventName, args, metadata = {}) {
    const eventData = {
      eventName,
      args: args.map(arg => {
        // Serialize complex objects safely
        if (typeof arg === 'object' && arg !== null) {
          try {
            return JSON.parse(JSON.stringify(arg));
          } catch (e) {
            return '[Complex Object]';
          }
        }
        return arg;
      }),
      timestamp: new Date().toISOString(),
      ...metadata
    };

    if (!this.eventHistory.has(eventName)) {
      this.eventHistory.set(eventName, []);
    }

    const history = this.eventHistory.get(eventName);
    history.unshift(eventData);

    // Keep only recent events
    if (history.length > this.maxHistorySize) {
      history.splice(this.maxHistorySize);
    }
  }

  /**
   * Get event history for debugging
   */
  getEventHistory(eventName = null) {
    if (eventName) {
      return this.eventHistory.get(eventName) || [];
    }
    
    const allHistory = {};
    for (const [name, history] of this.eventHistory.entries()) {
      allHistory[name] = history;
    }
    return allHistory;
  }

  /**
   * Clear event history
   */
  clearHistory(eventName = null) {
    if (eventName) {
      this.eventHistory.delete(eventName);
    } else {
      this.eventHistory.clear();
    }
  }

  /**
   * Get statistics about event listeners
   */
  getStats() {
    const stats = {
      totalListeners: 0,
      eventCounts: {},
      asyncHandlerCounts: {},
      historySize: 0
    };

    // Count listeners per event
    for (const eventName of this.eventNames()) {
      const listenerCount = this.listenerCount(eventName);
      stats.eventCounts[eventName] = listenerCount;
      stats.totalListeners += listenerCount;
    }

    // Count async handlers
    for (const [eventName, handlers] of this.asyncHandlers.entries()) {
      stats.asyncHandlerCounts[eventName] = handlers.length;
    }

    // Count history entries
    for (const history of this.eventHistory.values()) {
      stats.historySize += history.length;
    }

    return stats;
  }

  /**
   * Remove all listeners for async handlers
   */
  removeAllAsyncListeners(eventName = null) {
    if (eventName) {
      this.asyncHandlers.delete(eventName);
      this.removeAllListeners(eventName);
    } else {
      this.asyncHandlers.clear();
      this.removeAllListeners();
    }
  }

  /**
   * Create a namespace for events to avoid conflicts
   */
  namespace(prefix) {
    return {
      emit: (eventName, ...args) => this.emit(`${prefix}:${eventName}`, ...args),
      emitAsync: (eventName, ...args) => this.emitAsync(`${prefix}:${eventName}`, ...args),
      on: (eventName, handler) => this.on(`${prefix}:${eventName}`, handler),
      onAsync: (eventName, handler) => this.onAsync(`${prefix}:${eventName}`, handler),
      once: (eventName, handler) => this.once(`${prefix}:${eventName}`, handler),
      onceAsync: (eventName, handler) => this.onceAsync(`${prefix}:${eventName}`, handler),
      off: (eventName, handler) => this.off(`${prefix}:${eventName}`, handler),
      removeAllListeners: (eventName) => this.removeAllListeners(`${prefix}:${eventName}`)
    };
  }
}

// Create singleton instance
const globalEventEmitter = new EventEmitter();

// Set up global error handler
globalEventEmitter.on('error', (error, eventName, args) => {
  console.error('🚨 Global event error:', {
    error: error.message,
    stack: error.stack,
    eventName,
    timestamp: new Date().toISOString()
  });
});

module.exports = EventEmitter;