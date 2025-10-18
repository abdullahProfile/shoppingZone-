/**
 * Async error handler wrapper
 * Wraps async functions to automatically catch and pass errors to Express error handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;