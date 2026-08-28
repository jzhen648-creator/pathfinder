# Almanac API — deployment checklist

The exact current deployment identity is owned by
[`../ALMANAC-CURRENT-STATE.md`](../ALMANAC-CURRENT-STATE.md). This file defines
the procedure only. It must not duplicate a “current” commit or deployment ID.

The Vercel project and hostname still use legacy Pathfinder names. Do not rename
them during an API deploy.

## Before any production deploy

1. Identify the exact API branch, commit, upstream and working-tree state.
2. Confirm that the commit is pushed and that the workspace will record the
   intended API dependency.
3. Review the exact diff. Do not deploy from an unidentified dirty tree.
4. Confirm the change does not revive retired Goals, Atlas, Insights, Timeline,
   internal-AI or provider-integration runtime.
5. If a Prisma migration is involved:
   - apply every migration from empty state to a disposable PostgreSQL database;
   - run the relevant integration suite with none skipped;
   - review ownership, RLS and rollback implications;
   - obtain separate founder approval before touching production.
6. Run:

   ```powershell
   npm ci --dry-run
   npx tsc --noEmit
   npm run lint
   npm test
   npm run build
   ```

7. Verify production environment variables in Vercel without copying secrets
   into chat or documentation. Database URLs, auth secrets and email credentials
   must belong to the intended production project.

## Deployment

1. Create and inspect a preview deployment when the change affects production
   runtime.
2. Verify `/api/health`, `/privacy`, authentication failure boundaries and
   the changed route against preview.
3. Promote or deploy to production only after explicit founder approval.
4. Confirm the resulting deployment is Ready, Production and Current.
5. Confirm its source commit exactly matches the approved API commit.
6. Run the non-destructive production verification:

   ```powershell
   npm run verify:prod
   ```

7. Run an authenticated write only when it is part of the approved smoke scope,
   using a disposable account and a reversible operation.

## After deployment

Update root `ALMANAC-CURRENT-STATE.md` in the same reviewed release change with:

- API repository, branch and commit;
- Vercel deployment ID and state;
- verification time and limits;
- matching workspace dependency pointer;
- tests and smoke evidence.

Do not infer deployment success from a Git push, Vercel build log or HTTP 200
alone. Record the exact source commit and current production assignment.
