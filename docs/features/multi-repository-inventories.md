# Project-wide branches and pull requests (0.2.0)

Select **All repositories** under Analysis scope and open Branches or Pull requests.
Both views list cached records across the project, including a Repository column
to distinguish identical branch names and duplicate PR numbers.

The new local APIs are:

- GET /api/projects/:projectId/branches?limit=200&offset=0
- GET /api/projects/:projectId/pull-requests?limit=200&offset=0

Responses provide items, total, repositoryName and repoId. The UI
paginates 200 rows at a time and provides Previous and Next controls.

Selecting a single repository retains its original Branches, PR and
read-only ahead/behind branch comparison. Cross-repository Git ancestry
is not comparable; select a repository before comparing branches.

These are local SQLite inventory reads. Use an explicit refresh to
update their caches; cached PRs remain available when GitHub status is degraded.
