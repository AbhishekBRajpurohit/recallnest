# Validation

The source was taken from the uploaded complete project snapshot. The app implementation is unchanged; packaging and documentation were simplified.

- The complete project passes its Node test suite.
- The filename-based commit sequence is checked in a fresh temporary Git repository: every source file is selected once, no additional files are included, and the final tracked tree matches this package.
- Backend starts with only files from commits 1–6. Frontend entry points are added at commit 9. The committed test suite is available from commit 11.
- Commits 1–5 intentionally assemble configuration and backend modules; they are not complete runnable applications. Commits 7–8 add browser modules before the full workspace is wired in commit 9.
- Because the extracted working folder contains all files from the start, running the app there uses the full source even before every file has been committed. Use a clean checkout to test what a particular commit actually contains.
- Real-browser service-worker reload and extension clicks remain manual checks. AI and email tests use mocks; real model inference and delivery require your own setup. No real email was sent.
