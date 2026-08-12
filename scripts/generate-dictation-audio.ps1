param(
    [string]$BankPath = (Join-Path $PSScriptRoot '..\data\dictation-words.json'),
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\private\dictation-audio')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$items = Get-Content -LiteralPath $BankPath -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $chineseVoice = $synthesizer.GetInstalledVoices() |
        Where-Object { $_.VoiceInfo.Culture.Name -eq 'zh-CN' } |
        Select-Object -First 1
    if (-not $chineseVoice) {
        throw 'No zh-CN speech synthesis voice is installed.'
    }
    $synthesizer.SelectVoice($chineseVoice.VoiceInfo.Name)
    $synthesizer.Rate = -1

    foreach ($item in $items) {
        $id = [string]$item.id
        $word = [string]$item.word
        if ($id -notmatch '^[A-Za-z0-9_-]{1,50}$' -or [string]::IsNullOrWhiteSpace($word)) {
            throw "Invalid dictation item: $id"
        }

        $target = Join-Path $OutputDirectory "$id.wav"
        $synthesizer.SetOutputToWaveFile($target)
        $synthesizer.Speak($word)
        $synthesizer.SetOutputToNull()
    }
} finally {
    $synthesizer.Dispose()
}

Write-Host "Generated $($items.Count) private dictation audio prompts in $OutputDirectory"
