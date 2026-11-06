# Before the first real entry

Use PowerShell 7 on Windows. Run the commands from the repository root unless a step says otherwise. Keep the test and work databases separate.

## 1. Prepare a clean local setup

1. Install PostgreSQL, Python 3.13 or newer, uv, and Node.js. Start PostgreSQL on `127.0.0.1`. Put `psql`, `createdb`, `pg_dump`, and `pg_restore` on PATH. Use the PostgreSQL client tools that match your server's major version.
2. Choose an existing local PostgreSQL role with permission to create a database. Set the port and role below. Use a dedicated CMT database. If either database name already exists, pick a new name and use it consistently. Keep the synthetic name starting with `cmt_synthetic`.

   ```powershell
   $pgPort = 5432
   $pgUser = Read-Host 'Local PostgreSQL role'
   $pgArgs = @('--host=127.0.0.1', "--port=$pgPort", "--username=$pgUser")
   createdb @pgArgs --template=template0 cmt_synthetic_rehearsal
   if ($LASTEXITCODE -ne 0) { throw 'Could not create the rehearsal database' }
   createdb @pgArgs --template=template0 cmt_unit_local
   if ($LASTEXITCODE -ne 0) { throw 'Could not create the clean work database' }
   ```

3. In the backend terminal, set a local connection and a fresh app secret. Use separate credentials for the rehearsal and real work. Save the real app secret and admin password in your password manager. The password prompt below requires PowerShell 7.

   ```powershell
   $db = 'cmt_synthetic_rehearsal'
   $dbPassword = Read-Host 'Local PostgreSQL password' -MaskInput
   $urlUser = [uri]::EscapeDataString($pgUser)
   $urlPassword = [uri]::EscapeDataString($dbPassword)
   $env:DATABASE_URL = "postgresql+psycopg2://${urlUser}:${urlPassword}@127.0.0.1:${pgPort}/$db"
   $env:ALLOWED_ORIGINS = 'http://127.0.0.1:3000'
   $env:SECRET_KEY = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
   $env:ADMIN_USERNAME = Read-Host 'Local app admin username'
   $env:ADMIN_EMAIL = Read-Host 'Local app admin email'
   $env:ADMIN_PASSWORD = Read-Host 'Local app admin password' -MaskInput
   Set-Location backend
   uv sync --locked
   if ($LASTEXITCODE -ne 0) { throw 'Backend setup failed' }
   uv run alembic upgrade head
   if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
   uv run alembic current
   uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

4. In a second terminal, start the frontend.

   ```powershell
   Set-Location frontend
   npm ci
   if ($LASTEXITCODE -ne 0) { throw 'Frontend setup failed' }
   $env:NEXT_PUBLIC_API_URL = 'http://127.0.0.1:8000/api/v1'
   $env:NEXT_TELEMETRY_DISABLED = '1'
   npm run dev -- --hostname 127.0.0.1 --port 3000
   ```

5. Open `http://127.0.0.1:3000/login` and sign in with the rehearsal admin. In browser DevTools → Network, confirm API requests go to `127.0.0.1:8000`. In the backend terminal, confirm Alembic reports `2d9f4b8c1a60 (head)` and startup has no migration or seed errors.

## 2. Rehearse a shift with synthetic entries

Use one date throughout. Prefix the party name, order description, and operator code with **SYNTHETIC**. The quantities and rates below are examples for the rehearsal.

| Screen | Action and expected result |
| --- | --- |
| **Parties** | Create a synthetic customer, then open its ledger. Record a synthetic charge and a smaller payment. Check the transaction amounts and the balance against your paper calculation. |
| **Orders** | Create an order for the synthetic party. Set the stitching labour rate to Rs 3.75 and enter a separate customer rate. Move the order through cutting to stitching in progress. |
| **Production → Stitching → Log Session** | Select the order and enter the work date, operator code, 25 good pieces, Rs 3.75 per good piece, and 2 wasted pieces. Save once. Reload and confirm the operator, pieces, rate, and wastage. Use the same operator code on later shifts. |
| **Quality** | Select the order and log a synthetic defect. Check that the defect appears. Record actual scrap in Production. A defect can be repaired, so a Quality entry does not increase CSV wastage. |
| **Reports** | Pick the work date and download the piecework CSV. Check `date`, `pieces=25`, `piece_rate=3.75`, `wages=93.75`, and `wastage=2`. Pick an unused date and confirm the file contains only the headers. |

The CSV has one row per operator session. Wages are good pieces × the rate saved on that session. Wastage counts scrapped pieces. Check that paying on good pieces matches how the unit pays operators before using this for real wages. To calculate direct labour cost per good piece, divide summed wages by summed good pieces for the same department. Leave the result blank if there are zero good pieces. Add material and overhead costs separately if you need total cost. For a garment that passes through stitching and packing, use its final good-piece count once when calculating total cost per garment.

## 3. Back up and restore before using the work database

Keep archives outside the repository in a protected folder. Run these commands with a local PostgreSQL role and stop entry while doing the restore comparison. The restore test creates a new database and leaves it available for inspection.

```powershell
$backupFolder = Read-Host 'Full path to an existing protected backup folder'
$archive = Join-Path $backupFolder ("cmt-synthetic-" + (Get-Date -Format yyyyMMdd-HHmmss) + ".dump")
pwsh -NoProfile -File backend/scripts/test_local_restore.ps1 -SourceDatabase cmt_synthetic_rehearsal -Archive $archive -User $pgUser -Port $pgPort
if ($LASTEXITCODE -ne 0) { throw 'Restore drill failed' }
```

Wait for the PASS message. Use the restored database name from the output to inspect the synthetic sessions and ledger. Keep backup and restore targets separate.

For routine backup and recovery, use these commands. Use a fresh archive name and a fresh database name each time you recover.

```powershell
$source = 'cmt_unit_local'
$archive = Join-Path $backupFolder ("cmt-unit-" + (Get-Date -Format yyyyMMdd-HHmmss) + ".dump")
if (Test-Path -LiteralPath $archive) { throw 'Choose a new archive path' }
pg_dump @pgArgs --dbname=$source --format=custom --file=$archive
if ($LASTEXITCODE -ne 0) { throw 'Backup failed' }
pg_restore --list $archive
if ($LASTEXITCODE -ne 0) { throw 'Archive cannot be read' }

$restore = 'cmt_recovery_' + (Get-Date -Format yyyyMMddHHmmss)
createdb @pgArgs --template=template0 $restore
if ($LASTEXITCODE -ne 0) { throw 'Could not create a fresh restore database' }
pg_restore @pgArgs --dbname=$restore --no-owner --no-privileges --single-transaction --exit-on-error $archive
if ($LASTEXITCODE -ne 0) { throw 'Restore failed' }
psql @pgArgs --dbname=$restore -X -v ON_ERROR_STOP=1 -c 'SELECT version_num FROM alembic_version;'
if ($LASTEXITCODE -ne 0) { throw 'Could not read restored migration revision' }
```

## 4. Switch to the clean work database

1. Stop the backend with Ctrl+C. From the repository root, repeat step 1.3 with `$db = 'cmt_unit_local'` and your real local app settings. Keep the frontend on the same loopback URL. Sign out of the rehearsal login and sign in again.
2. Open Parties, Orders, and Production. Verify that the work database has no synthetic parties or orders. Verify the opening balances against your records before recording transactions.
3. Run the routine backup commands on `cmt_unit_local`. Check the archive and record its location. Make another dated backup at the end of each workday.
4. Create the first real party and order from the original work slip. Confirm the labour rate, work date, and operator code before saving production. Check the first saved session and CSV against the slip, then check the party ledger after the first charge or payment.
