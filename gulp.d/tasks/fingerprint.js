'use strict'

const crypto = require('crypto')
const fs = require('fs-extra')
const ospath = require('path')

// The UI assets keep the same name in every release (site.css, site.js), so a site cannot cache them
// for long: a reader who visited before an update would keep the old ones. Naming them after their
// content lets a site cache them forever, because a changed file is a different URL.
const ASSETS = ['css/site.css', 'js/site.js', 'js/vendor/highlight.js']
const TEMPLATES = ['partials', 'layouts']

const hash = (contents) => crypto.createHash('sha256').update(contents).digest('hex').slice(0, 8)

module.exports = (dest) => async () => {
  const renames = []
  for (const asset of ASSETS) {
    const file = ospath.join(dest, asset)
    if (!(await fs.pathExists(file))) continue
    const extname = ospath.extname(asset)
    const fingerprinted = `${asset.slice(0, -extname.length)}-${hash(await fs.readFile(file))}${extname}`
    const map = `${file}.map`
    if (await fs.pathExists(map)) {
      // keep the sourcemap next to the file it belongs to, and keep the reference inside it valid
      await fs.move(map, ospath.join(dest, `${fingerprinted}.map`), { overwrite: true })
      const from = `sourceMappingURL=${ospath.basename(asset)}.map`
      const to = `sourceMappingURL=${ospath.basename(fingerprinted)}.map`
      await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace(from, to))
    }
    await fs.move(file, ospath.join(dest, fingerprinted), { overwrite: true })
    renames.push([asset, fingerprinted])
  }

  for (const dir of TEMPLATES) {
    const templateDir = ospath.join(dest, dir)
    if (!(await fs.pathExists(templateDir))) continue
    for (const name of await fs.readdir(templateDir)) {
      const file = ospath.join(templateDir, name)
      let contents = await fs.readFile(file, 'utf8')
      const before = contents
      for (const [asset, fingerprinted] of renames) contents = contents.split(asset).join(fingerprinted)
      if (contents !== before) await fs.writeFile(file, contents)
    }
  }
  return renames
}
