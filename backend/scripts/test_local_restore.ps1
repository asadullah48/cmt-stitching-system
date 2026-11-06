param(
    [Parameter(Mandatory)][ValidatePattern('^cmt_synthetic[a-z0-9_]*$')][string]$SourceDatabase,
    [Parameter(Mandatory)][string]$Archive,
    [Parameter(Mandatory)][string]$User,
    [ValidateRange(1, 65535)][int]$Port = 5432
)

$ErrorActionPreference = 'Stop'
$connection = @('--host=127.0.0.1', "--port=$Port", "--username=$User")
$restoreDatabase = 'cmt_restore_' + [guid]::NewGuid().ToString('N')
if (Test-Path -LiteralPath $Archive) { throw 'Choose a new archive path.' }

function Read-DatabaseSnapshot([string]$Database) {
    $query = @'
SELECT version_num FROM alembic_version ORDER BY version_num;
SELECT row_to_json(t) FROM cmt_orders AS t ORDER BY id;
SELECT row_to_json(t) FROM cmt_production_sessions AS t ORDER BY id;
SELECT row_to_json(t) FROM cmt_parties AS t ORDER BY id;
SELECT row_to_json(t) FROM cmt_financial_transactions AS t ORDER BY id;
'@
    $snapshot = & psql @connection --dbname=$Database -X -A -t -v ON_ERROR_STOP=1 -c $query
    if ($LASTEXITCODE -ne 0) { throw "Snapshot query failed for $Database." }
    return ($snapshot -join [Environment]::NewLine)
}

$pieceworkCount = & psql @connection --dbname=$SourceDatabase -X -A -t -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM cmt_production_sessions WHERE operator_name IS NOT NULL AND NOT is_deleted;'
if ($LASTEXITCODE -ne 0 -or [int]$pieceworkCount -lt 1) { throw 'Seed at least one synthetic piecework session first.' }

$before = Read-DatabaseSnapshot $SourceDatabase
& pg_dump @connection --dbname=$SourceDatabase --format=custom --file=$Archive
if ($LASTEXITCODE -ne 0) { throw 'Backup failed.' }
& createdb @connection --template=template0 $restoreDatabase
if ($LASTEXITCODE -ne 0) { throw 'Could not create a fresh restore database.' }
& pg_restore @connection --dbname=$restoreDatabase --no-owner --no-privileges --single-transaction --exit-on-error $Archive
if ($LASTEXITCODE -ne 0) { throw "Restore failed for $restoreDatabase." }

$after = Read-DatabaseSnapshot $restoreDatabase
if ($before -cne $after) { throw "Restored data differs in $restoreDatabase." }
Write-Output "PASS: migration revision, orders, sessions, parties and transactions match in fresh database $restoreDatabase."
