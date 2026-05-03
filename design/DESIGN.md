---
name: Editorial Noir
colors:
  surface: '#fbf9f9'
  surface-dim: '#dbdad9'
  surface-bright: '#fbf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#e9e8e7'
  surface-container-highest: '#e3e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#4c4546'
  inverse-surface: '#303031'
  inverse-on-surface: '#f2f0f0'
  outline: '#7e7576'
  outline-variant: '#cfc4c5'
  surface-tint: '#5e5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b1b1b'
  on-primary-container: '#848484'
  inverse-primary: '#c6c6c6'
  secondary: '#5d5f5f'
  on-secondary: '#ffffff'
  secondary-container: '#dfe0e0'
  on-secondary-container: '#616363'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b1b1b'
  on-tertiary-container: '#848484'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c6'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c6'
  on-tertiary-fixed: '#1b1b1b'
  on-tertiary-fixed-variant: '#474747'
  background: '#fbf9f9'
  on-background: '#1b1c1c'
  surface-variant: '#e3e2e2'
typography:
  display-xl:
    fontFamily: Epilogue
    fontSize: 80px
    fontWeight: '700'
    lineHeight: '1.0'
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Epilogue
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Epilogue
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: 0em
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.1em
spacing:
  unit: 8px
  container-max: 1280px
  gutter: 32px
  margin: 64px
  stack-sm: 16px
  stack-md: 40px
  stack-lg: 80px
---

## Brand & Style

This design system is defined by a rigorous, high-fashion editorial aesthetic. It targets a culturally sophisticated audience that values clarity, intentionality, and the "urban minimal" spirit found in independent boutique publications. The emotional response is one of quiet authority, intellectual depth, and rhythmic discipline.

The style is a blend of **Minimalism** and **High-Contrast Boldness**. It rejects the softness of typical modern SaaS in favor of sharp transitions, expansive white space, and a strict adherence to a grid. The interface should feel like a digital broadsheet or a physical architecture monograph—permanent, deliberate, and expensive.

## Colors

The palette is strictly monochromatic, relying on the interplay between absolute black and pure white.

- **Primary:** Pure Black (#000000) is used for all primary text, structural borders, and high-impact CTAs.
- **Secondary:** Pure White (#FFFFFF) serves as the primary canvas, creating an "open gallery" feel.
- **Neutral:** Mid-greys are used sparingly only for secondary information or disabled states.

Avoid gradients, transparency, or mid-tone fills. The depth of the interface comes from the density of black elements against the void of the white background.

## Typography

This design system utilizes a high-contrast typographic pairing to achieve an urban editorial look.

**Epilogue** is used for headlines. Its geometric but slightly expressive nature provides the "urban" edge. Large-scale display text should be set with tight tracking to create a "block" of ink effect.

**Inter** is used for body copy and UI labels. It provides a systematic, clean, and unobtrusive reading experience that balances the stylistic weight of the headlines.

The hierarchy relies on dramatic scale shifts. Use `label-caps` for all metadata and small navigational elements to maintain a structured, architectural feel.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy inspired by print journalism. A 12-column grid is utilized with generous margins and gutters to ensure content never feels crowded.

- **Whitespace:** Use whitespace as a functional element, not just a gap. Vertical spacing should be aggressive, utilizing `stack-lg` to separate distinct narrative sections.
- **Alignment:** Strict left-alignment for all text elements. Indentations may be used to signify sub-sections, mirroring a table of contents.
- **Rhythm:** Elements should snap to an 8px baseline grid to ensure typographic alignment across columns.

## Elevation & Depth

This design system rejects shadows and blurs. Depth is communicated through **Bold Borders** and **Layered Planes**.

- **Borders:** Use 1px or 2px solid black strokes to define boundaries.
- **Inversion:** Depth is signaled by inverting the color scheme—black surfaces with white text appear "higher" or more "active" than the white base layer.
- **Structural Lines:** Use horizontal rules (HR) to separate content blocks. These lines should be 1px black, extending to the full width of the container.

## Shapes

The shape language is strictly **Sharp (0)**. There are no rounded corners in this design system.

Every button, input field, and image container must have 0px border-radius. This maintains the brutalist, architectural integrity of the "Noir" aesthetic and reinforces the feeling of a printed page.

## Components

- **Buttons:** Rectangular with 2px black borders. Default state is white background/black text. Hover state is fully inverted (black background/white text). Use `label-caps` for button labels.
- **Inputs:** Simple bottom-border only (2px black) for a minimal look, or a full 1px black box. Placeholder text should be in a light neutral grey.
- **Chips/Tags:** Small rectangular boxes with 1px black borders. No fill.
- **Lists:** Separated by 1px horizontal lines. High contrast between the list item title (Epilogue) and the metadata (Inter).
- **Cards:** No shadows. Defined by a 1px black border or simply by the alignment of content within the grid.
- **Images:** All images should be treated as editorial assets—strictly rectangular, often utilizing black and white photography to maintain the system's visual cohesion.
