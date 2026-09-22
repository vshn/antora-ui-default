'use strict'

const { test, expect } = require('@playwright/test')

// Third-party URLs the UI is allowed to load. All third-party requests are blocked so the tests run offline.
const ALLOWED_THIRD_PARTY_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/mathjax/',
  'https://www.googletagmanager.com/gtag/js',
]

const ADMONITIONS = ['note', 'tip', 'warning', 'caution', 'important']
const ICON_MACROS = ['check', 'times', 'glasses', 'users-cog']

async function openPage (page, path) {
  const origin = new URL(test.info().project.use.baseURL).origin
  const thirdParty = []
  const failed = []
  const consoleErrors = []
  await page.route((url) => url.origin !== origin, (route) => {
    thirdParty.push(route.request().url())
    return route.abort()
  })
  page.on('response', (res) => {
    if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`)
  })
  page.on('requestfailed', (req) => {
    if (new URL(req.url()).origin === origin) failed.push(`${req.failure().errorText} ${req.url()}`)
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const source = msg.location().url
    if (source && new URL(source).origin !== origin) return // blocked third-party script
    consoleErrors.push(msg.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(`uncaught: ${error.message}`))
  await page.goto(path)
  await page.evaluate(() => document.fonts.ready)
  return { origin, thirdParty, failed, consoleErrors }
}

test.describe('preview page', () => {
  test('loads without errors or failed requests', async ({ page }) => {
    const { failed, consoleErrors } = await openPage(page, '/index.html')
    expect(failed).toEqual([])
    expect(consoleErrors).toEqual([])
  })

  test('only loads allowed third-party resources', async ({ page }) => {
    const { thirdParty } = await openPage(page, '/index.html')
    expect(thirdParty.filter((url) => !ALLOWED_THIRD_PARTY_URLS.some((prefix) => url.startsWith(prefix)))).toEqual([])
  })

  test('serves every web font from the site itself', async ({ page }) => {
    const { origin } = await openPage(page, '/index.html')
    const fonts = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((e) => e.name).filter((name) => /\.woff2?(\?|$)/.test(name))
    )
    expect(fonts.length).toBeGreaterThan(0)
    for (const font of fonts) expect(new URL(font).origin).toBe(origin)
  })

  for (const name of ICON_MACROS) {
    test(`renders icon:${name}[] with Font Awesome`, async ({ page }) => {
      await openPage(page, '/index.html')
      const icon = page.locator(`.doc i.fa.fa-${name}`).first()
      await expect(icon).toBeVisible()
      const box = await icon.boundingBox()
      expect(box.width).toBeGreaterThan(8)
      const style = await icon.evaluate((el) => {
        const before = getComputedStyle(el, '::before')
        return { content: before.content, fontFamily: before.fontFamily }
      })
      expect(style.content).not.toBe('none')
      expect(style.fontFamily).toContain('Font Awesome 5 Free')
    })
  }

  for (const type of ADMONITIONS) {
    test(`draws the ${type} admonition icon`, async ({ page }) => {
      await openPage(page, '/index.html')
      const icon = page.locator(`.doc .admonitionblock.${type} td.icon i.icon-${type}`).first()
      await expect(icon).toBeVisible()
      const before = await icon.evaluate((el) => {
        const cs = getComputedStyle(el, '::before')
        return { mask: cs.maskImage || cs.webkitMaskImage, width: parseFloat(cs.width) }
      })
      expect(before.mask).toMatch(/^url\("data:image\/svg\+xml/)
      expect(before.width).toBeGreaterThan(8)
    })
  }

  test('renders the menu macro caret', async ({ page }) => {
    await openPage(page, '/index.html')
    const caret = page.locator('.doc .menuseq i.caret').first()
    await expect(caret).toBeVisible()
    expect(await caret.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"›"')
  })

  test('highlights the current section in the table of contents while scrolling', async ({ page }) => {
    await openPage(page, '/index.html')
    const links = page.locator('aside.toc .toc-menu a')
    expect(await links.count()).toBeGreaterThan(3)
    for (const index of [2, 1]) {
      const href = await links.nth(index).getAttribute('href')
      await page.locator(href).evaluate((heading) => {
        window.scrollTo(0, window.scrollY + heading.getBoundingClientRect().top)
      })
      await expect(page.locator('aside.toc .toc-menu a.is-active')).toHaveAttribute('href', href)
    }
  })
})

test.describe('search', () => {
  async function searchFor (page, query) {
    await page.locator('#search-input').fill(query)
    await page.locator('#search-input').press('Enter')
    await expect(page.locator('article.doc h1.page')).toHaveText(`Search Results for "${query}"`)
  }

  test('finds pages with the Pagefind index built into the site', async ({ page }) => {
    const { consoleErrors } = await openPage(page, '/index.html')
    const serverSearches = []
    page.on('request', (req) => {
      if (new URL(req.url()).pathname === '/search') serverSearches.push(req.url())
    })
    await searchFor(page, 'TOML')
    const first = page.locator('article.doc .search-entry').first()
    await expect(first).toHaveText('Hardware and Software Requirements')
    await expect(page.locator('article.doc .search-excerpt').first()).toContainText(/toml/i)
    expect(new URL(page.url()).searchParams.get('q')).toBe('TOML')
    expect(serverSearches).toEqual([])
    expect(consoleErrors).toEqual([])
  })

  test('shows a message when nothing matches', async ({ page }) => {
    await openPage(page, '/index.html')
    await searchFor(page, 'zzzqqqxxx')
    await expect(page.locator('article.doc')).toContainText('No results found.')
  })

  test('falls back to the /search endpoint on sites without a Pagefind index', async ({ page }) => {
    await openPage(page, '/index.html')
    await page.route('**/pagefind/pagefind.js', (route) => route.fulfill({ status: 404 }))
    await page.route('**/search?q=*', (route) => route.fulfill({
      json: [{
        name: 'Result from the server',
        href: '/server-result.html',
        excerpt: 'Found by the search container',
        version: '',
      }],
    }))
    await searchFor(page, 'TOML')
    await expect(page.locator('article.doc .search-entry')).toHaveText(['Result from the server'])
    await expect(page.locator('article.doc .search-excerpt')).toHaveText(['Found by the search container'])
  })
})

test('404 page loads without errors or failed requests', async ({ page }) => {
  const { failed, consoleErrors } = await openPage(page, '/404.html')
  expect(failed).toEqual([])
  expect(consoleErrors).toEqual([])
})
