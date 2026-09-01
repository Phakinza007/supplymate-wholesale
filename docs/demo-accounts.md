# SupplyMate demo access

SupplyMate Wholesale is a self-initiated concept demo created to showcase a realistic Thai
B2B wholesale purchasing workflow.

Demo credentials will be provisioned separately for each environment and are never committed to
this repository. Buyer and admin verification roles are required for a future hosted smoke test;
access must be requested from the project owner after the environment exists.

The demo is deployed on Vercel at `https://supplymate-wholesale.vercel.app`, running the real
Supabase-backed app against a hosted Supabase project. Supabase Auth must allow
`https://supplymate-wholesale.vercel.app` as a redirect before sign-in is tested.

The password-recovery callback is `https://supplymate-wholesale.vercel.app/reset-password` — a
real path, not a hash route, because outside a GitHub Pages build the app mounts `BrowserRouter`
and `vercel.json`'s rewrite serves that path. The hash-fragment handling in
`src/lib/githubPagesAuth.ts` only applies to a `VITE_DEPLOY_TARGET=github-pages` build, which
nothing produces any more.

No buyer, admin, Supabase, or payment credentials are published here.
