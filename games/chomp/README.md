# Chomp

A 13×13 clearing, one herbivore that never stops running, and one T-Rex. You
don't move the dino — you only ever point it, and it takes the next square in
that direction on its own clock. Graze the amber frond for +1 and another
grows somewhere else. Trees cost you a step. Water ends the run. So does the
Rex, which stalks you until it leaves the board entirely and comes back in on
an edge you weren't watching.

Both dinos run on independent clocks that accelerate with your score, and the
Rex accelerates faster — so the gap closes as you get better.

## Dev

```bash
npm run dev      # vite dev server
npm run lint     # oxlint
npm run build    # production bundle into dist/
npx cap sync     # push dist/ into the ios/ and android/ projects
```

Bundle id: `com.simonecislaghi.chomp` (iOS + Android).

## Layout

- `src/Chomp.jsx` — rules, board generation, and the engine
- `src/sprites.jsx` — the cast (dino, Rex, tree, pond, frond, footprint)
- `src/palette.js` — the four accents and what each one is allowed to mean

`src/adIds.js` currently holds Google's **test** AdMob unit IDs. Swap them for
the real ones once Chomp exists in the AdMob console, and add the App IDs to
`android/app/src/main/res/values/strings.xml` and `ios/App/App/Info.plist`.

## Native projects

`android/` and `ios/` are not generated yet:

```bash
npm run build && npx cap add ios && npx cap add android && npx cap sync
```
