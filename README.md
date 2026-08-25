> **API backend for Almanac.** The active product is the Expo app in
> `../pathfinder-mobile/`. The desktop product UI is removed; this repository
> provides Next.js API routes, Prisma, authentication and domain services.
> Current product authority: [canon](../docs/current/ALMANAC-PRODUCT-CANON.md),
> [Subject History experience](../docs/current/ALMANAC-SUBJECT-HISTORY-EXPERIENCE.md)
> and [memory integrity](../docs/current/ALMANAC-MEMORY-INTEGRITY-SPEC.md).

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result (dev server uses port 3001 by default; port 3000 is often taken on Windows).

API routes live under `src/app/api/`. The small web landing lives in
`src/components/MobileWebLanding.tsx`; do not rebuild the removed desktop
product UI.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

The separate Expo web dogfood at
`https://almanac-mobile-dogfood.vercel.app/almanac` proxies `/api/*` to this
service for browser QA. It is not hosted by this backend project and is not a
desktop product or TestFlight release candidate.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Project docs

| Doc | Purpose |
|-----|---------|
| [Current product canon](../docs/current/ALMANAC-PRODUCT-CANON.md) | Product direction — start here |
| [Subject History experience](../docs/current/ALMANAC-SUBJECT-HISTORY-EXPERIENCE.md) | Current mobile interaction |
| [Memory integrity](../docs/current/ALMANAC-MEMORY-INTEGRITY-SPEC.md) | Ownership, provenance, supersession and undo |
| [GLOSSARY.md](./GLOSSARY.md) / [ONTOLOGY.md](./ONTOLOGY.md) | Legacy persistence vocabulary only |
| [CHANGELOG.md](./CHANGELOG.md) | Dated ship log |
| [DECISIONS.md](./DECISIONS.md) | Historical backend decisions; not current product authority |
| [docs/STABILIZATION.md](./docs/STABILIZATION.md) | Dogfood QA checklist |
| [DESKTOP-ON-HOLD.md](./DESKTOP-ON-HOLD.md) | Record of the removed desktop UI |

## Product boundary

The current canonical model remains `Import + Place + Update`, presented to
people as immutable original responses, **Subjects** and accepted **Updates**.
`Place`, `atlas` and `slot` are temporary persistence/wire names. Do not use
this backend's Goal/Theme/Chapter tables to define the new interface, and do
not add an internal AI call to the first persisted Subject History slice.
