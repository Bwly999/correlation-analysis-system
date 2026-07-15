/**
 * WorkspaceTree 测试
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkspaceTree from '../WorkspaceTree.vue'
import type { TreeNode } from '../../shared/opfsAccess'

const buildTree = (): TreeNode => ({
  name: '',
  kind: 'directory',
  children: [
    {
      name: 'inputs',
      kind: 'directory',
      children: [{ name: 'upstream.csv', kind: 'file', size: 1024, modifiedAt: 100 }],
    },
    {
      name: 'reports',
      kind: 'directory',
      children: [
        { name: 'old.md', kind: 'file', size: 200, modifiedAt: 50 },
        { name: 'new.md', kind: 'file', size: 300, modifiedAt: 150 },
      ],
    },
    {
      name: 'scripts',
      kind: 'directory',
      children: [],
    },
    {
      name: 'artifacts',
      kind: 'directory',
      children: [],
    },
  ],
})

describe('WorkspaceTree', () => {
  it('总是渲染 4 个顶级目录', () => {
    const wrapper = mount(WorkspaceTree, {
      props: {
        tree: { name: '', kind: 'directory', children: [] },
        selectedPath: null,
        isFresh: () => false,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('inputs/')
    expect(text).toContain('scripts/')
    expect(text).toContain('artifacts/')
    expect(text).toContain('reports/')
  })

  it('文件按 mtime 倒序排列', () => {
    const wrapper = mount(WorkspaceTree, {
      props: { tree: buildTree(), selectedPath: null, isFresh: () => false },
    })
    const items = wrapper.findAll('[data-path]')
    const reportsItems = items.filter((i) => i.attributes('data-path')?.startsWith('reports/'))
    expect(reportsItems[0]!.attributes('data-path')).toBe('reports/new.md')
    expect(reportsItems[1]!.attributes('data-path')).toBe('reports/old.md')
  })

  it('文件数包含顶级目录下的嵌套文件', () => {
    const wrapper = mount(WorkspaceTree, {
      props: {
        tree: {
          ...buildTree(),
          children: buildTree().children?.map((node) =>
            node.name === 'reports'
              ? {
                  ...node,
                  children: [
                    {
                      name: 'nested',
                      kind: 'directory' as const,
                      children: [{ name: 'main.md', kind: 'file' as const }],
                    },
                  ],
                }
              : node,
          ),
        },
        selectedPath: null,
        isFresh: () => false,
      },
    })

    expect(wrapper.find('[data-path="reports/nested/main.md"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('2 files')
  })

  it('点击文件 emit select', async () => {
    const wrapper = mount(WorkspaceTree, {
      props: { tree: buildTree(), selectedPath: null, isFresh: () => false },
    })
    await wrapper.find('[data-path="reports/new.md"]').trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual(['reports/new.md'])
  })

  it('isFresh 返回 true 时显示星标', () => {
    const wrapper = mount(WorkspaceTree, {
      props: {
        tree: buildTree(),
        selectedPath: null,
        isFresh: (p) => p === 'reports/new.md',
      },
    })
    const row = wrapper.find('[data-path="reports/new.md"]')
    // lucide-vue-next 的 Star 会渲染 svg
    expect(row.html()).toContain('lucide-star')
  })
})
