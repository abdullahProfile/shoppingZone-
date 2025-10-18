const supabase = require('../config/supabase');

class ProductService {
  // Create a new product
  async createProduct(productData) {
    try {
      // Start transaction
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          name: productData.name,
          description: productData.description,
          price: productData.price,
          original_price: productData.originalPrice,
          category: productData.category,
          brand: productData.brand,
          material: productData.material,
          care_instructions: productData.careInstructions,
          stock: productData.stock,
          is_active: productData.isActive,
          is_featured: productData.isFeatured,
          meta_title: productData.seo?.metaTitle,
          meta_description: productData.seo?.metaDescription,
          slug: productData.seo?.slug
        })
        .select()
        .single();

      if (productError) throw productError;

      // Add sizes
      if (productData.size && productData.size.length > 0) {
        const sizes = productData.size.map(size => ({
          product_id: product.id,
          size
        }));

        const { error: sizesError } = await supabase
          .from('product_sizes')
          .insert(sizes);

        if (sizesError) throw sizesError;
      }

      // Add colors
      if (productData.color && productData.color.length > 0) {
        const colors = productData.color.map(color => ({
          product_id: product.id,
          color
        }));

        const { error: colorsError } = await supabase
          .from('product_colors')
          .insert(colors);

        if (colorsError) throw colorsError;
      }

      // Add images
      if (productData.images && productData.images.length > 0) {
        const images = productData.images.map((image, index) => ({
          product_id: product.id,
          url: image.url,
          alt: image.alt,
          sort_order: index
        }));

        const { error: imagesError } = await supabase
          .from('product_images')
          .insert(images);

        if (imagesError) throw imagesError;
      }

      // Add tags
      if (productData.tags && productData.tags.length > 0) {
        const tags = productData.tags.map(tag => ({
          product_id: product.id,
          tag
        }));

        const { error: tagsError } = await supabase
          .from('product_tags')
          .insert(tags);

        if (tagsError) throw tagsError;
      }

      return await this.getProductById(product.id);
    } catch (error) {
      console.error('Error creating product:', error);
      throw error;
    }
  }

  // Get product by ID with all related data
  async getProductById(productId) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          product_sizes (size),
          product_colors (color),
          product_images (url, alt, sort_order),
          product_tags (tag)
        `)
        .eq('id', productId)
        .single();

      if (error) throw error;

      // Transform data to match MongoDB schema format
      return this.transformProduct(data);
    } catch (error) {
      console.error('Error getting product by ID:', error);
      throw error;
    }
  }

  // Get products with filtering, sorting, and pagination
  async getProducts({
    category,
    brand,
    minPrice,
    maxPrice,
    isActive = true,
    isFeatured,
    search,
    sortBy = 'created_at',
    sortOrder = 'desc',
    limit = 20,
    offset = 0
  } = {}) {
    try {
      let query = supabase
        .from('products')
        .select(`
          *,
          product_sizes (size),
          product_colors (color),
          product_images (url, alt, sort_order),
          product_tags (tag)
        `, { count: 'exact' });

      // Apply filters
      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      if (category) {
        query = query.eq('category', category);
      }

      if (brand) {
        query = query.eq('brand', brand);
      }

      if (minPrice !== undefined) {
        query = query.gte('price', minPrice);
      }

      if (maxPrice !== undefined) {
        query = query.lte('price', maxPrice);
      }

      if (isFeatured !== undefined) {
        query = query.eq('is_featured', isFeatured);
      }

      if (search) {
        query = query.textSearch('fts', search);
      }

      // Apply sorting
      const ascending = sortOrder === 'asc';
      query = query.order(sortBy, { ascending });

      // Apply pagination
      if (limit && offset !== undefined) {
        query = query.range(offset, offset + limit - 1);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        products: data.map(product => this.transformProduct(product)),
        total: count,
        limit,
        offset
      };
    } catch (error) {
      console.error('Error getting products:', error);
      throw error;
    }
  }

  // Update product
  async updateProduct(productId, updateData) {
    try {
      const { data, error } = await supabase
        .from('products')
        .update({
          name: updateData.name,
          description: updateData.description,
          price: updateData.price,
          original_price: updateData.originalPrice,
          category: updateData.category,
          brand: updateData.brand,
          material: updateData.material,
          care_instructions: updateData.careInstructions,
          stock: updateData.stock,
          is_active: updateData.isActive,
          is_featured: updateData.isFeatured,
          meta_title: updateData.seo?.metaTitle,
          meta_description: updateData.seo?.metaDescription,
          slug: updateData.seo?.slug
        })
        .eq('id', productId)
        .select()
        .single();

      if (error) throw error;

      // Update related data if provided
      if (updateData.size !== undefined) {
        // Delete existing sizes and add new ones
        await supabase.from('product_sizes').delete().eq('product_id', productId);
        
        if (updateData.size.length > 0) {
          const sizes = updateData.size.map(size => ({
            product_id: productId,
            size
          }));
          await supabase.from('product_sizes').insert(sizes);
        }
      }

      if (updateData.color !== undefined) {
        // Delete existing colors and add new ones
        await supabase.from('product_colors').delete().eq('product_id', productId);
        
        if (updateData.color.length > 0) {
          const colors = updateData.color.map(color => ({
            product_id: productId,
            color
          }));
          await supabase.from('product_colors').insert(colors);
        }
      }

      return await this.getProductById(productId);
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  }

  // Delete product
  async deleteProduct(productId) {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  }

  // Reserve stock (atomic operation for concurrency)
  async reserveStock(productId, quantity) {
    try {
      // Get current product with version
      const { data: currentProduct, error: fetchError } = await supabase
        .from('products')
        .select('stock, reserved_stock, version, available_stock')
        .eq('id', productId)
        .single();

      if (fetchError) throw fetchError;

      if (currentProduct.available_stock < quantity) {
        throw new Error('Insufficient stock available');
      }

      // Update with version check for optimistic locking
      const { data, error } = await supabase
        .from('products')
        .update({
          reserved_stock: currentProduct.reserved_stock + quantity,
          version: currentProduct.version + 1,
          last_stock_update: new Date().toISOString()
        })
        .eq('id', productId)
        .eq('version', currentProduct.version) // Optimistic locking
        .select()
        .single();

      if (error) throw error;
      
      if (!data) {
        throw new Error('Product was modified by another operation. Please try again.');
      }

      return data;
    } catch (error) {
      console.error('Error reserving stock:', error);
      throw error;
    }
  }

  // Release stock
  async releaseStock(productId, quantity) {
    try {
      const { data: currentProduct, error: fetchError } = await supabase
        .from('products')
        .select('reserved_stock, version')
        .eq('id', productId)
        .single();

      if (fetchError) throw fetchError;

      if (currentProduct.reserved_stock < quantity) {
        throw new Error('Cannot release more stock than reserved');
      }

      const { data, error } = await supabase
        .from('products')
        .update({
          reserved_stock: currentProduct.reserved_stock - quantity,
          version: currentProduct.version + 1,
          last_stock_update: new Date().toISOString()
        })
        .eq('id', productId)
        .eq('version', currentProduct.version)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error releasing stock:', error);
      throw error;
    }
  }

  // Confirm stock (convert reserved to sold)
  async confirmStock(productId, quantity) {
    try {
      const { data: currentProduct, error: fetchError } = await supabase
        .from('products')
        .select('stock, reserved_stock, version')
        .eq('id', productId)
        .single();

      if (fetchError) throw fetchError;

      if (currentProduct.reserved_stock < quantity) {
        throw new Error('Cannot confirm more stock than reserved');
      }

      const { data, error } = await supabase
        .from('products')
        .update({
          stock: currentProduct.stock - quantity,
          reserved_stock: currentProduct.reserved_stock - quantity,
          version: currentProduct.version + 1,
          last_stock_update: new Date().toISOString()
        })
        .eq('id', productId)
        .eq('version', currentProduct.version)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error confirming stock:', error);
      throw error;
    }
  }

  // Search products with full-text search
  async searchProducts(searchTerm, { limit = 20, offset = 0 } = {}) {
    try {
      const { data, error, count } = await supabase
        .from('products')
        .select(`
          *,
          product_sizes (size),
          product_colors (color),
          product_images (url, alt, sort_order),
          product_tags (tag)
        `, { count: 'exact' })
        .textSearch('name, description, brand', searchTerm)
        .eq('is_active', true)
        .range(offset, offset + limit - 1)
        .order('rating_average', { ascending: false });

      if (error) throw error;

      return {
        products: data.map(product => this.transformProduct(product)),
        total: count,
        limit,
        offset
      };
    } catch (error) {
      console.error('Error searching products:', error);
      throw error;
    }
  }

  // Get featured products
  async getFeaturedProducts(limit = 10) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          product_sizes (size),
          product_colors (color),
          product_images (url, alt, sort_order),
          product_tags (tag)
        `)
        .eq('is_active', true)
        .eq('is_featured', true)
        .limit(limit)
        .order('rating_average', { ascending: false });

      if (error) throw error;
      return data.map(product => this.transformProduct(product));
    } catch (error) {
      console.error('Error getting featured products:', error);
      throw error;
    }
  }

  // Transform Supabase product data to MongoDB format
  transformProduct(data) {
    if (!data) return null;

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      price: parseFloat(data.price),
      originalPrice: data.original_price ? parseFloat(data.original_price) : undefined,
      category: data.category,
      brand: data.brand,
      material: data.material,
      careInstructions: data.care_instructions,
      stock: data.stock,
      reservedStock: data.reserved_stock,
      availableStock: data.available_stock,
      isActive: data.is_active,
      isFeatured: data.is_featured,
      rating: {
        average: parseFloat(data.rating_average),
        count: data.rating_count
      },
      seo: {
        metaTitle: data.meta_title,
        metaDescription: data.meta_description,
        slug: data.slug
      },
      version: data.version,
      lastStockUpdate: data.last_stock_update,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      size: data.product_sizes?.map(s => s.size) || [],
      color: data.product_colors?.map(c => c.color) || [],
      images: data.product_images?.sort((a, b) => a.sort_order - b.sort_order).map(img => ({
        url: img.url,
        alt: img.alt
      })) || [],
      tags: data.product_tags?.map(t => t.tag) || []
    };
  }
}

module.exports = new ProductService();