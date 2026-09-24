'use strict'

const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const { test, expect } = require('@playwright/test')

const fingerprint = require('../gulp.d/tasks/fingerprint')

async function stage (css) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ui-fingerprint-'))
  await fs.outputFile(path.join(dir, 'css/site.css'), css)
  await fs.outputFile(path.join(dir, 'js/site.js'), 'console.log("site")')
  await fs.outputFile(path.join(dir, 'js/vendor/highlight.js'), 'console.log("highlight")')
  await fs.outputFile(path.join(dir, 'partials/head-styles.hbs'),
    '<link rel="stylesheet" href="{{{uiRootPath}}}/css/site.css">')
  await fs.outputFile(path.join(dir, 'partials/footer-scripts.hbs'),
    '<script src="{{{uiRootPath}}}/js/site.js"></script>\n' +
    '<script async src="{{{uiRootPath}}}/js/vendor/highlight.js"></script>')
  return dir
}

const names = (dir, sub) => fs.readdir(path.join(dir, sub))

test.describe('fingerprint', () => {
  test('renames the assets after their content and rewrites the templates', async () => {
    const dir = await stage('a { color: red }')
    await fingerprint(dir)()
    const css = (await names(dir, 'css')).filter((name) => name.endsWith('.css'))
    expect(css).toHaveLength(1)
    expect(css[0]).toMatch(/^site-[0-9a-f]{8}\.css$/)
    const head = await fs.readFile(path.join(dir, 'partials/head-styles.hbs'), 'utf8')
    expect(head).toContain(`/css/${css[0]}`)
    const footer = await fs.readFile(path.join(dir, 'partials/footer-scripts.hbs'), 'utf8')
    const js = (await names(dir, 'js')).filter((name) => name.endsWith('.js'))
    expect(footer).toContain(`/js/${js[0]}`)
    expect(footer).toMatch(/js\/vendor\/highlight-[0-9a-f]{8}\.js/)
    await fs.remove(dir)
  })

  test('gives different content a different name', async () => {
    const one = await stage('a { color: red }')
    const two = await stage('a { color: blue }')
    await fingerprint(one)()
    await fingerprint(two)()
    expect((await names(one, 'css'))[0]).not.toBe((await names(two, 'css'))[0])
    await fs.remove(one)
    await fs.remove(two)
  })

  test('leaves no stale asset behind when the content changes', async () => {
    const dir = await stage('a { color: red }')
    await fingerprint(dir)()
    const first = (await names(dir, 'css'))[0]

    // a rebuild, as gulp preview:build does without cleaning the staged UI first
    await fs.outputFile(path.join(dir, 'css/site.css'), 'a { color: blue }')
    await fs.outputFile(path.join(dir, 'partials/head-styles.hbs'),
      '<link rel="stylesheet" href="{{{uiRootPath}}}/css/site.css">')
    await fingerprint(dir)()

    const css = await names(dir, 'css')
    expect(css).toHaveLength(1)
    expect(css[0]).not.toBe(first)
    await fs.remove(dir)
  })
})
