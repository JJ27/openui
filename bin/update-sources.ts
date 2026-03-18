// Update source configuration for JJ27/openui
// This file is excluded from auto-updates (rsync --exclude) so it persists
// across syncs from universe. Edit manually when source URLs change.

export interface UpdateSource {
  owner: string;
  repo: string;
  path: string;
  ref: string;
  apiBase: string;
}

export const DEFAULT_UPDATE_SOURCE: UpdateSource = {
  owner: "databricks-eng",
  repo: "universe",
  path: "openui",
  ref: "master",
  apiBase: "https://api.github.com",
};

// Public fallback for users without access to the private universe repo
export const FALLBACK_UPDATE_SOURCE: UpdateSource = {
  owner: "JJ27",
  repo: "openui",
  path: ".",
  ref: "stable",
  apiBase: "https://api.github.com",
};
