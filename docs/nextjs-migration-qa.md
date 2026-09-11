# Next.js migration QA

## Automated checks

- `npm run build` — production build + type validation
- `npm run qa` — full browser QA
- `npm run qa:multi` — multi-user QA
- `npm run qa:visual` — visual/layout guardian
- `npm run qa:all` — aggregate command running the complete suite

## Visual Guardian

The guardian checks desktop, tablet and mobile layouts for clipping, overflow, tiny controls, fixed-element collisions and JavaScript/runtime errors.

## Current architecture

The frontend is Next.js + TypeScript + Tailwind CSS. The realtime backend remains the existing WebSocket service.
