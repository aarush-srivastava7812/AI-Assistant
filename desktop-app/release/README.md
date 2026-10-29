# Windows desktop downloads

Latest local candidate: [0.5.0-preview.4 usage](START-HERE-0.5.0-preview.4.md), [verification](Wayfinder-0.5.0-preview.4-verification.json), [checksum](Wayfinder-0.5.0-preview.4-Windows-x64.exe.sha256). The local EXE includes the connected pet and chat overlay; it has not been published as a release asset.

Local development candidate: [0.5.0-preview.3 usage](START-HERE-0.5.0-preview.3.md), [verification and unresolved failure](Wayfinder-0.5.0-preview.3-verification.json), [checksum](Wayfinder-0.5.0-preview.3-Windows-x64.exe.sha256). The EXE is adjacent locally; it has not been published. The full rebuild remains open.

Download the portable Windows x64 app from [GitHub Releases](https://github.com/aarush-srivastava7812/AI-Assistant/releases).

| Version | App | Integrity and evidence |
| --- | --- | --- |
| 0.4.1 | [Wayfinder Windows x64](https://github.com/aarush-srivastava7812/AI-Assistant/releases/download/v0.4.1/Wayfinder-0.4.1-Windows-x64.exe) | [SHA-256](Wayfinder-0.4.1-Windows-x64.exe.sha256), [verification](Wayfinder-0.4.1-verification.json), [usage](START-HERE-0.4.1.md) |
| 0.4.0 | [Wayfinder Windows x64](https://github.com/aarush-srivastava7812/AI-Assistant/releases/download/v0.4.0/Wayfinder-0.4.0-Windows-x64.exe) | [SHA-256](Wayfinder-0.4.0-Windows-x64.exe.sha256), [verification](Wayfinder-0.4.0-verification.json), [usage](START-HERE-0.4.0.md) |

The executables are distributed as release assets because each exceeds 500 MB. This folder tracks download links, checksums and the original build verification reports. Binary outputs, unpacked runtimes, installed dependencies and private credentials remain excluded from Git.

These unsigned builds require Docker Desktop and the existing managed Hermes/OpenShell environment. Provider connections require the user's own account authorization; credentials are not bundled. Native desktop actions (W37), fitness and scheduling remain unavailable. The verification reports describe the original build checks; publication does not add new native or live-account test coverage.
