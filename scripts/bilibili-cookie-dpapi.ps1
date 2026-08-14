[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Protect', 'Unprotect', 'ProtectFile', 'Verify', 'LockAcl')]
    [string]$Mode,
    [string]$Path,
    [string]$InputPath,
    [string]$OutputPath,
    [switch]$RemoveSource
)

$ErrorActionPreference = 'Stop'
$Header = "MGS-DPAPI-V1`n"
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false, $true)
$MaxBytes = 2MB
$MaxProtectedBytes = 3MB
Add-Type -AssemblyName System.Security

function Protect-Bytes([byte[]]$Bytes) {
    return [System.Security.Cryptography.ProtectedData]::Protect(
        $Bytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
}

function Unprotect-Bytes([byte[]]$Bytes) {
    return [System.Security.Cryptography.ProtectedData]::Unprotect(
        $Bytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
}

function Read-ProtectedFile([string]$FilePath) {
    $info = Get-Item -LiteralPath $FilePath
    if ($info.PSIsContainer -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Cookie path must be a regular file'
    }
    if ($info.Length -eq 0 -or $info.Length -gt $MaxProtectedBytes) {
        throw 'Protected cookie file is empty or too large'
    }
    $raw = [System.IO.File]::ReadAllText($FilePath, $Utf8NoBom)
    if (-not $raw.StartsWith($Header)) {
        throw 'Cookie file does not use the MGS DPAPI format'
    }
    $encoded = $raw.Substring($Header.Length).Trim()
    if (-not $encoded) {
        throw 'DPAPI payload is empty'
    }
    $plain = Unprotect-Bytes ([Convert]::FromBase64String($encoded))
    if ($plain.Length -eq 0 -or $plain.Length -gt $MaxBytes) {
        throw 'Decrypted cookie payload is empty or too large'
    }
    return $plain
}

function Test-RequiredCookieFields([string]$Text) {
    return $Text -match '(?m)(?:^|[\t ])SESSDATA[\t ]' -and
        $Text -match '(?m)(?:^|[\t ])bili_jct[\t ]'
}

function Set-PrivateAcl([string]$TargetPath) {
    $resolved = [System.IO.Path]::GetFullPath($TargetPath)
    $directory = if ([System.IO.Directory]::Exists($resolved)) {
        $resolved
    } else {
        [System.IO.Path]::GetDirectoryName($resolved)
    }
    if (-not [System.IO.Directory]::Exists($directory)) {
        [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    }
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    foreach ($item in @($directory, $resolved)) {
        if (-not [System.IO.Directory]::Exists($item) -and -not [System.IO.File]::Exists($item)) {
            continue
        }
        $acl = Get-Acl -LiteralPath $item
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($rule in @($acl.Access)) {
            $acl.RemoveAccessRuleSpecific($rule)
        }
        $inheritance = if ([System.IO.Directory]::Exists($item)) {
            [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
        } else {
            [System.Security.AccessControl.InheritanceFlags]::None
        }
        foreach ($account in @($identity, 'NT AUTHORITY\SYSTEM')) {
            $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
                $account,
                [System.Security.AccessControl.FileSystemRights]::FullControl,
                $inheritance,
                [System.Security.AccessControl.PropagationFlags]::None,
                [System.Security.AccessControl.AccessControlType]::Allow
            )
            $acl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $item -AclObject $acl
    }
}

switch ($Mode) {
    'Protect' {
        $plain = [Console]::In.ReadToEnd()
        $bytes = $Utf8NoBom.GetBytes($plain)
        if ($bytes.Length -eq 0 -or $bytes.Length -gt $MaxBytes) {
            throw 'Cookie payload is empty or too large'
        }
        [Console]::Out.Write([Convert]::ToBase64String((Protect-Bytes $bytes)))
    }
    'Unprotect' {
        $encoded = [Console]::In.ReadToEnd().Trim()
        $plain = Unprotect-Bytes ([Convert]::FromBase64String($encoded))
        [Console]::Out.Write($Utf8NoBom.GetString($plain))
    }
    'ProtectFile' {
        if (-not $InputPath -or -not $OutputPath) {
            throw 'ProtectFile requires InputPath and OutputPath'
        }
        $source = [System.IO.Path]::GetFullPath($InputPath)
        $destination = [System.IO.Path]::GetFullPath($OutputPath)
        if ($source -eq $destination) {
            throw 'InputPath and OutputPath must differ'
        }
        $sourceInfo = Get-Item -LiteralPath $source
        if ($sourceInfo.PSIsContainer -or ($sourceInfo.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Cookie source must be a regular file'
        }
        $plain = [System.IO.File]::ReadAllBytes($source)
        if ($plain.Length -eq 0 -or $plain.Length -gt $MaxBytes) {
            throw 'Cookie source is empty or too large'
        }
        $text = $Utf8NoBom.GetString($plain)
        if (-not (Test-RequiredCookieFields $text)) {
            throw 'Cookie source is missing required fields'
        }
        $directory = [System.IO.Path]::GetDirectoryName($destination)
        [System.IO.Directory]::CreateDirectory($directory) | Out-Null
        $temporary = Join-Path $directory ('.' + [System.IO.Path]::GetFileName($destination) + '.' + [Guid]::NewGuid().ToString('N') + '.tmp')
        try {
            $payload = $Header + [Convert]::ToBase64String((Protect-Bytes $plain))
            [System.IO.File]::WriteAllText($temporary, $payload, $Utf8NoBom)
            if ([System.IO.File]::Exists($destination)) {
                [System.IO.File]::Replace($temporary, $destination, $null, $true)
            } else {
                [System.IO.File]::Move($temporary, $destination)
            }
            Set-PrivateAcl $destination
            $verified = Read-ProtectedFile $destination
            $sha256 = [System.Security.Cryptography.SHA256]::Create()
            try {
                $expectedHash = [Convert]::ToBase64String($sha256.ComputeHash($plain))
                $actualHash = [Convert]::ToBase64String($sha256.ComputeHash($verified))
            } finally {
                $sha256.Dispose()
            }
            if ($expectedHash -ne $actualHash) {
                throw 'DPAPI round-trip verification failed'
            }
            if ($RemoveSource) {
                [System.IO.File]::Delete($source)
            }
            Write-Output 'protected'
        } finally {
            if ([System.IO.File]::Exists($temporary)) {
                [System.IO.File]::Delete($temporary)
            }
        }
    }
    'Verify' {
        if (-not $Path) { throw 'Verify requires Path' }
        $plain = Read-ProtectedFile $Path
        $text = $Utf8NoBom.GetString($plain)
        if (-not (Test-RequiredCookieFields $text)) {
            throw 'Protected cookie is missing required fields'
        }
        Write-Output 'valid'
    }
    'LockAcl' {
        if (-not $Path) { throw 'LockAcl requires Path' }
        Set-PrivateAcl $Path
        Write-Output 'locked'
    }
}
