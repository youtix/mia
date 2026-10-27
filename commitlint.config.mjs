const config = {
  extends: ['@commitlint/config-conventional'],
  // Commits générés par semantic-release : leurs notes de version dépassent 100 caractères par ligne.
  ignores: [(message) => message.startsWith('chore(release):')],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    // Scope facultatif, mais limité à cette liste (ajouter une ligne pour un nouveau domaine).
    'scope-enum': [
      2,
      'always',
      [
        'core',
        'ui',
        'navigation',
        'storage',
        'profile',
        'progression',
        'hub',
        'memory',
        'traffic-jam',
        'android',
        'pwa',
        'release',
        'quality',
        'deps',
        'deps-dev',
      ],
    ],
  },
};

export default config;
