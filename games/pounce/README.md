# Pounce

Turn-based predator-prey chase on a 5×5 or 7×7 board. You slide in any
direction; every enemy piece slides along its own fixed set of directions,
which its silhouette spells out — a Slider is a horizontal double-arrow, a
Blade is an X, a Star is an eight-point burst. Capture pieces to buy time.
Every move you make, the nearest hunter takes one back, telegraphed a beat
before it slides. Let one land on you and the round is over.

## Dev

```bash
npm run dev      # vite dev server
npm run lint     # oxlint
npm run build    # production bundle into dist/
npx cap sync     # push dist/ into the ios/ and android/ projects
```

Bundle id: `com.simonecislaghi.pounce` (iOS + Android).
