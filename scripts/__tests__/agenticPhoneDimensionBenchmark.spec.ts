import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const benchmarkDir = path.resolve(
  __dirname,
  '../../test/resource/agentic_phone_dimension_benchmark',
)

const requiredFiles = [
  'data/part_measurements.csv',
  'data/assembly_measurements.csv',
  'data/mapping_or_lot_bridge.csv',
  'data/field_dictionary.json',
  'data/dataset_truth.json',
  'README.md',
  'guide/operation-guide.md',
  'ui/benchmark-evaluator.html',
  'guide/rubric.md',
  'guide/review-sheet.md',
  'generator/generate_benchmark.py',
]

const readCsv = (filename: string) => {
  const filePath = path.join(benchmarkDir, filename)
  const content = fs.readFileSync(filePath, 'utf-8').trim()
  const lines = content.split(/\r?\n/)
  const header = lines[0]?.split(',') ?? []
  const rows = lines.slice(1).map((line) => line.split(','))

  return { header, rows }
}

describe('agentic phone dimension benchmark assets', () => {
  it('ships the expected benchmark artifact set', () => {
    for (const filename of requiredFiles) {
      expect(fs.existsSync(path.join(benchmarkDir, filename)), `${filename} should exist`).toBe(true)
    }
  })

  it('provides two high-dimensional main tables and a bridge table', () => {
    const partDataset = readCsv('data/part_measurements.csv')
    const assemblyDataset = readCsv('data/assembly_measurements.csv')
    const bridgeDataset = readCsv('data/mapping_or_lot_bridge.csv')

    expect(partDataset.header.length).toBeGreaterThanOrEqual(200)
    expect(partDataset.rows.length).toBeGreaterThanOrEqual(400)

    expect(assemblyDataset.header.length).toBeGreaterThanOrEqual(200)
    expect(assemblyDataset.rows.length).toBeGreaterThanOrEqual(400)

    expect(bridgeDataset.header).toEqual(
      expect.arrayContaining([
        'part_id',
        'sub_batch_id',
        'assembly_id',
        'station_id',
        'fixture_id',
        'shift',
        'timestamp_bucket',
      ]),
    )
    expect(bridgeDataset.rows.length).toBeGreaterThanOrEqual(400)
  })

  it('keeps join keys connected across part, assembly and bridge datasets', () => {
    const partDataset = readCsv('data/part_measurements.csv')
    const assemblyDataset = readCsv('data/assembly_measurements.csv')
    const bridgeDataset = readCsv('data/mapping_or_lot_bridge.csv')

    const partIdIndex = partDataset.header.indexOf('part_id')
    const assemblyIdIndex = assemblyDataset.header.indexOf('assembly_id')
    const bridgePartIdIndex = bridgeDataset.header.indexOf('part_id')
    const bridgeAssemblyIdIndex = bridgeDataset.header.indexOf('assembly_id')

    expect(partIdIndex).toBeGreaterThanOrEqual(0)
    expect(assemblyIdIndex).toBeGreaterThanOrEqual(0)
    expect(bridgePartIdIndex).toBeGreaterThanOrEqual(0)
    expect(bridgeAssemblyIdIndex).toBeGreaterThanOrEqual(0)

    const partIds = new Set(partDataset.rows.map((row) => row[partIdIndex]))
    const assemblyIds = new Set(assemblyDataset.rows.map((row) => row[assemblyIdIndex]))
    const bridgePartIds = new Set(bridgeDataset.rows.map((row) => row[bridgePartIdIndex]))
    const bridgeAssemblyIds = new Set(bridgeDataset.rows.map((row) => row[bridgeAssemblyIdIndex]))

    expect([...bridgePartIds].every((partId) => partIds.has(partId))).toBe(true)
    expect([...bridgeAssemblyIds].every((assemblyId) => assemblyIds.has(assemblyId))).toBe(true)
  })

  it('includes structured truth metadata for rules, misleading signals and conclusions', () => {
    const truthPath = path.join(benchmarkDir, 'data/dataset_truth.json')
    const truth = JSON.parse(fs.readFileSync(truthPath, 'utf-8')) as {
      dataset_summary?: unknown
      analysis_topics?: unknown
      rules?: Array<Record<string, unknown>>
      misleading_signals?: unknown
      recommended_analysis_path?: unknown
      standard_conclusions?: unknown
    }

    expect(truth.dataset_summary).toBeTruthy()
    expect(Array.isArray(truth.analysis_topics)).toBe(true)
    expect(Array.isArray(truth.rules)).toBe(true)
    expect(truth.rules?.length).toBeGreaterThanOrEqual(5)
    expect(truth.misleading_signals).toBeTruthy()
    expect(truth.recommended_analysis_path).toBeTruthy()
    expect(Array.isArray(truth.standard_conclusions)).toBe(true)

    for (const rule of truth.rules ?? []) {
      expect(rule).toEqual(
        expect.objectContaining({
          rule_id: expect.any(String),
          category: expect.any(String),
          source_fields: expect.any(Array),
          target_fields: expect.any(Array),
          relationship_type: expect.any(String),
          activation_condition: expect.any(String),
          strength: expect.any(String),
          is_root_cause: expect.any(Boolean),
          expected_discovery_statement: expect.any(String),
        }),
      )
    }
  })

  it('ships lightweight human-eval tasks for Codex, Claude Code and OpenCode', () => {
    const tasksDir = path.join(benchmarkDir, 'tasks')
    expect(fs.existsSync(tasksDir), 'tasks directory should exist').toBe(true)

    const taskFiles = fs
      .readdirSync(tasksDir)
      .filter((filename) => filename.endsWith('.json'))
      .sort()

    expect(taskFiles.length).toBeGreaterThanOrEqual(3)

    const firstTask = JSON.parse(fs.readFileSync(path.join(tasksDir, taskFiles[0]!), 'utf-8')) as {
      task_id?: unknown
      dataset?: unknown
      prompt?: unknown
      reference_conclusions?: unknown
      focus_points?: unknown
    }

    expect(firstTask.task_id).toEqual(expect.any(String))
    expect(firstTask.dataset).toEqual(expect.any(String))
    expect(firstTask.prompt).toEqual(expect.any(String))
    expect(Array.isArray(firstTask.reference_conclusions)).toBe(true)
    expect(Array.isArray(firstTask.focus_points)).toBe(true)
  })
})
