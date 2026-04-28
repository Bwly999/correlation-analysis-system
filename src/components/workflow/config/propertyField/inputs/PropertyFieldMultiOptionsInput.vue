<script setup lang="ts">
import { computed, shallowRef } from "vue";
import MultiSelect from "primevue/multiselect";
import type { NodeProperty } from "@/nodes/types";
import {
  PROPERTY_FIELD_MULTI_OPTIONS_MAX_SELECTED_LABELS,
  PROPERTY_FIELD_MULTI_OPTIONS_SELECTED_LABEL,
  PROPERTY_FIELD_OPTION_ITEM_SIZE,
} from "../constants";
import { useRegexFilter } from "../useRegexFilter";

const props = defineProps<{
  modelValue: unknown;
  prop: NodeProperty;
  options: any[];
  sourceOptionCount: number;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: unknown];
}>();

interface MultiSelectFilterEvent {
  value?: string;
}

interface MultiSelectAllChangeEvent {
  checked: boolean;
}

type QualityMetric = "completenessRate" | "missingRate";

const configValue = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const isQualityPanelOpen = shallowRef(false);
const qualityMetric = shallowRef<QualityMetric>("completenessRate");
const qualityThreshold = shallowRef(0);

const selectedValues = computed(() =>
  Array.isArray(configValue.value)
    ? configValue.value.filter(
        (value): value is string => typeof value === "string",
      )
    : [],
);

const selectedValueSet = computed(() => new Set(selectedValues.value));

const getOptionLabel = (option: any) =>
  String(option?.name ?? option?.label ?? option?.value ?? option ?? "");
const getOptionValue = (option: any) => String(option?.value ?? option);
const isOptionDisabled = (option: any) => Boolean(option?.disabled);
const hasQualityValue = (option: any) =>
  Number.isFinite(option?.missingRate) &&
  Number.isFinite(option?.completenessRate);

const canUseQualityFilter = computed(
  () =>
    Boolean(props.prop.useUpstreamFactors) &&
    props.options.some((option) => hasQualityValue(option)),
);

const normalizedQualityThreshold = computed(
  () => Math.max(0, Math.min(100, qualityThreshold.value)) / 100,
);

const matchesQualityFilter = (option: any) => {
  if (!canUseQualityFilter.value || qualityThreshold.value <= 0) return true;
  const metricValue = Number(option?.[qualityMetric.value]);
  if (!Number.isFinite(metricValue)) return false;
  return metricValue >= normalizedQualityThreshold.value;
};

const matchesCurrentFilter = (option: any) => {
  if (!matchesQualityFilter(option)) return false;

  const normalizedQuery = query.value.trim();
  if (!normalizedQuery) return true;

  const label = getOptionLabel(option);
  if (enabled.value) {
    try {
      return new RegExp(normalizedQuery, "i").test(label);
    } catch {
      return false;
    }
  }

  return label.toLowerCase().includes(normalizedQuery.toLowerCase());
};

const qualityFilteredOptions = computed(() =>
  props.options.filter((option) => matchesQualityFilter(option)),
);
const qualityFilteredCount = computed(
  () => qualityFilteredOptions.value.length,
);

const activeQualityLabel = computed(() =>
  qualityMetric.value === "completenessRate" ? "完整率" : "缺失率",
);

const qualitySummaryText = computed(
  () =>
    `${activeQualityLabel.value} ≥ ${Math.max(0, Math.min(100, qualityThreshold.value))}% · 命中 ${qualityFilteredCount.value} / ${props.options.length} 个字段`,
);

const visibleSelectionState = computed(() => {
  const visibleValues: string[] = [];
  const currentSelectedValueSet = selectedValueSet.value;
  let allVisibleSelected = true;

  props.options.forEach((option) => {
    if (isOptionDisabled(option) || !matchesCurrentFilter(option)) return;

    const optionValue = getOptionValue(option);
    visibleValues.push(optionValue);

    if (!currentSelectedValueSet.has(optionValue)) {
      allVisibleSelected = false;
    }
  });

  return {
    visibleValues,
    allVisibleSelected: visibleValues.length > 0 && allVisibleSelected,
  };
});

const visibleSelectableOptionValues = computed(
  () => visibleSelectionState.value.visibleValues,
);
const isAllVisibleSelected = computed(
  () => visibleSelectionState.value.allVisibleSelected,
);

const confirmEditableMultiOption = (event?: KeyboardEvent) => {
  const target = event?.target as HTMLInputElement | null;
  const value = (target?.value ?? query.value).trim();
  if (!value) return;

  const nextValues = Array.isArray(configValue.value)
    ? [...configValue.value]
    : [];
  if (!nextValues.includes(value)) {
    nextValues.push(value);
    configValue.value = nextValues;
  }

  clearQuery();
  if (target) target.value = "";
  event?.preventDefault();
};

const {
  query,
  enabled,
  errorMessage,
  filterMatchMode,
  filterInputProps,
  passThrough,
  clearQuery,
  setQuery,
  toggleRegexMode,
  getToggleClass,
} = useRegexFilter({
  inputTestId: "multi-options-filter-input",
  onEnter: confirmEditableMultiOption,
  defaultEnabled: false,
});

const multiOptionsForceInputHint = computed(() => {
  if (errorMessage.value) return errorMessage.value;
  if (!props.prop.forceInput) return undefined;
  if (props.sourceOptionCount > 0) return undefined;
  return "暂无可选项，可直接输入后按回车添加";
});

const virtualScrollerOptions = {
  itemSize: PROPERTY_FIELD_OPTION_ITEM_SIZE,
};

const handleFilter = (event: MultiSelectFilterEvent) => {
  setQuery(event.value ?? "");
};

const handleSelectAllChange = (event: MultiSelectAllChangeEvent) => {
  const visibleValues = visibleSelectableOptionValues.value;
  if (visibleValues.length === 0) return;

  if (event.checked) {
    const nextValues = [...selectedValues.value];
    const nextValueSet = new Set(nextValues);
    visibleValues.forEach((value) => {
      if (!nextValueSet.has(value)) {
        nextValues.push(value);
        nextValueSet.add(value);
      }
    });
    configValue.value = nextValues;
    return;
  }

  const visibleValueSet = new Set(visibleValues);
  configValue.value = selectedValues.value.filter(
    (value) => !visibleValueSet.has(value),
  );
};

const toggleQualityPanel = () => {
  isQualityPanelOpen.value = !isQualityPanelOpen.value;
};

const setQualityMetric = (metric: QualityMetric) => {
  qualityMetric.value = metric;
};

const handleQualityThresholdInput = (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  const nextValue = Number(target?.value ?? 0);
  qualityThreshold.value = Number.isFinite(nextValue)
    ? Math.max(0, Math.min(100, nextValue))
    : 0;
};

const clearQualityFilter = () => {
  qualityMetric.value = "completenessRate";
  qualityThreshold.value = 0;
};
</script>

<template>
  <MultiSelect
    v-model="configValue"
    :options="qualityFilteredOptions"
    option-label="name"
    option-value="value"
    option-disabled="disabled"
    :filter="true"
    :filter-match-mode="filterMatchMode"
    :filter-input-props="filterInputProps"
    :empty-filter-message="multiOptionsForceInputHint"
    :empty-message="multiOptionsForceInputHint"
    :pt="passThrough"
    :select-all="isAllVisibleSelected"
    display="chip"
    :max-selected-labels="PROPERTY_FIELD_MULTI_OPTIONS_MAX_SELECTED_LABELS"
    :selected-items-label="PROPERTY_FIELD_MULTI_OPTIONS_SELECTED_LABEL"
    :placeholder="prop.placeholder"
    :virtual-scroller-options="virtualScrollerOptions"
    class="w-full ndv-input ndv-multi-options"
    @filter="handleFilter"
    @selectall-change="handleSelectAllChange"
  >
    <template
      v-if="prop.allowRegexSearch !== false || canUseQualityFilter"
      #filtericon
    >
      <div class="relative flex items-center gap-1">
        <button
          v-if="prop.allowRegexSearch !== false"
          type="button"
          data-testid="multi-options-regex-toggle"
          :class="getToggleClass(enabled)"
          @mousedown.prevent
          @click="toggleRegexMode"
        >
          .*
        </button>
        <button
          v-if="canUseQualityFilter"
          type="button"
          data-testid="multi-options-quality-toggle"
          class="flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-semibold transition-all"
          :class="
            qualityThreshold > 0
              ? 'border-blue-200 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
          "
          title="字段质量筛选"
          @mousedown.prevent
          @click.stop="toggleQualityPanel"
        >
          <svg
            class="h-3 w-3"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M2.25 3.5h11.5L9.4 8.35v3.25l-2.8 1.35v-4.6L2.25 3.5Z"
              fill="none"
              stroke="currentColor"
              stroke-linejoin="round"
              stroke-width="1.5"
            />
          </svg>
        </button>
        <div
          v-if="canUseQualityFilter && isQualityPanelOpen"
          class="quality-filter-panel"
          data-testid="quality-filter-panel"
          @mousedown.stop
          @click.stop
        >
          <div class="mb-2 flex items-center justify-between gap-3">
            <span class="text-xs font-semibold text-slate-900"
              >字段质量筛选</span
            >
            <button
              type="button"
              class="text-xs text-slate-400 transition-colors hover:text-slate-700"
              @click="isQualityPanelOpen = false"
            >
              关闭
            </button>
          </div>
          <div
            class="mb-3 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-xs font-medium text-slate-500"
          >
            <button
              type="button"
              data-testid="quality-metric-completeness"
              class="rounded-md px-2 py-1.5 transition-colors"
              :class="
                qualityMetric === 'completenessRate'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'hover:text-slate-700'
              "
              @click="setQualityMetric('completenessRate')"
            >
              完整率
            </button>
            <button
              type="button"
              data-testid="quality-metric-missing"
              class="rounded-md px-2 py-1.5 transition-colors"
              :class="
                qualityMetric === 'missingRate'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'hover:text-slate-700'
              "
              @click="setQualityMetric('missingRate')"
            >
              缺失率
            </button>
          </div>
          <label class="mb-1 block text-xs font-medium text-slate-600"
            >阈值（大于等于）</label
          >
          <div class="mb-2 flex items-center gap-2">
            <input
              data-testid="quality-threshold-input"
              class="quality-threshold-input"
              type="number"
              min="0"
              max="100"
              step="1"
              :value="qualityThreshold"
              @input="handleQualityThresholdInput"
            />
            <span class="text-xs font-semibold text-slate-500">%</span>
          </div>
          <div
            class="mb-3 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-500"
          >
            {{ qualitySummaryText }}
          </div>
          <button
            type="button"
            class="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            @click="clearQualityFilter"
          >
            清除筛选
          </button>
        </div>
      </div>
    </template>
  </MultiSelect>
</template>

<style scoped>
:deep(.ndv-multi-options) {
  min-height: 42px;
}

:deep(.ndv-multi-options .p-multiselect-label-container) {
  min-height: 42px;
  display: flex;
  align-items: center;
}

:deep(.ndv-multi-options .p-multiselect-label) {
  min-height: 42px;
  padding: 0 12px;
  display: flex;
  align-items: center;
}

:deep(.ndv-multi-options .p-multiselect-dropdown) {
  width: 42px;
}

.quality-filter-panel {
  position: absolute;
  top: 32px;
  right: -8px;
  z-index: 20;
  width: 220px;
  border: 1px solid rgb(226 232 240);
  border-radius: 14px;
  background: rgb(255 255 255);
  padding: 12px;
  box-shadow: 0 18px 45px rgb(15 23 42 / 14%);
}

.quality-threshold-input {
  width: 100%;
  border: 1px solid rgb(203 213 225);
  border-radius: 10px;
  padding: 6px 9px;
  font-size: 12px;
  color: rgb(15 23 42);
  outline: none;
}

.quality-threshold-input:focus {
  border-color: rgb(37 99 235);
  box-shadow: 0 0 0 3px rgb(37 99 235 / 12%);
}
</style>
