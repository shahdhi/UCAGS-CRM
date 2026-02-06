# UCAGS CRM - UI Design Guide

## 🎨 Design Philosophy

The UCAGS CRM UI is inspired by Apple's design language, featuring:
- **Glassmorphism**: Frosted glass effects with backdrop blur
- **Fluid Animations**: Smooth, natural motion using cubic-bezier easing
- **Purple Theme**: Professional violet color palette
- **Dark Mode**: Modern dark interface with high contrast
- **Micro-interactions**: Delightful hover and click effects

---

## 🎯 Color Palette

### Purple Theme
```css
Primary Purple:   #8B5CF6
Purple Dark:      #7C3AED
Purple Light:     #A78BFA
Secondary Purple: #C4B5FD
Accent Purple:    #DDD6FE
```

### Neutral Colors
```css
Background Primary:   #0F0F1A (Dark)
Background Secondary: #1A1A2E
Background Tertiary:  #16213E
Text Primary:         #FFFFFF
Text Secondary:       #B8B8C8
Text Muted:           #757589
```

### Status Colors
```css
Success (New):        #10B981 (Green)
Info (Contacted):     #3B82F6 (Blue)
Warning (Follow-up):  #F59E0B (Orange)
Primary (Registered): #8B5CF6 (Purple)
Danger (Closed):      #EF4444 (Red)
```

---

## ✨ Glassmorphism Effects

### Glass Background
```css
background: rgba(255, 255, 255, 0.05);
backdrop-filter: blur(20px) saturate(180%);
border: 1px solid rgba(255, 255, 255, 0.1);
```

### Enhanced Glass (Cards/Modals)
```css
backdrop-filter: blur(30px) saturate(180%);
box-shadow: 0 8px 32px 0 rgba(139, 92, 246, 0.2);
```

---

## 🎬 Animations & Transitions

### Cubic Bezier Timing
```css
--transition-fast: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
--transition-base: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
--transition-slow: 0.5s cubic-bezier(0.4, 0, 0.2, 1);
```

### Key Animations
1. **Float In**: Entry animation for cards
2. **Slide In**: Navigation and content reveal
3. **Modal Slide Up**: Modal appearance with scale
4. **Ripple Effect**: Button click feedback
5. **Glow**: Hover state for cards
6. **Gradient Shift**: Animated gradient backgrounds

---

## 🖱️ Micro-interactions

### Hover Effects
- **Cards**: Lift up 4px with glow shadow
- **Buttons**: Lift 2px with enhanced shadow
- **Table Rows**: Slight scale (1.01) with background color
- **Nav Links**: Translate up 2px with opacity change

### Click Effects
- **Buttons**: Scale down to 0.98
- **Cards**: Immediate response with ripple
- **Checkboxes**: Checkmark animation

### Focus States
- **Inputs**: Border color change + glow shadow
- **All Elements**: Purple outline with 2px offset

---

## 📐 Spacing System

```css
--spacing-xs: 0.5rem  (8px)
--spacing-sm: 1rem    (16px)
--spacing-md: 1.5rem  (24px)
--spacing-lg: 2rem    (32px)
--spacing-xl: 3rem    (48px)
```

---

## 🔲 Border Radius

```css
--radius-sm: 8px   (Small elements)
--radius-md: 12px  (Inputs, buttons)
--radius-lg: 16px  (Cards)
--radius-xl: 24px  (Modals, containers)
```

---

## 📝 Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 
             'Segoe UI', Roboto, sans-serif;
```

### Font Sizes
- **Headings**: 36px (h1), 24px (h2), 20px (h3)
- **Body**: 15px
- **Small**: 14px
- **Tiny**: 13px, 12px

### Font Weights
- **Bold**: 700 (headings)
- **Semibold**: 600 (subheadings)
- **Medium**: 500 (labels)
- **Regular**: 400 (body text)

---

## 🎨 Gradient Patterns

### Primary Gradient
```css
background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
```

### Glass Gradient
```css
background: linear-gradient(135deg, 
    rgba(139, 92, 246, 0.1) 0%, 
    rgba(196, 181, 253, 0.1) 100%);
```

### Status Gradients
```css
/* Success */
linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.2))

/* Error */
linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.2))

/* Warning */
linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.2))
```

---

## 🌟 Special Effects

### Background Patterns
- **Grid Animation**: Moving dot pattern
- **Radial Gradients**: Multiple colored spotlight effects
- **Gradient Shift**: Animated background position

### Shadows
```css
/* Subtle */
box-shadow: 0 2px 8px rgba(139, 92, 246, 0.1);

/* Medium */
box-shadow: 0 8px 24px rgba(139, 92, 246, 0.15);

/* Strong */
box-shadow: 0 12px 32px rgba(139, 92, 246, 0.2);

/* Glow */
box-shadow: 0 0 40px rgba(139, 92, 246, 0.6);
```

### Borders
```css
/* Glass Border */
border: 1px solid rgba(255, 255, 255, 0.1);

/* Accent Border */
border: 1px solid rgba(139, 92, 246, 0.3);

/* Gradient Border */
border-image: linear-gradient(90deg, transparent, 
    rgba(139, 92, 246, 0.5), transparent) 1;
```

---

## 📱 Responsive Design

### Breakpoints
- **Mobile**: max-width: 768px
- **Tablet**: 769px - 1024px
- **Desktop**: 1025px+

### Mobile Optimizations
- Stacked navigation
- Single column grids
- Larger touch targets (44px minimum)
- Simplified animations

---

## ♿ Accessibility

### Focus Indicators
```css
*:focus-visible {
    outline: 2px solid var(--primary-purple);
    outline-offset: 2px;
}
```

### Color Contrast
- Text on dark background: Minimum 4.5:1
- Interactive elements: Minimum 3:1
- Status badges: High contrast with background

### Motion
- Respects `prefers-reduced-motion`
- All animations can be disabled
- Alternative static states available

---

## 🎯 Component Patterns

### Cards
```css
background: var(--glass-bg);
backdrop-filter: blur(20px) saturate(180%);
border: 1px solid var(--glass-border);
border-radius: var(--radius-lg);
padding: 28px;
transition: all var(--transition-base);
```

### Buttons
```css
background: var(--gradient-primary);
padding: 14px 28px;
border-radius: var(--radius-md);
box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3);
```

### Inputs
```css
background: rgba(255, 255, 255, 0.05);
border: 1.5px solid rgba(139, 92, 246, 0.2);
border-radius: var(--radius-md);
padding: 14px 16px;
```

### Status Badges
```css
background: linear-gradient(135deg, rgba(color, 0.2), rgba(color-dark, 0.2));
border: 1px solid rgba(color, 0.3);
border-radius: 20px;
padding: 6px 14px;
backdrop-filter: blur(10px);
```

---

## 🔧 Implementation Tips

### 1. Always Use CSS Variables
```css
color: var(--text-primary);  /* ✅ Good */
color: #FFFFFF;              /* ❌ Avoid */
```

### 2. Use Consistent Timing
```css
transition: all var(--transition-base);  /* ✅ Good */
transition: all 0.3s;                    /* ❌ Avoid */
```

### 3. Layer Backdrop Filters
```css
backdrop-filter: blur(20px) saturate(180%);
-webkit-backdrop-filter: blur(20px) saturate(180%);
```

### 4. Add Smooth Scrolling
```css
scroll-behavior: smooth;
```

### 5. Custom Scrollbars
```css
::-webkit-scrollbar {
    width: 6px;
}
::-webkit-scrollbar-thumb {
    background: var(--primary-purple);
    border-radius: 10px;
}
```

---

## 🎨 Design Tokens

Use these tokens for consistency:

```javascript
const tokens = {
    colors: {
        primary: '#8B5CF6',
        secondary: '#C4B5FD',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
    },
    spacing: {
        xs: '8px',
        sm: '16px',
        md: '24px',
        lg: '32px',
        xl: '48px',
    },
    borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
    },
    shadows: {
        sm: '0 2px 8px rgba(139, 92, 246, 0.1)',
        md: '0 8px 24px rgba(139, 92, 246, 0.15)',
        lg: '0 12px 32px rgba(139, 92, 246, 0.2)',
    }
};
```

---

## 📚 References

- **Apple Human Interface Guidelines**: Design principles
- **Glassmorphism**: UI Trend from 2020+
- **Cubic Bezier**: Natural motion timing
- **Material Design**: Component patterns
- **Tailwind CSS**: Utility-first approach inspiration

---

## 🎬 Animation Library

All animations are in `public/css/animations.css`:
- Float, Shimmer, Ripple, Glow
- Bounce In, Fade In Up, Scale In, Rotate In
- Gradient Shift, Background Shift
- Particles, Breathing, Typing

---

**Version**: 1.0.0  
**Last Updated**: January 2026  
**Design System**: UCAGS Purple Theme v1
