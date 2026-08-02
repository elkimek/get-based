# Google Health OAuth scope justification

Google Cloud field: **How will the scopes be used?**

Character count: **970**, including spaces.

```text
After the user clicks Connect Google Health and accepts an in-app disclosure, activity_and_fitness.readonly reads steps and VO2 max for getbased activity cards, history, baselines and trends. health_metrics_and_measurements.readonly reads heart rate, resting heart rate, HRV, weight, body fat, SpO2, respiratory rate and temperature for Body/recovery cards and trends. sleep.readonly reads sleep duration, stages and awake time for Sleep cards and trends. Without each scope, its implemented dashboard features cannot import that data category; Google offers no narrower read-only scopes for these data types. No write or unrelated permissions are requested; partial grants are supported. The deployment's proxy relays HTTPS API requests without intentional storage. Tokens and rows are AES-256-GCM encrypted in the browser; raw rows are not synced or backed up. Disconnect deletes local credentials and data; account-wide revocation is available through Google Account.
```
