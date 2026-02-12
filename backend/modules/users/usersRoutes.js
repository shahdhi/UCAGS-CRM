/**
 * Users Module
 * Handles user authentication and management with Supabase
 */

const express = require('express');
const router = express.Router();
const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { copySheetTemplate, sheetExists } = require('../../core/sheets/sheetsClient');
const { config } = require('../../core/config/environment');

// Mock user database fallback (if Supabase is not configured)
let mockUsers = [
  {
    id: '1',
    email: 'admin@ucags.edu.lk',
    name: 'Admin User',
    role: 'admin',
    created_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    email_confirmed: true
  },
  {
    id: '2',
    email: 'officer@ucags.edu.lk',
    name: 'Academic Advisor',
    role: 'officer',
    created_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    email_confirmed: true
  }
];

/**
 * Check if Supabase admin is available
 */
function isSupabaseAvailable() {
  return getSupabaseAdmin() !== null;
}

/**
 * GET /api/users/officers
 * Get only officers (for assignment dropdown)
 */
router.get('/officers', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    
    if (supabase) {
      // Use Supabase
      const { data: { users }, error } = await supabase.auth.admin.listUsers();
      
      if (error) throw error;
      
      // Filter and format officers only
      const officers = users
        .filter(user => {
          const role = user.user_metadata?.role || 'officer';
          return role === 'officer' || role === 'admission_officer';
        })
        .map(user => ({
          id: user.id,
          name: user.user_metadata?.name || user.email.split('@')[0],
          email: user.email
        }));
      
      res.json({
        success: true,
        officers: officers,
        source: 'supabase'
      });
    } else {
      // Use mock data
      const officers = mockUsers
        .filter(user => user.role === 'officer')
        .map(user => ({
          id: user.id,
          name: user.name,
          email: user.email
        }));
      
      res.json({
        success: true,
        officers: officers,
        source: 'mock'
      });
    }
  } catch (error) {
    console.error('Error fetching officers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch officers'
    });
  }
});

/**
 * GET /api/users
 * Get all users (from Supabase or mock data)
 */
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    
    if (supabase) {
      // Use Supabase
      const { data: { users }, error } = await supabase.auth.admin.listUsers();
      
      if (error) throw error;
      
      // Transform Supabase users to our format
      const formattedUsers = users
        .slice()
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map(user => ({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email.split('@')[0],
        role: user.user_metadata?.role || 'officer',
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        email_confirmed: !!user.email_confirmed_at
      }));
      
      res.json({
        success: true,
        users: formattedUsers,
        source: 'supabase'
      });
    } else {
      // Use mock data
      res.json({
        success: true,
        users: mockUsers,
        source: 'mock'
      });
    }
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

/**
 * POST /api/users
 * Create a new user (in Supabase or mock data)
 */
router.post('/', async (req, res) => {
  try {
    const { email, name, role = 'officer', password = 'ucags123' } = req.body;

    // Validate input
    if (!email || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email and name are required'
      });
    }

    const supabase = getSupabaseAdmin();
    
    if (supabase) {
      // Use Supabase Admin API to create user with confirmed email
      console.log('Creating user with auto-confirmed email:', email);
      
      const { data, error } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // This should auto-confirm the email
        user_metadata: {
          name: name,
          role: role
        }
      });

      if (error) {
        if (error.message.includes('already registered')) {
          return res.status(409).json({
            success: false,
            error: 'User with this email already exists'
          });
        }
        throw error;
      }

      // Log the created user details for debugging
      console.log('User created:', {
        id: data.user.id,
        email: data.user.email,
        email_confirmed_at: data.user.email_confirmed_at,
        confirmed: !!data.user.email_confirmed_at
      });

      // Create a personal sheet for the user in the User Leads Spreadsheet
      let sheetCreated = false;
      let sheetError = null;

      // Create a personal attendance sheet for the user in the Attendance Spreadsheet
      let attendanceSheetCreated = false;
      let attendanceSheetError = null;
      
      if (config.sheets.userLeadsSheetId && config.sheets.userLeadsTemplateSheet) {
        try {
          console.log(`\n📋 Creating personal sheet for new user: ${name}`);
          console.log(`Spreadsheet ID: ${config.sheets.userLeadsSheetId}`);
          console.log(`Template: ${config.sheets.userLeadsTemplateSheet}`);
          
          // Check if sheet already exists (returns sheet name if exists, null if not)
          const existingSheet = await sheetExists(config.sheets.userLeadsSheetId, name);
          const exists = !!existingSheet;
          
          if (!exists) {
            console.log(`📋 Sheet doesn't exist, creating from template...`);
            
            // Check if template exists
            const templateExists = await sheetExists(config.sheets.userLeadsSheetId, config.sheets.userLeadsTemplateSheet);
            
            if (templateExists) {
              console.log(`✓ Template "${templateExists}" found, copying...`);
              await copySheetTemplate(
                config.sheets.userLeadsSheetId,
                templateExists, // Use the actual template name (case-corrected)
                name
              );
              console.log(`✅ Personal sheet created for ${name}`);
              sheetCreated = true;
            } else {
              console.log(`❌ Template sheet "${config.sheets.userLeadsTemplateSheet}" not found`);
              // Try to use the first available sheet as template
              const { getSpreadsheetInfo } = require('../../core/sheets/sheetsClient');
              const spreadsheet = await getSpreadsheetInfo(config.sheets.userLeadsSheetId);
              const allSheets = spreadsheet.sheets.map(s => s.properties.title);
              console.log(`Available sheets:`, allSheets);
              
              if (allSheets.length > 0) {
                console.log(`Using first sheet "${allSheets[0]}" as template...`);
                await copySheetTemplate(
                  config.sheets.userLeadsSheetId,
                  allSheets[0],
                  name
                );
                console.log(`✅ Personal sheet created for ${name} using fallback template`);
                sheetCreated = true;
              } else {
                throw new Error('No sheets available to use as template');
              }
            }
          } else {
            console.log(`ℹ️  Sheet already exists for user: ${existingSheet}`);
            sheetCreated = true;
          }
        } catch (err) {
          console.error('❌ Error creating user sheet:', err);
          console.error('Error details:', err.message);
          sheetError = err.message;
          // Don't fail user creation if sheet creation fails
        }
      } else {
        console.log('⚠️  Sheet creation skipped - configuration missing');
        console.log('USER_LEADS_SHEET_ID:', config.sheets.userLeadsSheetId);
        console.log('USER_LEADS_TEMPLATE_SHEET:', config.sheets.userLeadsTemplateSheet);
      }

      // Attendance sheet creation (one sheet per staff name)
      const { getAttendanceSheetId } = require('../../core/config/appSettings');
      const attendanceSheetId = await getAttendanceSheetId();

      if (attendanceSheetId) {
        try {
          const { ensureStaffSheet } = require('../attendance/attendanceService');
          await ensureStaffSheet(name);
          attendanceSheetCreated = true;
        } catch (err) {
          console.error('❌ Error creating attendance sheet:', err);
          attendanceSheetError = err.message;
          // Don't fail user creation if attendance sheet creation fails
        }
      } else {
        console.log('⚠️  Attendance sheet creation skipped - attendance sheet id not configured');
      }

      const newUser = {
        id: data.user.id,
        email: data.user.email,
        name: name,
        role: role,
        created_at: data.user.created_at,
        last_sign_in_at: null,
        email_confirmed: !!data.user.email_confirmed_at // Check actual confirmation status
      };

      res.status(201).json({
        success: true,
        message: `Staff member created successfully. Password: ${password}`
          + `${sheetCreated ? ' Personal leads sheet created.' : ''}`
          + `${attendanceSheetCreated ? ' Attendance sheet created.' : ''}`,
        user: newUser,
        emailConfirmed: !!data.user.email_confirmed_at,
        sheetCreated: sheetCreated,
        sheetError: sheetError,
        attendanceSheetCreated,
        attendanceSheetError,
        note: !data.user.email_confirmed_at ? 'Email confirmation may be required by Supabase settings. Please check Supabase Dashboard > Authentication > Settings.' : 'User can login immediately.',
        source: 'supabase'
      });
    } else {
      // Use mock data
      const existingUser = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'User with this email already exists'
        });
      }

      const newUser = {
        id: String(Date.now()),
        email: email,
        name: name,
        role: role,
        created_at: new Date().toISOString(),
        last_sign_in_at: null,
        email_confirmed: true // Auto-confirmed
      };

      mockUsers.push(newUser);

      res.status(201).json({
        success: true,
        message: 'Staff member created successfully (mock)',
        user: newUser,
        source: 'mock'
      });
    }
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create user'
    });
  }
});

/**
 * DELETE /api/users/:id
 * Delete a user (from Supabase or mock data)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseAdmin();

    if (supabase) {
      // Use Supabase
      // First, get the user to check if they're an admin
      const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
      
      if (listError) throw listError;
      
      const userToDelete = users.find(u => u.id === id);
      if (!userToDelete) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Don't allow deleting the last admin
      if (userToDelete.user_metadata?.role === 'admin') {
        const adminCount = users.filter(u => u.user_metadata?.role === 'admin').length;
        if (adminCount <= 1) {
          return res.status(400).json({
            success: false,
            error: 'Cannot delete the last admin user'
          });
        }
      }

      // Delete the user
      const { error: deleteError } = await supabase.auth.admin.deleteUser(id);
      
      if (deleteError) throw deleteError;

      res.json({
        success: true,
        message: 'Staff member deleted successfully',
        source: 'supabase'
      });
    } else {
      // Use mock data
      const userIndex = mockUsers.findIndex(u => u.id === id);
      if (userIndex === -1) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Don't allow deleting the last admin
      const deletingUser = mockUsers[userIndex];
      if (deletingUser.role === 'admin') {
        const adminCount = mockUsers.filter(u => u.role === 'admin').length;
        if (adminCount <= 1) {
          return res.status(400).json({
            success: false,
            error: 'Cannot delete the last admin user'
          });
        }
      }

      mockUsers.splice(userIndex, 1);

      res.json({
        success: true,
        message: 'Staff member deleted successfully',
        source: 'mock'
      });
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete user'
    });
  }
});

/**
 * PUT /api/users/:id
 * Update a user (in Supabase or mock data)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role } = req.body;
    const supabase = getSupabaseAdmin();

    if (supabase) {
      // Use Supabase
      const { data, error } = await supabase.auth.admin.updateUserById(id, {
        user_metadata: {
          name: name,
          role: role
        }
      });

      if (error) {
        if (error.message.includes('not found')) {
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }
        throw error;
      }

      const updatedUser = {
        id: data.user.id,
        email: data.user.email,
        name: name,
        role: role,
        created_at: data.user.created_at,
        last_sign_in_at: data.user.last_sign_in_at,
        email_confirmed: !!data.user.email_confirmed_at
      };

      res.json({
        success: true,
        message: 'Staff member updated successfully',
        user: updatedUser,
        source: 'supabase'
      });
    } else {
      // Use mock data
      const user = mockUsers.find(u => u.id === id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Update user fields
      if (name) user.name = name;
      if (role) user.role = role;

      res.json({
        success: true,
        message: 'Staff member updated successfully',
        user: user,
        source: 'mock'
      });
    }
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update user'
    });
  }
});

/**
 * POST /api/users/:id/confirm-email
 * Manually confirm user email (in Supabase)
 */
router.post('/:id/confirm-email', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseAdmin();

    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Supabase admin not available'
      });
    }

    // Get the user first
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const user = users.find(u => u.id === id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.email_confirmed_at) {
      return res.json({
        success: true,
        message: 'User email is already confirmed',
        alreadyConfirmed: true
      });
    }

    // Confirm the email
    const { data, error } = await supabase.auth.admin.updateUserById(id, {
      email_confirm: true
    });

    if (error) throw error;

    res.json({
      success: true,
      message: 'Email confirmed successfully. User can now login.',
      user: {
        id: data.user.id,
        email: data.user.email,
        email_confirmed: !!data.user.email_confirmed_at
      }
    });
  } catch (error) {
    console.error('Error confirming email:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to confirm email'
    });
  }
});

/**
 * PUT /api/users/:id/password
 * Change user password (in Supabase or mock data)
 */
router.put('/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const supabase = getSupabaseAdmin();

    // Validate password
    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters'
      });
    }

    if (supabase) {
      // Use Supabase
      const { data, error } = await supabase.auth.admin.updateUserById(id, {
        password: password
      });

      if (error) {
        if (error.message.includes('not found')) {
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }
        throw error;
      }

      res.json({
        success: true,
        message: 'Password changed successfully',
        source: 'supabase'
      });
    } else {
      // Use mock data - just verify user exists
      const user = mockUsers.find(u => u.id === id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Mock doesn't actually store passwords, just return success
      res.json({
        success: true,
        message: 'Password changed successfully (mock)',
        source: 'mock'
      });
    }
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to change password'
    });
  }
});

module.exports = router;
