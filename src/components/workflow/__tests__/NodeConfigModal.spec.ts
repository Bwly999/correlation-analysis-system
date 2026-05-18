vi.mock("../MonacoEditor.vue", () => ({ default: { template: "<div />" } }));

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { config, mount, enableAutoUnmount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import NodeConfigModal from "../NodeConfigModal.vue";
import { useWorkflowStore } from "@/stores/workflowStore";
import { nodeDefinitions } from "@/nodes/registry";

const mockToastAdd = vi.fn();

vi.mock("primevue/usetoast", () => ({
  useToast: () => ({
    add: mockToastAdd,
  }),
}));

enableAutoUnmount(afterEach);

describe("NodeConfigModal", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockToastAdd.mockReset();
    document.body.innerHTML = "";
    document.queryCommandSupported = vi.fn(() => true) as any;
    config.global.directives = {
      ...(config.global.directives || {}),
      tooltip: () => undefined,
    };
  });

  const dialogStub = {
    name: "Dialog",
    props: [
      "visible",
      "draggable",
      "style",
      "contentStyle",
      "contentClass",
      "blockScroll",
    ],
    template:
      '<div class="dialog-stub" :data-visible="String(visible)" :data-draggable="String(draggable)" :data-style="JSON.stringify(style ?? {})" :data-content-style="JSON.stringify(contentStyle ?? {})" :data-content-class="contentClass ?? \'\'" :data-block-scroll="String(Boolean(blockScroll))"><template v-if="visible"><slot name="header" /><slot /></template></div>',
  };

  it("passes a multi-input summary to the input display panel for multi-input nodes", () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "source-1",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "来源一",
        data: {
          label: "来源一",
          type: "manual-json-import",
          category: "trigger",
          status: "success",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: { data: [{ id: 1, city: "上海" }] },
        },
      } as any,
      {
        id: "source-2",
        type: "custom",
        position: { x: 0, y: 120 },
        label: "来源二",
        data: {
          label: "来源二",
          type: "manual-json-import",
          category: "trigger",
          status: "success",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: { data: [{ id: 2, score: 95 }] },
        },
      } as any,
      {
        id: "data-merge-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "数据合并",
        data: {
          label: "数据合并",
          type: "data-merge",
          category: "action",
          status: "idle",
          config: { mergeMode: "append" },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];
    store.edges = [
      {
        id: "e1",
        source: "source-1",
        target: "data-merge-node",
        type: "n8n",
        animated: true,
      },
      {
        id: "e2",
        source: "source-2",
        target: "data-merge-node",
        type: "n8n",
        animated: true,
      },
    ] as any;

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "data-merge-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: {
            props: ["title", "data"],
            template:
              '<div class="data-display-panel">{{ title }}::{{ JSON.stringify(data) }}</div>',
          },
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    const inputPanel = wrapper.findAll(".data-display-panel")[0]!;
    expect(inputPanel.text()).toContain("inputs");
    expect(inputPanel.text()).toContain("来源一");
    expect(inputPanel.text()).toContain("来源二");
    expect(
      wrapper.find('[data-testid="runtime-inputs-panel-shell"]').exists(),
    ).toBe(true);
  });

  it("exposes upstream factor schema metadata for analysis field hints", () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "source-1",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "来源一",
        data: {
          label: "来源一",
          type: "manual-json-import",
          category: "trigger",
          status: "success",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: {
            kind: "table",
            payload: [{ temperature: 12.3, batchCode: "A-01" }],
            schema: {
              fields: [
                { name: "temperature", type: "number" },
                { name: "batchCode", type: "string" },
              ],
            },
          },
        },
      } as any,
      {
        id: "pearson-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "Pearson 分析",
        data: {
          label: "Pearson 分析",
          type: "pearson",
          category: "terminal",
          status: "idle",
          config: { xFields: [], yFields: [] },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];
    store.edges = [
      {
        id: "e1",
        source: "source-1",
        target: "pearson-node",
        type: "n8n",
        animated: true,
      },
    ] as any;

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "pearson-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            props: ["upstreamFactors"],
            template:
              '<div class="upstream-factors">{{ JSON.stringify(upstreamFactors) }}</div>',
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    const upstreamFactorsText = wrapper.find(".upstream-factors").text();
    expect(upstreamFactorsText).toContain('"name":"temperature"');
    expect(upstreamFactorsText).toContain('"dataType":"number"');
    expect(upstreamFactorsText).toContain('"missingRate":0');
    expect(upstreamFactorsText).toContain('"completenessRate":1');
    expect(upstreamFactorsText).toContain('"name":"batchCode"');
    expect(upstreamFactorsText).toContain('"dataType":"string"');
  });

  it("derives upstream factors from grouped collection outputs using common fields", () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "merge-node",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "数据合并",
        data: {
          label: "数据合并",
          type: "data-merge",
          category: "action",
          status: "success",
          config: { mergeMode: "collection" },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: {
            kind: "tableCollection",
            payload: [
              {
                name: "来源一",
                data: [
                  { score: null, temperature: 10, onlyA: 1 },
                  { score: 2, temperature: 12 },
                ],
              },
              {
                name: "来源二",
                data: [
                  { score: null, temperature: 20, onlyB: 9 },
                  { score: 5, temperature: 24 },
                ],
              },
            ],
          },
        },
      } as any,
      {
        id: "chart-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "图表展示",
        data: {
          label: "图表展示",
          type: "chart-display",
          category: "terminal",
          status: "idle",
          config: { chartType: "boxplot", xAxis: "", yAxis: "" },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];
    store.edges = [
      {
        id: "e1",
        source: "merge-node",
        target: "chart-node",
        type: "n8n",
        animated: true,
      },
    ] as any;

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "chart-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            props: ["upstreamFactors"],
            template:
              '<div class="upstream-factors">{{ JSON.stringify(upstreamFactors) }}</div>',
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    const text = wrapper.find(".upstream-factors").text();
    expect(text).toContain('"name":"score"');
    expect(text).toContain('"name":"temperature"');
    expect(text).toContain('"dataType":"number"');
    expect(text).not.toContain('"name":"onlyA"');
    expect(text).not.toContain('"name":"onlyB"');
  });

  it("shows a compact correlation setup guide entry for first-time analysis configuration", () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "source-1",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "来源一",
        data: {
          label: "来源一",
          type: "manual-json-import",
          category: "trigger",
          status: "success",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: {
            kind: "table",
            payload: [{ target: 12, f1: 1.2, f2: 3.4 }],
            schema: {
              fields: [
                { name: "target", type: "number" },
                { name: "f1", type: "number" },
                { name: "f2", type: "number" },
              ],
            },
          },
        },
      } as any,
      {
        id: "pearson-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "Pearson 分析",
        data: {
          label: "Pearson 分析",
          type: "pearson",
          category: "terminal",
          status: "idle",
          config: { xFields: [], yFields: [], heatmapTopN: 8, rankingTopN: 8 },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];
    store.edges = [
      {
        id: "e1",
        source: "source-1",
        target: "pearson-node",
        type: "n8n",
        animated: true,
      },
    ] as any;

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "pearson-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    expect(
      wrapper.find('[data-testid="correlation-setup-guide"]').exists(),
    ).toBe(true);
    expect(wrapper.text()).toContain("相关性分析配置建议");
    expect(wrapper.text()).toContain("可用数值字段 3 个");
  });

  it("shows file import background parsing status in the debug workspace", () => {
    const store = useWorkflowStore();
    store.fileImportTasks = {
      "file-import-node": {
        phase: "cleaning",
        progress: 70,
        fileName: "demo.xlsx",
        format: "xlsx",
        canCancel: true,
        startedAt: Date.now(),
      },
    } as any;
    store.nodes = [
      {
        id: "file-import-node",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "文件导入",
        data: {
          label: "文件导入",
          type: "file-import",
          category: "trigger",
          status: "running",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: null,
        },
      } as any,
    ];

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "file-import-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    expect(wrapper.text()).toContain("后台解析中");
    expect(wrapper.text()).toContain("demo.xlsx");
    expect(wrapper.text()).toContain("正在清洗并识别字段");
  });

  it("generates a standard table result template for single-input debugging", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "source-1",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "来源一",
        data: {
          label: "来源一",
          type: "manual-json-import",
          category: "trigger",
          status: "success",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: {
            kind: "table",
            payload: [{ id: 1, city: "上海", score: 95 }],
          },
        },
      } as any,
      {
        id: "data-cleaning-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "数据清洗",
        data: {
          label: "数据清洗",
          type: "data-cleaning",
          category: "action",
          status: "idle",
          config: {},
          logs: [],
          useManualInput: true,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];
    store.edges = [
      {
        id: "e1",
        source: "source-1",
        target: "data-cleaning-node",
        type: "n8n",
        animated: true,
      },
    ] as any;

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "data-cleaning-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: {
            props: ["title", "manualInputStr"],
            emits: ["generateMock"],
            template:
              '<div class="data-display-panel">{{ title }}::{{ manualInputStr }}<button class="generate-mock-btn" @click="$emit(\'generateMock\')">生成</button></div>',
          },
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    await wrapper.find(".generate-mock-btn").trigger("click");

    const inputPanel = wrapper.findAll(".data-display-panel")[0]!;
    expect(inputPanel.text()).toContain('"kind": "table"');
    expect(inputPanel.text()).toContain('"payload"');
    expect(inputPanel.text()).not.toContain('"data":');
  });

  it("generates a multi-input execution template with standard results", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "source-1",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "来源一",
        data: {
          label: "来源一",
          type: "manual-json-import",
          category: "trigger",
          status: "success",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: {
            kind: "table",
            payload: [{ id: 1, city: "上海" }],
          },
        },
      } as any,
      {
        id: "source-2",
        type: "custom",
        position: { x: 0, y: 120 },
        label: "来源二",
        data: {
          label: "来源二",
          type: "manual-json-import",
          category: "trigger",
          status: "success",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: {
            kind: "table",
            payload: [{ id: 2, score: 88 }],
          },
        },
      } as any,
      {
        id: "data-merge-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "数据合并",
        data: {
          label: "数据合并",
          type: "data-merge",
          category: "action",
          status: "idle",
          config: { mergeMode: "append" },
          logs: [],
          useManualInput: true,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];
    store.edges = [
      {
        id: "e1",
        source: "source-1",
        target: "data-merge-node",
        type: "n8n",
        animated: true,
      },
      {
        id: "e2",
        source: "source-2",
        target: "data-merge-node",
        type: "n8n",
        animated: true,
      },
    ] as any;

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "data-merge-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: {
            props: ["title", "manualInputStr"],
            emits: ["generateMock"],
            template:
              '<div class="data-display-panel">{{ title }}::{{ manualInputStr }}<button class="generate-mock-btn" @click="$emit(\'generateMock\')">生成</button></div>',
          },
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    await wrapper.find(".generate-mock-btn").trigger("click");

    const inputPanel = wrapper.findAll(".data-display-panel")[0]!;
    expect(inputPanel.text()).toContain('"inputs"');
    expect(inputPanel.text()).toContain('"result"');
    expect(inputPanel.text()).toContain('"kind": "table"');
    expect(inputPanel.text()).not.toContain('"data":');
  });

  it("renders a compact node summary and opens full help in a dialog", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "file-import-node",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "文件导入",
        data: {
          label: "文件导入",
          type: "file-import",
          category: "trigger",
          status: "idle",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "file-import-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    expect(wrapper.text()).toContain("节点简介");
    expect(wrapper.text()).toContain("本地文件导入");
    expect(wrapper.text()).not.toContain("适用场景");

    const helpButton = wrapper.find('[data-testid="node-help-trigger"]');
    expect(helpButton.exists()).toBe(true);

    await helpButton.trigger("click");

    expect(wrapper.text()).toContain("适用场景");
    expect(wrapper.text()).toContain("输入要求");
  });

  it("shows a fallback help message when node help is unavailable", () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "unknown-node",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "未知节点",
        data: {
          label: "未知节点",
          type: "unknown-node-type",
          category: "action",
          status: "idle",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "unknown-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    expect(wrapper.text()).toContain("未找到节点定义");
    expect(wrapper.text()).toContain("暂时无法展示帮助");
    expect(wrapper.find('[data-testid="node-help-trigger"]').exists()).toBe(
      false,
    );
  });

  it("saves config without closing the modal when applying changes", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "data-cleaning-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "数据清洗",
        data: {
          label: "数据清洗",
          type: "data-cleaning",
          category: "action",
          status: "idle",
          config: { scaling: "none" },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "data-cleaning-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: {
            template:
              '<button class="apply-btn" @click="$emit(\'save\')">应用</button>',
          },
          ConfigForm: {
            props: ["config", "properties", "upstreamFactors"],
            emits: ["update:config", "save"],
            template:
              "<div><button class=\"change-config-btn\" @click=\"$emit('update:config', { ...config, scaling: 'minmax' })\">改配置</button></div>",
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    const closeCountBeforeSave = wrapper.emitted("close")?.length ?? 0;
    await wrapper.get(".change-config-btn").trigger("click");
    await wrapper.get(".apply-btn").trigger("click");

    expect(store.nodes[0]?.data.config.scaling).toBe("minmax");
    expect(wrapper.emitted("close")?.length ?? 0).toBe(closeCountBeforeSave);
  });

  it("cleans up document drag listeners when unmounted during resize", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "file-import-node",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "文件导入",
        data: {
          label: "文件导入",
          type: "file-import",
          category: "trigger",
          status: "idle",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];

    const addEventListenerSpy = vi.spyOn(document, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "file-import-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    await wrapper
      .find('[data-testid="left-pane-vertical-resizer"]')
      .trigger("mousedown", { clientY: 320 });
    wrapper.unmount();

    const mouseMoveHandler = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === "mousemove",
    )?.[1];
    const mouseUpHandler = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === "mouseup",
    )?.[1];

    expect(mouseMoveHandler).toBeTypeOf("function");
    expect(mouseUpHandler).toBeTypeOf("function");
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "mousemove",
      mouseMoveHandler,
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "mouseup",
      mouseUpHandler,
    );
  });

  it("allows dragging both horizontal dividers to resize the three-column debug layout", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "file-import-node",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "文件导入",
        data: {
          label: "文件导入",
          type: "file-import",
          category: "trigger",
          status: "idle",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "file-import-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    const leftPane = wrapper.get('[data-testid="debug-left-pane"]');
    const rightPane = wrapper.get('[data-testid="debug-right-pane"]');

    expect(leftPane.attributes("style")).toContain("width: 320px;");
    expect(rightPane.attributes("style")).toContain("width: 320px;");

    await wrapper
      .find('[data-testid="left-pane-horizontal-resizer"]')
      .trigger("mousedown", {
        clientX: 320,
      });
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 420 }));
    document.dispatchEvent(new MouseEvent("mouseup"));
    await nextTick();

    expect(leftPane.attributes("style")).toContain("width: 420px;");

    await wrapper
      .find('[data-testid="right-pane-horizontal-resizer"]')
      .trigger("mousedown", {
        clientX: 960,
      });
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 880 }));
    document.dispatchEvent(new MouseEvent("mouseup"));
    await nextTick();

    expect(rightPane.attributes("style")).toContain("width: 400px;");
  });

  it("shows runtime settings for trigger nodes and allows resetting saved runtime inputs", async () => {
    const store = useWorkflowStore();
    const file = new File(["a,b\n1,2"], "test.csv");
    store.nodes = [
      {
        id: "file-import-node",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "文件导入",
        data: {
          label: "文件导入",
          type: "file-import",
          category: "trigger",
          status: "idle",
          config: {
            fileData: file,
            format: "csv",
          },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          reuseLastRuntimeInputs: true,
        },
      } as any,
    ];

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "file-import-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    expect(wrapper.text()).toContain("运行设置");
    expect(wrapper.text()).not.toContain("系统选项");

    const runtimeSettingsTab = wrapper
      .findAll("button")
      .find((button) => button.text() === "运行设置");
    expect(runtimeSettingsTab).toBeTruthy();

    await runtimeSettingsTab!.trigger("click");
    await nextTick();

    expect(wrapper.text()).toContain("沿用上次启动参数");
    expect(wrapper.text()).toContain("重置已保存启动参数");

    const resetButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("重置已保存启动参数"));
    expect(resetButton).toBeTruthy();

    await resetButton!.trigger("click");

    expect(store.nodes[0]?.data.reuseLastRuntimeInputs).toBe(false);
    expect(store.nodes[0]?.data.config.fileData).toBeNull();
    expect(store.nodes[0]?.data.config.format).toBe("csv");
  });

  it("renders a refined error card above the output panel when node debugging fails", () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "pearson-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "Pearson 分析",
        data: {
          label: "Pearson 分析",
          type: "pearson",
          category: "terminal",
          status: "error",
          error: "字段 target 不存在，请先检查输入字段映射",
          config: { xFields: [], yFields: [] },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: null,
        },
      } as any,
    ];

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "pearson-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: {
            props: ["title"],
            template: '<div class="data-display-panel">{{ title }}</div>',
          },
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    expect(wrapper.find('[data-testid="node-debug-error-card"]').exists()).toBe(
      true,
    );
    expect(wrapper.text()).toContain("本次调试失败");
    expect(wrapper.text()).toContain(
      "字段 target 不存在，请先检查输入字段映射",
    );
    expect(wrapper.text()).toContain("重新调试");
    expect(wrapper.text()).toContain("重跑上游后调试");
    expect(wrapper.text()).toContain("查看执行日志");
  });

  it("opens the log panel and closes the modal from the error card action", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "pearson-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "Pearson 分析",
        data: {
          label: "Pearson 分析",
          type: "pearson",
          category: "terminal",
          status: "error",
          error: "字段 target 不存在，请先检查输入字段映射",
          config: { xFields: [], yFields: [] },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: null,
        },
      } as any,
    ];

    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "pearson-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: {
            props: ["title"],
            template: '<div class="data-display-panel">{{ title }}</div>',
          },
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    await wrapper
      .get('[data-testid="node-debug-open-log-button"]')
      .trigger("click");

    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workflow:open-log-panel",
      }),
    );
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("shows loading debug actions and a stop button while the current node debug run is active", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "pearson-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "Pearson 分析",
        data: {
          label: "Pearson 分析",
          type: "pearson",
          category: "terminal",
          status: "idle",
          config: { xFields: [], yFields: [] },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: null,
        },
      } as any,
    ];
    store.isRunning = true;
    (store as any).activeExecutionScope = "single";
    (store as any).activeExecutionNodeId = "pearson-node";

    const stopSpy = vi
      .spyOn(store, "stopExecution")
      .mockImplementation(() => undefined);

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "pearson-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: {
            props: ["title"],
            template: '<div class="data-display-panel">{{ title }}</div>',
          },
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    const debugButton = wrapper.get('[data-testid="node-config-debug-button"]');
    const rerunButton = wrapper.get('[data-testid="node-config-rerun-button"]');
    const stopButton = wrapper.get('[data-testid="node-config-stop-button"]');

    expect(debugButton.attributes("disabled")).toBeDefined();
    expect(rerunButton.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("正在调试...");

    await stopButton.trigger("click");

    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it("shows the js transform agent panel only for js-transform nodes", () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "source-1",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "来源一",
        data: {
          label: "来源一",
          type: "manual-json-import",
          category: "trigger",
          status: "success",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: {
            kind: "table",
            payload: [{ date: "2026-05-01", revenue: 12 }],
          },
        },
      } as any,
      {
        id: "js-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "JS代码执行",
        data: {
          label: "JS代码执行",
          type: "js-transform",
          category: "action",
          status: "idle",
          config: { code: "return rows" },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
      {
        id: "pearson-node",
        type: "custom",
        position: { x: 600, y: 0 },
        label: "Pearson 分析",
        data: {
          label: "Pearson 分析",
          type: "pearson",
          category: "terminal",
          status: "idle",
          config: { xFields: [], yFields: [] },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];
    store.edges = [
      {
        id: "e1",
        source: "source-1",
        target: "js-node",
        type: "n8n",
        animated: true,
      },
      {
        id: "e2",
        source: "source-1",
        target: "pearson-node",
        type: "n8n",
        animated: true,
      },
    ] as any;

    const globalStubs = {
      Dialog: dialogStub,
      DataDisplayPanel: true,
      DataAnalysisModal: true,
      ConfigHeader: {
        template: "<div />",
        props: ["nodeLabel", "isPinned", "nodeType"],
      },
      ConfigFooter: { template: "<div />" },
      ConfigForm: {
        template: "<div />",
        props: ["config", "properties", "upstreamFactors"],
      },
      RuntimeInputs: {
        template: "<div />",
        props: ["config", "properties", "upstreamFactors"],
      },
      JsTransformAgentPanel: {
        template: '<div data-testid="js-transform-agent-panel" />',
      },
    };

    const jsWrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "js-node" },
      global: {
        stubs: globalStubs,
      },
    });

    const pearsonWrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "pearson-node" },
      global: {
        stubs: globalStubs,
      },
    });

    expect(jsWrapper.find('[data-testid="js-transform-agent-panel"]').exists()).toBe(true);
    expect(pearsonWrapper.find('[data-testid="js-transform-agent-panel"]').exists()).toBe(false);
  });

  it("shows loading copy after clicking debug for a synchronous local node", async () => {
    const syncNodeDefinition = {
      name: "test-sync-config-node",
      displayName: "同步配置节点",
      icon: "zap",
      category: "action" as const,
      description: "test",
      properties: [],
      execute: () => ({
        kind: "json" as const,
        payload: { ok: true },
      }),
    };

    nodeDefinitions.push(syncNodeDefinition);

    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const scheduledPaintCallbacks: Array<() => void> = [];

    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        scheduledPaintCallbacks.push(() => callback(16));
        return 1;
      }),
    );

    try {
      const store = useWorkflowStore();
      store.nodes = [
        {
          id: "sync-config-node",
          type: "custom",
          position: { x: 300, y: 0 },
          label: "同步配置节点",
          data: {
            label: "同步配置节点",
            type: "test-sync-config-node",
            category: "action",
            status: "idle",
            config: {},
            logs: [],
            useManualInput: false,
            manualInput: "",
            isPinned: false,
            output: null,
          },
        } as any,
      ];

      const wrapper = mount(NodeConfigModal, {
        props: { visible: true, nodeId: "sync-config-node" },
        global: {
          stubs: {
            Dialog: dialogStub,
            DataDisplayPanel: {
              props: ["title"],
              template: '<div class="data-display-panel">{{ title }}</div>',
            },
            DataAnalysisModal: true,
            ConfigHeader: {
              template: "<div />",
              props: ["nodeLabel", "isPinned", "nodeType"],
            },
            ConfigFooter: { template: "<div />" },
            ConfigForm: {
              template: "<div />",
              props: ["config", "properties", "upstreamFactors"],
            },
            RuntimeInputs: {
              template: "<div />",
              props: ["config", "properties", "upstreamFactors"],
            },
          },
        },
      });

      await wrapper.get('[data-testid="node-config-debug-button"]').trigger("click");
      await nextTick();

      expect(wrapper.text()).toContain("正在调试...");
      expect(
        wrapper.get('[data-testid="node-config-debug-button"]').attributes("disabled"),
      ).toBeDefined();

      scheduledPaintCallbacks[0]?.();
      await Promise.resolve();
      await nextTick();
      wrapper.unmount();
    } finally {
      const index = nodeDefinitions.findIndex(
        (definition) => definition.name === "test-sync-config-node",
      );
      if (index >= 0) nodeDefinitions.splice(index, 1);

      if (originalRequestAnimationFrame) {
        vi.stubGlobal("requestAnimationFrame", originalRequestAnimationFrame);
      } else {
        vi.unstubAllGlobals();
      }
    }
  });

  it("shows a success toast after applying node config changes", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "data-cleaning-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "数据清洗",
        data: {
          label: "数据清洗",
          type: "data-cleaning",
          category: "action",
          status: "idle",
          config: { scaling: "none" },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "data-cleaning-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: {
            template:
              '<button class="apply-btn" @click="$emit(\'save\')">应用</button>',
          },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    await wrapper.get(".apply-btn").trigger("click");

    expect(mockToastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        group: "node-config",
        severity: "success",
        summary: "保存成功",
        detail: "节点配置已应用",
      }),
    );
  });

  it("applies node config when pressing Ctrl+S while the modal is visible", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "data-cleaning-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "数据清洗",
        data: {
          label: "数据清洗",
          type: "data-cleaning",
          category: "action",
          status: "idle",
          config: { scaling: "none" },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "data-cleaning-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    const event = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      cancelable: true,
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(mockToastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "保存成功",
        detail: "节点配置已应用",
      }),
    );

    wrapper.unmount();
  });

  it("ignores Ctrl+S when the modal is not visible", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "data-cleaning-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "数据清洗",
        data: {
          label: "数据清洗",
          type: "data-cleaning",
          category: "action",
          status: "idle",
          config: { scaling: "none" },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];

    const wrapper = mount(NodeConfigModal, {
      props: { visible: false, nodeId: "data-cleaning-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    const event = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      cancelable: true,
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(mockToastAdd).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("disables dragging for the node config dialog and help dialog", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "data-cleaning-node",
        type: "custom",
        position: { x: 300, y: 0 },
        label: "数据清洗",
        data: {
          label: "数据清洗",
          type: "data-cleaning",
          category: "action",
          status: "idle",
          config: { scaling: "none" },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "data-cleaning-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    const initialDialogs = wrapper.findAll(".dialog-stub");
    expect(initialDialogs).toHaveLength(2);
    expect(initialDialogs[0]?.attributes("data-draggable")).toBe("false");
    expect(initialDialogs[1]?.attributes("data-draggable")).toBe("false");

    await wrapper.get('[data-testid="node-help-trigger"]').trigger("click");
    await nextTick();

    const helpDialogs = wrapper.findAll(".dialog-stub");
    expect(helpDialogs[0]?.attributes("data-draggable")).toBe("false");
    expect(helpDialogs[1]?.attributes("data-draggable")).toBe("false");
    expect(helpDialogs[1]?.attributes("data-visible")).toBe("true");
  });

  it("renders neighbor rails outside dialog with direct upstream and downstream nodes only", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "upstream-node",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "上游节点",
        data: {
          label: "上游节点",
          type: "manual-json-import",
          category: "trigger",
          status: "idle",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
      {
        id: "current-node",
        type: "custom",
        position: { x: 320, y: 60 },
        label: "当前节点",
        data: {
          label: "当前节点",
          type: "data-cleaning",
          category: "action",
          status: "idle",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
      {
        id: "downstream-node",
        type: "custom",
        position: { x: 640, y: 120 },
        label: "下游节点",
        data: {
          label: "下游节点",
          type: "pearson",
          category: "terminal",
          status: "idle",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];
    store.edges = [
      {
        id: "e1",
        source: "upstream-node",
        target: "current-node",
        type: "n8n",
        animated: true,
      },
      {
        id: "e2",
        source: "current-node",
        target: "downstream-node",
        type: "n8n",
        animated: true,
      },
    ] as any;

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "current-node" },
      attachTo: document.body,
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    await nextTick();

    const leftRail = document.body.querySelector(
      '[data-testid="debug-neighbor-left-rail"]',
    );
    const rightRail = document.body.querySelector(
      '[data-testid="debug-neighbor-right-rail"]',
    );

    expect(leftRail).not.toBeNull();
    expect(rightRail).not.toBeNull();
    expect(document.body.textContent).toContain("上游节点");
    expect(document.body.textContent).toContain("下游节点");

    wrapper.unmount();
  });

  it("hides neighbor navigators while node result preview is open", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "upstream-node",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "上游节点",
        data: {
          label: "上游节点",
          type: "manual-json-import",
          category: "trigger",
          status: "success",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: { data: [{ id: 1 }] },
        },
      } as any,
      {
        id: "current-node",
        type: "custom",
        position: { x: 320, y: 60 },
        label: "当前节点",
        data: {
          label: "当前节点",
          type: "data-cleaning",
          category: "action",
          status: "success",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          output: { data: [{ id: 2 }] },
        },
      } as any,
      {
        id: "downstream-node",
        type: "custom",
        position: { x: 640, y: 120 },
        label: "下游节点",
        data: {
          label: "下游节点",
          type: "pearson",
          category: "terminal",
          status: "idle",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];
    store.edges = [
      {
        id: "e1",
        source: "upstream-node",
        target: "current-node",
        type: "n8n",
        animated: true,
      },
      {
        id: "e2",
        source: "current-node",
        target: "downstream-node",
        type: "n8n",
        animated: true,
      },
    ] as any;

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "current-node" },
      attachTo: document.body,
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: {
            emits: ["open-detail"],
            template:
              '<button class="open-detail-btn" @click="$emit(\'open-detail\')">打开预览</button>',
          },
          DataAnalysisModal: {
            props: ["visible"],
            template:
              '<div v-if="visible" data-testid="analysis-modal-stub">结果预览</div>',
          },
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    await nextTick();

    expect(
      document.body.querySelector('[data-testid="debug-neighbor-left-rail"]'),
    ).not.toBeNull();
    expect(
      document.body.querySelector('[data-testid="debug-neighbor-right-rail"]'),
    ).not.toBeNull();

    await wrapper.findAll(".open-detail-btn")[1]!.trigger("click");
    await nextTick();

    expect(wrapper.find('[data-testid="analysis-modal-stub"]').exists()).toBe(
      true,
    );
    expect(
      document.body.querySelector('[data-testid="debug-neighbor-left-rail"]'),
    ).toBeNull();
    expect(
      document.body.querySelector('[data-testid="debug-neighbor-right-rail"]'),
    ).toBeNull();

    wrapper.unmount();
  });

  it("switches target node by clicking neighbor button without auto-saving current draft", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "upstream-node",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "上游节点",
        data: {
          label: "上游节点",
          type: "manual-json-import",
          category: "trigger",
          status: "idle",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
      {
        id: "current-node",
        type: "custom",
        position: { x: 320, y: 60 },
        label: "当前节点",
        data: {
          label: "当前节点",
          type: "data-cleaning",
          category: "action",
          status: "idle",
          config: { scaling: "none" },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
      {
        id: "downstream-node",
        type: "custom",
        position: { x: 640, y: 120 },
        label: "下游节点",
        data: {
          label: "下游节点",
          type: "pearson",
          category: "terminal",
          status: "idle",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];
    store.edges = [
      {
        id: "e1",
        source: "upstream-node",
        target: "current-node",
        type: "n8n",
        animated: true,
      },
      {
        id: "e2",
        source: "current-node",
        target: "downstream-node",
        type: "n8n",
        animated: true,
      },
    ] as any;

    const switchSpy = vi.spyOn(store, "setActiveConfigNodeId");

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "current-node" },
      attachTo: document.body,
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: { template: "<div />" },
          ConfigForm: {
            props: ["config"],
            emits: ["update:config"],
            template:
              "<button class=\"change-config-btn\" @click=\"$emit('update:config', { ...config, scaling: 'minmax' })\">改配置</button>",
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    await wrapper.get(".change-config-btn").trigger("click");
    await nextTick();

    const downstreamButton = document.body.querySelector(
      '[data-testid="debug-neighbor-downstream-downstream-node"]',
    ) as HTMLButtonElement | null;
    expect(downstreamButton).not.toBeNull();
    downstreamButton?.click();

    expect(switchSpy).toHaveBeenCalledWith("downstream-node");
    expect(
      store.nodes.find((item) => item.id === "current-node")?.data.config
        .scaling,
    ).toBe("none");

    wrapper.unmount();
  });

  it("does not persist runtime input values when applying trigger node settings", async () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "neighbor-system-node",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "看板数据对接",
        data: {
          label: "看板数据对接",
          type: "neighbor-system",
          category: "trigger",
          status: "idle",
          config: {
            productName: "产品A",
            fetchMode: "time",
            timeRange: null,
            materialType: "",
          },
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
          reuseLastRuntimeInputs: false,
        },
      } as any,
    ];

    const selectedRange = [
      new Date("2026-04-01T00:00:00.000Z"),
      new Date("2026-04-07T00:00:00.000Z"),
    ];

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "neighbor-system-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: {
            template:
              '<button class="apply-btn" @click="$emit(\'save\')">应用</button>',
          },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            props: ["config"],
            emits: ["update:config"],
            template:
              "<button class=\"runtime-change-btn\" @click=\"$emit('update:config', { ...config, timeRange: selectedRange, materialType: '成品' })\">改运行时输入</button>",
            data() {
              return {
                selectedRange,
              };
            },
          },
        },
      },
    });

    await wrapper.get(".runtime-change-btn").trigger("click");
    await wrapper.get(".apply-btn").trigger("click");

    expect(store.nodes[0]?.data.config.productName).toBe("产品A");
    expect(store.nodes[0]?.data.config.fetchMode).toBe("time");
    expect(store.nodes[0]?.data.config.timeRange).toBeNull();
    expect(store.nodes[0]?.data.config.materialType).toBe("");
  });

  it("keeps a fixed dialog height and limits scrolling to the center config area", () => {
    const store = useWorkflowStore();
    store.nodes = [
      {
        id: "layout-node",
        type: "custom",
        position: { x: 0, y: 0 },
        label: "布局测试节点",
        data: {
          label: "布局测试节点",
          type: "data-cleaning",
          category: "action",
          status: "idle",
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: "",
          isPinned: false,
        },
      } as any,
    ];

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: "layout-node" },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: {
            template: "<div />",
            props: ["nodeLabel", "isPinned", "nodeType"],
          },
          ConfigFooter: {
            template: '<div data-testid="config-footer-stub">底部操作区</div>',
          },
          ConfigForm: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
          RuntimeInputs: {
            template: "<div />",
            props: ["config", "properties", "upstreamFactors"],
          },
        },
      },
    });

    const dialog = wrapper.get(".dialog-stub");
    const bodyShell = wrapper.get(".ndv-body-shell");
    const body = wrapper.get(".ndv-body");
    const centerScrollArea = wrapper.get(".custom-scrollbar");
    const footer = wrapper.get('[data-testid="config-footer-stub"]');

    expect(dialog.attributes("data-style")).toContain('"height":"88vh"');
    expect(dialog.attributes("data-style")).not.toContain('"maxHeight":"88vh"');
    expect(bodyShell.classes()).toContain("h-full");
    expect(body.classes()).toContain("w-full");
    expect(centerScrollArea.element.contains(footer.element)).toBe(false);
  });
});
