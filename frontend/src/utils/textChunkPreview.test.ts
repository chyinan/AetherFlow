import { describe, expect, it } from 'vitest'

import { splitTextForPreview } from './textChunkPreview'

describe('splitTextForPreview', () => {
  it('matches the backend fixed-window splitter including overlap', () => {
    expect(splitTextForPreview('abcdefghij', 4, 1)).toEqual(['abcd', 'defg', 'ghij'])
  })

  it('returns no fake chunks for blank content', () => {
    expect(splitTextForPreview('   ', 4, 1)).toEqual([])
  })

  it('rejects overlap that cannot advance the window', () => {
    expect(() => splitTextForPreview('content', 4, 4)).toThrow('smaller than chunk size')
  })

  it('matches delimiter-based backend segmentation after cleanup', () => {
    expect(splitTextForPreview(' first  section\n\nsecond https://example.com ', 20, 0, {
      delimiter: '\\n\\n',
      cleanSpaces: true,
      cleanUrls: true,
    })).toEqual(['first section', 'second [URL]'])
  })
})
