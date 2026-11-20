# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub: [Report a vulnerability](https://github.com/jean-melikian/reviewhopper/security/advisories/new) (Security tab, "Report a vulnerability").

Include what you can:

- affected component: browser extension, Xcode relay app (`helpers/xcode/`) or Homebrew cask;
- browser and version, or macOS and Xcode versions;
- steps to reproduce, and what an attacker could achieve.

You should get a first answer within 7 days. Reports in English or French are welcome.

## Supported versions

Only the [latest release](https://github.com/jean-melikian/reviewhopper/releases/latest) receives security fixes.

## Scope

In scope, for example:

- a GitHub page, PR or comment that makes the extension open, copy or send something it shouldn't (path outside the repository, injected link parameters, HTML injection);
- a website or local app that abuses the `reviewhopper-xcode://` link to make the relay app do more than open an existing, non-downloaded file in Xcode;
- the install script or cask deleting or modifying files outside their own app bundle.

Out of scope: issues that require an already compromised machine or browser profile, and behavior of the editors themselves once a file is opened.
