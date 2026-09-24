'use strict'

const fs = require('fs')
const path = require('path')
const yauzl = require('yauzl')
const { test, expect } = require('@playwright/test')

const BUNDLE = path.join(__dirname, '..', 'build', 'ui-bundle.zip')
const DEFLATE = 8
// Node 24.17, which the Antora image of the documentation sites runs, never finishes reading
// a compressed zip entry of 64 KiB or more, and Antora then exits without output
const MAX_COMPRESSED_SIZE = 64 * 1024
const ALREADY_COMPRESSED = /\.(woff2?|png|jpe?g|gif|ico)$/
// First bytes of the formats the bundle ships. A build tool that reads files as text instead of
// binary (vinyl-fs 4 defaults to utf8) corrupts them, and the sites then serve broken fonts and images.
const MAGIC = {
  '.woff2': Buffer.from('wOF2'),
  '.woff': Buffer.from('wOFF'),
  '.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  '.ico': Buffer.from([0x00, 0x00, 0x01, 0x00]),
}

function readZip (file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err)
      const entries = []
      zip.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) return zip.readEntry()
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr)
          const chunks = []
          stream.on('data', (chunk) => chunks.push(chunk))
          stream.on('end', () => {
            entries.push({ entry, contents: Buffer.concat(chunks) })
            zip.readEntry()
          })
          stream.on('error', reject)
        })
      })
      zip.on('end', () => resolve(entries))
      zip.on('error', reject)
      zip.readEntry()
    })
  })
}

test.describe('UI bundle', () => {
  test.skip(!fs.existsSync(BUNDLE), 'build/ui-bundle.zip is missing: run gulp bundle first')

  test('has no compressed entry of 64 KiB or more', async () => {
    const entries = await readZip(BUNDLE)
    const tooLarge = entries
      .filter(({ entry }) => entry.compressionMethod === DEFLATE && entry.compressedSize >= MAX_COMPRESSED_SIZE)
      .map(({ entry }) => `${entry.fileName} (${entry.compressedSize} bytes compressed)`)
    expect(tooLarge).toEqual([])
  })

  test('stores already compressed formats without compressing them again', async () => {
    const entries = await readZip(BUNDLE)
    const binary = entries.filter(({ entry }) => ALREADY_COMPRESSED.test(entry.fileName))
    expect(binary.map(({ entry }) => entry.fileName)).toContain('font/fa-solid-900.woff2')
    expect(binary.filter(({ entry }) => entry.compressionMethod !== 0).map(({ entry }) => entry.fileName)).toEqual([])
  })

  test('ships fonts and images as valid binaries', async () => {
    const entries = await readZip(BUNDLE)
    const checked = []
    for (const { entry, contents } of entries) {
      const magic = MAGIC[path.extname(entry.fileName)]
      if (!magic) continue
      checked.push(entry.fileName)
      expect(contents.length, `${entry.fileName} is empty`).toBeGreaterThan(0)
      expect(contents.subarray(0, magic.length).equals(magic), `${entry.fileName} is corrupt`).toBe(true)
    }
    expect(checked.length).toBeGreaterThan(10)
  })

  test('names the CSS and JS after their content, and references exactly those files', async () => {
    const entries = await readZip(BUNDLE)
    const names = entries.map(({ entry }) => entry.fileName)
    const assets = names.filter((name) => /^(css|js)\/.*\.(css|js)$/.test(name))
    expect(assets.length).toBeGreaterThan(2)
    for (const asset of assets) expect(asset, 'not fingerprinted').toMatch(/-[0-9a-f]{8}\.(css|js)$/)

    // every asset a template asks for must be in the bundle under that name
    const templates = entries.filter(({ entry }) => entry.fileName.endsWith('.hbs'))
    const referenced = templates.flatMap(({ contents }) =>
      [...contents.toString().matchAll(/uiRootPath\}\}\}\/((?:css|js)\/[^"']+)/g)].map((m) => m[1])
    )
    expect(referenced.length).toBeGreaterThan(2)
    for (const reference of referenced) expect(names, `${reference} is referenced but not shipped`).toContain(reference)
  })

  test('copies the Font Awesome font byte for byte', async () => {
    const entries = await readZip(BUNDLE)
    const font = entries.find(({ entry }) => entry.fileName === 'font/fa-solid-900.woff2')
    const source = path.join(__dirname, '..', 'node_modules', '@fortawesome', 'fontawesome-free',
      'webfonts', 'fa-solid-900.woff2')
    expect(font.contents.equals(fs.readFileSync(source))).toBe(true)
  })
})
