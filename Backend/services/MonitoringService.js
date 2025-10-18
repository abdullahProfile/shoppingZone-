const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * MonitoringService handles system monitoring, logging, and performance tracking
 * for concurrency operations and overall system health
 */
class MonitoringService {
  constructor() {
    this.metrics = {
      requests: new Map(),
      errors: new Map(),
      performance: new Map(),
      concurrency: new Map(),
      system: {
        startTime: Date.now(),
        requestCount: 0,
        errorCount: 0,
        activeConnections: 0
      }
    };
    
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.logDir = path.join(__dirname, '../logs');
    this.maxLogFiles = 10;
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    
    // Initialize logging
    this.initializeLogging();
    
    // Start performance monitoring
    this.startPerformanceMonitoring();
    
    // Setup graceful cleanup
    this.setupCleanup();
  }

  /**
   * Initialize logging system
   */
  async initializeLogging() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      console.log(`📁 Log directory initialized: ${this.logDir}`);
    } catch (error) {
      console.error('Failed to initialize logging directory:', error);
    }
  }

  /**
   * Log levels
   */
  static LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
  };

  /**
   * Check if log level should be logged
   */
  shouldLog(level) {
    const currentLevel = MonitoringService.LOG_LEVELS[this.logLevel] || 2;
    const messageLevel = MonitoringService.LOG_LEVELS[level] || 2;
    return messageLevel <= currentLevel;
  }

  /**
   * Write log entry to file
   */
  async writeLog(level, category, message, metadata = {}) {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      category,
      message,
      metadata,
      pid: process.pid,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    const logFile = path.join(this.logDir, `app-${new Date().toISOString().split('T')[0]}.log`);

    try {
      await fs.appendFile(logFile, logLine);
      
      // Check log rotation
      await this.rotateLogsIfNeeded(logFile);
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }

  /**
   * Rotate logs if they exceed max size
   */
  async rotateLogsIfNeeded(logFile) {
    try {
      const stats = await fs.stat(logFile);
      if (stats.size > this.maxLogSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = logFile.replace('.log', `-${timestamp}.log`);
        await fs.rename(logFile, rotatedFile);
        
        // Clean up old log files
        await this.cleanupOldLogs();
      }
    } catch (error) {
      // File might not exist yet, ignore
    }
  }

  /**
   * Clean up old log files
   */
  async cleanupOldLogs() {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files
        .filter(file => file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.logDir, file),
          time: fs.stat(path.join(this.logDir, file)).then(s => s.mtime)
        }));

      if (logFiles.length > this.maxLogFiles) {
        const sortedFiles = await Promise.all(
          logFiles.map(async file => ({
            ...file,
            time: await file.time
          }))
        );

        sortedFiles.sort((a, b) => b.time - a.time);
        
        for (let i = this.maxLogFiles; i < sortedFiles.length; i++) {
          await fs.unlink(sortedFiles[i].path);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }

  /**
   * Log methods for different levels
   */
  async logError(category, message, metadata = {}) {
    console.error(`❌ [${category}] ${message}`, metadata);
    await this.writeLog('error', category, message, metadata);
    this.metrics.system.errorCount++;
  }

  async logWarn(category, message, metadata = {}) {
    console.warn(`⚠️ [${category}] ${message}`, metadata);
    await this.writeLog('warn', category, message, metadata);
  }

  async logInfo(category, message, metadata = {}) {
    console.log(`ℹ️ [${category}] ${message}`, metadata);
    await this.writeLog('info', category, message, metadata);
  }

  async logDebug(category, message, metadata = {}) {
    if (this.shouldLog('debug')) {
      console.log(`🐛 [${category}] ${message}`, metadata);
      await this.writeLog('debug', category, message, metadata);
    }
  }

  /**
   * Track HTTP request
   */
  trackRequest(req, res, next) {
    const startTime = Date.now();
    const requestId = uuidv4();
    
    req.requestId = requestId;
    req.startTime = startTime;

    this.metrics.system.requestCount++;
    this.metrics.system.activeConnections++;

    this.logDebug('HTTP', `Request started: ${req.method} ${req.url}`, {
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });

    // Track response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      this.metrics.system.activeConnections--;

      const level = res.statusCode >= 400 ? 'error' : 'info';
      this[`log${level.charAt(0).toUpperCase() + level.slice(1)}`](
        'HTTP',
        `Request completed: ${req.method} ${req.url} - ${res.statusCode}`,
        {
          requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          contentLength: res.get('content-length')
        }
      );

      // Track performance metrics
      this.recordPerformanceMetric('http_request', duration, {
        method: req.method,
        route: req.route?.path || req.url,
        statusCode: res.statusCode
      });
    });

    next();
  }

  /**
   * Track concurrency operation
   */
  async trackConcurrencyOperation(operation, resourceId, operationId) {
    const startTime = Date.now();
    const operationInfo = {
      operation,
      resourceId,
      operationId,
      startTime,
      status: 'started'
    };

    this.metrics.concurrency.set(operationId, operationInfo);

    await this.logDebug('CONCURRENCY', `Operation started: ${operation}`, {
      resourceId,
      operationId
    });

    return {
      complete: async (status = 'completed', metadata = {}) => {
        const duration = Date.now() - startTime;
        operationInfo.endTime = Date.now();
        operationInfo.duration = duration;
        operationInfo.status = status;

        this.metrics.concurrency.delete(operationId);

        const level = status === 'failed' ? 'error' : 'info';
        await this[`log${level.charAt(0).toUpperCase() + level.slice(1)}`](
          'CONCURRENCY',
          `Operation ${status}: ${operation}`,
          {
            resourceId,
            operationId,
            duration,
            ...metadata
          }
        );

        this.recordPerformanceMetric(`concurrency_${operation}`, duration, {
          status,
          resourceId
        });
      }
    };
  }

  /**
   * Record performance metric
   */
  recordPerformanceMetric(operation, duration, metadata = {}) {
    const key = `${operation}_${Date.now()}`;
    this.metrics.performance.set(key, {
      operation,
      duration,
      timestamp: Date.now(),
      metadata
    });

    // Keep only recent metrics (last hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [key, metric] of this.metrics.performance.entries()) {
      if (metric.timestamp < oneHourAgo) {
        this.metrics.performance.delete(key);
      }
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(operation = null) {
    const metrics = Array.from(this.metrics.performance.values());
    const filteredMetrics = operation 
      ? metrics.filter(m => m.operation === operation)
      : metrics;

    if (filteredMetrics.length === 0) {
      return { operation, count: 0 };
    }

    const durations = filteredMetrics.map(m => m.duration);
    const total = durations.reduce((sum, d) => sum + d, 0);

    return {
      operation,
      count: filteredMetrics.length,
      avgDuration: total / filteredMetrics.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      totalDuration: total,
      recentActivity: filteredMetrics.slice(-10)
    };
  }

  /**
   * Get system health metrics
   */
  getSystemHealth() {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    const cpuUsage = process.cpuUsage();

    return {
      status: 'healthy',
      uptime: {
        seconds: uptime,
        human: this.formatUptime(uptime)
      },
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        utilization: (memUsage.heapUsed / memUsage.heapTotal * 100).toFixed(2) + '%'
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      requests: {
        total: this.metrics.system.requestCount,
        active: this.metrics.system.activeConnections,
        errors: this.metrics.system.errorCount,
        errorRate: this.metrics.system.requestCount > 0 
          ? (this.metrics.system.errorCount / this.metrics.system.requestCount * 100).toFixed(2) + '%'
          : '0%'
      },
      concurrency: {
        activeOperations: this.metrics.concurrency.size,
        operations: Array.from(this.metrics.concurrency.values())
      }
    };
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    // Monitor system metrics every 30 seconds
    setInterval(() => {
      const health = this.getSystemHealth();
      
      // Log system metrics
      this.logDebug('SYSTEM', 'System health check', health);
      
      // Alert on high memory usage
      const memUtilization = parseFloat(health.memory.utilization);
      if (memUtilization > 80) {
        this.logWarn('SYSTEM', `High memory usage: ${health.memory.utilization}`, {
          memoryUsage: health.memory
        });
      }
      
      // Alert on high error rate
      const errorRate = parseFloat(health.requests.errorRate);
      if (errorRate > 10 && health.requests.total > 100) {
        this.logWarn('SYSTEM', `High error rate: ${health.requests.errorRate}`, {
          requests: health.requests
        });
      }
      
    }, 30000);

    // Clean up old performance metrics every 5 minutes
    setInterval(() => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      for (const [key, metric] of this.metrics.performance.entries()) {
        if (metric.timestamp < fiveMinutesAgo) {
          this.metrics.performance.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Format uptime in human readable format
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0) parts.push(`${secs}s`);

    return parts.join(' ') || '0s';
  }

  /**
   * Get concurrency statistics
   */
  getConcurrencyStats() {
    const activeOps = Array.from(this.metrics.concurrency.values());
    const operations = {};

    activeOps.forEach(op => {
      if (!operations[op.operation]) {
        operations[op.operation] = { count: 0, avgDuration: 0, resources: new Set() };
      }
      operations[op.operation].count++;
      operations[op.operation].resources.add(op.resourceId);
    });

    return {
      activeOperations: activeOps.length,
      operationTypes: operations,
      longestRunning: activeOps.sort((a, b) => a.startTime - b.startTime)[0] || null
    };
  }

  /**
   * Export logs for analysis
   */
  async exportLogs(startDate, endDate) {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files.filter(file => file.endsWith('.log'));
      const logs = [];

      for (const file of logFiles) {
        const filePath = path.join(this.logDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            const entryDate = new Date(entry.timestamp);
            
            if ((!startDate || entryDate >= startDate) && 
                (!endDate || entryDate <= endDate)) {
              logs.push(entry);
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }

      return logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch (error) {
      await this.logError('MONITORING', 'Failed to export logs', { error: error.message });
      throw error;
    }
  }

  /**
   * Setup cleanup on process termination
   */
  setupCleanup() {
    const cleanup = async () => {
      await this.logInfo('SYSTEM', 'Application shutting down gracefully');
      
      // Log final statistics
      const stats = this.getSystemHealth();
      await this.logInfo('SYSTEM', 'Final system statistics', stats);
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  }

  /**
   * Generate monitoring report
   */
  generateReport() {
    const systemHealth = this.getSystemHealth();
    const concurrencyStats = this.getConcurrencyStats();
    const performanceStats = {
      httpRequests: this.getPerformanceStats('http_request'),
      stockOperations: this.getPerformanceStats('concurrency_reserveStock'),
      paymentOperations: this.getPerformanceStats('payment_processing')
    };

    return {
      timestamp: new Date().toISOString(),
      system: systemHealth,
      concurrency: concurrencyStats,
      performance: performanceStats,
      summary: {
        status: systemHealth.memory.utilization < '90%' && 
                systemHealth.requests.errorRate < '5%' ? 'healthy' : 'warning',
        uptime: systemHealth.uptime.human,
        totalRequests: systemHealth.requests.total,
        errorRate: systemHealth.requests.errorRate,
        memoryUtilization: systemHealth.memory.utilization
      }
    };
  }
}

module.exports = MonitoringService;