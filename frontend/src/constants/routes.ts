/** Centralised route path constants. Use these everywhere instead of raw strings. */
export const ROUTES = {
  HOME: '/',
  MY_WORK: '/my-work',
  PROJECT_SPACES: '/spaces/projects',
  projectWorkspace: (projectId: string, section = 'overview') =>
    `/spaces/projects/${encodeURIComponent(projectId)}/${section}`,
  LIBRARY: '/library',
  APPLICATIONS: '/library/applications',
  governance: (kind: string) => `/library/governance/${kind}`,
  MEETINGS: '/meetings',
  KNOWLEDGE: '/knowledge',
  AUTOMATION_DATA: '/automation-data',
  SETTINGS: '/settings',

  // Legacy paths remain available for redirects until bookmarks have migrated.
  PROJECTS: '/projects',
  TASKS: '/tasks',
  APPLICATION_CASES: '/application-cases',
  RISKS: '/risks',
  ISSUES: '/issues',
  DECISIONS: '/decisions',
  PARTNERS: '/partners',
}
