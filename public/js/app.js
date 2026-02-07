// Main Application Logic
let currentUser = null;
let currentEnquiries = [];

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    // Wait for Supabase to load
    if (!window.SupabaseAuth) {
        setTimeout(initializeApp, 100);
        return;
    }

    // Check if user is logged in with Supabase
    try {
        const user = await SupabaseAuth.getCurrentUser();
        if (user) {
            // Determine role: check user_metadata first, then check if admin email
            let role = user.user_metadata?.role || 'user';
            
            // Admin email list (you can add multiple admin emails here)
            const adminEmails = [
                'admin@ucags.edu.lk',
                'mohamedunais2018@gmail.com' // Add your admin emails here
            ];
            
            if (adminEmails.includes(user.email.toLowerCase())) {
                role = 'admin';
            }
            
            currentUser = {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name || user.email.split('@')[0],
                role: role
            };
            window.currentUser = currentUser; // Expose globally
            showDashboard();
        } else {
            showLogin();
        }
    } catch (error) {
        console.error('Auth check error:', error);
        showLogin();
    }

    // Listen for auth changes
    SupabaseAuth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);
        if (event === 'SIGNED_IN' && session) {
            // Determine role
            let role = session.user.user_metadata?.role || 'user';
            
            const adminEmails = [
                'admin@ucags.edu.lk',
                'mohamedunais2018@gmail.com'
            ];
            
            if (adminEmails.includes(session.user.email.toLowerCase())) {
                role = 'admin';
            }
            
            currentUser = {
                id: session.user.id,
                email: session.user.email,
                name: session.user.user_metadata?.name || session.user.email.split('@')[0],
                role: role
            };
            window.currentUser = currentUser; // Expose globally
            showDashboard();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            showLogin();
        }
    });
}

// Show login page
function showLogin() {
    UI.hide('dashboardPage');
    UI.show('loginPage');
    
    // Clear any active views and reset hash
    window.location.hash = '';
    
    // Clear user info
    document.getElementById('userDisplay').textContent = '';
    document.getElementById('sidebarUserName').textContent = '';
    document.getElementById('welcomeUserName').textContent = '';
    document.getElementById('sidebarUserRole').textContent = '';
    
    // Reset forms
    const loginForm = document.getElementById('loginForm');
    
    if (loginForm) {
        loginForm.reset();
        document.getElementById('loginError').textContent = '';
    }
    
    // Setup forms
    setupAuthForms();
}

// Show dashboard
async function showDashboard() {
    UI.hide('loginPage');
    UI.show('dashboardPage');
    
    // Update user displays
    document.getElementById('userDisplay').textContent = currentUser.name;
    document.getElementById('sidebarUserName').textContent = currentUser.name;
    document.getElementById('welcomeUserName').textContent = currentUser.name;
    
    const userRole = currentUser.role === 'admin' ? 'Administrator' : 'Admissions Officer';
    document.getElementById('sidebarUserRole').textContent = userRole;
    
    // Show/hide admin features
    if (currentUser.role === 'admin') {
        document.body.classList.add('admin');
        console.log('✓ Admin user detected - showing admin features');
    } else {
        document.body.classList.remove('admin');
        console.log('✓ Officer user detected - hiding admin features');
        console.log('  Body has admin class:', document.body.classList.contains('admin'));
    }
    
    // Setup navigation/event listeners immediately so sidebar is clickable even if API calls are slow
    if (!window.__navInitialized) {
        setupNavigation();
        setupEventListeners();
        setupUserManagement();
        setupRouting();
        window.__navInitialized = true;
    }

    // Load batches (admin) in background; do not block UI interactivity
    loadBatchesMenu();

    // Initialize counts
    updateEnquiriesBadge();
}

// Load batches dynamically from spreadsheet
async function loadBatchesMenu() {
    // Only load batches for admins
    if (!currentUser || currentUser.role !== 'admin') {
        console.log('Skipping batch loading for non-admin user');
        return;
    }
    
    try {
        const response = await API.leads.getBatches();
        const batches = response.batches || [];
        
        const menu = document.getElementById('leadsBatchesMenu');
        if (!menu) return;
        
        // Clear existing batch items (keep only Add New Batch button)
        const addBatchBtn = document.getElementById('addNewBatchBtn');
        menu.innerHTML = '';
        
        // Add batch items with event listeners
        batches.forEach(batchName => {
            const batchLink = document.createElement('a');
            batchLink.href = '#';
            batchLink.className = 'nav-subitem';
            batchLink.dataset.page = `leads-${batchName.toLowerCase().replace(/\s+/g, '')}`;
            batchLink.innerHTML = `
                <i class="fas fa-layer-group"></i>
                <span>${batchName}</span>
            `;
            
            // Add click handler immediately
            batchLink.addEventListener('click', (e) => {
                e.preventDefault();
                const page = batchLink.dataset.page;
                
                if (!page) return;
                
                // Update URL hash
                window.location.hash = page;
                
                // Navigate to page
                navigateToPage(page);
                
                // Close mobile menu if open
                closeMobileMenu();
            });
            
            menu.appendChild(batchLink);
        });
        
        // Add back the "Add New Batch" button
        if (addBatchBtn) {
            menu.appendChild(addBatchBtn);
        }
        
        console.log(`✓ Loaded ${batches.length} batches with click handlers`);
    } catch (error) {
        console.error('Error loading batches:', error);
    }
}

// Setup authentication forms
function setupAuthForms() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        const newLoginForm = loginForm.cloneNode(true);
        loginForm.parentNode.replaceChild(newLoginForm, loginForm);
        newLoginForm.addEventListener('submit', handleLogin);
    }
}


// Handle login with Supabase
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
        errorDiv.textContent = '';
        
        console.log('Attempting login for:', email);
        const result = await SupabaseAuth.signIn(email, password);
        
        console.log('Login result:', result);
        
        if (result.user) {
            console.log('Login successful, user:', result.user);
            
            // Manually set current user and show dashboard
            let role = result.user.user_metadata?.role || 'user';
            const adminEmails = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];
            if (adminEmails.includes(result.user.email.toLowerCase())) {
                role = 'admin';
            }
            
            currentUser = {
                id: result.user.id,
                email: result.user.email,
                name: result.user.user_metadata?.name || result.user.email.split('@')[0],
                role: role
            };
            window.currentUser = currentUser; // Expose globally
            
            console.log('Current user set:', currentUser);
            showDashboard();
        }
        
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = error.message || 'Login failed. Please check your credentials.';
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Login';
    }
}


// Handle logout
async function handleLogout() {
    try {
        await SupabaseAuth.signOut();
        currentUser = null;
        window.currentUser = null; // Clear global reference
        currentEnquiries = [];
        
        // Remove all event listeners by cleaning up
        window.location.hash = '';
        
        // Hide all content views
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });
        
        // Remove active states from navigation
        document.querySelectorAll('.nav-item, .nav-subitem').forEach(item => {
            item.classList.remove('active');
        });
        
        // Clear any cached data
        const enquiriesTable = document.getElementById('enquiriesTableBody');
        const leadsTable = document.getElementById('leadsTableBody');
        if (enquiriesTable) enquiriesTable.innerHTML = '';
        if (leadsTable) leadsTable.innerHTML = '';
        
        showLogin();
    } catch (error) {
        console.error('Logout error:', error);
        currentUser = null;
        window.currentUser = null; // Clear global reference
        currentEnquiries = [];
        showLogin();
    }
}

// Setup navigation
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item, .nav-subitem:not(#addNewBatchBtn)');
    const navSections = document.querySelectorAll('.nav-section');
    
    // Handle Add New Batch button separately
    const addNewBatchBtn = document.getElementById('addNewBatchBtn');
    if (addNewBatchBtn) {
        addNewBatchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showAddBatchModal();
        });
    }
    
    // Handle main nav items and subitems
    navItems.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            
            if (!page) return;
            
            // Update URL hash
            window.location.hash = page;
            
            // Navigate to page
            navigateToPage(page);
            
            // Close mobile menu if open
            closeMobileMenu();
        });
    });
    
    // Handle collapsible sections
    navSections.forEach(section => {
        const header = section.querySelector('.nav-section-header');
        header.addEventListener('click', (e) => {
            e.preventDefault();
            section.classList.toggle('active');
        });
    });
    
    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
        });
    }
    
    // Sidebar toggle (collapse/expand)
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
}

// Close mobile menu
function closeMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.remove('mobile-open');
    }
}

// Setup URL routing
function setupRouting() {
    // Handle browser back/forward buttons
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.slice(1); // Remove the #
        const page = hash || 'home';
        navigateToPage(page);
    });
    
    // Load initial page based on URL hash
    const hash = window.location.hash.slice(1);
    const initialPage = hash || 'home';
    navigateToPage(initialPage);
}

// Navigate to a specific page
async function navigateToPage(page) {
    const navItems = document.querySelectorAll('.nav-item, .nav-subitem');
    
    // Update active link
    navItems.forEach(link => {
        if (link.dataset.page === page) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    
    // Reset Lead Management initialization flag when leaving the page
    if (window.resetLeadManagementInit && page !== 'lead-management') {
        window.resetLeadManagementInit();
    }
    
    // Show corresponding view
    document.querySelectorAll('.content-view').forEach(view => {
        view.classList.remove('active');
    });
    
    // For leads pages, use the shared leadsView
    if (page.startsWith('leads-')) {
        const viewElement = document.getElementById('leadsView');
        if (viewElement) {
            viewElement.classList.add('active');
            // Update title based on page
            const titleElement = document.getElementById('leadsViewTitle');
            if (titleElement) {
                if (page === 'leads-myLeads') {
                    titleElement.textContent = 'My Leads';
                } else {
                    const batchName = page.replace('leads-', '');
                    const formattedName = batchName.charAt(0).toUpperCase() + batchName.slice(1);
                    titleElement.textContent = `${formattedName} Leads`;
                }
            }
        }
    } else {
        const viewElement = document.getElementById(`${page}View`);
        if (viewElement) {
            viewElement.classList.add('active');
        } else {
            // If page doesn't exist, redirect to home
            window.location.hash = 'home';
            return;
        }
    }
    
    // Update page title
    const pageTitle = document.getElementById('pageTitle');
    const activeLink = document.querySelector(`.nav-item[data-page="${page}"], .nav-subitem[data-page="${page}"]`);
    if (pageTitle && activeLink) {
        pageTitle.textContent = activeLink.querySelector('span')?.textContent || page;
    }
    
    // Load data for the view
    switch(page) {
        case 'home':
            loadDashboard();
            break;
        case 'enquiries':
            loadEnquiries();
            break;
        case 'leads-myLeads':
            // Officer's personal leads page
            if (window.initLeadsPage) {
                window.initLeadsPage('myLeads');
            }
            break;
        case 'leads-batch14':
            if (window.initLeadsPage) {
                window.initLeadsPage('Batch14');
            }
            break;
        case 'lead-management':
            if (window.initLeadManagementPage) {
                await window.initLeadManagementPage();
            }
            break;
        default:
            // Handle dynamic batch pages
            if (page.startsWith('leads-')) {
                const batchName = page.replace('leads-', '');
                const formattedName = batchName.charAt(0).toUpperCase() + batchName.slice(1);
                if (window.initLeadsPage) {
                    window.initLeadsPage(formattedName);
                }
            }
            break;
        case 'admissions':
        case 'students':
            showPlaceholderMessage(page);
            break;
        case 'calendar':
            loadCalendar();
            break;
        case 'users':
            loadUsers();
            break;
        case 'officers':
            loadOfficers();
            break;
        case 'contacts-all':
        case 'contacts-batch1':
        case 'contacts-batch2':
        case 'contacts-batch3':
        case 'contacts-archived':
            loadContacts(page);
            break;
        case 'gmail':
            loadGmail();
            break;
        case 'call':
            loadCallCenter();
            break;
        case 'reports':
            loadReports();
            break;
        case 'settings':
            loadSettings();
            break;
        case 'receipts':
            loadReceipts();
            break;
    }
}

// Load contacts based on page
function loadContacts(page) {
    console.log('Loading contacts for:', page);
    // This will be implemented to load actual contact data
}

// Load Gmail view
function loadGmail() {
    console.log('Loading Gmail integration');
    // This will be implemented to show Gmail interface
}

// Load Call Center view
function loadCallCenter() {
    console.log('Loading Call Center');
    // This will be implemented to show call interface
}

// Load Reports view
function loadReports() {
    console.log('Loading Reports');
    // This will be implemented to show reports
}

// Load Settings view
function loadSettings() {
    console.log('Loading Settings');
    // This will be implemented to show settings
}

// Load Receipts view (admin only)
function loadReceipts() {
    console.log('Loading Receipts page');
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin only.');
        return;
    }
    // Initialize receipts page
    if (window.initReceiptsPage) {
        window.initReceiptsPage();
    }
}

// Load users (admin only)
async function loadUsers() {
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin only.');
        return;
    }
    
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    try {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading users...</td></tr>';
        
        // Get all users from API
        const response = await fetch('/api/users');
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load users');
        }
        
        const users = data.users || [];
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">No users found</td></tr>';
            return;
        }
        
        // Define admin emails that cannot be deleted
        const protectedAdminEmails = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];
        
        tbody.innerHTML = users.map(user => {
            const isProtectedAdmin = protectedAdminEmails.includes(user.email.toLowerCase());
            
            return `
            <tr>
                <td>${escapeHtml(user.email)}</td>
                <td>${escapeHtml(user.name || '-')}</td>
                <td>
                    <span class="badge badge-${user.role === 'admin' ? 'primary' : 'secondary'}">
                        ${user.role || 'officer'}
                    </span>
                </td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td>${user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : '-'}</td>
                <td>
                    <span class="badge badge-${user.email_confirmed ? 'success' : 'warning'}">
                        ${user.email_confirmed ? 'Active' : 'Pending'}
                    </span>
                </td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        ${!user.email_confirmed ? `
                        <button class="btn btn-sm btn-success" onclick="confirmUserEmail('${user.id}', '${escapeHtml(user.email)}')" title="Confirm Email">
                            <i class="fas fa-check"></i>
                        </button>
                        ` : ''}
                        <button class="btn btn-sm btn-warning" onclick="openChangePasswordModal('${user.id}', '${escapeHtml(user.email)}')" title="Change Password">
                            <i class="fas fa-key"></i>
                        </button>
                        ${!isProtectedAdmin ? `
                        <button class="btn btn-sm btn-danger" onclick="deleteUser('${user.id}')" title="Delete User">
                            <i class="fas fa-trash"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading users:', error);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: red;">
            Error: ${error.message}
        </td></tr>`;
    }
}

// Delete user (admin only)
async function deleteUser(userId) {
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin only.');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to delete user');
        }
        
        if (window.UI && window.UI.showToast) {
            UI.showToast('Staff member deleted successfully!', 'success');
        } else {
            alert('Staff member deleted successfully!');
        }
        loadUsers();
    } catch (error) {
        console.error('Error deleting user:', error);
        if (window.UI && window.UI.showToast) {
            UI.showToast('Failed to delete user: ' + error.message, 'error');
        } else {
            alert('Failed to delete user: ' + error.message);
        }
    }
}

// Add new user (admin only)
async function addNewUser(event) {
    event.preventDefault();
    
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin only.');
        return;
    }
    
    const email = document.getElementById('userEmail').value.trim();
    const name = document.getElementById('userName').value.trim();
    const role = document.getElementById('userRole').value;
    const password = document.getElementById('userPassword').value;
    
    // Validate password
    if (password.length < 6) {
        alert('Password must be at least 6 characters');
        return;
    }
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
    submitBtn.disabled = true;
    
    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, name, role, password })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to add user');
        }
        
        // Close modal
        closeModal('addUserModal');
        
        // Show success message
        if (window.UI && window.UI.showToast) {
            UI.showToast(`Staff member "${name}" added successfully!`, 'success');
        } else {
            alert(`Staff member "${name}" added successfully!`);
        }
        
        // Reset form
        document.getElementById('addUserForm').reset();
        
        // Reload users
        loadUsers();
    } catch (error) {
        console.error('Error adding user:', error);
        if (window.UI && window.UI.showToast) {
            UI.showToast('Failed to add user: ' + error.message, 'error');
        } else {
            alert('Failed to add user: ' + error.message);
        }
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Open change password modal
function openChangePasswordModal(userId, userEmail) {
    document.getElementById('changePasswordUserId').value = userId;
    document.getElementById('changePasswordUserEmail').value = userEmail;
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    
    // Reset button state
    const form = document.getElementById('changePasswordForm');
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-key"></i> Change Password';
        submitBtn.disabled = false;
    }
    
    openModal('changePasswordModal');
}

// Change user password
async function changeUserPassword(event) {
    event.preventDefault();
    
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin only.');
        return;
    }
    
    const userId = document.getElementById('changePasswordUserId').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Validate passwords match
    if (newPassword !== confirmPassword) {
        alert('Passwords do not match!');
        return;
    }
    
    // Validate password length
    if (newPassword.length < 6) {
        alert('Password must be at least 6 characters');
        return;
    }
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Changing...';
    submitBtn.disabled = true;
    
    try {
        const response = await fetch(`/api/users/${userId}/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password: newPassword })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to change password');
        }
        
        // Close modal
        closeModal('changePasswordModal');
        
        // Show success message
        if (window.UI && window.UI.showToast) {
            UI.showToast('Password changed successfully!', 'success');
        } else {
            alert('Password changed successfully!');
        }
        
        // Reset form and button
        document.getElementById('changePasswordForm').reset();
        submitBtn.innerHTML = '<i class="fas fa-key"></i> Change Password';
        submitBtn.disabled = false;
    } catch (error) {
        console.error('Error changing password:', error);
        if (window.UI && window.UI.showToast) {
            UI.showToast('Failed to change password: ' + error.message, 'error');
        } else {
            alert('Failed to change password: ' + error.message);
        }
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Toggle password visibility
function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Setup Add User button and form
function setupUserManagement() {
    const addUserBtn = document.getElementById('addUserBtn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => {
            openModal('addUserModal');
        });
    }
    
    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
        addUserForm.addEventListener('submit', addNewUser);
    }
    
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', changeUserPassword);
    }
}

// Confirm user email (admin only)
async function confirmUserEmail(userId, userEmail) {
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin only.');
        return;
    }
    
    if (!confirm(`Confirm email for ${userEmail}?\n\nThis will allow the user to login immediately.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/users/${userId}/confirm-email`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to confirm email');
        }
        
        if (window.UI && window.UI.showToast) {
            UI.showToast(data.message, 'success');
        } else {
            alert(data.message);
        }
        loadUsers();
    } catch (error) {
        console.error('Error confirming email:', error);
        if (window.UI && window.UI.showToast) {
            UI.showToast('Failed to confirm email: ' + error.message, 'error');
        } else {
            alert('Failed to confirm email: ' + error.message);
        }
    }
}

// Make functions global
window.deleteUser = deleteUser;
window.confirmUserEmail = confirmUserEmail;
window.openChangePasswordModal = openChangePasswordModal;
window.togglePasswordVisibility = togglePasswordVisibility;

// Helper function
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show add batch modal
function showAddBatchModal() {
    const modalHTML = `
        <div class="modal-overlay" id="addBatchModal" onclick="closeAddBatchModal(event)">
            <div class="modal-dialog" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2><i class="fas fa-plus-circle"></i> Add New Batch</h2>
                    <button class="modal-close" onclick="closeAddBatchModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="addBatchForm" onsubmit="handleAddBatch(event)">
                        <div class="form-group">
                            <label for="batchName"><i class="fas fa-layer-group"></i> Batch Name *</label>
                            <input type="text" id="batchName" class="form-control" 
                                   placeholder="e.g., Batch-16, Spring-2026, Batch-A" 
                                   required
                                   pattern="^[A-Za-z0-9_\-]+$"
                                   title="Only letters, numbers, hyphens, and underscores allowed (no spaces)"
                                   style="padding: 12px; font-size: 14px;">
                            <small style="color: #ff9800; margin-top: 8px; display: block; font-weight: 500;">
                                <i class="fas fa-exclamation-triangle"></i> <strong>Important:</strong> Do NOT use spaces in batch names. Use hyphens (-) or underscores (_) instead.
                            </small>
                            <small style="color: #666; margin-top: 4px; display: block;">
                                ✓ Good: Batch-16, Spring-2026, Batch_A<br>
                                ✗ Bad: Batch 16, Spring 2026, Batch A
                            </small>
                        </div>
                        
                        <div style="background: #f0f7ff; padding: 15px; border-radius: 6px; border-left: 4px solid #2196f3; margin-top: 20px;">
                            <p style="margin: 0; color: #333; font-size: 14px;">
                                <i class="fas fa-info-circle" style="color: #2196f3;"></i>
                                <strong>What will be created:</strong>
                            </p>
                            <ul style="margin: 10px 0 0 20px; color: #666; font-size: 13px;">
                                <li>New sheet in Google Spreadsheet</li>
                                <li>Same column structure (ID, Name, Email, etc.)</li>
                                <li>Added to Leads menu</li>
                                <li>Empty and ready for new leads</li>
                            </ul>
                        </div>
                        
                        <div class="modal-footer" style="border-top: 1px solid #e0e0e0; margin-top: 20px; padding-top: 20px;">
                            <button type="button" class="btn btn-secondary" onclick="closeAddBatchModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-plus"></i> Create Batch
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.style.overflow = 'hidden';
    
    // Focus on input
    setTimeout(() => {
        document.getElementById('batchName').focus();
    }, 100);
}

// Close add batch modal
function closeAddBatchModal(event) {
    if (event && event.target.className !== 'modal-overlay' && !event.target.closest('.modal-close')) {
        return;
    }
    
    const modal = document.getElementById('addBatchModal');
    if (modal) {
        modal.remove();
    }
    document.body.style.overflow = '';
}

// Handle add batch form submission
async function handleAddBatch(event) {
    event.preventDefault();
    
    const batchNameInput = document.getElementById('batchName');
    const batchName = batchNameInput.value.trim();
    
    if (!batchName) {
        alert('Please enter a batch name');
        return;
    }
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    submitBtn.disabled = true;
    
    try {
        await createNewBatch(batchName);
    } catch (error) {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Create new batch
async function createNewBatch(batchName) {
    try {
        // Call API to create new batch sheet
        const response = await fetch('/api/leads/create-batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ batchName })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Close modal
            closeAddBatchModal();
            
            // Show success toast
            if (window.showToast) {
                showToast(`Batch "${batchName}" created successfully!`, 'success');
            } else {
                alert(`Batch "${batchName}" created successfully!`);
            }
            
            // Add to menu
            const menu = document.getElementById('leadsBatchesMenu');
            const addBatchBtn = document.getElementById('addNewBatchBtn');
            
            const newBatchLink = document.createElement('a');
            newBatchLink.href = '#';
            newBatchLink.className = 'nav-subitem';
            newBatchLink.dataset.page = `leads-${batchName.toLowerCase().replace(/\s+/g, '')}`;
            newBatchLink.innerHTML = `
                <i class="fas fa-layer-group"></i>
                <span>${batchName}</span>
            `;
            
            menu.insertBefore(newBatchLink, addBatchBtn);
            
            // Add click listener
            newBatchLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.initLeadsPage) {
                    window.initLeadsPage(batchName);
                }
            });
            
            // Reload batches menu and navigate
            setTimeout(async () => {
                await loadBatchesMenu();
                setupNavigation(); // Re-setup navigation with new batch
                location.hash = `leads-${batchName.toLowerCase().replace(/\s+/g, '')}`;
                navigateToPage(`leads-${batchName.toLowerCase().replace(/\s+/g, '')}`);
            }, 500);
        } else {
            throw new Error(data.error || 'Failed to create batch');
        }
    } catch (error) {
        console.error('Error creating batch:', error);
        if (window.showToast) {
            showToast('Failed to create batch: ' + error.message, 'error');
        } else {
            alert('Failed to create batch: ' + error.message);
        }
        throw error;
    }
}

// Make functions global
window.closeAddBatchModal = closeAddBatchModal;
window.handleAddBatch = handleAddBatch;

// Show placeholder message for disabled modules
function showPlaceholderMessage(moduleName) {
    const viewElement = document.getElementById(`${moduleName}View`);
    if (!viewElement) {
        alert(`${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} module is not yet implemented.\n\nThis is a placeholder for future CRM functionality.`);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // New enquiry button
    document.getElementById('newEnquiryBtn').addEventListener('click', () => {
        openModal('newEnquiryModal');
    });
    
    // New enquiry form
    document.getElementById('newEnquiryForm').addEventListener('submit', handleNewEnquiry);
    
    // Filter button
    document.getElementById('filterBtn').addEventListener('click', loadEnquiries);
    
    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', loadEnquiries);
    
    // Search input (real-time search)
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(loadEnquiries, 500);
    });
    
    // Leads refresh button
    const refreshLeadsBtn = document.getElementById('refreshLeadsBtn');
    if (refreshLeadsBtn) {
        refreshLeadsBtn.addEventListener('click', loadLeads);
    }
    
    // Leads search input (real-time search)
    let leadsSearchTimeout;
    document.getElementById('leadsSearchInput').addEventListener('input', () => {
        clearTimeout(leadsSearchTimeout);
        leadsSearchTimeout = setTimeout(loadLeads, 500);
    });
}

// Load dashboard data
async function loadDashboard() {
    try {
        // Load stats
        const statsResponse = await API.dashboard.getStats();
        document.getElementById('statTotal').textContent = statsResponse.stats.total;
        document.getElementById('statNew').textContent = statsResponse.stats.new;
        document.getElementById('statFollowUp').textContent = statsResponse.stats.followUp;
        document.getElementById('statRegistered').textContent = statsResponse.stats.registered;
        
        // Update badge
        document.getElementById('newEnquiriesCount').textContent = statsResponse.stats.new;
        
        // Load recent enquiries
        const recentResponse = await API.dashboard.getRecent(5);
        UI.renderRecentEnquiries(recentResponse.enquiries);
        
        // Load upcoming follow-ups
        const followUpsResponse = await API.dashboard.getFollowUps();
        UI.renderUpcomingFollowUps(followUpsResponse.upcoming.slice(0, 5));
        
        // Load officer performance (admin only)
        if (currentUser.role === 'admin' && statsResponse.officerStats) {
            UI.renderOfficerPerformance(statsResponse.officerStats);
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        UI.showToast('Failed to load dashboard data', 'error');
    }
}

// Update enquiries badge
async function updateEnquiriesBadge() {
    try {
        const statsResponse = await API.dashboard.getStats();
        const badge = document.getElementById('newEnquiriesCount');
        if (badge) {
            badge.textContent = statsResponse.stats.new || 0;
        }
    } catch (error) {
        console.error('Error updating badge:', error);
    }
}

// Load enquiries
async function loadEnquiries() {
    try {
        const search = document.getElementById('searchInput').value;
        const status = document.getElementById('statusFilter').value;
        
        const filters = {};
        if (search) filters.search = search;
        if (status) filters.status = status;
        
        const response = await API.enquiries.getAll(filters);
        currentEnquiries = response.enquiries;
        UI.renderEnquiriesTable(currentEnquiries);
    } catch (error) {
        console.error('Error loading enquiries:', error);
        UI.showToast('Failed to load enquiries', 'error');
    }
}

// Load leads
async function loadLeads() {
    // Use the modular leads page if available
    if (window.leadsPageLoadLeads) {
        await window.leadsPageLoadLeads();
    }
}

// Load calendar
async function loadCalendar() {
    try {
        const response = await API.dashboard.getFollowUps();
        UI.renderCalendarLists(response.overdue, response.upcoming);
    } catch (error) {
        console.error('Error loading calendar:', error);
        UI.showToast('Failed to load calendar', 'error');
    }
}

// Load officers
async function loadOfficers() {
    try {
        const response = await API.officers.getStats();
        UI.renderOfficerStats(response.officerStats);
    } catch (error) {
        console.error('Error loading officers:', error);
        UI.showToast('Failed to load officers', 'error');
    }
}

// Handle new enquiry submission
async function handleNewEnquiry(e) {
    e.preventDefault();
    
    const enquiryData = {
        fullName: document.getElementById('newFullName').value,
        email: document.getElementById('newEmail').value,
        phone: document.getElementById('newPhone').value,
        course: document.getElementById('newCourse').value,
        source: document.getElementById('newSource').value,
        notes: document.getElementById('newNotes').value
    };
    
    try {
        await API.enquiries.create(enquiryData);
        UI.showToast('Enquiry created successfully', 'success');
        closeModal('newEnquiryModal');
        document.getElementById('newEnquiryForm').reset();
        loadEnquiries();
    } catch (error) {
        console.error('Error creating enquiry:', error);
        UI.showToast('Failed to create enquiry', 'error');
    }
}

// View enquiry details
window.viewEnquiryDetails = async function(enquiryId) {
    try {
        const response = await API.enquiries.getById(enquiryId);
        const enquiry = response.enquiry;
        
        const modalBody = document.getElementById('enquiryModalBody');
        modalBody.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                <div>
                    <h3>Contact Information</h3>
                    <p><strong>Name:</strong> ${enquiry.fullName}</p>
                    <p><strong>Email:</strong> ${enquiry.email}</p>
                    <p><strong>Phone:</strong> ${enquiry.phone ? `<a href="tel:${enquiry.phone}">${enquiry.phone}</a>` : 'N/A'}</p>
                </div>
                <div>
                    <h3>Enquiry Details</h3>
                    <p><strong>Course:</strong> ${enquiry.course || 'N/A'}</p>
                    <p><strong>Source:</strong> ${enquiry.source}</p>
                    <p><strong>Status:</strong> ${UI.getStatusBadge(enquiry.status)}</p>
                </div>
            </div>
            <div style="margin-top: 20px;">
                <h3>Assignment & Dates</h3>
                <p><strong>Assigned Officer:</strong> ${enquiry.assignedOfficer || 'Unassigned'}</p>
                <p><strong>Created:</strong> ${UI.formatDateTime(enquiry.createdDate)}</p>
                <p><strong>Follow-up Date:</strong> ${enquiry.followUpDate ? UI.formatDate(enquiry.followUpDate) : 'Not set'}</p>
            </div>
            <div style="margin-top: 20px;">
                <h3>Notes</h3>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; max-height: 200px; overflow-y: auto;">
                    ${enquiry.notes ? enquiry.notes.replace(/\n/g, '<br>') : 'No notes'}
                </div>
            </div>
            <div style="margin-top: 20px;">
                <h3>Actions</h3>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button class="btn btn-primary" onclick="updateEnquiryStatus('${enquiry.enquiryId}')">
                        <i class="fas fa-edit"></i> Update Status
                    </button>
                    <button class="btn btn-success" onclick="addEnquiryNote('${enquiry.enquiryId}')">
                        <i class="fas fa-comment"></i> Add Note
                    </button>
                    <button class="btn btn-warning" onclick="scheduleFollowUp('${enquiry.enquiryId}')">
                        <i class="fas fa-calendar"></i> Schedule Follow-up
                    </button>
                    <button class="btn btn-secondary" onclick="showEmailOptions('${enquiry.enquiryId}')">
                        <i class="fas fa-envelope"></i> Send Email
                    </button>
                </div>
            </div>
        `;
        
        openModal('enquiryModal');
    } catch (error) {
        console.error('Error loading enquiry details:', error);
        UI.showToast('Failed to load enquiry details', 'error');
    }
};

// Update enquiry status
window.updateEnquiryStatus = async function(enquiryId) {
    const newStatus = prompt('Enter new status (New, Contacted, Follow-up, Registered, Closed):');
    if (!newStatus) return;
    
    try {
        await API.enquiries.update(enquiryId, { status: newStatus });
        UI.showToast('Status updated successfully', 'success');
        closeModal('enquiryModal');
        loadEnquiries();
    } catch (error) {
        console.error('Error updating status:', error);
        UI.showToast('Failed to update status', 'error');
    }
};

// Add enquiry note
window.addEnquiryNote = async function(enquiryId) {
    const note = prompt('Enter your note:');
    if (!note) return;
    
    try {
        await API.enquiries.addNote(enquiryId, note);
        UI.showToast('Note added successfully', 'success');
        viewEnquiryDetails(enquiryId);
    } catch (error) {
        console.error('Error adding note:', error);
        UI.showToast('Failed to add note', 'error');
    }
};

// Schedule follow-up
window.scheduleFollowUp = async function(enquiryId) {
    const dateStr = prompt('Enter follow-up date (YYYY-MM-DD):');
    if (!dateStr) return;
    
    try {
        await API.calendar.createFollowUp(enquiryId, dateStr, '');
        UI.showToast('Follow-up scheduled successfully', 'success');
        closeModal('enquiryModal');
    } catch (error) {
        console.error('Error scheduling follow-up:', error);
        UI.showToast('Failed to schedule follow-up', 'error');
    }
};

// Show email options
window.showEmailOptions = async function(enquiryId) {
    const choice = prompt('Select email type:\n1. Acknowledgement\n2. Follow-up\n3. Registration Info\n\nEnter number:');
    
    try {
        switch(choice) {
            case '1':
                await API.email.sendAcknowledgement(enquiryId);
                break;
            case '2':
                await API.email.sendFollowUp(enquiryId);
                break;
            case '3':
                await API.email.sendRegistration(enquiryId);
                break;
            default:
                return;
        }
        UI.showToast('Email sent successfully', 'success');
    } catch (error) {
        console.error('Error sending email:', error);
        UI.showToast('Failed to send email', 'error');
    }
};
