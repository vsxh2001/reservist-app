# send-push Edge Function

VAPID-signed Web Push fan-out for the reservist app.

## What it does

Invoked from the React client via `supabase.functions.invoke('send-push', { body })`:

1. Verifies the caller's JWT.
2. Resolves the caller's `members` row.
3. If `member_ids` targets anyone other than the caller, requires the caller to be a `commander` of the supplied `team_id`. Recipients are further constrained to actual members of that team.
4. Loads every `push_subscriptions` row for the recipients and POSTs a VAPID-signed Web Push to each endpoint.
5. Deletes subscriptions that the push service rejects with 404/410 so we stop retrying dead endpoints.

## Payload

```ts
{
  member_ids: string[];   // required
  team_id?: string;       // required when fanning out beyond self
  title: string;          // required
  body: string;           // required
  url?: string;           // SW navigates here on click (default '/')
  tag?: string;           // collapses repeated notifications on device
}
```

## Local dev

1. Generate VAPID keys once (already done; values live in `supabase/.env` and `web/.env`):
   ```bash
   npx web-push generate-vapid-keys --json
   ```
2. Serve the function locally against your running supabase stack:
   ```bash
   supabase functions serve send-push --env-file ./supabase/.env --no-verify-jwt=false
   ```
3. The web client picks the function up automatically through `supabase.functions.invoke`.

## Production deploy

```bash
# 1. Push the function to your hosted Supabase project.
supabase functions deploy send-push

# 2. Set VAPID env vars in the hosted project (one-time).
supabase secrets set \
  VAPID_PUBLIC_KEY=<public> \
  VAPID_PRIVATE_KEY=<private> \
  VAPID_SUBJECT=mailto:you@example.com
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the runtime automatically — do not set them yourself.

## Wiring

Client triggers live in `web/src/lib/notify.ts`. Mutations in `web/src/lib/queries.ts` call them fire-and-forget after the underlying DB write:

- `useCreateSlot` — urgent → `notifyUrgentCallUp` to whole team; non-urgent with assignee → `notifySlotAssigned`.
- `useAssignToSlot` → `notifySlotAssigned` to the new assignee.

Pick approve/reject and other surfaces can adopt the same helpers later — `notifyPickDecided` already exists for that.
