UCAGS WhatsApp Containers - Firefox Extension

This repo includes a companion Firefox extension at:
  firefox-extension/ucags-wa-containers/

For permanent installation, the extension must be signed by Mozilla (AMO). The repository includes a GitHub Actions workflow:
  .github/workflows/firefox-extension-sign.yml

Tag a release like:
  ext-v1.0.0

The workflow will build and sign an unlisted XPI and upload it as a build artifact.

Secrets required in GitHub repo settings:
  AMO_JWT_ISSUER   (AMO API key / JWT issuer)
  AMO_JWT_SECRET   (AMO API secret)

Local build/sign commands (requires Node.js):
  npm run ext:build

Local signing (requires AMO_JWT_ISSUER + AMO_JWT_SECRET env vars):
  # PowerShell
  $env:AMO_JWT_ISSUER='...'
  $env:AMO_JWT_SECRET='...'
  npm run ext:sign

Artifacts output:
  firefox-extension/web-ext-artifacts/

You must first create an AMO developer account and create an unlisted add-on using the same Add-on ID/GUID as in manifest.json:
  ucags-wa-containers@ucags.local
