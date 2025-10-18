// Main application state
let currentProducts = [];
let currentCategory = 'all';
let currentPage = 1;
let totalPages = 1;
let currentSearch = '';
let currentSort = 'createdAt:desc';

// DOM elements
const elements = {
    productsGrid: document.getElementById('products-grid'),
    loading: document.getElementById('loading'),
    noProducts: document.getElementById('no-products'),
    cartCount: document.getElementById('cart-count'),
    pagination: document.getElementById('pagination'),
    pageInfo: document.getElementById('page-info'),
    prevButton: document.getElementById('prev-page'),
    nextButton: document.getElementById('next-page'),
    searchInput: document.getElementById('search-input'),
    searchButton: document.getElementById('search-btn'),
    sortSelect: document.getElementById('sort-select'),
    clearFiltersButton: document.getElementById('clear-filters'),
    navLinks: document.querySelectorAll('.nav-link'),
    productModal: document.getElementById('product-modal'),
    cartModal: document.getElementById('cart-modal'),
    toast: document.getElementById('toast')
};

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initializeApp();
    } catch (error) {
        console.error('Failed to initialize app:', error);
        showToast('Failed to load application. Please refresh the page.', 'error');
    }
});

async function initializeApp() {
    // Set up event listeners
    setupEventListeners();
    
    // Load initial data
    await loadProducts();
    await updateCartCount();
    
    // Start periodic cart sync
    startCartSync();
    
    console.log('ClothStore app initialized successfully');
}

function setupEventListeners() {
    // Navigation category links
    elements.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const category = e.target.dataset.category;
            selectCategory(category);
        });
    });
    
    // Search functionality
    elements.searchButton.addEventListener('click', handleSearch);
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    // Sort functionality
    elements.sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        currentPage = 1;
        loadProducts();
    });
    
    // Clear filters
    elements.clearFiltersButton.addEventListener('click', clearFilters);
    
    // Pagination
    elements.prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadProducts();
        }
    });
    
    elements.nextButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadProducts();
        }
    });
    
    // Modal functionality
    setupModalEventListeners();
}

function setupModalEventListeners() {
    // Close modals when clicking close button or outside modal
    document.querySelectorAll('.modal .close').forEach(closeBtn => {
        closeBtn.addEventListener('click', closeModal);
    });
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    });
    
    // Add to cart form submission
    const addToCartForm = document.getElementById('add-to-cart-form');
    if (addToCartForm) {
        addToCartForm.addEventListener('submit', handleAddToCart);
    }
}

// Product loading and display functions
async function loadProducts() {
    showLoading(true);
    
    try {
        let response;
        const params = {
            page: currentPage,
            limit: 20,
            sortBy: currentSort.split(':')[0],
            sortOrder: currentSort.split(':')[1]
        };
        
        if (currentSearch) {
            response = await API.Products.searchProducts(currentSearch, params);
        } else if (currentCategory !== 'all') {
            response = await API.Products.getProductsByCategory(currentCategory, params);
        } else {
            response = await API.Products.getProducts(params);
        }
        
        if (response.success) {
            currentProducts = response.data.products;
            if (response.data.pagination) {
                totalPages = response.data.pagination.totalPages;
                currentPage = response.data.pagination.currentPage;
            }
            
            displayProducts();
            updatePagination();
        } else {
            throw new Error(response.message || 'Failed to load products');
        }
        
    } catch (error) {
        console.error('Error loading products:', error);
        showToast(API.Utils.handleError(error, 'Products'), 'error');
        showNoProducts();
    } finally {
        showLoading(false);
    }
}

function displayProducts() {
    elements.productsGrid.innerHTML = '';
    
    if (currentProducts.length === 0) {
        showNoProducts();
        return;
    }
    
    elements.noProducts.style.display = 'none';
    
    currentProducts.forEach(product => {
        const productCard = createProductCard(product);
        elements.productsGrid.appendChild(productCard);
    });
}

function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.productId = product._id;
    
    const stockClass = getStockClass(product.availableStock || 0);
    const stockText = getStockText(product.availableStock || 0);
    
    card.innerHTML = `
        <div class="product-image">
            ${product.images && product.images.length > 0 ? 
                `<img src="${product.images[0].url}" alt="${product.name}" style="width: 100%; height: 100%; object-fit: cover;">` :
                '👕'
            }
        </div>
        <div class="product-info">
            <div class="product-name">${product.name}</div>
            <div class="product-brand">${product.brand || 'ClothStore'}</div>
            <div class="product-price">$${product.price.toFixed(2)}</div>
            <div class="product-stock ${stockClass}">${stockText}</div>
            <button class="btn-primary" ${product.availableStock <= 0 ? 'disabled' : ''}>
                ${product.availableStock <= 0 ? 'Out of Stock' : 'Add to Cart'}
            </button>
        </div>
    `;
    
    // Add click event for product details
    card.addEventListener('click', (e) => {
        if (!e.target.matches('button')) {
            showProductModal(product);
        }
    });
    
    // Add click event for add to cart button
    const addButton = card.querySelector('button');
    addButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (product.availableStock > 0) {
            showCartModal(product);
        }
    });
    
    return card;
}

function getStockClass(stock) {
    if (stock <= 0) return 'out-of-stock';
    if (stock <= 5) return 'low-stock';
    return '';
}

function getStockText(stock) {
    if (stock <= 0) return 'Out of Stock';
    if (stock <= 5) return `Only ${stock} left!`;
    return `${stock} in stock`;
}

// Modal functions
function showProductModal(product) {
    const modal = elements.productModal;
    const detailsDiv = document.getElementById('product-details');
    
    detailsDiv.innerHTML = `
        <h2>${product.name}</h2>
        <p><strong>Brand:</strong> ${product.brand || 'ClothStore'}</p>
        <p><strong>Category:</strong> ${product.category}</p>
        <p><strong>Price:</strong> $${product.price.toFixed(2)}</p>
        <p><strong>Available Sizes:</strong> ${product.size ? product.size.join(', ') : 'N/A'}</p>
        <p><strong>Available Colors:</strong> ${product.color ? product.color.join(', ') : 'N/A'}</p>
        <p><strong>Stock:</strong> ${getStockText(product.availableStock || 0)}</p>
        <p><strong>Description:</strong></p>
        <p>${product.description}</p>
        <br>
        <button class="btn-primary" onclick="showCartModal(${JSON.stringify(product).replace(/"/g, '&quot;')})" ${product.availableStock <= 0 ? 'disabled' : ''}>
            ${product.availableStock <= 0 ? 'Out of Stock' : 'Add to Cart'}
        </button>
    `;
    
    modal.style.display = 'block';
}

function showCartModal(product) {
    const modal = elements.cartModal;
    const sizeSelect = document.getElementById('size-select');
    const colorSelect = document.getElementById('color-select');
    const quantityInput = document.getElementById('quantity-input');
    
    // Populate size options
    sizeSelect.innerHTML = '<option value="">Select Size</option>';
    if (product.size && product.size.length > 0) {
        product.size.forEach(size => {
            sizeSelect.innerHTML += `<option value="${size}">${size}</option>`;
        });
    }
    
    // Populate color options
    colorSelect.innerHTML = '<option value="">Select Color</option>';
    if (product.color && product.color.length > 0) {
        product.color.forEach(color => {
            colorSelect.innerHTML += `<option value="${color}">${color}</option>`;
        });
    }
    
    // Set max quantity
    quantityInput.max = Math.min(10, product.availableStock || 0);
    quantityInput.value = 1;
    
    // Store product data for form submission
    modal.dataset.productId = product._id;
    modal.dataset.productName = product.name;
    modal.dataset.productPrice = product.price;
    
    modal.style.display = 'block';
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

// Cart functions
async function handleAddToCart(e) {
    e.preventDefault();
    
    const modal = elements.cartModal;
    const productId = modal.dataset.productId;
    const productName = modal.dataset.productName;
    const size = document.getElementById('size-select').value;
    const color = document.getElementById('color-select').value;
    const quantity = parseInt(document.getElementById('quantity-input').value);
    
    if (!size || !color) {
        showToast('Please select size and color', 'warning');
        return;
    }
    
    try {
        const response = await API.Cart.addToCart(productId, quantity, size, color);
        
        if (response.success) {
            showToast(`${productName} added to cart!`, 'success');
            await updateCartCount();
            closeModal();
        } else {
            throw new Error(response.message || 'Failed to add item to cart');
        }
        
    } catch (error) {
        console.error('Error adding to cart:', error);
        showToast(API.Utils.handleError(error, 'Cart'), 'error');
    }
}

async function updateCartCount() {
    try {
        const response = await API.Cart.getCartSummary();
        if (response.success) {
            elements.cartCount.textContent = response.data.summary.totalItems || 0;
        }
    } catch (error) {
        console.error('Error updating cart count:', error);
    }
}

// Search and filter functions
async function handleSearch() {
    const query = elements.searchInput.value.trim();
    if (query.length === 0) {
        clearFilters();
        return;
    }
    
    currentSearch = query;
    currentCategory = 'all';
    currentPage = 1;
    
    updateActiveCategory('all');
    await loadProducts();
}

function selectCategory(category) {
    currentCategory = category;
    currentSearch = '';
    currentPage = 1;
    
    updateActiveCategory(category);
    elements.searchInput.value = '';
    loadProducts();
}

function updateActiveCategory(category) {
    elements.navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.dataset.category === category) {
            link.classList.add('active');
        }
    });
}

function clearFilters() {
    currentCategory = 'all';
    currentSearch = '';
    currentPage = 1;
    currentSort = 'createdAt:desc';
    
    elements.searchInput.value = '';
    elements.sortSelect.value = currentSort;
    updateActiveCategory('all');
    loadProducts();
}

// Utility functions
function showLoading(show) {
    elements.loading.style.display = show ? 'block' : 'none';
    elements.productsGrid.style.display = show ? 'none' : 'grid';
    elements.noProducts.style.display = 'none';
}

function showNoProducts() {
    elements.loading.style.display = 'none';
    elements.productsGrid.style.display = 'none';
    elements.noProducts.style.display = 'block';
}

function updatePagination() {
    elements.pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    elements.prevButton.disabled = currentPage <= 1;
    elements.nextButton.disabled = currentPage >= totalPages;
    
    elements.pagination.style.display = totalPages > 1 ? 'flex' : 'none';
}

function showToast(message, type = 'success') {
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 4000);
}

// Cart synchronization
function startCartSync() {
    // Sync cart every 30 seconds to handle price/stock changes
    setInterval(async () => {
        try {
            const response = await API.Cart.syncCart();
            if (response.success && response.data.hasChanges) {
                console.log('Cart synchronized with changes:', response.data.changes);
                await updateCartCount();
                
                if (response.data.changes.length > 0) {
                    showToast('Your cart has been updated due to product changes', 'warning');
                }
            }
        } catch (error) {
            console.error('Cart sync error:', error);
        }
    }, 30000);
}

// Global functions for inline event handlers
window.showCartModal = showCartModal;
window.showProductModal = showProductModal;