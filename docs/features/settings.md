# Settings and analytics organization (0.2.0)

The dashboard now separates analytics from configuration. The top header
contains product identity and refresh progress. The compact Analysis scope
strip below navigation holds the selected project, repository, date range
and display metric; these are analytical filters rather than persistent settings.

The dedicated **Settings** tab holds:
- Project and repository creation, GitHub import, and confirmed deletion
- **Data synchronization**, with three scoped actions:
  - **Sync repositories:** explicitly fetch Git and rebuild repository inventories, without reindexing the annual scores
  - **Sync local metrics:** reindex annual evidence for all repositories using cached Git mirrors, without network access
  - **Sync repositories + metrics:** fetch Git and index annual evidence in the same operation
- A single progress indicator for these jobs; active and previously opened analytics views refresh automatically after a successful or partially failed run
- Appearance: light, dark or operating-system mode
- Saved branch views and folder filters
- User-defined custom tags and their assignments
- Manual Git author identity links and on-demand GitHub PR/review snapshot synchronization
- Local read-only agent CLI: sample commands, active database path, and
  GG_DATA_DIR override guidance

The first-run empty-project screen retains Create project for onboarding.
**Compare** defaults to an executive cohort ranking with per-metric positions,
with the earlier full evidence comparison under **Detailed evidence**.
Annual contribution retains analysis and export controls. The former
**Index local history** buttons in those views now live in Settings, to
avoid fragmented synchronization entry points.

The organization borrows the separation-of-concerns principle from
developer tools such as PandaCode without copying code or assets.
