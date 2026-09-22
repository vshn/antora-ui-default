'use strict'

const log = require('fancy-log')
const ospath = require('path')

// Builds a Pagefind index of the generated pages, the same way a site's pipeline does after the Antora build
module.exports = (siteDir) => async () => {
  const pagefind = await import('pagefind')
  try {
    const { index, errors } = await pagefind.createIndex()
    if (errors.length) throw new Error(`pagefind: ${errors.join('; ')}`)
    const added = await index.addDirectory({ path: siteDir })
    if (added.errors.length) throw new Error(`pagefind: ${added.errors.join('; ')}`)
    const written = await index.writeFiles({ outputPath: ospath.join(siteDir, 'pagefind') })
    if (written.errors.length) throw new Error(`pagefind: ${written.errors.join('; ')}`)
    log(`pagefind: indexed ${added.page_count} page${added.page_count === 1 ? '' : 's'}`)
  } finally {
    await pagefind.close()
  }
}
