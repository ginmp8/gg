# Settings and analytics organization (0.2.0)

The dashboard now separates analytics from configuration. The top header
contains product identity and refresh progress. The compact Analysis scope
strip below navigation holds the selected project, repository, date range
and display metric; these are analytical filters rather than persistent settings.

The dedicated **Settings** tab holds:
- Project and repository creation, GitHub import, refresh and confirmed deletion
- Appearance: light, dark or operating-system mode
- Saved branch views and folder filters
- User-defined custom tags and their assignments
- Manual Git author identity links and on-demand GitHub PR/review snapshot synchronization
- Local read-only agent CLI: sample commands, active database path, and
  GITA_DATA_DIR override guidance

The first-run empty-project screen retains Create project for onboarding.
**Compare** keeps selection and tag filters next to its side-by-side
results. Annual contribution retains analysis/export controls.

The organization borrows the separation-of-concerns principle from
developer tools such as PandaCode without copying code or assets.
