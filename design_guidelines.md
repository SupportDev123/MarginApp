# Margin - Design Guidelines

## Design Philosophy
**Theme:** Exciting vibrant teal-green theme with light/dark mode support
**Goal:** Make users want to scan "just one more item" - fast, decisive, rewarding
**Features:** Glow effects, pulse animations, micro-interactions for excitement

## Color System

### Primary Palette
- **Background (Dark):** Near-black with cool tint - creates focus
- **Background (Light):** Clean white - bright and professional
- **Foreground:** High contrast text for readability
- **Primary/Accent:** Vibrant teal-green (#14b8a6) - exciting, energetic
- **Card Surface:** Subtle elevation from background

### Result Colors (Instantly Recognizable)
| Result | Color | Hex | Tailwind | Usage |
|--------|-------|-----|----------|-------|
| FLIP | Teal-Green | #14b8a6 | teal-500 | Profitable - exciting profit signal |
| SKIP | Red | #ef4444 | red-500 | Loss - avoid signal |
| RISKY | Amber | #f59e0b | amber-500 | Caution - proceed carefully |
| HOLD | Gray | #737373 | neutral-500 | Insufficient data |

### CSS Classes for Results
```css
.result-flip-badge    /* Teal badge with glow effect */
.result-skip-badge    /* Red badge */
.result-risky-badge   /* Amber badge */
.result-hold-badge    /* Gray badge */
.result-flip-bg       /* Teal gradient background */
.result-flip-glow     /* Teal glow shadow */
```

### Theme Toggle
Users can switch between light and dark modes via the bottom navigation.

## Typography

### Font Stack
- **Primary:** Inter (400, 500, 600, 700)
- **Display:** Space Grotesk (500, 700) - for hero numbers

### Hierarchy
- **Hero Numbers (Flip Score):** text-4xl to text-5xl, font-bold, with text shadow
- **Section Headers:** text-lg, font-semibold
- **Body Text:** text-base, font-normal
- **Labels:** text-sm, font-medium, text-muted-foreground
- **Metadata:** text-xs

### Contrast Rules
- Primary text: white on dark (#fafafa)
- Secondary text: 70% white - visible but not competing
- Muted text: 65% white - for metadata only

## Spacing

### Compact Mobile-First
- **Card padding:** p-3 to p-4 (tighter than typical)
- **Section gaps:** gap-3
- **Component margins:** mb-3
- **Container padding:** px-4

### Rhythm
Use 2, 3, 4, 6 for tight, efficient layouts that feel decisive.

## Micro-Interactions

### Button Press Feedback
```css
.btn-press:active { transform: scale(0.97); }
.btn-primary-glow { box-shadow: 0 4px 14px hsl(217 91% 60% / 0.4); }
```

### Result Celebrations
- FLIP results get subtle pulse-glow animation
- Score numbers have text-shadow emphasis
- Cards lift on hover (desktop)

### Transitions
- All transitions: 0.15s to 0.2s ease
- Transform on tap: 0.1s ease
- Stagger list animations: 50ms delay between items

## Component Patterns

### Result Cards
- Use gradient backgrounds matching result type
- Border color reflects result (subtle, 35% opacity)
- FLIP cards get glow effect on the score

### Primary Action Buttons
```jsx
<Button className="btn-primary-glow btn-press text-white font-semibold">
  Analyze Item
</Button>
```

### Score Display
```jsx
<span className={`text-4xl font-bold ${
  score >= 70 ? 'score-flip' :
  score >= 50 ? 'score-risky' :
  'score-skip'
}`}>
  {score}
</span>
```

### Verdict Badges
```jsx
<Badge className={`${
  verdict === 'flip' ? 'result-flip-badge' :
  verdict === 'skip' ? 'result-skip-badge' :
  verdict === 'risky' ? 'result-risky-badge' :
  'result-hold-badge'
} font-semibold uppercase tracking-wide`}>
  {verdict}
</Badge>
```

## Animation Guidelines

### Do
- Subtle pulse on FLIP results (celebratory)
- Quick tap feedback (0.1s scale)
- Smooth page transitions (0.2s fade/slide)
- Staggered list reveals

### Don't
- Long loading animations
- Bouncy/springy effects
- Animations longer than 0.3s for interactions
- Animations that block user actions

## Accessibility

### Contrast Ratios
- Text on background: 12:1+
- Muted text: 4.5:1 minimum
- Result colors: All pass WCAG AA against dark backgrounds

### Focus States
- Use ring-2 with primary color
- .focus-glow class for enhanced visibility

## Mobile Optimization

### Touch Targets
- Minimum 44px height for interactive elements
- Generous padding on buttons

### Performance
- Prefer CSS animations over JS
- Use will-change sparingly
- Limit glows/shadows on mobile if laggy

## Example Usage

### Flip Result Card
```jsx
<Card className="result-flip-bg result-flip-glow border">
  <div className="flex justify-between items-center">
    <span className="text-4xl font-bold score-flip">{score}</span>
    <Badge className="result-flip-badge">FLIP</Badge>
  </div>
  <div className="profit-positive text-2xl">+${profit}</div>
</Card>
```

### Skip Result Card
```jsx
<Card className="result-skip-bg border">
  <div className="flex justify-between items-center">
    <span className="text-4xl font-bold score-skip">{score}</span>
    <Badge className="result-skip-badge">SKIP</Badge>
  </div>
  <div className="profit-negative text-2xl">-${loss}</div>
</Card>
```
