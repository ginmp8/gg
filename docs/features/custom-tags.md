# Custom tags (0.2.0)

Gita supports arbitrary user-defined tag names and optional group labels. Nothing is preconfigured.

## Manage

Open **Settings → Custom tags** and enter a tag label and optional group.
Use Edit to rename the tag/group and Delete to remove a tag with its assignments
after confirmation. Tag deletion does not delete a Git contributor, repository,
branch or pull request. Tag name/group pairs are unique inside each project
(case-insensitive).

## Assign

Choose a tag, select Contributor, Repository, Branch or Pull request,
then search by name, email or identifier. Select a target and assign the tag.
Current assignments can be removed individually. Up to 100 matching targets
are returned per search; refine your search for additional targets.

The backend verifies target membership in the project before assignments.
An inaccessible or stale entity is rejected (422), and duplicate tags
return 409. Contributor keys use normalized Git/canonical author email,
repository keys use Gita repository IDs, and branch/PR keys are scoped by repository.

## Filter

The Compare view includes a user-defined tag filter for the selectable
contributor list. It narrows displayed candidates without changing the
ICE-Git/1 score reference cohort or reinterpreting scores.

Project deletion cascades to its tags and assignments. Data lives only in
the local SQLite tables project_tags and project_tag_assignments, added by
the 0.2.0 migration. No tag data is uploaded to GitHub.
