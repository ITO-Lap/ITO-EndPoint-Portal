import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { appFolderName, outputDirFor, outputRoot } from '../outputDir.js'

describe('output folder', () => {
  it('defaults to ~/Desktop/win-packager outside of tests', () => {
    expect(outputRoot({ HOME: '/x' } as NodeJS.ProcessEnv)).toMatch(/Desktop[\\/]win-packager$/)
    expect(outputRoot({ WIN_PACKAGER_OUTPUT_DIR: '/data/out' } as NodeJS.ProcessEnv)).toBe('/data/out')
  })
  it('uses one safe folder per application', () => {
    expect(appFolderName('Notepad++ (x64)')).toBe('Notepad++ (x64)')
    expect(appFolderName('../../etc/passwd')).not.toMatch(/[\\/]/)
    expect(appFolderName('   ')).toBe('Application')
    const dir = outputDirFor({ config: { appName: '7-Zip 26.06 (x64 edition)' } as never, source: { fileName: 'a.exe' } as never })
    expect(dir).toBe(join(outputRoot(), '7-Zip 26.06 (x64 edition)'))
  })
})
