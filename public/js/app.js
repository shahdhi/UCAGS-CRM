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
            // Avoid double-initializing the dashboard on first load (INITIAL_SESSION -> SIGNED_IN)
            if (currentUser && currentUser.id === session.user.id) {
                return;
            }
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
    const userDisplayEl = document.getElementById('userDisplay');
    if (userDisplayEl) userDisplayEl.textContent = '';
    const sidebarUserNameEl = document.getElementById('sidebarUserName');
    if (sidebarUserNameEl) sidebarUserNameEl.textContent = '';
    const welcomeUserNameEl = document.getElementById('welcomeUserName');
    if (welcomeUserNameEl) welcomeUserNameEl.textContent = '';
    const sidebarUserRoleEl = document.getElementById('sidebarUserRole');
    if (sidebarUserRoleEl) sidebarUserRoleEl.textContent = '';
    
    // Reset forms
    const loginForm = document.getElementById('loginForm');

    if (loginForm) {
        loginForm.reset();
        const err = document.getElementById('loginError');
        if (err) {
            err.textContent = '';
            err.style.display = 'none';
        }

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

// Helper: wait for Supabase session token (fixes sidebar/batches sometimes loading only after refresh)
async function getAuthHeadersWithRetry(maxWaitMs = 1500) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        try {
            if (window.supabaseClient) {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session && session.access_token) {
                    return { 'Authorization': `Bearer ${session.access_token}` };
                }
            }
        } catch (e) {
            // ignore and retry
        }
        // small backoff
        await new Promise(r => setTimeout(r, 100));
    }
    return {};
}

// Show dashboard
async function showDashboard() {
    UI.hide('loginPage');
    UI.show('dashboardPage');
    
    // Update user displays
    const userDisplayEl = document.getElementById('userDisplay');
    if (userDisplayEl) userDisplayEl.textContent = currentUser.name;

    const sidebarUserNameEl = document.getElementById('sidebarUserName');
    if (sidebarUserNameEl) sidebarUserNameEl.textContent = currentUser.name;

    const welcomeUserNameEl = document.getElementById('welcomeUserName');
    if (welcomeUserNameEl) welcomeUserNameEl.textContent = currentUser.name;
    
    const userRole = currentUser.role === 'admin' ? 'Administrator' : 'Academic Advisor';
    const sidebarUserRoleEl = document.getElementById('sidebarUserRole');
    if (sidebarUserRoleEl) sidebarUserRoleEl.textContent = userRole;
    
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

    // Initialize notification center dropdown
    try {
        if (window.NotificationCenter && typeof window.NotificationCenter.init === 'function') {
            window.NotificationCenter.init();
        }
    } catch (e) {
        console.warn('NotificationCenter init error:', e);
    }

    // Initialize client-side notifications (officer reminders)
    try {
        if (window.Notifications && typeof window.Notifications.init === 'function') {
            window.Notifications.init(currentUser);
        }
    } catch (e) {
        console.warn('Notifications init error:', e);
    }

    // Preload Lead Management once after login so calendar deep-links work immediately
    if (!window.__leadManagementPreloaded && typeof window.initLeadManagementPage === 'function') {
        window.__leadManagementPreloaded = true;
        const preload = async () => {
            try {
                // Do not switch view; just warm caches/data
                await window.initLeadManagementPage();
            } catch (e) {
                console.warn('Lead management preload failed:', e);
            }
        };
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => preload(), { timeout: 1500 });
        } else {
            setTimeout(preload, 600);
        }
    }
}

// Load officer leads batches dynamically (officer-only)
// Uses the officer's personal leads sheet (no new sheet; batch comes from the Batch column in that sheet).
async function loadOfficerLeadsBatchesMenu() {
    if (window.__officerBatchesMenuLoadInFlight) return;
    window.__officerBatchesMenuLoadInFlight = true;
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

        // Clear existing items (sidebar will show only programs)
        leadsMenu.innerHTML = '';
        mgmtMenu.innerHTML = '';

        // Load programs + batches (same view as admin)
        const authHeaders = await getAuthHeadersWithRetry();
        const res = await fetch('/api/programs/sidebar', { headers: authHeaders });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to load programs');

        const programs = json.programs || [];
        const batches = json.batches || [];

        const byProgram = new Map();
        batches.forEach(b => {
            const arr = byProgram.get(b.program_id) || [];
            arr.push(b);
            byProgram.set(b.program_id, arr);
        });

        const defaultSheet = 'Main Leads';

        const createLink = (page, label, onClick) => {
            const a = document.createElement('a');
            a.href = '#';
            a.className = 'nav-subitem';
            a.dataset.page = page;
            a.innerHTML = `<i class=\"fas fa-folder\"></i><span>${label}</span>`;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                if (onClick) onClick();
                window.location.hash = page;
                navigateToPage(page);
                closeMobileMenu();
            });
            return a;
        };

        for (const p of programs) {
            const bs = byProgram.get(p.id) || [];
            const current = bs.find(x => x.is_current);
            if (!current?.batch_name) continue;

            const leadsPage = `leads-myLeads-batch-${encodeURIComponent(current.batch_name)}__sheet__${encodeURIComponent(defaultSheet)}`;
            const mgmtPage = `lead-management-batch-${encodeURIComponent(current.batch_name)}__sheet__${encodeURIComponent(defaultSheet)}`;

            leadsMenu.appendChild(createLink(leadsPage, p.name, () => {
                window.officerProgramId = p.id;
            }));
            mgmtMenu.appendChild(createLink(mgmtPage, p.name, () => {
                window.officerProgramId = p.id;
            }));
        }

        // If another render started while we were awaiting network calls, don't overwrite/duplicate
        if (renderVersion !== window.__officerBatchesRenderVersion) return;
        console.log(`✓ Loaded ${batches.length} officer batch groups`);
    } catch (error) {
        console.error('Error loading officer batch menus:', error);
    } finally {
        window.__officerBatchesMenuLoadInFlight = false;
    }
}

// Load batches dynamically from spreadsheet
async function loadBatchesMenu() {
    if (window.__adminBatchesMenuLoadInFlight) return;
    window.__adminBatchesMenuLoadInFlight = true;
    // Prevent duplicate renders when init/login triggers this multiple times
    const renderVersion = (window.__adminBatchesRenderVersion = (window.__adminBatchesRenderVersion || 0) + 1);

    // Only load batches for admins
    if (!currentUser || currentUser.role !== 'admin') {
        console.log('Skipping batch loading for non-admin user');
        window.__adminBatchesMenuLoadInFlight = false;
        return;
    }

    try {
        // Ensure we have a session token before hitting protected endpoints
        await getAuthHeadersWithRetry();
        // Load programs + current batches
        const authHeaders = await getAuthHeadersWithRetry();
        const res = await fetch('/api/programs/sidebar', { headers: authHeaders });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to load programs');

        const programs = json.programs || [];
        const batches = json.batches || [];

        const byProgram = new Map();
        batches.forEach(b => {
            const arr = byProgram.get(b.program_id) || [];
            arr.push(b);
            byProgram.set(b.program_id, arr);
        });

        const menu = document.getElementById('leadsBatchesMenu');
        if (!menu) return;
        menu.innerHTML = '';

        const createLink = (page, label) => {
            const a = document.createElement('a');
            a.href = '#';
            a.className = 'nav-subitem';
            a.dataset.page = page;
            a.innerHTML = `<i class="fas fa-folder"></i><span>${label}</span>`;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.hash = page;
                navigateToPage(page);
                closeMobileMenu();
            });
            return a;
        };

        // Show only program names; clicking opens Leads for current batch (Main Leads)
        for (const p of programs) {
            const bs = byProgram.get(p.id) || [];
            const current = bs.find(x => x.is_current);
            if (!current || !current.batch_name) continue;

            const leadsPage = `leads-batch-${encodeURIComponent(current.batch_name)}__sheet__${encodeURIComponent('Main Leads')}`;
            const link = createLink(leadsPage, p.name);
            link.dataset.programId = p.id;
            link.addEventListener('click', () => {
                // set context for in-page batch dropdown
                window.adminProgramId = p.id;
            });
            menu.appendChild(link);
        }

        console.log(`✓ Loaded ${programs.length} programs (current batch only)`);
    } catch (error) {
        console.error('Error loading batches:', error);
    } finally {
        window.__adminBatchesMenuLoadInFlight = false;
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
        if (err) {
            err.textContent = '';
            err.style.display = 'none';
        }

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
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        }
        
        console.log('Attempting login for:', email);
        const result = await SupabaseAuth.signIn(email, password);
        
        console.log('Login result:', result);

        // SupabaseAuth.signIn may return { error } without throwing
        if (result && result.error) {
            const msg = result.error.message || 'Login failed. Please check your credentials.';
            if (errorDiv) {
                errorDiv.textContent = msg;
                errorDiv.style.display = '';
            }
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
            return;
        }
        
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
        if (errorDiv) {
            errorDiv.textContent = error.message || 'Login failed. Please check your credentials.';
            errorDiv.style.display = '';
        }
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
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
    const navItems = document.querySelectorAll('.nav-item, .nav-subitem');
    const navSections = document.querySelectorAll('.nav-section');
    
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
function updateDeleteSheetButtons(page) {
    const isDefault = (s) => ['Main Leads', 'Extra Leads'].map(x => x.toLowerCase()).includes(String(s || '').toLowerCase());

    const btnLeads = document.getElementById('deleteSheetBtn');
    const btnMgmt = document.getElementById('deleteManagementSheetBtn');

    const hideAll = () => {
        if (btnLeads) btnLeads.style.display = 'none';
        if (btnMgmt) btnMgmt.style.display = 'none';
    };

    hideAll();

    // Officer leads pages
    if (page && page.startsWith('leads-myLeads-batch-')) {
        const batch = window.officerBatchFilter;
        const sheet = window.officerSheetFilter;
        if (!batch || batch === 'all' || !sheet || isDefault(sheet)) return;
        if (!btnLeads) return;

        // Supabase-only sheets: allow officer to attempt deleting any non-default sheet.
        // Backend restricts deletion to officer-owned sheets.
        btnLeads.style.display = '';

        btnLeads.onclick = async () => {
            if (!confirm(`Delete sheet "${sheet}" (only for you)? This cannot be undone.`)) return;
            let authHeaders = {};
            if (window.supabaseClient) {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session && session.access_token) authHeaders['Authorization'] = `Bearer ${session.access_token}`;
            }
            const res = await fetch(`/api/crm-leads/meta/sheets?batch=${encodeURIComponent(batch)}&sheet=${encodeURIComponent(sheet)}&scope=officer`, { method: 'DELETE', headers: authHeaders });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Failed to delete sheet');
            if (window.showToast) showToast('Sheet deleted', 'success');
            await loadOfficerLeadsBatchesMenu();
            // Go back to main leads
            window.location.hash = 'leads-myLeads';
            navigateToPage('leads-myLeads');
        };
        return;
    }

    // Officer lead management pages
    if (page && page.startsWith('lead-management-batch-')) {
        const batch = window.officerBatchFilter;
        const sheet = window.officerSheetFilter;
        if (!batch || batch === 'all' || !sheet || isDefault(sheet)) return;
        if (!btnMgmt) return;

        // Supabase-only sheets: allow officer to attempt deleting any non-default sheet.
        // Backend restricts deletion to officer-owned sheets.
        btnMgmt.style.display = '';

        btnMgmt.onclick = async () => {
            if (!confirm(`Delete sheet "${sheet}" (only for you)? This cannot be undone.`)) return;
            let authHeaders = {};
            if (window.supabaseClient) {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session && session.access_token) authHeaders['Authorization'] = `Bearer ${session.access_token}`;
            }
            const res = await fetch(`/api/crm-leads/meta/sheets?batch=${encodeURIComponent(batch)}&sheet=${encodeURIComponent(sheet)}&scope=officer`, { method: 'DELETE', headers: authHeaders });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Failed to delete sheet');
            if (window.showToast) showToast('Sheet deleted', 'success');
            await loadOfficerLeadsBatchesMenu();
            window.location.hash = 'lead-management';
            navigateToPage('lead-management');
        };
        return;
    }

    // Admin leads pages
    if (page && page.startsWith('leads-batch-')) {
        const batch = window.adminBatchFilter;
        const sheet = window.adminSheetFilter;
        if (!batch || !sheet || isDefault(sheet)) return;
        if (!btnLeads) return;

        btnLeads.style.display = '';
        btnLeads.onclick = async () => {
            if (!confirm(`Delete sheet "${sheet}" for batch ${batch} (admin + all officers)? This cannot be undone.`)) return;
            let authHeaders = {};
            if (window.supabaseClient) {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session && session.access_token) authHeaders['Authorization'] = `Bearer ${session.access_token}`;
            }
            const res = await fetch(`/api/crm-leads/meta/sheets?batch=${encodeURIComponent(batch)}&sheet=${encodeURIComponent(sheet)}&scope=admin`, { method: 'DELETE', headers: authHeaders });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Failed to delete sheet');
            if (window.showToast) showToast('Sheet deleted', 'success');
            await loadBatchesMenu();
            window.location.hash = 'home';
            navigateToPage('home');
        };
    }
}

// Navigate to a specific page
async function navigateToPage(page) {
    // WhatsApp: do not navigate to an internal page; just open WhatsApp Web
    if (page === 'whatsapp') {
        if (window.openWhatsAppSidePanel) {
            window.openWhatsAppSidePanel();
        } else if (window.WhatsAppPanel?.open) {
            window.WhatsAppPanel.open();
        } else {
            window.open('https://web.whatsapp.com/', '_blank', 'noopener,noreferrer');
        }
        // Keep the current view unchanged
        return;
    }

    const navItems = document.querySelectorAll('.nav-item, .nav-subitem');
    
    // Update active link
    navItems.forEach(link => {
        if (link.dataset.page === page) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    
    // Do not reset lead-management init on navigation; it breaks calendar deep-link UX.
    // (If you need a manual refresh, we can add a Refresh button inside the Lead Management page.)
    
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

            const titleEl = document.getElementById('leadManagementViewTitle');
            const subEl = document.getElementById('leadManagementViewSubtitle');
            if (titleEl) {
                titleEl.innerHTML = `<i class="fas fa-tasks"></i> Lead Management`;
            }
            if (subEl) {
                const batchLabel = (window.officerBatchFilter && window.officerBatchFilter !== 'all')
                    ? `(${window.officerBatchFilter})`
                    : '';
                const sheetLabel = window.officerSheetFilter ? `${window.officerSheetFilter}` : '';
                const text = [batchLabel, sheetLabel].filter(Boolean).join(' - ');
                subEl.textContent = text;
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
    
    // Update delete-sheet buttons based on route
    updateDeleteSheetButtons(page);

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
        case 'staff-lead-management':
            if (window.initStaffLeadManagementPage) {
                await window.initStaffLeadManagementPage();
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
            showPlaceholderMessage(page);
            break;
        case 'students':
            if (window.initStudentsPage) {
                window.initStudentsPage();
            } else {
                showPlaceholderMessage(page);
            }
            break;
        case 'calendar':
            loadCalendar();
            break;
        case 'users': {
            const tbody = document.getElementById('usersTableBody');
            const hasRows = !!tbody?.querySelector('tr[data-row-key]');
            loadUsers({ showSkeleton: !hasRows }).catch(console.error);
            break;
        }
        case 'officers':
            loadOfficers();
            break;
        case 'contacts':
            loadContacts(page);
            initGoogleContactsUI().catch(console.error);
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
        case 'registrations':
            if (window.initRegistrationsPage) {
                await window.initRegistrationsPage();
            }
            break;
        case 'registrations-my':
            if (window.initMyRegistrationsPage) {
                await window.initMyRegistrationsPage();
            }
            break;
        case 'programs':
            if (window.initProgramsPage) {
                await window.initProgramsPage();
            }
            break;
        case 'payments':
            if (window.initPaymentsPage) {
                await window.initPaymentsPage();
            }
            break;
        case 'receipts':
            loadReceipts();
            break;
        case 'whatsapp':
            // handled above (open WhatsApp Web)
            break;
    }
}

async function initGoogleContactsUI() {
    try {
        if (!window.API || !API.google) return;
        const statusEl = document.getElementById('googleContactsStatus');
        const connectBtn = document.getElementById('googleContactsConnectBtn');
        const disconnectBtn = document.getElementById('googleContactsDisconnectBtn');
        const syncAllBtn = document.getElementById('googleContactsSyncAllBtn');

        if (connectBtn && !connectBtn.__bound) {
            connectBtn.__bound = true;
            connectBtn.addEventListener('click', async () => {
                // Must fetch connect URL with auth headers, then redirect to Google.
                try {
                    const url = await API.google.getConnectUrl('/#contacts');
                    window.location.href = url;
                } catch (e) {
                    console.error(e);
                    UI.showToast(e.message || 'Failed to start Google connect', 'error');
                }
            });
        }

        if (syncAllBtn && !syncAllBtn.__bound) {
            syncAllBtn.__bound = true;
            syncAllBtn.addEventListener('click', async () => {
                const ok = confirm('Sync your contacts to Google Contacts now?');
                if (!ok) return;
                syncAllBtn.disabled = true;
                const old = syncAllBtn.innerHTML;
                syncAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
                try {
                    // Sync currently loaded list if available (faster + matches UI filter)
                    const rows = Array.isArray(window.__contactsLastRows) ? window.__contactsLastRows : null;
                    const ids = rows ? rows.map(r => r.id).filter(Boolean) : null;
                    const r = await API.google.syncContacts(ids && ids.length ? ids : null);
                    UI.showToast(`Google sync done: ${r.ok}/${r.total} ok`, 'success');
                    await loadContacts();
                } catch (e) {
                    console.error(e);
                    UI.showToast(e.message || 'Failed to sync contacts', 'error');
                } finally {
                    syncAllBtn.disabled = false;
                    syncAllBtn.innerHTML = old;
                }
            });
        }

        if (disconnectBtn && !disconnectBtn.__bound) {
            disconnectBtn.__bound = true;
            disconnectBtn.addEventListener('click', async () => {
                const ok = confirm('Disconnect Google Contacts?');
                if (!ok) return;
                disconnectBtn.disabled = true;
                try {
                    await API.google.disconnect();
                    UI.showToast('Disconnected Google', 'success');
                    await initGoogleContactsUI();
                } catch (e) {
                    UI.showToast(e.message || 'Failed to disconnect', 'error');
                } finally {
                    disconnectBtn.disabled = false;
                }
            });
        }

        if (statusEl) statusEl.textContent = 'Checking Google connection...';
        const st = await API.google.status();
        const connected = !!st?.connected;

        if (statusEl) {
            statusEl.textContent = connected
                ? `Google: Connected${st.googleEmail ? ` (${st.googleEmail})` : ''}`
                : 'Google: Not connected';
        }

        if (connectBtn) connectBtn.style.display = connected ? 'none' : '';
        if (disconnectBtn) disconnectBtn.style.display = connected ? '' : 'none';
        if (syncAllBtn) syncAllBtn.style.display = connected ? '' : 'none';
    } catch (e) {
        console.error('Failed to init Google UI:', e);
        const statusEl = document.getElementById('googleContactsStatus');
        if (statusEl) statusEl.textContent = 'Google: Error';
    }
}

// Load contacts
function openContactModal(contact) {
    const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Close existing
    document.getElementById('contactDetailsModal')?.remove();

    const html = `
      <div class="modal-overlay" id="contactDetailsModal" onclick="this.remove(); document.body.style.overflow='';">
        <div class="modal-dialog" onclick="event.stopPropagation()" style="max-width:720px;">
          <div class="modal-header">
            <h2><i class="fas fa-address-book"></i> Contact Details</h2>
            <button class="modal-close" onclick="document.getElementById('contactDetailsModal')?.remove(); document.body.style.overflow='';"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group full-width">
                <label>Contact Name</label>
                <input id="c_display_name" class="form-control" value="${escape(contact.display_name || '')}" />
              </div>
              <div class="form-group">
                <label>Name</label>
                <input id="c_name" class="form-control" value="${escape(contact.name || '')}" />
              </div>
              <div class="form-group">
                <label>Phone</label>
                <input id="c_phone" class="form-control" value="${escape(contact.phone_number || '')}" />
              </div>
              <div class="form-group">
                <label>Email</label>
                <input id="c_email" class="form-control" value="${escape(contact.email || '')}" />
              </div>
              <div class="form-group">
                <label>Program</label>
                <input id="c_program" class="form-control" value="${escape(contact.program_name || contact.program_short || '')}" />
              </div>
              <div class="form-group">
                <label>Batch</label>
                <input id="c_batch" class="form-control" value="${escape(contact.batch_name || '')}" />
              </div>
            </div>
          </div>
          <div class="modal-footer" style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn btn-secondary" id="c_sync_google"><i class="fab fa-google"></i> Sync to Google</button>
              <button class="btn btn-danger" id="c_delete"><i class="fas fa-trash"></i> Delete</button>
            </div>
            <div style="display:flex; gap:10px;">
              <button class="btn btn-secondary" onclick="document.getElementById('contactDetailsModal')?.remove(); document.body.style.overflow='';">Close</button>
              <button class="btn btn-primary" id="c_save"><i class="fas fa-save"></i> Save</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    document.body.style.overflow = 'hidden';

    document.getElementById('c_sync_google')?.addEventListener('click', async () => {
        const btn = document.getElementById('c_sync_google');
        const old = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
        try {
            if (!window.API || !API.google) throw new Error('Google API not available');
            const st = await API.google.status();
            if (!st?.connected) {
                const ok = confirm('Google Contacts is not connected. Connect now?');
                if (ok) {
                    const url = await API.google.getConnectUrl('/#contacts');
                    window.location.href = url;
                    return;
                }
                throw new Error('Google not connected');
            }

            const r = await API.google.syncContact(contact.id);
            UI.showToast(r.created ? 'Saved to Google Contacts' : 'Updated in Google Contacts', 'success');
        } catch (e) {
            console.error(e);
            UI.showToast(e.message || 'Failed to sync to Google', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = old;
        }
    });

    document.getElementById('c_save')?.addEventListener('click', async () => {
        const btn = document.getElementById('c_save');
        const old = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        try {
            await API.contacts.update(contact.id, {
                display_name: document.getElementById('c_display_name')?.value,
                name: document.getElementById('c_name')?.value,
                phone_number: document.getElementById('c_phone')?.value,
                email: document.getElementById('c_email')?.value,
                program_name: document.getElementById('c_program')?.value,
                batch_name: document.getElementById('c_batch')?.value
            });
            UI.showToast('Contact saved', 'success');
            document.getElementById('contactDetailsModal')?.remove();
            document.body.style.overflow = '';
            await loadContacts();
        } catch (e) {
            console.error(e);
            UI.showToast(e.message || 'Failed to save', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = old;
        }
    });

    document.getElementById('c_delete')?.addEventListener('click', async () => {
        const ok = confirm('Delete this contact?');
        if (!ok) return;
        const btn = document.getElementById('c_delete');
        const old = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        try {
            await API.contacts.remove(contact.id);
            UI.showToast('Contact deleted', 'success');
            document.getElementById('contactDetailsModal')?.remove();
            document.body.style.overflow = '';
            await loadContacts();
        } catch (e) {
            console.error(e);
            UI.showToast(e.message || 'Failed to delete', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = old;
        }
    });
}

// Load contacts
async function loadContacts() {
    try {
        const tbody = document.getElementById('contactsTableBody');
        const q = document.getElementById('contactsSearch')?.value || '';
        const res = await API.contacts.list({ q });
        const rows = res.contacts || [];
        window.__contactsLastRows = rows;

        const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

        const trHtml = (c) => `
          <tr data-row-key="${escape(c.id)}">
            <td style="font-weight:700;">${escape(c.display_name || c.name || '')}</td>
            <td>${escape(c.phone_number || '')}</td>
            <td>${escape(c.email || '')}</td>
          </tr>
        `;

        if (tbody) {
            if (window.DOMPatcher && DOMPatcher.patchTableBody) {
                DOMPatcher.patchTableBody(tbody, rows, (x) => x.id, trHtml);
            } else {
                tbody.innerHTML = rows.map(trHtml).join('') || '<tr><td colspan="3" class="loading">No contacts found.</td></tr>';
            }

            // Row click -> details modal (bind once)
            if (!tbody.__bound) {
                tbody.__bound = true;
                tbody.addEventListener('click', (ev) => {
                    const tr = ev.target.closest('tr[data-row-key]');
                    if (!tr) return;
                    const id = tr.getAttribute('data-row-key');
                    const row = (window.__contactsLastRows || []).find(x => String(x.id) === String(id));
                    if (row) openContactModal(row);
                });
            }
        }

        const refreshBtn = document.getElementById('contactsRefreshBtn');
        if (refreshBtn && !refreshBtn.__bound) {
            refreshBtn.__bound = true;
            refreshBtn.addEventListener('click', () => loadContacts().catch(console.error));
        }

        const searchEl = document.getElementById('contactsSearch');
        if (searchEl && !searchEl.__bound) {
            searchEl.__bound = true;
            let t = null;
            searchEl.addEventListener('input', () => {
                if (t) clearTimeout(t);
                t = setTimeout(() => loadContacts().catch(console.error), 300);
            });
        }

    } catch (e) {
        console.error('Failed to load contacts:', e);
        UI.showToast(e.message || 'Failed to load contacts', 'error');
    }
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
async function loadReports() {
    console.log('Loading Reports');
    if (window.initReportsPage) {
        await window.initReportsPage(currentUser);
    }
}

// Load Settings view
async function loadSettings() {
    console.log('Loading Settings');

    const isAdmin = currentUser?.role === 'admin' || document.body.classList.contains('admin');

    const card = document.getElementById('settingsNotificationsCard');
    const adminPlaceholder = document.getElementById('settingsAdminPlaceholder');

    // Officer/Admin: show notification settings
    if (adminPlaceholder) adminPlaceholder.style.display = 'none';
    if (card) card.style.display = 'block';

    // Role-specific rows
    const rowDaily = document.getElementById('settingsRowDailyReportReminders');
    const rowAdminLeave = document.getElementById('settingsRowAdminLeaveReq');
    const rowAdminDaily = document.getElementById('settingsRowAdminDailyReports');

    if (rowDaily) rowDaily.style.display = isAdmin ? 'none' : 'flex';
    if (rowAdminLeave) rowAdminLeave.style.display = isAdmin ? 'flex' : 'none';
    if (rowAdminDaily) rowAdminDaily.style.display = isAdmin ? 'flex' : 'none';

    // settings UI
    {

        const msg = document.getElementById('settingsNotificationsMsg');
        const btnBrowser = document.getElementById('settingsEnableBrowserAlertsBtn');
        const btnDaily = document.getElementById('settingsDailyReportRemindersBtn');
        const btnAssign = document.getElementById('settingsAssignAlertsBtn');
        const btnFU = document.getElementById('settingsFollowupAlertsBtn');
        const btnAdminLeave = document.getElementById('settingsAdminLeaveReqBtn');
        const btnAdminDaily = document.getElementById('settingsAdminDailyReportsBtn');

        async function loadServerSettings() {
            try {
                const headers = await getAuthHeadersWithRetry();
                const res = await fetch('/api/notifications/settings', { headers });
                const json = await res.json();
                if (json?.success && json.settings) {
                    return json.settings;
                }
            } catch (e) {}
            return null;
        }

        async function saveServerSettings(patch) {
            try {
                const headers = { ...(await getAuthHeadersWithRetry()), 'Content-Type': 'application/json' };
                const res = await fetch('/api/notifications/settings', { method: 'PUT', headers, body: JSON.stringify(patch) });
                const json = await res.json();
                if (json?.success && json.settings) return json.settings;
            } catch (e) {}
            return null;
        }

        let serverSettings = await loadServerSettings();

        const refresh = () => {
            const local = window.Notifications?.getSettings ? window.Notifications.getSettings() : { dailyReports: true, assignments: true, followups: true };

            if (!isAdmin) {
                if (btnDaily) btnDaily.textContent = local.dailyReports ? 'On' : 'Off';
                if (btnAssign) btnAssign.textContent = local.assignments ? 'On' : 'Off';
                if (btnFU) btnFU.textContent = local.followups ? 'On' : 'Off';
            } else {
                const s = serverSettings || {};
                if (btnAdminLeave) btnAdminLeave.textContent = (s.admin_leave_requests === false) ? 'Off' : 'On';
                if (btnAdminDaily) btnAdminDaily.textContent = (s.admin_daily_reports === false) ? 'Off' : 'On';
            }

            // Browser alerts
            if (btnBrowser) {
                if (!window.Notifications?.canUseBrowserNotifications?.()) {
                    btnBrowser.disabled = true;
                    btnBrowser.textContent = 'Not supported';
                } else {
                    const enabled = window.Notifications.browserNotificationsEnabled?.() === true;
                    const perm = (window.Notification && Notification.permission) ? Notification.permission : 'default';
                    if (perm === 'granted' && enabled) {
                        btnBrowser.disabled = false;
                        btnBrowser.textContent = 'Disable';
                    } else {
                        btnBrowser.disabled = false;
                        btnBrowser.textContent = 'Enable';
                    }
                }
            }
        };

        if (btnBrowser) {
            btnBrowser.onclick = async () => {
                try {
                    if (!window.Notifications?.requestBrowserPermission) throw new Error('Notifications module not loaded');

                    // If already enabled locally + permission granted, clicking disables
                    const enabledLocal = window.Notifications.browserNotificationsEnabled?.() === true;
                    const perm = (window.Notification && Notification.permission) ? Notification.permission : 'default';
                    if (perm === 'granted' && enabledLocal) {
                        window.Notifications.setBrowserNotificationsEnabled(false);
                        // persist server pref
                        await fetch('/api/notifications/settings', {
                            method: 'PUT',
                            headers: { ...(await getAuthHeadersWithRetry()), 'Content-Type': 'application/json' },
                            body: JSON.stringify({ browser_alerts_enabled: false })
                        });
                        if (msg) msg.textContent = 'Browser alerts disabled.';
                        if (window.showToast) showToast('Browser alerts disabled', 'info');
                        refresh();
                        return;
                    }

                    const p = await window.Notifications.requestBrowserPermission();
                    if (p === 'granted') {
                        window.Notifications.setBrowserNotificationsEnabled(true);
                        // persist server pref
                        await fetch('/api/notifications/settings', {
                            method: 'PUT',
                            headers: { ...(await getAuthHeadersWithRetry()), 'Content-Type': 'application/json' },
                            body: JSON.stringify({ browser_alerts_enabled: true })
                        });
                        if (msg) msg.textContent = 'Browser alerts enabled.';
                        if (window.showToast) showToast('Browser alerts enabled', 'success');
                    } else {
                        window.Notifications.setBrowserNotificationsEnabled(false);
                        await fetch('/api/notifications/settings', {
                            method: 'PUT',
                            headers: { ...(await getAuthHeadersWithRetry()), 'Content-Type': 'application/json' },
                            body: JSON.stringify({ browser_alerts_enabled: false })
                        });
                        if (msg) msg.textContent = 'Browser alerts not allowed.';
                        if (window.showToast) showToast('Browser alerts not allowed', 'warning');
                    }
                    refresh();
                } catch (e) {
                    if (msg) msg.textContent = e.message;
                    if (window.showToast) showToast(e.message, 'error');
                }
            };
        }

        if (!isAdmin) {
            if (btnDaily) {
                btnDaily.onclick = async () => {
                    const cur = window.Notifications?.getSettings ? window.Notifications.getSettings().dailyReports : true;
                    window.Notifications?.setSetting?.('dailyReports', !cur);
                    refresh();
                    try { await window.Notifications?.reschedule?.(); } catch (e) {}
                };
            }

            if (btnAssign) {
                btnAssign.onclick = () => {
                    const cur = window.Notifications?.getSettings ? window.Notifications.getSettings().assignments : true;
                    window.Notifications?.setSetting?.('assignments', !cur);
                    refresh();
                };
            }

            if (btnFU) {
                btnFU.onclick = () => {
                    const cur = window.Notifications?.getSettings ? window.Notifications.getSettings().followups : true;
                    window.Notifications?.setSetting?.('followups', !cur);
                    refresh();
                };
            }
        } else {
            if (btnAdminLeave) {
                btnAdminLeave.onclick = async () => {
                    const curOff = (serverSettings && serverSettings.admin_leave_requests === false);
                    serverSettings = await saveServerSettings({ admin_leave_requests: curOff ? true : false });
                    refresh();
                };
            }
            if (btnAdminDaily) {
                btnAdminDaily.onclick = async () => {
                    const curOff = (serverSettings && serverSettings.admin_daily_reports === false);
                    serverSettings = await saveServerSettings({ admin_daily_reports: curOff ? true : false });
                    refresh();
                };
            }
        }

        refresh();
        return;
    }

    // Admin: keep placeholder for now
    if (card) card.style.display = 'none';
    if (adminPlaceholder) adminPlaceholder.style.display = 'block';
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
let isLoadingUsers = false;
let usersLoadedOnce = false;

async function loadUsers({ showSkeleton = false } = {}) {
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin only.');
        return;
    }
    
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (isLoadingUsers) return;
    isLoadingUsers = true;

    try {
        if (showSkeleton) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading users...</td></tr>';
        }
        
        const ttlMs = 10 * 60 * 1000; // 10 minutes
        const cacheKey = 'users:all';

        // Fast path: use cache when not explicitly showing skeleton
        if (!showSkeleton && window.Cache) {
            const cached = window.Cache.getFresh(cacheKey, ttlMs);
            if (cached && cached.success && cached.users) {
                const data = cached;

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

                return;
            }
        }

        // Get all users from API
        const response = await fetch('/api/users');
        const data = await response.json();
        if (window.Cache && data && data.success) window.Cache.setWithTs(cacheKey, data);
        
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
        
        const trHtmlFn = (user) => {
            const isProtectedAdmin = protectedAdminEmails.includes(user.email.toLowerCase());
            return `
            <tr data-row-key="${escapeHtml(user.id)}">
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
        };

        if (window.DOMPatcher?.patchTableBody) {
            window.DOMPatcher.patchTableBody(tbody, users, (u) => u.id, trHtmlFn);
        } else {
            tbody.innerHTML = users.map(trHtmlFn).join('');
        }
        
    } catch (error) {
        console.error('Error loading users:', error);
        if (showSkeleton) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: red;">
                Error: ${error.message}
            </td></tr>`;
        }
    } finally {
        usersLoadedOnce = true;
        isLoadingUsers = false;
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
        if (window.Cache) window.Cache.invalidatePrefix('users:');
        loadUsers().catch(console.error);
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
        if (window.Cache) window.Cache.invalidatePrefix('users:');
        loadUsers().catch(console.error);
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
        if (window.Cache) window.Cache.invalidatePrefix('users:');
        loadUsers().catch(console.error);
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
                            <input type="url" id="mainSheetUrl" class="form-control" required
                                   placeholder="Paste admin Google Sheet URL for this batch" />
                            <small style="color:#666; display:block; margin-top:6px;">This is where all leads for this batch are stored & assigned from.</small>
                        </div>

                        <div style="background: #e8f5e9; padding: 15px; border-radius: 6px; border-left: 4px solid #4caf50; margin-top: 20px;">
                            <p style="margin: 0; color: #333; font-size: 14px;">
                                <i class="fas fa-info-circle" style="color: #2196f3;"></i>
                                <strong>What will be created:</strong>
                            </p>
                            <ul style="margin: 10px 0 0 20px; color: #666; font-size: 13px;">
                                <li>Links this batch to the Main Google Sheet you provide</li>
                                <li>Syncs leads from the sheet into Supabase (operational database)</li>
                                <li>Officers work from Supabase (no officer spreadsheets needed)</li>
                                <li>Assignment changes sync back to the main sheet automatically</li>
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
        const mainSheetUrl = document.getElementById('mainSheetUrl')?.value?.trim();
        await createNewBatch(batchName, mainSheetUrl);
    } catch (error) {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Create new batch
async function createNewBatch(batchName, mainSpreadsheetUrl) {
    try {
        // Call API to create new batch
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
            body: JSON.stringify({ batchName, mainSpreadsheetUrl })
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
            
            // Batch creation is now managed in Programs tab.
            // If this legacy modal is used, just refresh the batches menu.
            setTimeout(async () => {
                await loadBatchesMenu();
                setupNavigation();
                location.hash = 'home';
                navigateToPage('home');
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

// Load dashboard data (Admin Analytics Home)
let __homeFunnelChart = null;
let __homeConfirmedLineChart = null;

function fmtPct(x) {
    const n = Number(x || 0);
    if (!Number.isFinite(n)) return '0%';
    return `${(n * 100).toFixed(1)}%`;
}

function isoDate(d) {
    return new Date(d).toISOString().slice(0, 10);
}

function setDefaultHomeRange() {
    const to = new Date();
    const from = new Date(Date.now() - 29 * 24 * 3600 * 1000);
    const fromEl = document.getElementById('homeFromDate');
    const toEl = document.getElementById('homeToDate');
    if (fromEl && !fromEl.value) fromEl.value = isoDate(from);
    if (toEl && !toEl.value) toEl.value = isoDate(to);
}

async function loadDashboard() {
    try {
        // Always keep the "new enquiries" badge working
        try {
            const statsResponse = await API.dashboard.getStats();
            const badgeEl = document.getElementById('newEnquiriesCount');
            if (badgeEl) badgeEl.textContent = statsResponse.stats?.new || 0;
        } catch (e) {
            // ignore badge failures
        }

        if (!currentUser) {
            return;
        }

        const fromInputEl = document.getElementById('homeFromDate');
        const toInputEl = document.getElementById('homeToDate');

        const from = fromInputEl?.value || '';
        const to = toInputEl?.value || '';

        // Bind buttons once
        const applyBtn = document.getElementById('homeApplyRangeBtn');
        if (applyBtn && !applyBtn.__bound) {
            applyBtn.__bound = true;
            applyBtn.addEventListener('click', () => loadDashboard().catch(console.error));
        }
        const last30Btn = document.getElementById('homeThisMonthBtn');
        if (last30Btn && !last30Btn.__bound) {
            last30Btn.__bound = true;
            last30Btn.addEventListener('click', () => {
                const toD = new Date();
                const fromD = new Date(Date.now() - 29 * 24 * 3600 * 1000);
                const fromEl = document.getElementById('homeFromDate');
                const toEl = document.getElementById('homeToDate');
                if (fromEl) fromEl.value = isoDate(fromD);
                if (toEl) toEl.value = isoDate(toD);
                loadDashboard().catch(console.error);
            });
        }

        // Stable loading placeholders (avoid layout jumps)
        const acLoadingEl = document.getElementById('homeActionCenter');
        const lbLoadingEl = document.getElementById('homeLeaderboard');
        if (acLoadingEl) acLoadingEl.innerHTML = '<p class="loading">Loading...</p>';
        if (lbLoadingEl) lbLoadingEl.innerHTML = '<p class="loading">Loading...</p>';

        const analytics = await API.dashboard.getAnalytics({ from, to });

        // If range inputs are empty, default them to server-chosen range (current batch start -> today)
        if (fromInputEl && !fromInputEl.value && analytics?.range?.from) fromInputEl.value = analytics.range.from;
        if (toInputEl && !toInputEl.value && analytics?.range?.to) toInputEl.value = analytics.range.to;

        // KPI strip
        const k = analytics.kpis || {};
        const elDue = document.getElementById('kpiFollowUpsDue');
        const elRegR = null;
        const elCP = document.getElementById('kpiConfirmedPayments');
        const elCR = document.getElementById('kpiConversionRate');
        if (elDue) elDue.textContent = String(k.followUpsDue ?? 0);
        if (elCP) elCP.textContent = String(k.confirmedPayments ?? 0);
        if (elCR) elCR.textContent = fmtPct(k.conversionRate);

        // Funnel chart
        const f = analytics.funnel || { new: 0, contacted: 0, followUp: 0, registered: 0, confirmedPayments: 0 };
        const funnelCanvas = document.getElementById('homeFunnelChart');
        if (funnelCanvas && window.Chart) {
            const labels = ['New', 'Contacted', 'Follow-up', 'Registered', 'Confirmed'];
            const values = [f.new, f.contacted, f.followUp, f.registered, f.confirmedPayments];
            if (__homeFunnelChart) __homeFunnelChart.destroy();
            __homeFunnelChart = new Chart(funnelCanvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Count',
                        data: values,
                        backgroundColor: ['#e0f2fe', '#d1fae5', '#fef3c7', '#ede9fe', '#dcfce7'],
                        borderColor: ['#0284c7', '#059669', '#d97706', '#7c3aed', '#16a34a'],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
                }
            });
        }

        // Line chart (confirmed payments/day)
        const s = analytics.series?.confirmedPaymentsPerDay || [];
        const lineCanvas = document.getElementById('homeConfirmedLineChart');
        if (lineCanvas && window.Chart) {
            const labels = s.map(x => x.day);
            const values = s.map(x => x.count);
            if (__homeConfirmedLineChart) __homeConfirmedLineChart.destroy();
            __homeConfirmedLineChart = new Chart(lineCanvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Enrollments',
                        data: values,
                        tension: 0.35,
                        borderColor: '#16a34a',
                        backgroundColor: 'rgba(22, 163, 74, 0.12)',
                        fill: true,
                        pointRadius: 2
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { precision: 0 } },
                        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }
                    }
                }
            });
        }

        // Leaderboard
        const lb = analytics.leaderboard?.enrollmentsCurrentBatch || [];
        const lbEl = document.getElementById('homeLeaderboard');
        if (lbEl) {
            const medal = (idx) => {
                if (idx === 0) return '<i class="fas fa-medal" style="color:#d4af37;"></i>'; // gold
                if (idx === 1) return '<i class="fas fa-medal" style="color:#c0c0c0;"></i>'; // silver
                if (idx === 2) return '<i class="fas fa-medal" style="color:#cd7f32;"></i>'; // bronze
                return `<span style="display:inline-block; width:18px; text-align:right; color:#667085; font-weight:700;">${idx + 1}</span>`;
            };
            if (!lb.length) {
                lbEl.innerHTML = '<p class="loading">No confirmed payments yet this week.</p>';
            } else {
                lbEl.innerHTML = lb.map((r, i) => {
                    const name = String(r.officer || 'Unassigned');
                    const count = Number(r.count || 0);
                    const cr = Number(r.conversionRate || 0);
                    const leadsAssigned = Number(r.leadsAssigned || 0);
                    const crText = `${(cr * 100).toFixed(1)}%`;
                    return `
                      <div class="officer-stat leaderboard-row">
                        <div class="officer-name">
                          <span class="leaderboard-rank">${medal(i)}</span>
                          <span class="leaderboard-name" title="${name}">${name}</span>
                        </div>
                        <div class="leaderboard-metrics" title="Leads assigned: ${leadsAssigned}">
                          <div class="officer-count">${count}</div>
                          <div class="leaderboard-cr">${crText}</div>
                        </div>
                      </div>
                    `;
                }).join('');
            }
        }

        // Action center
        const ac = analytics.actionCenter || null;
        const acEl = document.getElementById('homeActionCenter');
        if (acEl && currentUser.role === 'admin' && ac) {
            const overdue = Number(ac.overdueFollowUps || 0);
            const toConfirm = Number(ac.paymentsToBeConfirmed || 0);
            const toEnroll = Number(ac.toBeEnrolled || 0);
            const missingAssign = Number(ac.registrationsMissingAssignedTo || 0);

            acEl.innerHTML = `
              <div style="display:flex; flex-direction:column; gap:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                  <div><strong>Overdue follow-ups</strong><div style="color:#667085; font-size:12px;">Needs attention</div></div>
                  <div style="display:flex; gap:10px; align-items:center;">
                    <span class="badge" style="background:#fff1f2; color:#9f1239; border:1px solid #fecdd3;">${overdue}</span>
                    <button class="btn btn-secondary" type="button" id="acViewFollowUpsBtn">View</button>
                  </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                  <div><strong>Payments to be confirmed</strong><div style="color:#667085; font-size:12px;">Payment received but not confirmed</div></div>
                  <div style="display:flex; gap:10px; align-items:center;">
                    <span class="badge" style="background:#fffbeb; color:#92400e; border:1px solid #fde68a;">${toConfirm}</span>
                    <button class="btn btn-secondary" type="button" id="acViewPaymentsBtn">View</button>
                  </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                  <div><strong>To be enrolled</strong><div style="color:#667085; font-size:12px;">Payment received but not enrolled</div></div>
                  <div style="display:flex; gap:10px; align-items:center;">
                    <span class="badge" style="background:#ecfeff; color:#155e75; border:1px solid #a5f3fc;">${toEnroll}</span>
                    <button class="btn btn-secondary" type="button" id="acViewToEnrollBtn">View</button>
                  </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                  <div><strong>Registrations missing assignment</strong><div style="color:#667085; font-size:12px;">Assign an officer</div></div>
                  <div style="display:flex; gap:10px; align-items:center;">
                    <span class="badge" style="background:#eef2ff; color:#3730a3; border:1px solid #c7d2fe;">${missingAssign}</span>
                    <button class="btn btn-secondary" type="button" id="acViewRegistrationsBtn">View</button>
                  </div>
                </div>
              </div>
            `;

            const fuBtn = document.getElementById('acViewFollowUpsBtn');
            if (fuBtn && !fuBtn.__bound) {
                fuBtn.__bound = true;
                fuBtn.addEventListener('click', () => {
                    window.location.hash = 'calendar';
                });
            }
            const payBtn = document.getElementById('acViewPaymentsBtn');
            if (payBtn && !payBtn.__bound) {
                payBtn.__bound = true;
                payBtn.addEventListener('click', () => {
                    window.location.hash = 'payments';
                });
            }
            const toEnrollBtn = document.getElementById('acViewToEnrollBtn');
            if (toEnrollBtn && !toEnrollBtn.__bound) {
                toEnrollBtn.__bound = true;
                toEnrollBtn.addEventListener('click', () => {
                    window.location.hash = 'registrations';
                });
            }

            const regBtn = document.getElementById('acViewRegistrationsBtn');
            if (regBtn && !regBtn.__bound) {
                regBtn.__bound = true;
                regBtn.addEventListener('click', () => {
                    window.location.hash = 'registrations';
                });
            }
        }

    } catch (error) {
        console.error('Error loading dashboard:', error);
        UI.showToast('Failed to load dashboard data', 'error');
    }
}

// Update enquiries badge
async function updateEnquiriesBadge() {
    // Backoff when Sheets quota is hit
    const now = Date.now();
    if (window.__badgeQuotaBackoffUntil && now < window.__badgeQuotaBackoffUntil) return;

    try {
        const statsResponse = await API.dashboard.getStats();
        const badge = document.getElementById('newEnquiriesCount');
        if (badge) {
            badge.textContent = statsResponse.stats?.new || 0;
        }
    } catch (error) {
        const msg = String(error?.message || error || '');
        if (msg.includes('Quota exceeded') || msg.includes('SHEETS_QUOTA') || error?.status === 429) {
            window.__badgeQuotaBackoffUntil = Date.now() + 10000;
            return;
        }
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
    const now = Date.now();
    if (window.__calendarQuotaBackoffUntil && now < window.__calendarQuotaBackoffUntil) return;

    if (window.__calendarLoadInFlight) return;
    window.__calendarLoadInFlight = true;
    try {
        const calendarAlreadyRendered = Boolean(window.__followupCalendarState && window.__followupCalendarState.events && window.__followupCalendarState.events.all && window.__followupCalendarState.events.all.length);

        // Render skeleton immediately (fallback even if UI isn't ready yet). Only do this on first load.
        const renderCalendarSkeletonFallback = () => {
            const grid = document.getElementById('calendarGrid');
            if (grid) {
                const headers = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const cells = [];
                for (const h of headers) {
                    cells.push(`<div class="followup-calendar-cell" style="font-weight:600; background:#f9fafb;">${h}</div>`);
                }
                for (let i = 0; i < 42; i++) {
                    cells.push(`
                        <div class="followup-calendar-cell loading-shimmer" style="min-height:78px; background-color:#f3f4f6; border:1px solid #e5e7eb;">
                            <div style="height:12px; width:40%; background:rgba(255,255,255,0.35); border-radius:6px;"></div>
                            <div style="height:10px; width:60%; margin-top:10px; background:rgba(255,255,255,0.25); border-radius:6px;"></div>
                        </div>
                    `);
                }
                grid.innerHTML = cells.join('');
            }
            const monthLabel = document.getElementById('calendarMonthLabel');
            if (monthLabel) monthLabel.textContent = 'Loading…';
            const dayTitle = document.getElementById('calendarSelectedDayTitle');
            if (dayTitle) dayTitle.textContent = 'Loading…';
            const dayEvents = document.getElementById('calendarSelectedDayEvents');
            if (dayEvents) dayEvents.innerHTML = `<p class="loading">Loading calendar…</p>`;
        };

        // If we have already rendered once, keep the existing grid visible and just show a light refresh hint.
        // Otherwise, show skeleton.
        if (!calendarAlreadyRendered) {
            // rAF ensures the view is active/painted before we touch DOM
            requestAnimationFrame(() => {
                if (window.UI && typeof UI.showFollowUpCalendarSkeleton === 'function') UI.showFollowUpCalendarSkeleton();
                else if (window.UI && typeof UI.renderFollowUpCalendarSkeleton === 'function') UI.renderFollowUpCalendarSkeleton();
                else renderCalendarSkeletonFallback();
            });
        } else {
            const monthLabel = document.getElementById('calendarMonthLabel');
            if (monthLabel) monthLabel.textContent = 'Refreshing…';
        }

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
        if (window.UI && typeof UI.hideFollowUpCalendarSkeleton === 'function') UI.hideFollowUpCalendarSkeleton();

        // Bind Add Task
        const addBtn = document.getElementById('calendarAddTaskBtn');
        if (addBtn && !addBtn.__bound) {
            addBtn.addEventListener('click', () => {
                if (window.openCalendarTaskModal) window.openCalendarTaskModal();
            });
            addBtn.__bound = true;
        }
    } catch (error) {
        const msg = String(error?.message || error || '');
        if (msg.includes('Quota exceeded') || msg.includes('SHEETS_QUOTA') || error?.status === 429) {
            // Back off calendar reload attempts briefly
            window.__calendarQuotaBackoffUntil = Date.now() + 10000;
            if (window.UI && typeof UI.hideFollowUpCalendarSkeleton === 'function') UI.hideFollowUpCalendarSkeleton();
            return;
        }

        console.error('Error loading calendar:', error);
        UI.showToast('Failed to load calendar', 'error');
    } finally {
        window.__calendarLoadInFlight = false;
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
// Add Sheet modal (used by Leads + Lead Management tab bars)
window.openBatchPaymentSetup = function (batchName) {
    const b = document.getElementById('paymentSetupBatchName');
    if (b) b.value = batchName || '';
    if (window.BatchPaymentSetup && window.BatchPaymentSetup.open) {
        window.BatchPaymentSetup.open(batchName);
    } else {
        openModal('batchPaymentSetupModal');
    }
};

window.openAddSheetModal = function ({ batchName, scope }) {
    const batchEl = document.getElementById('addSheetBatchName');
    const scopeEl = document.getElementById('addSheetScope');
    const nameEl = document.getElementById('addSheetName');
    if (batchEl) batchEl.value = batchName || '';
    if (scopeEl) scopeEl.value = scope || 'officer';
    if (nameEl) nameEl.value = '';
    openModal('addSheetModal');
};

async function setupAddSheetModalHandler() {
    const btn = document.getElementById('addSheetSaveBtn');
    if (!btn || btn.__bound) return;
    btn.__bound = true;

    btn.addEventListener('click', async () => {
        const batchName = document.getElementById('addSheetBatchName')?.value;
        const scope = document.getElementById('addSheetScope')?.value;
        const sheetName = document.getElementById('addSheetName')?.value?.trim();

        if (!batchName) return;
        if (!sheetName) {
            if (window.UI && UI.showToast) UI.showToast('Sheet name is required', 'error');
            return;
        }

        // Prevent reserved/default names
        const reserved = ['main leads', 'extra leads'];
        const key = sheetName.toLowerCase().replace(/\s+/g, ' ').trim();
        if (reserved.includes(key)) {
            if (window.UI && UI.showToast) UI.showToast('This sheet name is reserved. Please choose a different name.', 'error');
            return;
        }

        // Basic duplicate check from current tab bar (if present)
        const tabEls = document.querySelectorAll('#leadsSheetTabs button, #managementSheetTabs button');
        const existing = Array.from(tabEls)
            .map(b => (b.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        if (existing.includes(key)) {
            if (window.UI && UI.showToast) UI.showToast('A sheet with this name already exists.', 'error');
            return;
        }

        try {
            btn.disabled = true;
            let authHeaders = { 'Content-Type': 'application/json' };
            if (window.supabaseClient) {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session && session.access_token) {
                    authHeaders['Authorization'] = `Bearer ${session.access_token}`;
                }
            }

            const res = await fetch('/api/crm-leads/meta/sheets', {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ batchName, sheetName, scope })
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Failed to create sheet');

            closeModal('addSheetModal');
            if (window.UI && UI.showToast) UI.showToast('Sheet created', 'success');

            // Notify pages to refresh tabs
            document.dispatchEvent(new CustomEvent('sheet:created', { detail: { batchName, sheetName, scope } }));
        } catch (e) {
            console.error(e);
            if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to create sheet', 'error');
        } finally {
            btn.disabled = false;
        }
    });
}

// Ensure handler is bound early
document.addEventListener('DOMContentLoaded', () => {
    setupAddSheetModalHandler();
});

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
