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
        const err = document.getElementById('loginError');
        if (err) err.textContent = '';

        // IMPORTANT: logout can return to login screen while the submit button is still disabled
        // from a previous login attempt. Always reset it here.
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            // Restore default text if it was changed to "Logging in..."
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        }
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
    
    const userRole = currentUser.role === 'admin' ? 'Administrator' : 'Academic Advisor';
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

    // Load officer batch submenus (officer-only) in background
    loadOfficerLeadsBatchesMenu();

    // Initialize counts
    updateEnquiriesBadge();
}

// Load officer leads batches dynamically (officer-only)
// Uses the officer's personal leads sheet (no new sheet; batch comes from the Batch column in that sheet).
async function loadOfficerLeadsBatchesMenu() {
    // Prevent duplicate renders when init/login triggers this multiple times
    const renderVersion = (window.__officerBatchesRenderVersion = (window.__officerBatchesRenderVersion || 0) + 1);
    try {
        if (!currentUser || currentUser.role === 'admin') {
            // Admin uses the admin batch system (separate sheets)
            return;
        }

        // Default filter
        window.officerBatchFilter = window.officerBatchFilter || 'all';

        const leadsMenu = document.getElementById('officerLeadsBatchesMenu');
        const mgmtMenu = document.getElementById('officerLeadManagementBatchesMenu');
        if (!leadsMenu || !mgmtMenu) return;

        // Keep the first item ("All") and clear the rest
        const keepLeadsAll = leadsMenu.querySelector('a[data-page="leads-myLeads"]');
        const keepMgmtAll = mgmtMenu.querySelector('a[data-page="lead-management"]');
        leadsMenu.innerHTML = '';
        mgmtMenu.innerHTML = '';
        if (keepLeadsAll) leadsMenu.appendChild(keepLeadsAll);
        if (keepMgmtAll) mgmtMenu.appendChild(keepMgmtAll);

        // Fetch global batches list (created by admins). Officers should see these tabs even if they have no leads yet.
        let authHeaders = {};
        if (window.supabaseClient) {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (session && session.access_token) {
                authHeaders['Authorization'] = `Bearer ${session.access_token}`;
            }
        }

        const response = await fetch('/api/batch-leads/batches', { headers: authHeaders });
        const data = await response.json();
        const batches = (data && data.batches) ? data.batches : [];

        // Sort batches in a friendly way (Batch 2, Batch 10)
        batches.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        // Helper to create a batch nav link
        const createBatchLink = (page, label) => {
            const a = document.createElement('a');
            a.href = '#';
            a.className = 'nav-subitem';
            a.dataset.page = page;
            a.innerHTML = `
                <i class="fas fa-layer-group"></i>
                <span>${label}</span>
            `;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.hash = page;
                navigateToPage(page);
                closeMobileMenu();
            });
            return a;
        };

        // Build expanded batch -> sheets tree for officers
        const defaultSheets = ['Main Leads', 'Extra Leads'];

        for (const batchName of batches) {
            const batchEnc = encodeURIComponent(batchName);

            // Fetch sheet list
            let sheets = [...defaultSheets];
            try {
                const res = await fetch(`/api/batch-leads/${batchEnc}/sheets`, { headers: authHeaders });
                const json = await res.json();
                if (json.success && Array.isArray(json.sheets) && json.sheets.length) {
                    sheets = Array.from(new Set([...defaultSheets, ...json.sheets]));
                }
            } catch (e) {
                // ignore
            }

            // Parent header (not navigational)
            const parent = document.createElement('a');
            parent.href = '#';
            parent.className = 'nav-subitem';
            parent.innerHTML = `
                <i class="fas fa-folder"></i>
                <span>${batchName}</span>
                <i class="fas fa-chevron-down" style="margin-left:auto; opacity:0.7;"></i>
            `;

            const childWrap1 = document.createElement('div');
            childWrap1.style.marginLeft = '12px';
            childWrap1.style.display = 'block';

            const childWrap2 = document.createElement('div');
            childWrap2.style.marginLeft = '12px';
            childWrap2.style.display = 'block';

            parent.addEventListener('click', (e) => {
                e.preventDefault();
                const next = (childWrap1.style.display === 'none') ? 'block' : 'none';
                childWrap1.style.display = next;
            });

            // Separate parent nodes so both menus toggle correctly
            leadsMenu.appendChild(parent);

            const parent2 = document.createElement('a');
            parent2.href = '#';
            parent2.className = 'nav-subitem';
            parent2.innerHTML = parent.innerHTML;
            parent2.addEventListener('click', (e) => {
                e.preventDefault();
                const next = (childWrap2.style.display === 'none') ? 'block' : 'none';
                childWrap2.style.display = next;
            });
            mgmtMenu.appendChild(parent2);

            sheets.forEach(sheetName => {
                const sheetEnc = encodeURIComponent(sheetName);
                const page1 = `leads-myLeads-batch-${batchEnc}__sheet__${sheetEnc}`;
                const page2 = `lead-management-batch-${batchEnc}__sheet__${sheetEnc}`;

                childWrap1.appendChild(createBatchLink(page1, sheetName));
                childWrap2.appendChild(createBatchLink(page2, sheetName));
            });

            leadsMenu.appendChild(childWrap1);
            mgmtMenu.appendChild(childWrap2);
        }

        // If another render started while we were awaiting network calls, don't overwrite/duplicate
        if (renderVersion !== window.__officerBatchesRenderVersion) return;
        console.log(`✓ Loaded ${batches.length} officer batch groups`);
    } catch (error) {
        console.error('Error loading officer batch menus:', error);
    }
}

// Load batches dynamically from spreadsheet
async function loadBatchesMenu() {
    // Prevent duplicate renders when init/login triggers this multiple times
    const renderVersion = (window.__adminBatchesRenderVersion = (window.__adminBatchesRenderVersion || 0) + 1);

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

        // Helper to create a clickable link
        const createLink = (page, label, iconClass = 'fas fa-layer-group') => {
            const a = document.createElement('a');
            a.href = '#';
            a.className = 'nav-subitem';
            a.dataset.page = page;
            a.innerHTML = `
                <i class="${iconClass}"></i>
                <span>${label}</span>
            `;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.hash = page;
                navigateToPage(page);
                closeMobileMenu();
            });
            return a;
        };

        // Helper to create a batch group (expand/collapse)
        const createBatchGroup = async (batchName) => {
            const batchEnc = encodeURIComponent(batchName);

            const wrapper = document.createElement('div');
            wrapper.className = 'nav-batch-group';

            const header = document.createElement('a');
            header.href = '#';
            header.className = 'nav-subitem';
            header.innerHTML = `
                <i class="fas fa-folder"></i>
                <span>${batchName}</span>
                <i class="fas fa-chevron-down" style="margin-left:auto; opacity:0.7;"></i>
            `;

            const children = document.createElement('div');
            children.className = 'nav-batch-children';
            children.style.marginLeft = '12px';
            children.style.display = 'block'; // expanded by default

            header.addEventListener('click', async (e) => {
                e.preventDefault();
                children.style.display = (children.style.display === 'none') ? 'block' : 'none';
            });

            // Fetch sheets for this batch
            let sheets = ['Main Leads', 'Extra Leads'];
            try {
                const res = await fetch(`/api/batch-leads/${batchEnc}/sheets`);
                const data = await res.json();
                if (data.success && Array.isArray(data.sheets) && data.sheets.length) {
                    sheets = data.sheets;
                }
            } catch (e) {
                console.warn('Failed to load sheets for batch', batchName, e);
            }

            // Ensure default sheets appear first
            const defaultOrder = ['Main Leads', 'Extra Leads'];
            sheets = Array.from(new Set([...defaultOrder, ...sheets]));

            sheets.forEach(sheetName => {
                const sheetEnc = encodeURIComponent(sheetName);
                const page = `leads-batch-${batchEnc}__sheet__${sheetEnc}`;
                children.appendChild(createLink(page, sheetName, 'fas fa-table'));
            });

            // + Add sheet (admin only)
            const add = document.createElement('a');
            add.href = '#';
            add.className = 'nav-subitem';
            add.style.color = '#1976d2';
            add.innerHTML = `
                <i class="fas fa-plus"></i>
                <span>Add sheet</span>
            `;
            add.addEventListener('click', async (e) => {
                e.preventDefault();
                const sheetName = prompt('New sheet name (e.g., Extra Leads 2):');
                if (!sheetName) return;

                try {
                    let authHeaders = { 'Content-Type': 'application/json' };
                    if (window.supabaseClient) {
                        const { data: { session } } = await window.supabaseClient.auth.getSession();
                        if (session && session.access_token) {
                            authHeaders['Authorization'] = `Bearer ${session.access_token}`;
                        }
                    }

                    const res = await fetch(`/api/batch-leads/${batchEnc}/sheets`, {
                        method: 'POST',
                        headers: authHeaders,
                        body: JSON.stringify({ sheetName })
                    });
                    const data = await res.json();
                    if (!data.success) throw new Error(data.error || 'Failed to create sheet');

                    if (window.showToast) showToast('Sheet created successfully', 'success');
                    await loadBatchesMenu();
                } catch (err) {
                    console.error(err);
                    if (window.showToast) showToast(err.message, 'error');
                    else alert(err.message);
                }
            });
            children.appendChild(add);

            wrapper.appendChild(header);
            wrapper.appendChild(children);
            return wrapper;
        };

        // Add batch groups
        for (const batchName of batches) {
            if (renderVersion !== window.__adminBatchesRenderVersion) return;
            menu.appendChild(await createBatchGroup(batchName));
        }

        // Add back the "Add New Batch" button
        if (renderVersion !== window.__adminBatchesRenderVersion) return;
        if (addBatchBtn) {
            menu.appendChild(addBatchBtn);
        }

        console.log(`✓ Loaded ${batches.length} batches (expanded with sheets)`);
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

        // Ensure submit button state is reset after cloning
        const submitBtn = newLoginForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        }

        const err = document.getElementById('loginError');
        if (err) err.textContent = '';

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

// Parse leads route into filters so titles work even after refresh
function parseLeadsRouteIntoFilters(page) {
    try {
        if (!page || typeof page !== 'string') return;

        // Officer personal leads
        if (page === 'leads-myLeads') {
            window.officerBatchFilter = 'all';
            window.officerSheetFilter = '';
            return;
        }
        if (page.startsWith('leads-myLeads-batch-')) {
            const slug = page.replace('leads-myLeads-batch-', '');
            const parts = slug.split('__sheet__');
            window.officerBatchFilter = decodeURIComponent(parts[0] || 'all');
            window.officerSheetFilter = decodeURIComponent(parts[1] || 'Main Leads');
            return;
        }

        // Officer lead management
        if (page === 'lead-management') {
            window.officerBatchFilter = 'all';
            window.officerSheetFilter = '';
            return;
        }
        if (page.startsWith('lead-management-batch-')) {
            const slug = page.replace('lead-management-batch-', '');
            const parts = slug.split('__sheet__');
            window.officerBatchFilter = decodeURIComponent(parts[0] || 'all');
            window.officerSheetFilter = decodeURIComponent(parts[1] || 'Main Leads');
            return;
        }

        // Admin batch pages
        if (page.startsWith('leads-batch-')) {
            const slug = page.replace('leads-batch-', '');
            const parts = slug.split('__sheet__');
            window.adminBatchFilter = decodeURIComponent(parts[0] || '');
            window.adminSheetFilter = decodeURIComponent(parts[1] || 'Main Leads');
        }
    } catch (e) {
        // ignore
    }
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
    if (window.resetLeadManagementInit && !(page === 'lead-management' || page.startsWith('lead-management-batch-'))) {
        window.resetLeadManagementInit();
    }
    
    // Show corresponding view
    document.querySelectorAll('.content-view').forEach(view => {
        view.classList.remove('active');
    });
    
    // For leads pages, use the shared leadsView
    // (parse the route first so the title is correct on refresh)
    parseLeadsRouteIntoFilters(page);

    if (page.startsWith('leads-')) {
        const viewElement = document.getElementById('leadsView');
        if (viewElement) {
            viewElement.classList.add('active');
            // Update title based on page
            const titleElement = document.getElementById('leadsViewTitle');
            if (titleElement) {
                if (page === 'leads-myLeads' || page.startsWith('leads-myLeads-batch-')) {
                    const batchLabel = (window.officerBatchFilter && window.officerBatchFilter !== 'all')
                        ? ` (${window.officerBatchFilter})`
                        : '';
                    const sheetLabel = window.officerSheetFilter ? ` - ${window.officerSheetFilter}` : '';
                    titleElement.textContent = `My Leads${batchLabel}${sheetLabel}`;
                } else {
                    // Admin batch pages
                    const b = window.adminBatchFilter || page.replace('leads-', '');
                    const s = window.adminSheetFilter || '';
                    const formattedName = b;
                    titleElement.textContent = `${formattedName} - ${s || 'Main Leads'}`;
                }
            }
        }
    } else if (page === 'lead-management' || page.startsWith('lead-management-batch-')) {
        // Officer Lead Management uses a shared view container
        const viewElement = document.getElementById('lead-managementView');
        if (viewElement) {
            viewElement.classList.add('active');
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
            // Officer's personal leads page (all batches)
            window.officerBatchFilter = 'all';
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
            window.officerBatchFilter = 'all';
            if (window.initLeadManagementPage) {
                await window.initLeadManagementPage();
            }
            break;
        default:
            // Officer: handle per-batch pages (filtering personal leads)
            if (page.startsWith('leads-myLeads-batch-')) {
                const slug = page.replace('leads-myLeads-batch-', '');
                const parts = slug.split('__sheet__');
                window.officerBatchFilter = decodeURIComponent(parts[0] || 'all');
                window.officerSheetFilter = decodeURIComponent(parts[1] || 'Main Leads');
                if (window.initLeadsPage) {
                    window.initLeadsPage('myLeads');
                }
                break;
            }

            if (page.startsWith('lead-management-batch-')) {
                const slug = page.replace('lead-management-batch-', '');
                const parts = slug.split('__sheet__');
                window.officerBatchFilter = decodeURIComponent(parts[0] || 'all');
                window.officerSheetFilter = decodeURIComponent(parts[1] || 'Main Leads');
                if (window.initLeadManagementPage) {
                    await window.initLeadManagementPage();
                }
                break;
            }

            // Admin: handle dynamic batch+sheet pages
            if (page.startsWith('leads-batch-')) {
                const slug = page.replace('leads-batch-', '');
                const parts = slug.split('__sheet__');
                window.adminBatchFilter = decodeURIComponent(parts[0] || 'all');
                window.adminSheetFilter = decodeURIComponent(parts[1] || 'Main Leads');

                if (window.initLeadsPage) {
                    window.initLeadsPage(window.adminBatchFilter);
                }
                break;
            }

            // Backward compatibility: other leads-* pages
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
        case 'attendance':
            // Show admin-only section if admin
            {
                const adminSection = document.getElementById('attendanceAdminSection');
                if (adminSection) {
                    adminSection.style.display = (currentUser.role === 'admin') ? 'block' : 'none';
                }
                if (window.initAttendancePage) {
                    window.initAttendancePage();
                }
            }
            break;
        case 'receipts':
            loadReceipts();
            break;
        case 'whatsapp':
            if (window.initWhatsAppPanelPage) {
                window.initWhatsAppPanelPage();
            }
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
                        ${user.role === 'admin' ? 'Admin' : 'Staff'}
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
    // Ensure we don't accidentally render the modal twice
    const existing = document.getElementById('addBatchModal');
    if (existing) existing.remove();

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
                        
                        <div class="form-group" style="margin-top: 16px;">
                            <label for="adminSheetUrl"><i class=\"fas fa-link\"></i> Admin Sheet URL *</label>
                            <input type="url" id="adminSheetUrl" class="form-control" required
                                   placeholder="Paste admin Google Sheet URL for this batch" />
                            <small style="color:#666; display:block; margin-top:6px;">This is where all leads for this batch are stored & assigned from.</small>
                        </div>

                        <div id="officerSheetsContainer" style="margin-top: 16px;">
                            <div class="loading" style="padding:10px; color:#666;">Loading officers...</div>
                        </div>

                        <div style="background: #f0f7ff; padding: 15px; border-radius: 6px; border-left: 4px solid #2196f3; margin-top: 20px;">
                            <p style="margin: 0; color: #333; font-size: 14px;">
                                <i class="fas fa-info-circle" style="color: #2196f3;"></i>
                                <strong>What will be created:</strong>
                            </p>
                            <ul style="margin: 10px 0 0 20px; color: #666; font-size: 13px;">
                                <li>Links this batch to the Admin spreadsheet URL you provide</li>
                                <li>Links this batch to each Officer spreadsheet URL you provide</li>
                                <li>Creates default tabs (Main Leads, Extra Leads) + headers in all sheets</li>
                                <li>Links everything automatically inside the CRM</li>
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

    // Load officers and build sheet URL inputs
    (async () => {
        try {
            let authHeaders = {};
            if (window.supabaseClient) {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session && session.access_token) {
                    authHeaders['Authorization'] = `Bearer ${session.access_token}`;
                }
            }

            const res = await fetch('/api/batches/officers', { headers: authHeaders });
            const data = await res.json();
            const container = document.getElementById('officerSheetsContainer');
            if (!container) return;

            if (!data.success) {
                container.innerHTML = `<div style="color:#b00;">Failed to load officers: ${escapeHtml(data.error || '')}</div>`;
                return;
            }

            const officers = data.officers || [];
            if (officers.length === 0) {
                container.innerHTML = `<div style="color:#b00;">No officers found. Please create staff first.</div>`;
                return;
            }

            container.innerHTML = `
                <div style="margin-bottom: 8px;"><strong>Officer Sheet URLs (required)</strong></div>
                <div style="display:flex; flex-direction:column; gap: 10px;">
                    ${officers.map(o => `
                        <div class="form-group" style="margin:0;">
                            <label style="font-size: 13px; margin-bottom: 4px;">${escapeHtml(o)}</label>
                            <input type="url" class="form-control officerSheetUrl" data-officer="${escapeHtml(o)}" required
                                   placeholder="Paste Google Sheet URL for ${escapeHtml(o)}" />
                        </div>
                    `).join('')}
                </div>
                <small style="color:#666; display:block; margin-top:8px;">You must provide a sheet URL for every officer. Batch creation will fail otherwise.</small>
            `;
        } catch (e) {
            const container = document.getElementById('officerSheetsContainer');
            if (container) container.innerHTML = `<div style="color:#b00;">Failed to load officers</div>`;
        }
    })();
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
        const adminSheetUrl = document.getElementById('adminSheetUrl')?.value?.trim();
        const officerInputs = Array.from(document.querySelectorAll('.officerSheetUrl'));
        const officerSheets = {};
        officerInputs.forEach(inp => {
            const officer = inp.getAttribute('data-officer');
            officerSheets[officer] = inp.value.trim();
        });

        await createNewBatch(batchName, adminSheetUrl, officerSheets);
    } catch (error) {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Create new batch
async function createNewBatch(batchName, adminSpreadsheetUrl, officerSheets) {
    try {
        // Call API to create new batch sheet
        // New system: provision Drive folder + spreadsheets
        let authHeaders = { 'Content-Type': 'application/json' };
        if (window.supabaseClient) {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (session && session.access_token) {
                authHeaders['Authorization'] = `Bearer ${session.access_token}`;
            }
        }

        const response = await fetch('/api/batches/create', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ batchName, adminSpreadsheetUrl, officerSheets })
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
        const elTotal = document.getElementById('statTotal');
        const elNew = document.getElementById('statNew');
        const elFU = document.getElementById('statFollowUp');
        const elReg = document.getElementById('statRegistered');
        if (elTotal) elTotal.textContent = statsResponse.stats.total;
        if (elNew) elNew.textContent = statsResponse.stats.new;
        if (elFU) elFU.textContent = statsResponse.stats.followUp;
        if (elReg) elReg.textContent = statsResponse.stats.registered;
        
        // Update badge
        const badgeEl = document.getElementById('newEnquiriesCount');
        if (badgeEl) badgeEl.textContent = statsResponse.stats.new;
        
        // Load recent enquiries
        const recentResponse = await API.dashboard.getRecent(5);
        if (typeof UI?.renderRecentEnquiries === 'function') {
            UI.renderRecentEnquiries(recentResponse.enquiries);
        }
        
        // Load upcoming follow-ups
        const followUpsResponse = await API.dashboard.getFollowUps();
        if (typeof UI?.renderUpcomingFollowUps === 'function') {
            UI.renderUpcomingFollowUps(followUpsResponse.upcoming.slice(0, 5));
        }
        
        // Load officer performance (admin only)
        if (currentUser.role === 'admin' && statsResponse.officerStats && typeof UI?.renderOfficerPerformance === 'function') {
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
        // Admin can filter by officer
        const controls = document.getElementById('calendarAdminControls');
        const select = document.getElementById('calendarOfficerSelect');

        if (controls) {
            controls.style.display = (currentUser && currentUser.role === 'admin') ? 'flex' : 'none';
        }

        // Populate dropdown once
        if (currentUser && currentUser.role === 'admin' && select && select.options.length === 0) { 
            let authHeaders = {};
            if (window.supabaseClient) {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session && session.access_token) {
                    authHeaders['Authorization'] = `Bearer ${session.access_token}`;
                }
            }

            // Reuse batches/officers list endpoint
            const res = await fetch('/api/batches/officers', { headers: authHeaders });
            const data = await res.json();
            const officers = (data && data.officers) ? data.officers : [];

            // Default: current admin user first
            const opts = [currentUser.name, ...officers.filter(o => o !== currentUser.name)];
            select.innerHTML = opts.map(o => `<option value="${o}">${o}</option>`).join('');

            select.addEventListener('change', () => loadCalendar());

        }

        let url = '/api/calendar/followups';
        let tasksParams = {};

        if (currentUser && currentUser.role === 'admin' && select && select.value) {
            url += `?officer=${encodeURIComponent(select.value)}`;
            tasksParams = { mode: 'officer', officer: select.value };
        }

        const response = await fetchAPI(url.replace('/api', ''));

        // Load custom tasks (personal for selected officer + global)
        const tasksRes = await API.calendar.getTasks(tasksParams);
        UI.renderFollowUpCalendar(response.overdue || [], response.upcoming || [], tasksRes.tasks || []);

        // Bind Add Task
        const addBtn = document.getElementById('calendarAddTaskBtn');
        if (addBtn && !addBtn.__bound) {
            addBtn.addEventListener('click', () => {
                if (window.openCalendarTaskModal) window.openCalendarTaskModal();
            });
            addBtn.__bound = true;
        }
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
