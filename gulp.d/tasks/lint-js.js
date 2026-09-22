'use strict'

const { ESLint } = require('eslint')

module.exports = (files) => async () => {
  const eslint = new ESLint()
  const results = await eslint.lintFiles(files)
  const output = (await eslint.loadFormatter('stylish')).format(results)
  if (output) console.log(output)
  const errorCount = results.reduce((sum, result) => sum + result.errorCount, 0)
  if (errorCount) throw new Error(`ESLint failed with ${errorCount} error${errorCount === 1 ? '' : 's'}`)
}
