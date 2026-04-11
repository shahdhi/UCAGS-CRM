# Dashboard CSS Analysis

## CSS Variables & Color Theme

### Root Variables (`:root`)

#### Typography
```css
--font-sans: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"
```

#### Text Colors (Tailwind-like)
```css
--tw-gray-900:  #111827   /* Darkest text */
--tw-gray-700:  #374151   /* Primary text */
--tw-gray-600:  #4B5563   /* Secondary text */
--tw-gray-500:  #6B7280   /* Tertiary text */
--tw-gray-400:  #9CA3AF   /* Light gray */
--tw-blue-600:  #2563EB   /* Blue accent */
--tw-white:     #FFFFFF   /* White */
--tw-green-600: #16A34A   /* Green accent */
--tw-red-600:   #DC2626   /* Red accent */
--tw-yellow-600: #CA8A04  /* Yellow accent */
```

#### Purple Theme Colors (Primary Brand)
```css
--primary-purple:       #8B5CF6   /* Main purple */
--primary-purple-dark:  #7C3AED   /* Darker purple (used in XP) */
--primary-purple-light: #A78BFA   /* Lighter purple */
--secondary-purple:     #C4B5FD   /* Secondary shade */
--accent-purple:        #DDD6FE   /* Accent shade */
--purple-50:            #FAF5FF   /* Lightest purple */
--purple-100:           #F3E8FF   /* Very light purple */
```

#### Gradients
```css
--gradient-primary:       linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)
--gradient-secondary:     linear-gradient(135deg, #C4B5FD 0%, #DDD6FE 100%)
--gradient-glass:         linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(196, 181, 253, 0.1) 100%)
--gradient-modal-header:  linear-gradient(135deg, #4C1D95 0%, #6D28D9 100%)
--gradient-action-primary: var(--gradient-primary)
```

#### Neutral Colors
```css
--bg-primary:      #FFFFFF      /* Main background */
--bg-secondary:    #F8F9FA      /* Secondary background */
--bg-tertiary:     #F1F3F5      /* Tertiary background */
--bg-elevated:     #FFFFFF      /* Elevated elements */
--bg-hover:        #F8F9FA      /* Hover state */
--text-primary:    #212529      /* Primary text */
--text-secondary:  #6C757D      /* Secondary text */
--text-tertiary:   #ADB5BD      /* Tertiary text */
--text-quaternary: #DEE2E6      /* Quaternary text */
--separator:       #E9ECEF      /* Border/divider color */
--separator-light: #F1F3F5      /* Light border */
```

#### Shadows
```css
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05)
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1)
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1)
```

#### Glass Effect
```css
--glass-bg:     rgba(255, 255, 255, 0.8)
--glass-border: rgba(0, 0, 0, 0.08)
--glass-shadow: 0 2px 16px 0 rgba(0, 0, 0, 0.08)
```

#### Spacing
```css
--spacing-xs: 0.5rem    /* 8px */
--spacing-sm: 1rem      /* 16px */
--spacing-md: 1.5rem    /* 24px */
--spacing-lg: 2rem      /* 32px */
--spacing-xl: 3rem      /* 48px */
```

#### Border Radius
```css
--radius-sm: 8px
--radius-md: 12px
--radius-lg: 16px
--radius-xl: 24px
```

#### Transitions
```css
--transition-fast: 0.2s cubic-bezier(0.4, 0, 0.2, 1)
--transition-base: 0.3s cubic-bezier(0.4, 0, 0.2, 1)
--transition-slow: 0.5s cubic-bezier(0.4, 0, 0.2, 1)
```

---

## Dashboard-Specific CSS Classes

### New Dashboard (ND) Components

#### Profile Section
```css
.nd-profile-section       /* Main profile container with flexbox layout */
.nd-profile-left          /* Avatar + info (left side) */
.nd-profile-center        /* XP progress (center) */
.nd-profile-right         /* Filters + date range (right) */
.nd-avatar                /* User avatar circle */
.nd-avatar-initials       /* Avatar text (ID: ndAvatarInitials) */
.nd-profile-name          /* User name display */
.nd-profile-role          /* User role text */
.nd-profile-meta          /* Additional metadata */
.nd-rank-badge            /* Trophy badge with rank text */
.nd-xp-block              /* XP progress section */
.nd-xp-label              /* "⚡ XP Progress" label */
.nd-xp-numbers            /* "X / Y" display */
.nd-xp-bar-bg             /* Progress bar background */
.nd-xp-bar-fill           /* Progress bar fill (width: %) */
.nd-xp-bar-shimmer        /* Shimmer animation on progress bar */
.nd-level-label           /* "Level N" text */
```

#### Officer Filter
```css
.nd-officer-filter        /* Filter wrapper (admin-only) */
.nd-filter-label          /* Label text with icon */
.nd-select                /* Styled select dropdown */
```

#### Date Range
```css
.nd-date-range            /* Date range container */
.nd-date-input            /* Date input fields */
.nd-date-sep              /* Separator ("→") between dates */
.nd-btn-ghost             /* Ghost button style (filter/30d buttons) */
```

#### Metrics Grid
```css
.nd-metrics-grid          /* 6-column responsive grid */
.nd-metric-card           /* Individual metric card */
.nd-metric-purple         /* Purple themed card */
.nd-metric-green          /* Green themed card */
.nd-metric-amber          /* Amber/yellow themed card */
.nd-metric-blue           /* Blue themed card */
.nd-metric-indigo         /* Indigo themed card */
.nd-metric-rose           /* Rose/pink themed card */
.nd-metric-icon-wrap      /* Icon container */
.nd-metric-body           /* Content area */
.nd-metric-value          /* Large metric number */
.nd-metric-label          /* Metric label text */
.nd-metric-trend          /* Trend indicator */
.nd-metric-glow           /* Glow effect on card */
```

#### Cards & Layout
```css
.nd-card                  /* Base card container */
.nd-card-header           /* Card header with flexbox */
.nd-card-title            /* Card title with icon */
.nd-toggle-group          /* Toggle button group (7d/30d) */
.nd-toggle-btn            /* Individual toggle button */
.nd-toggle-btn.active     /* Active toggle button state */
.nd-chart-wrap            /* Chart container wrapper */
.nd-row                   /* Row container */
.nd-row-2-1               /* 2-column layout (first wider) */
.nd-row-equal             /* Equal width columns */
```

#### Background & Decorative
```css
.nd-bg-blobs              /* Background blob container */
.nd-blob                  /* Individual blob element */
.nd-blob-1                /* First blob animation */
.nd-blob-2                /* Second blob animation */
.nd-blob-3                /* Third blob animation */
```

#### XP Chart Statistics
```css
.nd-xp-chart-stats        /* Stats footer below chart */
.nd-xp-stat               /* Individual stat item */
.nd-xp-stat-label         /* Stat label text */
.nd-xp-stat-val           /* Stat value */
```

#### Achievements/Badges
```css
.nd-badges-grid           /* Badges container */
.nd-skeleton-badge        /* Loading skeleton for badge */
.nd-badges-summary        /* Summary text below badges */
```

#### Lead Pipeline/Funnel
```css
.nd-funnel-bars           /* Funnel bars container */
.nd-skeleton-bar          /* Loading skeleton for bar */
.nd-funnel-footer         /* Footer text below funnel */
.nd-pipeline-summary      /* Summary stats for pipeline */
```

#### Quick Actions
```css
.nd-quick-actions         /* Quick actions button container */
.nd-action-btn            /* Base action button */
.nd-action-purple         /* Purple action button */
.nd-action-blue           /* Blue action button */
.nd-action-green          /* Green action button */
.nd-action-icon-wrap      /* Icon container in button */
.nd-action-text           /* Text container in button */
.nd-action-title          /* Button title text */
.nd-action-desc           /* Button description text */
.nd-action-arrow          /* Right arrow icon */
```

#### Leaderboard
```css
.nd-leaderboard-list      /* Leaderboard items container */
.nd-leaderboard-badge     /* Badge element in header */
.nd-personal-xp           /* Officer personal XP summary */
.nd-skeleton-row           /* Loading skeleton for row */
```

#### Targets
```css
.nd-targets-list          /* Targets items container */
.nd-targets-overall       /* Overall targets summary */
```

#### Activity & Tasks
```css
.nd-activity-list         /* Activity feed container */
.nd-tasks-list            /* Tasks list container */
.nd-task-add-form         /* Add task form (hidden by default) */
.nd-task-input            /* Input fields in task form */
.nd-task-save             /* Save button in task form */
.nd-btn-save              /* Save button style */
```

#### Admin Action Center
```css
.nd-action-center-list    /* Action center items container */
.nd-loading               /* Loading state indicator */
```

---

## Colors Used in Dashboard Components

### Purple (#7C3AED / #8B5CF6)
- XP value text in leaderboard
- XP bar fill color
- Primary buttons
- Icon backgrounds
- Focus states
- Border accents

### Green (#10B981 / #059669)
- Positive XP transactions
- Success states
- Enrollment badges

### Red (#EF4444 / #DC2626)
- Negative XP transactions
- Error states
- Overdue badges

### Gray (#6B7280, #9CA3AF, #374151)
- Secondary text
- Disabled states
- Medal rankings
- Neutral elements

### Amber/Yellow (#F59E0B / #D97706)
- Follow-ups Due metric card
- Warning states

### Blue (#2563EB / #3B82F6)
- Active Leads metric card
- Links and highlights

### Indigo (#6366F1)
- Registrations metric card
- Checkbox states

### Rose/Pink (gradient)
- Total XP metric card
- Accent states

---

## Special Dashboard Styling

### Stable UI (No Hover Animations)
Home dashboard explicitly disables hover movements:
```css
#homeView .dashboard-card,
#homeView .dashboard-card:hover,
#homeView .dashboard-card:active {
    transition: none !important;
    transform: none !important;
    animation: none !important;
}

#homeView .stats-grid .stat-card {
    cursor: default !important;
    animation: none !important;
}
```

### Skeleton Loaders
```css
.nd-skeleton-badge        /* Badge loading state */
.nd-skeleton-bar          /* Bar loading state */
.nd-skeleton-row          /* Row loading state */

/* Shimmer animation */
@keyframes table-skel-shimmer {
    0% { background-position: 100% 0; }
    100% { background-position: 0 0; }
}
```

### Grid Layouts
```css
.nd-metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.nd-row-2-1 {
    display: grid;
    grid-template-columns: 2fr 1fr;  /* First column wider */
}

.nd-row-equal {
    display: grid;
    grid-template-columns: 1fr 1fr;
}

.nd-badges-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
}
```

---

## Button Styles

### Primary Button
```css
.btn-primary {
    background: var(--primary-purple);
    color: white;
    box-shadow: none;
    font-weight: 600;
}

.btn-primary:hover {
    background: var(--primary-purple-dark);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
}
```

### Secondary Button
```css
.btn-secondary {
    background: white;
    color: var(--text-primary);
    border: 1px solid var(--separator);
    font-weight: 600;
}

.btn-secondary:hover {
    background: var(--bg-hover);
    border-color: var(--text-tertiary);
}
```

### Success Button
```css
.btn-success {
    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
    color: white;
    box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
}
```

---

## Responsive Design

### Mobile Menu
```css
@media (max-width: 640px) {
    #leadsView .page-header {
        flex-direction: column;
        gap: 10px;
    }
    
    #leadsView .leads-header-actions {
        width: 100%;
        flex-wrap: wrap;
    }
}
```

### Tablet/Desktop Breakpoints
- Dashboard cards adjust grid layout for smaller screens
- Sidebar can collapse on narrow viewports
- Forms stack vertically on mobile

---
