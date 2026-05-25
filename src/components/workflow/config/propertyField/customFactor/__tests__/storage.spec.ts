import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CUSTOM_FACTOR_STORAGE_KEY,
  createCustomFactorGroup,
  deleteCustomFactorGroup,
  duplicateCustomFactorGroup,
  exportCustomFactorGroups,
  importCustomFactorGroups,
  loadCustomFactorGroups,
  saveCustomFactorGroup,
} from '../storage'
import { createIdentityKey } from '../identity'
import { mergeCustomFactorsIntoTree } from '../merge'

describe('customFactor storage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
    vi.setSystemTime(new Date('2026-05-25T10:00:00.000Z'))
  })

  it('creates, saves, duplicates and deletes groups in localStorage', () => {
    const group = createCustomFactorGroup('默认配置组')

    expect(group.name).toBe('默认配置组')
    expect(group.factors).toEqual([])

    saveCustomFactorGroup({
      ...group,
      factors: [
        {
          uid: 'uid-test-1',
          identityKey: createIdentityKey({
            factorKey: 'TEMP_1',
            factorName: '温度1',
            materialType: '正极',
            processName: '涂布',
            r2Name: 'R2-TEMP-1',
          }),
          factorKey: 'TEMP_1',
          factorName: '温度1',
          materialType: '正极',
          processName: '涂布',
          r2Name: 'R2-TEMP-1',
        },
      ],
    })

    const duplicated = duplicateCustomFactorGroup(group.id)
    const groupsAfterDuplicate = loadCustomFactorGroups()

    expect(duplicated?.id).not.toBe(group.id)
    expect(duplicated?.name).toContain('副本')
    expect(groupsAfterDuplicate).toHaveLength(2)

    deleteCustomFactorGroup(group.id)

    const persisted = loadCustomFactorGroups()
    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.id).toBe(duplicated?.id)
  })

  it('exports and imports groups with localStorage fallback safety', () => {
    const group = createCustomFactorGroup('导出组')
    saveCustomFactorGroup(group)

    const exported = exportCustomFactorGroups()
    expect(exported).toContain('"导出组"')

    localStorage.setItem(CUSTOM_FACTOR_STORAGE_KEY, 'not-json')
    expect(loadCustomFactorGroups()).toEqual([])

    const imported = importCustomFactorGroups(exported)
    expect(imported).toHaveLength(1)
    expect(loadCustomFactorGroups()[0]?.name).toBe('导出组')
  })

  it('merges custom factors into the existing process tree', () => {
    const merged = mergeCustomFactorsIntoTree([
      {
        key: 'process:涂布',
        label: '涂布',
        children: [
          {
            key: 'factor:涂布::TEMP_BASE',
            label: '基础温度',
            data: {
              value: {
                factorKey: 'TEMP_BASE',
                factorName: '基础温度',
                materialType: '正极',
                processName: '涂布',
                r2Name: 'R2-BASE',
              },
            },
          },
        ],
      },
    ], [
      {
        uid: 'uid-test-2',
        identityKey: createIdentityKey({
          factorKey: 'TEMP_CUSTOM',
          factorName: '自定义温度',
          materialType: '正极',
          processName: '涂布',
          r2Name: 'R2-CUSTOM',
        }),
        factorKey: 'TEMP_CUSTOM',
        factorName: '自定义温度',
        materialType: '正极',
        processName: '涂布',
        r2Name: 'R2-CUSTOM',
      },
      {
        uid: 'uid-test-3',
        identityKey: createIdentityKey({
          factorKey: 'PRESS_CUSTOM',
          factorName: '自定义压力',
          materialType: '负极',
          processName: '辊压',
          r2Name: 'R2-PRESS',
        }),
        factorKey: 'PRESS_CUSTOM',
        factorName: '自定义压力',
        materialType: '负极',
        processName: '辊压',
        r2Name: 'R2-PRESS',
      },
    ])

    expect(merged).toHaveLength(2)
    expect(merged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'process:涂布',
          children: expect.arrayContaining([
            expect.objectContaining({
              label: '基础温度',
            }),
            expect.objectContaining({
              label: '自定义温度',
              key: expect.stringContaining('custom-factor:涂布::'),
            }),
          ]),
        }),
      ]),
    )
    expect(merged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
      key: 'process:辊压',
      label: '辊压',
      children: [
        expect.objectContaining({
          label: '自定义压力',
        }),
      ],
        }),
      ]),
    )
  })
})
