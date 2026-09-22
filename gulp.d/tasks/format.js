'use strict'

const { ESLint } = require('eslint')
const log = require('fancy-log')

module.exports = (files) => async () => {
  const results = await new ESLint({ fix: true }).lintFiles(files)
  await ESLint.outputFixes(results)
  const changed = results.filter((result) => result.output !== undefined).length
  log(`eslint --fix: formatted ${changed} file${changed === 1 ? '' : 's'}, left ${results.length - changed} unchanged`)
}
