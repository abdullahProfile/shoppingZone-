const supabase = require('../config/supabase');
const bcrypt = require('bcryptjs');

class UserService {
  // Create a new user in Supabase auth and users table
  async createUser(userData) {
    try {
      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: false, // Set to true if you want to skip email confirmation
        user_metadata: {
          first_name: userData.profile.firstName,
          last_name: userData.profile.lastName
        }
      });

      if (authError) throw authError;

      // Create user profile in users table
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: userData.email,
          first_name: userData.profile.firstName,
          last_name: userData.profile.lastName,
          phone: userData.profile.phone,
          date_of_birth: userData.profile.dateOfBirth,
          gender: userData.profile.gender,
          avatar: userData.profile.avatar,
          role: userData.role || 'customer',
          status: userData.status || 'pending_verification',
          newsletter: userData.preferences?.newsletter,
          marketing: userData.preferences?.marketing,
          sms_updates: userData.preferences?.smsUpdates,
          currency: userData.preferences?.currency || 'USD',
          language: userData.preferences?.language || 'en'
        })
        .select()
        .single();

      if (profileError) throw profileError;

      return { user: authData.user, profile: profileData };
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  // Sign in user with email and password
  async signIn(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      // Get user profile
      const profile = await this.getUserById(data.user.id);
      
      // Record login
      await this.recordLogin(data.user.id, null, null);

      return { user: data.user, profile, session: data.session };
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  }

  // Get user by ID
  async getUserById(userId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          user_addresses (*)
        `)
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw error;
    }
  }

  // Get user by email
  async getUserByEmail(email) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          user_addresses (*)
        `)
        .eq('email', email.toLowerCase())
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Error getting user by email:', error);
      throw error;
    }
  }

  // Update user profile
  async updateUser(userId, updateData) {
    try {
      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  // Add address to user
  async addAddress(userId, addressData) {
    try {
      const { data, error } = await supabase
        .from('user_addresses')
        .insert({
          user_id: userId,
          ...addressData
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding address:', error);
      throw error;
    }
  }

  // Update address
  async updateAddress(userId, addressId, updateData) {
    try {
      const { data, error } = await supabase
        .from('user_addresses')
        .update(updateData)
        .eq('id', addressId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating address:', error);
      throw error;
    }
  }

  // Remove address
  async removeAddress(userId, addressId) {
    try {
      const { error } = await supabase
        .from('user_addresses')
        .delete()
        .eq('id', addressId)
        .eq('user_id', userId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error removing address:', error);
      throw error;
    }
  }

  // Get user addresses
  async getUserAddresses(userId) {
    try {
      const { data, error } = await supabase
        .from('user_addresses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting user addresses:', error);
      throw error;
    }
  }

  // Get default address
  async getDefaultAddress(userId) {
    try {
      const { data, error } = await supabase
        .from('user_addresses')
        .select('*')
        .eq('user_id', userId)
        .eq('is_default', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Error getting default address:', error);
      throw error;
    }
  }

  // Record login history
  async recordLogin(userId, ipAddress, userAgent, location = {}) {
    try {
      const { data, error } = await supabase
        .from('user_login_history')
        .insert({
          user_id: userId,
          ip_address: ipAddress,
          user_agent: userAgent,
          location_country: location.country,
          location_city: location.city
        });

      if (error) throw error;

      // Update last login
      await this.updateUser(userId, { last_login: new Date().toISOString() });

      return data;
    } catch (error) {
      console.error('Error recording login:', error);
      throw error;
    }
  }

  // Get active users
  async getActiveUsers(limit = 50, offset = 0) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('status', 'active')
        .eq('is_active', true)
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting active users:', error);
      throw error;
    }
  }

  // Change password
  async changePassword(userId, newPassword) {
    try {
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password: newPassword
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error changing password:', error);
      throw error;
    }
  }

  // Verify user email
  async verifyEmail(userId) {
    try {
      const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
        email_confirm: true
      });

      if (authError) throw authError;

      const { data, error } = await this.updateUser(userId, {
        email_verified: true,
        status: 'active'
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error verifying email:', error);
      throw error;
    }
  }

  // Delete user
  async deleteUser(userId) {
    try {
      // Delete from auth (this will cascade delete from users table due to foreign key)
      const { error } = await supabase.auth.admin.deleteUser(userId);
      
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }
}

module.exports = new UserService();