/** Centralised route path constants. Use these everywhere instead of raw strings. */
export const ROUTES = {
  HOME: '/',
  MY_WORK: '/my-work',
  PROJECT_SPACES: '/spaces/projects',
  projectWorkspace: (projectId: string, section = 'overview') =>
    `/spaces/projects/${encodeURIComponent(projectId)}/${section}`,
  DOCS: '/docs',
  BASE: '/base',
  CALENDAR: '/calendar',
  SEARCH: '/search',

  // Compatibility paths remain reachable outside the primary navigation.
  LIBRARY: '/library',
  APPLICATIONS: '/library/applications',
  governance: (kind: string) => `/library/governance/${kind}`,
  MEETINGS: '/meetings',
  KNOWLEDGE: '/knowledge',
  AUTOMATION_DATA: '/automation-data',
  SETTINGS: '/settings',
  DATA_GOVERNANCE: '/settings/data-governance',
  EXTENSIONS_SETTINGS: '/settings/extensions',
  OPERATIONS: '/library/operations',
  RESOURCES: '/library/operations?tab=resources',
  RESOURCES_LEGACY: '/resources',
  REPORTS: '/library/reports',
  INTELLIGENCE: '/library/intelligence',
  INTELLIGENCE_BRIEFS: '/library/intelligence/briefs',

  // Legacy paths remain available for redirects until bookmarks have migrated.
  PROJECTS: '/projects',
  TASKS: '/tasks',
  APPLICATION_CASES: '/application-cases',
  RISKS: '/risks',
  ISSUES: '/issues',
  DECISIONS: '/decisions',
  PARTNERS: '/partners',
}
