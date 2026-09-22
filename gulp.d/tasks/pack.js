'use strict'

const fs = require('fs-extra')
const path = require('path')
const vfs = require('vinyl-fs')
const yazl = require('yazl')
const { Transform } = require('stream')

// Formats that are compressed already are stored as they are. Compressing them again saves nothing,
// and Node 24.17 (in the Antora image of the documentation sites) never finishes reading a compressed
// entry of 64 KiB or more, such as the Font Awesome font, so Antora exits without output.
const ALREADY_COMPRESSED = /\.(woff2?|png|jpe?g|gif|ico)$/

module.exports = (src, dest, bundleName, onFinish) => () => {
  const bundlePath = path.join(dest, `${bundleName}-bundle.zip`)
  const zip = new yazl.ZipFile()
  return new Promise((resolve, reject) => {
    fs.ensureDirSync(dest)
    zip.outputStream
      .pipe(fs.createWriteStream(bundlePath))
      .on('close', () => {
        if (onFinish) onFinish(path.resolve(bundlePath))
        resolve()
      })
      .on('error', reject)
    vfs
      .src('**/*', { base: src, cwd: src })
      .on('error', reject)
      .pipe(
        new Transform({
          objectMode: true,
          transform (file, _, next) {
            const name = file.relative.replace(/\\/g, '/')
            const options = { mtime: file.stat.mtime, mode: file.stat.mode }
            if (file.isDirectory()) {
              zip.addEmptyDirectory(name, options)
            } else {
              zip.addBuffer(file.contents, name, { ...options, compress: !ALREADY_COMPRESSED.test(name) })
            }
            next()
          },
          flush (done) {
            zip.end()
            done()
          },
        })
      )
      .on('error', reject)
  })
}
