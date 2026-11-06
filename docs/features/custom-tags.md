# Custom tags (GG Analytics 0.2.0)

Every tag name and optional group is created by the user; no predefined
roles, teams or other categories are seeded.

## Search and assign several targets

Open Settings → Custom tags. Choose or create a tag, select the entity
type (Contributor, Repository, Branch or Pull request), then open
**Search and select multiple targets**. Search by name/email/identifier
directly *inside* the picker, check multiple results, and close with Done.
Selections remain visible as removable chips even when search results
change. Finally choose **Assign N selected targets**.

Up to 100 unique targets can be selected per batch. The server applies
all assignments in one SQLite transaction: a stale/foreign target yields
HTTP 422 and causes the entire batch to roll back. Repeated assignments
are idempotent. Removal of existing individual assignments remains possible.

Contributor search combines the regular commit index with the complete
annual commit index, applying canonical author email mappings. This
enables tagging historical contributors even when the shorter commit
inventory no longer shows them.

## Tag lifecycle and filtering

Create, edit, or delete any label and optional free-form group; names
are unique by project/group (case-insensitive). Deleting a tag removes
its assignments, not the underlying Git data.

Compare offers filtering by a user-created contributor tag. Filtering
candidate people does not modify the reference cohort for contribution
scores. Everything is saved in the local project_tags and
project_tag_assignments SQLite tables. No tag data is uploaded to GitHub.
