# Cornucopia — Food Finder

An Expo (React Native) app to find nearby food assistance using OpenStreetMap, with extras like walkability scoring, favorites, and events.

## Environment variables

Create a `.env` (or use EAS secrets) with:

- EXPO_PUBLIC_SUPABASE_URL
- EXPO_PUBLIC_SUPABASE_ANON_KEY
- EXPO_PUBLIC_GOOGLE_PLACES_API_KEY (optional; used by utils/places-api.ts)

Notes:
- Supabase is initialized in `lib/supabase.ts` using EXPO_PUBLIC_ vars.

## Development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npx expo start
# or
npm run start
```

Open the app:
- iOS simulator: press i
- Android emulator: press a
- Web: npm run web

Run native projects:

```bash
npm run ios
npm run android
```

## Project structure

- app/ — Expo Router routes (screens, stacks, tabs)
- app/(tabs)/ — Bottom tab screens (Home, Map, Events, Eligibility, Favorites)
- app/option/[id].tsx — Location description/details page
- app/walkability.tsx — Food Walkability explanation
- components/ — Themed primitives and UI
- constants/ — Theme, rules, assets config
- lib/ — Supabase client setup
- utils/ — OSM API, navigation helpers, distance, cache
- ios/ and android/ — Native projects (generated/managed by Expo)

## Scripts

- start: expo start
- ios: expo run:ios
- android: expo run:android
- web: expo start --web
- reset-project: node ./scripts/reset-project.js
- lint: expo lint

## Deployment

Using EAS:
```bash
npm install -g eas-cli
eas login
eas build -p ios   # or -p android
eas submit -p ios  # or -p android
```

Notes:
- Location permission strings are configured in app.json (iOS and Android).
- App icons and splash are configured in app.json and ios asset catalogs.

## License

MIT

## Authors

Made by Alex Lautin, Andy Blumberg, and Jake Floch
