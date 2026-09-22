'use strict'

const fs = require('fs')
const path = require('path')
const handlebars = require('handlebars')
const { test, expect } = require('@playwright/test')

// Renders a partial with the UI's own helpers, the way Antora does
function render (partial, model) {
  const hbs = handlebars.create()
  const helpersDir = path.join(__dirname, '..', 'src', 'helpers')
  for (const file of fs.readdirSync(helpersDir)) {
    hbs.registerHelper(path.basename(file, '.js'), require(path.join(helpersDir, file)))
  }
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'partials', `${partial}.hbs`), 'utf8')
  return hbs.compile(source)(model)
}

const gaTag = (html) => html.match(/googletagmanager\.com\/gtag\/js\?id=([^"]+)/)

test.describe('head-scripts', () => {
  test('loads Google Analytics for a GA4 measurement ID', () => {
    const html = render('head-scripts', { site: { keys: { googleAnalytics: 'G-FWQPMNS0R2' } }, uiRootPath: '_' })
    expect(gaTag(html)[1]).toBe('G-FWQPMNS0R2')
    expect(html).toContain("gtag('config','G-FWQPMNS0R2')")
  })

  test('leaves out a Universal Analytics ID, which Google no longer processes', () => {
    const html = render('head-scripts', { site: { keys: { googleAnalytics: 'UA-54393406-8' } }, uiRootPath: '_' })
    expect(gaTag(html)).toBeNull()
    expect(html).not.toContain('gtag(')
  })

  test('loads nothing without a Google Analytics key', () => {
    const html = render('head-scripts', { site: { keys: {} }, uiRootPath: '_' })
    expect(html).not.toContain('googletagmanager')
  })
})
