# GitHub repository picker and local branch comparison

The functionality is adapted from the Git Insights Dashboard's GitHub CLI
discovery and branch comparison workflow.

## GitHub import (explicit opt-in)

The header's **GitHub import** control opens a repository picker. Merely
opening it does not contact GitHub. Click **Discover accessible repositories
(network)** to run the authenticated GitHub CLI. This operation requires:

- `gh auth login` and compatible GitHub permissions
- `GG_ALLOW_GITHUB_METADATA=1`
- No global `GG_OFFLINE=1` block

The endpoint fetches public/private/organization/collaborator repository
metadata through the paginated GitHub `user/repos` API. Only HTTPS GitHub
clone URLs pass validation, with no embedded credentials.

Filter the returned list by owner, visibility, archived status or text;
select no more than 25 entries per import. **Register selected** writes
repository records locally but does not clone or fetch. Use the project
Refresh button to fetch mirrors. This preserves GG's explicit network
authorization semantics. Private HTTPS clones may require `gh auth
setup-git` or another configured Git credential helper.

No access tokens are read or stored by the GG repository picker.

## Compare branches (local only)

In the **Branches** tab, select one repository, choose Base and Head,
then click **Compare branches (local)**. The API reads the local Git mirror:

- `git rev-list --left-right --count base...head`: ahead/behind exclusive commits
- `git diff --name-status --no-renames -z base...head`: changed files from the merge-base

This is a read-only three-dot comparison. It does not check out branches,
fetch remotes or mutate repository content. The UI shows a maximum of 500
files, including an explicit truncation indicator when more exist.
The full ahead/behind counts are not truncated. A file diff is not equal to
cumulative churn across commits.

If a branch does not exist in the local cache, refresh the repository before
comparing again. The comparator uses only `refs/heads` and rejects unsafe
branch names and option-like inputs. Comparison requests do not contact GitHub.

## Security and limitations

- Local API endpoints must be reachable only by the trusted local UI.
- CLI discovery runs only on explicit user action and only with independent
  GitHub metadata consent.
- The picker does not implement a credential helper or store tokens; configured
  Git authentication is external.
- Cross-provider repository discovery is not provided by this GitHub picker.
- The GG desktop sidecar retains its authenticated loopback boundary.

Static source and unit-test gates cover protocol safety, comparison results,
metadata parsing and the 25-entry batch cap. Private GitHub credentials and
installed GUI behavior need separate authorized manual testing.
