# Windows desktop downloads

All six versioned Windows x64 executables are available through [GitHub Releases](https://github.com/aarush-srivastava7812/AI-Assistant/releases).

The newest preview, **0.5.0-preview.4**, includes the connected desktop pet and chat widget. Versions 0.5.0 are marked prerelease; 0.4.1 and 0.4.0 retain their existing release status.

| Version | Executable | Integrity and evidence |
| --- | --- | --- |
| 0.5.0-preview.4 | [Windows x64 EXE](https://github.com/aarush-srivastava7812/AI-Assistant/releases/download/v0.5.0-preview.4/Wayfinder-0.5.0-preview.4-Windows-x64.exe) | [SHA-256](Wayfinder-0.5.0-preview.4-Windows-x64.exe.sha256), [verification](Wayfinder-0.5.0-preview.4-verification.json), [usage](START-HERE-0.5.0-preview.4.md) |
| 0.5.0-preview.3 | [Windows x64 EXE](https://github.com/aarush-srivastava7812/AI-Assistant/releases/download/v0.5.0-preview.3/Wayfinder-0.5.0-preview.3-Windows-x64.exe) | [SHA-256](Wayfinder-0.5.0-preview.3-Windows-x64.exe.sha256), [verification](Wayfinder-0.5.0-preview.3-verification.json), [usage](START-HERE-0.5.0-preview.3.md) |
| 0.5.0-preview.2 | [Windows x64 EXE](https://github.com/aarush-srivastava7812/AI-Assistant/releases/download/v0.5.0-preview.2/Wayfinder-0.5.0-preview.2-Windows-x64.exe) | [SHA-256](Wayfinder-0.5.0-preview.2-Windows-x64.exe.sha256), [verification](Wayfinder-0.5.0-preview.2-verification.json), [usage](START-HERE-0.5.0-preview.2.md) |
| 0.5.0-preview.1 | [Windows x64 EXE](https://github.com/aarush-srivastava7812/AI-Assistant/releases/download/v0.5.0-preview.1/Wayfinder-0.5.0-preview.1-Windows-x64.exe) | [SHA-256](Wayfinder-0.5.0-preview.1-Windows-x64.exe.sha256), [verification](Wayfinder-0.5.0-preview.1-verification.json), [usage](START-HERE-0.5.0-preview.1.md) |
| 0.4.1 | [Windows x64 EXE](https://github.com/aarush-srivastava7812/AI-Assistant/releases/download/v0.4.1/Wayfinder-0.4.1-Windows-x64.exe) | [SHA-256](Wayfinder-0.4.1-Windows-x64.exe.sha256), [verification](Wayfinder-0.4.1-verification.json), [usage](START-HERE-0.4.1.md) |
| 0.4.0 | [Windows x64 EXE](https://github.com/aarush-srivastava7812/AI-Assistant/releases/download/v0.4.0/Wayfinder-0.4.0-Windows-x64.exe) | [SHA-256](Wayfinder-0.4.0-Windows-x64.exe.sha256), [verification](Wayfinder-0.4.0-verification.json), [usage](START-HERE-0.4.0.md) |

The binaries are release assets rather than Git source files. All uploaded assets were verified against their local SHA-256 hashes; [publication evidence](../../docs/platform/DESKTOP-RELEASES.json) records each URL, size and digest. Original verification reports describe their respective builds; publication does not add test coverage.

These unsigned executables bundle Python, the backend and CPU memory model. Docker Desktop with a local Linux engine and the existing managed Hermes/OpenShell installation remain prerequisites. Provider credentials are not bundled. The full rebuild and the graph-lease qualification issue recorded for previews 3/4 remain open.
