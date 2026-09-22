'use strict'

const globals = require('globals')
const neostandard = require('neostandard')

module.exports = [
  ...neostandard({ ignores: neostandard.resolveIgnoresFromGitignore() }),
  {
    // src/js runs in the browser; so do the page.evaluate() callbacks in test/
    files: ['src/js/**/*.js', 'test/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    // src/js stays ES5 like upstream Antora UI: it is minified with uglify and ships to browsers as is
    files: ['src/js/**/*.js'],
    languageOptions: { sourceType: 'script' },
    rules: { 'no-var': 'off', 'object-shorthand': 'off' },
  },
  {
    rules: {
      '@stylistic/arrow-parens': ['error', 'always'],
      '@stylistic/comma-dangle': ['error', {
        arrays: 'always-multiline',
        objects: 'always-multiline',
        imports: 'always-multiline',
        exports: 'always-multiline',
      }],
      '@stylistic/max-len': ['warn', 120, 2],
      '@stylistic/spaced-comment': 'off',
    },
  },
]
