const { getSupabaseAdmin } = require('../../backend/core/supabase/supabaseAdmin');

// Authentication middleware - Works with both Session and Supabase
async function isAuthenticated(req, res, next) {
  // Check session first (legacy)
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }
  
  // Check Supabase Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      const supabase = getSupabaseAdmin();
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return res.status(401).json({ error: 'Unauthorized. Invalid token.' });
      }
      
      // Determine role
      let role = user.user_metadata?.role || 'user';
      const adminEmails = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];
      if (adminEmails.includes(user.email.toLowerCase())) {
        role = 'admin';
      }
      
      // Attach user to request
      req.user = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email.split('@')[0],
        role: role
      };
      
      return next();
    } catch (error) {
      console.error('Auth error:', error);
      return res.status(401).json({ error: 'Unauthorized. Please login.' });
    }
  }
  
  res.status(401).json({ error: 'Unauthorized. Please login.' });
}

// Admin-only middleware
async function isAdmin(req, res, next) {
  // First check authentication
  await isAuthenticated(req, res, async () => {
    if (req.user && req.user.role === 'admin') {
      return next();
    }
    res.status(403).json({ error: 'Forbidden. Admin access required.' });
  });
}

// Admin or Officer middleware
async function isAdminOrOfficer(req, res, next) {
  // First check authentication
  await isAuthenticated(req, res, async () => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'officer')) {
      return next();
    }
    res.status(403).json({ error: 'Forbidden. Admin or Officer access required.' });
  });
}

module.exports = {
  isAuthenticated,
  isAdmin,
  isAdminOrOfficer
};
