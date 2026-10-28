import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeJsonAtomic, readJsonFile, dataFile, dataDir } from '../dataDir.js'
import { saveSourceDevices, loadSourceDevices } from '../deviceSnapshotStore.js'

const tmp = () => mkdtempSync(join(tmpdir(), 'ito-data-'))

describe('writeJsonAtomic / readJsonFile', () => {
  it('round-trips, keeps the previous version as .bak, and recovers from a corrupt file', () => {
    const file = join(tmp(), 'a.json')
    writeJsonAtomic(file, { v: 1 })
    writeJsonAtomic(file, { v: 2 })
    expect(readJsonFile<{ v: number }>(file)).toEqual({ v: 2 })
    expect(JSON.parse(readFileSync(`${file}.bak`, 'utf-8'))).toEqual({ v: 1 })
    writeFileSync(file, '{ half written')
    expect(readJsonFile<{ v: number }>(file)).toEqual({ v: 1 })
  })
  it('returns undefined when nothing readable exists', () => {
    expect(readJsonFile(join(tmp(), 'missing.json'))).toBeUndefined()
  })
})

describe('dataFile', () => {
  it('lives in the data dir (a temp folder under test) and copies a legacy file once', () => {
    const legacy = join(tmp(), 'old.json')
    writeFileSync(legacy, '{"kept":true}')
    const name = `migrate-${process.pid}-${Date.now()}.json`
    const target = dataFile(name, [legacy])
    expect(target.startsWith(dataDir())).toBe(true)
    expect(readJsonFile(target)).toEqual({ kept: true })
    writeFileSync(legacy, '{"kept":false}')
    expect(readJsonFile(dataFile(name, [legacy]))).toEqual({ kept: true }) // never overwritten
    expect(existsSync(target)).toBe(true)
  })
})

describe('deviceSnapshotStore', () => {
  const dev = [{ deviceName: 'A' }] as never
  it('saves and loads a source list, and never overwrites it with an empty answer', () => {
    const file = join(tmp(), 'intune.json')
    saveSourceDevices('intune', dev, file)
    saveSourceDevices('intune', [], file)
    const snap = loadSourceDevices('intune', file)
    expect(snap?.devices).toHaveLength(1)
    expect(Date.parse(snap!.savedAt)).not.toBeNaN()
  })
  it('does not touch the disk under test unless a file is given', () => {
    saveSourceDevices('manageengine', dev)
    expect(loadSourceDevices('manageengine')).toBeNull()
  })
})
