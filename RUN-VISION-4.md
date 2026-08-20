# Voice Nation CRM — VISION 4.0

This build contains the visible VISION 4.0 command-center UI plus the role workflow already present in the CRM.

## Start on Windows PowerShell

From the folder containing `server.js` and `package.json`:

```powershell
npm.cmd install
node server.js
```

The server listens on **http://localhost:5000**.

Open exactly:

http://localhost:5000

Do not use a placeholder path such as `C:\path\to\...`.

If PowerShell blocks `npm`, use `npm.cmd` as above.

## Important
- Keep the existing `database.sqlite` to preserve CRM data.
- If an older CRM server is already running, stop it first (`Ctrl+C`).
- Hard refresh the browser with `Ctrl+F5` after starting this build.
- The page title is `Voice Nation CRM • VISION 4.0 Operations Control Center`, so this build is easy to verify.
