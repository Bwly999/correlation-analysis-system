import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PropertyFieldMultiOptionsInput from "../PropertyFieldMultiOptionsInput.vue";

const multiOptions = [
  { name: "温度", value: "temperature" },
  { name: "压力", value: "pressure" },
  { name: "批次", value: "batch" },
];

describe("PropertyFieldMultiOptionsInput", () => {
  it("筛选后全选与反选仅增减当前命中项，不覆盖未命中的既有选择", async () => {
    const wrapper = mount(PropertyFieldMultiOptionsInput, {
      props: {
        modelValue: ["batch"],
        prop: {
          name: "fields",
          displayName: "字段列表",
          type: "multi-options",
          default: [],
          placeholder: "请选择字段",
        },
        options: multiOptions,
        sourceOptionCount: multiOptions.length,
      },
      global: {
        stubs: {
          MultiSelect: {
            props: ["selectAll"],
            emits: ["filter", "selectall-change"],
            template: `
              <div>
                <button
                  type="button"
                  data-testid="filter-temperature"
                  @click="$emit('filter', { originalEvent: { type: 'input' }, value: '温' })"
                >
                  筛选温度
                </button>
                <button
                  type="button"
                  data-testid="toggle-select-all"
                  @click="$emit('selectall-change', { originalEvent: { type: 'click' }, checked: !selectAll })"
                >
                  切换全选
                </button>
                <div data-testid="select-all-state">{{ selectAll }}</div>
              </div>
            `,
          },
        },
      },
    });

    await wrapper.get('[data-testid="filter-temperature"]').trigger("click");
    await wrapper.get('[data-testid="toggle-select-all"]').trigger("click");

    const emitted = wrapper.emitted("update:modelValue") || [];
    expect(emitted[0]?.[0]).toEqual(["batch", "temperature"]);

    await wrapper.setProps({
      modelValue: ["batch", "temperature"],
    });

    await wrapper.get('[data-testid="toggle-select-all"]').trigger("click");

    const updatedEmitted = wrapper.emitted("update:modelValue") || [];
    expect(updatedEmitted[1]?.[0]).toEqual(["batch"]);
  });
});

const qualityOptions = [
  { name: "温度", value: "temperature", completenessRate: 1, missingRate: 0 },
  {
    name: "压力",
    value: "pressure",
    completenessRate: 0.75,
    missingRate: 0.25,
  },
  { name: "批次", value: "batch", completenessRate: 0.5, missingRate: 0.5 },
];

const qualityMultiSelectStub = {
  props: ["options", "selectAll"],
  emits: ["filter", "selectall-change"],
  template: `
    <div>
      <slot name="filtericon" />
      <button
        type="button"
        data-testid="filter-temperature"
        @click="$emit('filter', { originalEvent: { type: 'input' }, value: '温' })"
      >
        筛选温度
      </button>
      <button
        type="button"
        data-testid="filter-empty"
        @click="$emit('filter', { originalEvent: { type: 'input' }, value: '' })"
      >
        清空文本筛选
      </button>
      <button
        type="button"
        data-testid="toggle-select-all"
        @click="$emit('selectall-change', { originalEvent: { type: 'click' }, checked: !selectAll })"
      >
        切换全选
      </button>
      <div data-testid="option-values">{{ options.map((option) => option.value).join(',') }}</div>
    </div>
  `,
};

describe("PropertyFieldMultiOptionsInput 字段质量筛选", () => {
  const mountWithOptions = (
    options: Array<Record<string, unknown>> = qualityOptions,
    propOverrides: Record<string, unknown> = {},
  ) =>
    mount(PropertyFieldMultiOptionsInput, {
      props: {
        modelValue: [],
        prop: {
          name: "fields",
          displayName: "字段列表",
          type: "multi-options",
          default: [],
          placeholder: "请选择字段",
          useUpstreamFactors: true,
          ...propOverrides,
        },
        options,
        sourceOptionCount: options.length,
      },
      global: {
        stubs: {
          MultiSelect: qualityMultiSelectStub,
        },
      },
    });

  it("仅对带质量指标的上游字段展示字段质量筛选入口", () => {
    const wrapper = mountWithOptions();

    expect(
      wrapper.find('[data-testid="multi-options-quality-toggle"]').exists(),
    ).toBe(true);

    const plainWrapper = mountWithOptions([
      { name: "温度", value: "temperature" },
    ]);
    expect(
      plainWrapper
        .find('[data-testid="multi-options-quality-toggle"]')
        .exists(),
    ).toBe(false);
  });

  it("按完整率阈值筛选候选字段，并在该基础上继续叠加原有文本筛选", async () => {
    const wrapper = mountWithOptions();

    await wrapper
      .get('[data-testid="multi-options-quality-toggle"]')
      .trigger("click");
    await wrapper.get('[data-testid="quality-threshold-input"]').setValue("70");

    expect(wrapper.get('[data-testid="option-values"]').text()).toBe(
      "temperature,pressure",
    );

    await wrapper.get('[data-testid="filter-temperature"]').trigger("click");
    await wrapper.get('[data-testid="toggle-select-all"]').trigger("click");

    expect(wrapper.emitted("update:modelValue")?.[0]?.[0]).toEqual([
      "temperature",
    ]);
  });

  it("按缺失率大于等于阈值筛选候选字段", async () => {
    const wrapper = mountWithOptions();

    await wrapper
      .get('[data-testid="multi-options-quality-toggle"]')
      .trigger("click");
    await wrapper
      .get('[data-testid="quality-metric-missing"]')
      .trigger("click");
    await wrapper.get('[data-testid="quality-threshold-input"]').setValue("30");

    expect(wrapper.get('[data-testid="option-values"]').text()).toBe("batch");
  });
});
