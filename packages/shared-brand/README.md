# @ccip-examples/shared-brand

Shared design tokens and brand assets for CCIP SDK examples.

## Purpose

Ensures **consistent design** across all frontend examples by centralizing:

- 🎨 Color palette
- 🖼️ Brand assets (logos, icons)
- 📐 Design tokens (spacing, typography, shadows)
- ♿ Accessibility standards

## Why This Package?

Centralizes design tokens and brand assets for reuse across all frontend examples:

- ✅ Single source of truth for design tokens
- ✅ Reusable color palette and spacing scales
- ✅ Easy to update (change once, applies everywhere)
- ✅ Maintains consistent look and feel across examples

---

## Installation

Already included in the monorepo workspace.

```bash
# Examples automatically have access via workspace:*
{
  "dependencies": {
    "@ccip-examples/shared-brand": "workspace:*"
  }
}
```

---

## Usage

### 1. Import Design Tokens (CSS)

In your example's main entry point (`main.tsx` or `index.tsx`):

```typescript
// Import shared design tokens
import "@ccip-examples/shared-brand/design-tokens.css";

// Then your app's styles
import "./styles/globals.css";
```

**Result:** All design token CSS variables become available.

---

### 2. Use Logo

```tsx
import { BRAND_ASSETS } from "@ccip-examples/shared-brand";

function Header() {
  return (
    <header>
      <img src={BRAND_ASSETS.logo} alt={BRAND_ASSETS.logoAlt} width={40} />
      <h1>My CCIP Example</h1>
    </header>
  );
}
```

**Or directly in your build process:**

```bash
# Vite will copy from node_modules/@ccip-examples/shared-brand/assets/
# Access as: /chainlink-logo.svg
```

---

### 3. Use Brand Colors Programmatically

```typescript
import { CHAINLINK_COLORS } from "@ccip-examples/shared-brand";

// Use in JavaScript/TypeScript
const chartColor = CHAINLINK_COLORS.primary; // "#0847F7"
canvas.fillStyle = CHAINLINK_COLORS.success; // "#217B71"
```

**Or in CSS:**

```css
.my-component {
  background-color: var(--color-primary); /* #0847F7 */
  color: var(--color-white);
}
```

---

### 4. Use Design Tokens

```typescript
import { DESIGN_TOKENS } from "@ccip-examples/shared-brand";

// Access any design token programmatically
const buttonPadding = DESIGN_TOKENS.spacing[4]; // "1rem"
const borderRadius = DESIGN_TOKENS.borderRadius.md; // "0.5rem"
```

---

## Color Palette

Colors used across CCIP examples for consistent design.

### Primary Colors

| Token                   | Hex       | Usage                          |
| ----------------------- | --------- | ------------------------------ |
| `--color-primary`       | `#0847F7` | Buttons, links, brand elements |
| `--color-primary-dark`  | `#0635C4` | Hover states, emphasis         |
| `--color-primary-light` | `#8AA6F9` | Backgrounds, subtle accents    |

### Neutral Colors

| Token           | Hex       | Usage                              |
| --------------- | --------- | ---------------------------------- |
| `--color-dark`  | `#0B101C` | Text, headers                      |
| `--color-light` | `#F8FAFF` | Page background (subtle blue tint) |
| `--color-white` | `#FFFFFF` | Cards, surfaces                    |

### Status Colors

| Token             | Hex       | Usage                         |
| ----------------- | --------- | ----------------------------- |
| `--color-success` | `#217B71` | Success states, confirmations |
| `--color-warning` | `#F7B808` | Warnings, cautions            |
| `--color-error`   | `#E54918` | Errors, destructive actions   |

---

## Architecture

```
packages/shared-brand/
├── assets/
│   └── chainlink-logo.svg       # Logo asset
├── src/
│   ├── design-tokens.css        # CSS variables (all design tokens)
│   └── index.ts                 # TypeScript exports (colors, constants)
├── package.json
├── tsconfig.json
└── README.md                    # This file
```

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend Examples                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Example 01 (CLI)    Example 02 (React)    Example 03       │
│       │                    │                    │           │
│       └────────────────────┴────────────────────┘           │
│                            │                                │
│                            ▼                                │
│              ┌─────────────────────────────┐                │
│              │  @ccip-examples/shared-brand │                │
│              ├─────────────────────────────┤                │
│              │ • Consistent color palette  │                │
│              │ • Logo SVG                  │                │
│              │ • Design tokens (CSS vars)  │                │
│              │ • Consistent spacing/fonts  │                │
│              └─────────────────────────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Example: Using Shared Brand

### Import Design Tokens

```typescript
// examples/my-example/src/main.tsx
import "@ccip-examples/shared-brand/design-tokens.css";
import "./styles/globals.css"; // Your app-specific styles
```

### Use CSS Variables

```css
/* examples/my-example/src/styles/globals.css */
body {
  background-color: var(--color-light);
  color: var(--color-text);
}

.my-button {
  background-color: var(--color-primary);
  padding: var(--spacing-4);
  border-radius: var(--radius-md);
}
```

---

## Benefits

### 1. Brand Consistency ✅

- All examples use consistent colors
- Logos are identical across examples
- Professional, cohesive brand experience

### 2. Maintainability ✅

- Update colors in one place → applies to all examples
- Change logo once → updates everywhere
- Add new brand assets → instantly available

### 3. Developer Experience ✅

- No need to copy/paste color codes
- Autocomplete for design tokens
- TypeScript types for all constants

### 4. Accessibility ✅

- Built-in reduced-motion support
- WCAG-compliant touch targets
- Consistent focus states

---

## Adding New Brand Assets

1. **Add the asset:**

   ```bash
   cp my-icon.svg packages/shared-brand/assets/
   ```

2. **Export in index.ts:**

   ```typescript
   export const BRAND_ASSETS = {
     logo: "/chainlink-logo.svg",
     myIcon: "/my-icon.svg", // ← Add here
   };
   ```

3. **Use in examples:**
   ```tsx
   import { BRAND_ASSETS } from "@ccip-examples/shared-brand";
   <img src={BRAND_ASSETS.myIcon} />;
   ```

---

## Future Examples

When creating a new frontend example:

1. ✅ Add `@ccip-examples/shared-brand` to dependencies
2. ✅ Import `design-tokens.css` in main entry
3. ✅ Use `BRAND_ASSETS` for logos/icons
4. ✅ Use CSS variables for all colors/spacing
5. ✅ No need to define brand colors manually

**Result:** Instant brand consistency! 🎯

---

## See Also

- [CCIP Documentation](https://docs.chain.link/ccip)
- `shared-config` - Network and token configuration
- `shared-utils` - Utility functions
- `shared-brand` - Design tokens and assets (this package)
