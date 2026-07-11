# Annual holiday refresh (every December)

`date-holidays` is rule-based and computes any future year offline, but its data
is only as current as the installed package version. Future dates won't reflect
later law changes or one-off holidays (jubilees, state funerals, a moved bank
holiday). Do this once a year, each December, before the new year rolls in.

## Steps

1. **Bump the package to the latest version:**
   ```bash
   npm install date-holidays@latest
   ```
2. **Verify nothing broke:**
   ```bash
   npm run typecheck && npm run lint && npm test
   ```
   The catalog unit tests (`tests/unit/holidays/catalog.test.ts`) assert the API
   shape and a few known holidays — if an upstream change breaks them, fix before
   shipping.
3. **Ship it** (normal PR → `main` → deploy). The migration story is unchanged;
   no DB work.
4. **Pull next year into each workspace:** Settings → Holidays → "Import public
   holidays" → the country/region is pre-filled from last time → pick next year →
   Preview → Import. Existing dates are skipped automatically, so re-importing is
   safe; only genuinely new/changed dates land. Repeat per workspace/tenant.

## Notes

- The importer never overwrites a manually-entered holiday on a colliding date
  (skip-on-collision). If a date *moved* (e.g. a substitute bank holiday), the new
  date imports as a new entry; delete the stale one by hand if needed.
- Default import set is public + bank holidays. The "Include observances &
  optional days" toggle widens it to observance/optional/school types.
- Third-level regions (`getRegions`) are not exposed in the v1 importer — only
  country + subdivision (state/nation: e.g. England vs Scotland, US states, AU
  states). Revisit if a tenant needs sub-state granularity.
- Holiday data is CC BY-SA 3.0 (Wikipedia-derived, via the date-holidays
  project). Attribution lives in the importer UI and the README Credits section.
