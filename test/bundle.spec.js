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

function readEntries (file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err)
      const entries = []
      zip.on('entry', (entry) => {
        entries.push(entry)
        zip.readEntry()
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
    const entries = await readEntries(BUNDLE)
    const tooLarge = entries
      .filter((e) => e.compressionMethod === DEFLATE && e.compressedSize >= MAX_COMPRESSED_SIZE)
      .map((e) => `${e.fileName} (${e.compressedSize} bytes compressed)`)
    expect(tooLarge).toEqual([])
  })

  test('stores already compressed formats without compressing them again', async () => {
    const entries = await readEntries(BUNDLE)
    const binary = entries.filter((e) => ALREADY_COMPRESSED.test(e.fileName))
    expect(binary.map((e) => e.fileName)).toContain('font/fa-solid-900.woff2')
    expect(binary.filter((e) => e.compressionMethod !== 0).map((e) => e.fileName)).toEqual([])
  })
})
