const Joi = require('joi');

/**
 * Address validation schema
 */
const addressSchema = Joi.object({
  firstName: Joi.string().min(1).max(50).required(),
  lastName: Joi.string().min(1).max(50).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().min(10).max(20).required(),
  address1: Joi.string().min(5).max(100).required(),
  address2: Joi.string().max(100).optional(),
  city: Joi.string().min(2).max(50).required(),
  state: Joi.string().min(2).max(50).required(),
  zipCode: Joi.string().min(5).max(10).required(),
  country: Joi.string().min(2).max(3).default('US')
});

/**
 * Payment validation schema
 */
const paymentSchema = Joi.object({
  method: Joi.string().valid('credit_card', 'debit_card', 'paypal', 'stripe', 'mock_payment').required(),
  gateway: Joi.string().valid('stripe', 'paypal', 'mock_gateway').default('mock_gateway')
});

/**
 * Order validation schema
 */
const orderSchema = Joi.object({
  shippingAddress: addressSchema.required(),
  billingAddress: addressSchema.optional(),
  payment: paymentSchema.required(),
  customerNotes: Joi.string().max(500).optional(),
  metadata: Joi.object().optional()
});

/**
 * Product validation schema
 */
const productSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  description: Joi.string().min(1).max(2000).required(),
  price: Joi.number().min(0).required(),
  originalPrice: Joi.number().min(0).optional(),
  category: Joi.string().valid('shirts', 'jeans', 'jackets', 'dresses', 'shoes', 'accessories').required(),
  size: Joi.array().items(Joi.string().valid('XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36', '38', '40', '42')).min(1).required(),
  color: Joi.array().items(Joi.string().min(1)).min(1).required(),
  stock: Joi.number().min(0).required(),
  images: Joi.array().items(
    Joi.object({
      url: Joi.string().uri().required(),
      alt: Joi.string().default('Product image')
    })
  ).min(1).required(),
  brand: Joi.string().min(1).required(),
  material: Joi.string().optional(),
  careInstructions: Joi.string().optional(),
  isActive: Joi.boolean().default(true),
  isFeatured: Joi.boolean().default(false),
  tags: Joi.array().items(Joi.string()).optional()
});

/**
 * Generic validation middleware factory
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context.value
      }));

      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errors
      });
    }

    // Replace the original data with validated data
    req[property] = value;
    next();
  };
};

/**
 * Specific validation middlewares
 */
const validateOrder = validate(orderSchema);
const validateProduct = validate(productSchema);

/**
 * Cart item validation schema
 */
const cartItemSchema = Joi.object({
  productId: Joi.string().hex().length(24).required(),
  quantity: Joi.number().min(1).max(10).required(),
  size: Joi.string().valid('XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36', '38', '40', '42').required(),
  color: Joi.string().min(1).required()
});

const validateCartItem = validate(cartItemSchema);

/**
 * Query parameter validation schemas
 */
const paginationSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(12)
});

const productQuerySchema = paginationSchema.keys({
  category: Joi.string().valid('shirts', 'jeans', 'jackets', 'dresses', 'shoes', 'accessories').optional(),
  brand: Joi.string().optional(),
  minPrice: Joi.number().min(0).optional(),
  maxPrice: Joi.number().min(0).optional(),
  sortBy: Joi.string().valid('createdAt', 'price', 'name', 'rating.average').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  search: Joi.string().min(2).optional(),
  inStock: Joi.boolean().default(true)
});

const validateProductQuery = validate(productQuerySchema, 'query');
const validatePagination = validate(paginationSchema, 'query');

/**
 * Custom validation functions
 */
const validateObjectId = (id) => {
  const objectIdPattern = /^[0-9a-fA-F]{24}$/;
  return objectIdPattern.test(id);
};

const validateEmail = (email) => {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
};

const validatePhone = (phone) => {
  const phonePattern = /^\+?[\d\s\-\(\)]+$/;
  return phonePattern.test(phone) && phone.replace(/\D/g, '').length >= 10;
};

module.exports = {
  validate,
  validateOrder,
  validateProduct,
  validateCartItem,
  validateProductQuery,
  validatePagination,
  validateObjectId,
  validateEmail,
  validatePhone,
  addressSchema,
  paymentSchema,
  orderSchema,
  productSchema,
  cartItemSchema,
  paginationSchema,
  productQuerySchema
};