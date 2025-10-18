// API Base Configuration
const API_BASE_URL = '/api';
const TIMEOUT = 10000; // 10 seconds

// Generic API request function with error handling
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include', // Include session cookies
        timeout: TIMEOUT
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    // Add request logging for concurrency testing
    console.log(`[API] ${finalOptions.method || 'GET'} ${url}`, finalOptions.body ? JSON.parse(finalOptions.body) : '');
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
        
        const response = await fetch(url, {
            ...finalOptions,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        let data;
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }
        
        console.log(`[API] Response ${response.status}:`, data);
        
        if (!response.ok) {
            throw new Error(data.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        return data;
        
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Request timeout - please try again');
        }
        
        console.error(`[API] Error ${finalOptions.method || 'GET'} ${url}:`, error);
        throw error;
    }
}

// Product API functions
const ProductAPI = {
    // Get all products with filters
    async getProducts(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = `/products${queryString ? `?${queryString}` : ''}`;
        return apiRequest(endpoint);
    },
    
    // Get single product by ID
    async getProduct(id) {
        return apiRequest(`/products/${id}`);
    },
    
    // Get products by category
    async getProductsByCategory(category, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = `/products/category/${category}${queryString ? `?${queryString}` : ''}`;
        return apiRequest(endpoint);
    },
    
    // Search products
    async searchProducts(query, params = {}) {
        const searchParams = { query, ...params };
        const queryString = new URLSearchParams(searchParams).toString();
        return apiRequest(`/products/search?${queryString}`);
    },
    
    // Check product availability
    async checkAvailability(productId, quantity = 1) {
        return apiRequest(`/products/${productId}/availability?quantity=${quantity}`);
    },
    
    // Get featured products
    async getFeaturedProducts(limit = 8) {
        return apiRequest(`/products/featured?limit=${limit}`);
    },
    
    // Get categories
    async getCategories() {
        return apiRequest('/products/categories');
    },
    
    // Get brands
    async getBrands() {
        return apiRequest('/products/brands');
    }
};

// Cart API functions
const CartAPI = {
    // Get current cart
    async getCart() {
        return apiRequest('/cart');
    },
    
    // Add item to cart
    async addToCart(productId, quantity, size, color) {
        return apiRequest('/cart/add', {
            method: 'POST',
            body: JSON.stringify({
                productId,
                quantity: parseInt(quantity),
                size,
                color
            })
        });
    },
    
    // Update cart item quantity
    async updateCartItem(productId, size, color, quantity) {
        return apiRequest('/cart/update', {
            method: 'PUT',
            body: JSON.stringify({
                productId,
                size,
                color,
                quantity: parseInt(quantity)
            })
        });
    },
    
    // Remove item from cart
    async removeFromCart(productId, size, color) {
        return apiRequest('/cart/remove', {
            method: 'DELETE',
            body: JSON.stringify({
                productId,
                size,
                color
            })
        });
    },
    
    // Clear entire cart
    async clearCart() {
        return apiRequest('/cart/clear', {
            method: 'DELETE'
        });
    },
    
    // Validate cart before checkout
    async validateCart() {
        return apiRequest('/cart/validate');
    },
    
    // Get cart summary
    async getCartSummary() {
        return apiRequest('/cart/summary');
    },
    
    // Sync cart with product updates
    async syncCart() {
        return apiRequest('/cart/sync', {
            method: 'POST'
        });
    }
};

// Order API functions
const OrderAPI = {
    // Create order from cart
    async createOrder(shippingAddress, paymentMethod = 'credit_card') {
        return apiRequest('/orders/create', {
            method: 'POST',
            body: JSON.stringify({
                shippingAddress,
                paymentMethod
            })
        });
    },
    
    // Get order by ID
    async getOrder(orderId) {
        return apiRequest(`/orders/${orderId}`);
    },
    
    // Get orders for current session
    async getOrders() {
        return apiRequest('/orders');
    },
    
    // Cancel order
    async cancelOrder(orderId) {
        return apiRequest(`/orders/${orderId}/cancel`, {
            method: 'POST'
        });
    }
};

// Payment API functions
const PaymentAPI = {
    // Process payment for order
    async processPayment(orderId, paymentMethod, customerInfo) {
        return apiRequest('/payment/process', {
            method: 'POST',
            body: JSON.stringify({
                orderId,
                paymentMethod,
                customerInfo
            })
        });
    },
    
    // Get payment status
    async getPaymentStatus(orderId) {
        return apiRequest(`/payment/status/${orderId}`);
    },
    
    // Validate payment method
    async validatePaymentMethod(paymentMethod, cardInfo = null) {
        return apiRequest('/payment/validate', {
            method: 'POST',
            body: JSON.stringify({
                paymentMethod,
                cardInfo
            })
        });
    }
};

// Utility functions
const APIUtils = {
    // Check API health
    async checkHealth() {
        return apiRequest('/health');
    },
    
    // Get API status
    async getStatus() {
        return apiRequest('/status');
    },
    
    // Handle API errors consistently
    handleError(error, context = 'API') {
        console.error(`[${context}] Error:`, error);
        
        let message = 'An unexpected error occurred. Please try again.';
        
        if (error.message) {
            if (error.message.includes('timeout')) {
                message = 'Request timed out. Please check your connection and try again.';
            } else if (error.message.includes('fetch')) {
                message = 'Unable to connect to server. Please check your connection.';
            } else if (error.message.includes('404')) {
                message = 'Requested resource not found.';
            } else if (error.message.includes('500')) {
                message = 'Server error occurred. Please try again later.';
            } else {
                message = error.message;
            }
        }
        
        return message;
    },
    
    // Retry function for failed requests
    async retry(asyncFunction, maxRetries = 3, delay = 1000) {
        let lastError;
        
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await asyncFunction();
            } catch (error) {
                lastError = error;
                
                if (i < maxRetries - 1) {
                    console.log(`Retry attempt ${i + 1}/${maxRetries} after ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Exponential backoff
                }
            }
        }
        
        throw lastError;
    },
    
    // Batch multiple API requests
    async batch(requests) {
        const results = await Promise.allSettled(requests);
        
        return results.map((result, index) => ({
            index,
            status: result.status,
            data: result.status === 'fulfilled' ? result.value : null,
            error: result.status === 'rejected' ? result.reason : null
        }));
    }
};

// Export API objects for use in other scripts
window.API = {
    Products: ProductAPI,
    Cart: CartAPI,
    Orders: OrderAPI,
    Payment: PaymentAPI,
    Utils: APIUtils
};