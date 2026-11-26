import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { discoverRepoFiles } from '../ocean/indexer.js'
import { detectSecrets, pathExclusionReason } from '../ocean/knowledgeRules.js'

// Ocean silently drops any document that looks like it contains credentials (for example a full connection
// string with a user and password). Writing such an example in the docs removes that whole page from Ocean's
// knowledge, so this fails the build instead. Describe the format in words, as docs/14 does.
describe('project docs stay indexable by Ocean', () => {
  const root = join(process.cwd(), '..')
  const { files } = discoverRepoFiles(root)

  it('finds the docs', () => { expect(files.length).toBeGreaterThan(20) })

  it('has no document that Ocean would exclude for credential-like content', () => {
    const excluded = files
      .filter(f => !pathExclusionReason(f))
      .map(f => ({ f, hits: detectSecrets(readFileSync(join(root, f), 'utf-8')) }))
      .filter(x => x.hits.length)
      .map(x => `${x.f} (${x.hits[0]!.label}, line ${x.hits[0]!.line})`)
    expect(excluded).toEqual([])
  })
})
