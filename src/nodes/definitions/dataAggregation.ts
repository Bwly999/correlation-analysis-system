import type { NodeDefinition } from '../types';

export const dataAggregationNode: NodeDefinition = {
  name: 'data-aggregation',
  displayName: '数据聚合',
  icon: 'sigma',
  category: 'action',
  description: '将多个因子（X）按指定规则聚合为新的因子。支持多组并行聚合。',
  properties: [
    {
      name: 'aggregationGroups',
      displayName: '聚合任务配置',
      type: 'collection',
      default: [],
      description: '每一组配置将生成一个新的聚合因子',
      properties: [
        {
          name: 'targetFactorName',
          displayName: '新生成的因子名称',
          type: 'string',
          default: 'factor_combined',
          placeholder: '输入新因子的 Key'
        },
        {
          name: 'method',
          displayName: '数学聚合算法',
          type: 'options',
          default: 'arithmetic_mean',
          options: [
            { name: '算术平均 (Mean)', value: 'arithmetic_mean' },
            { name: '加权平均 (Weighted Mean)', value: 'weighted_mean' },
            { name: '几何平均 (Geometric Mean)', value: 'geometric_mean' },
            { name: '最大值 (Max)', value: 'max' },
            { name: '最小值 (Min)', value: 'min' },
            { name: '总和 (Sum)', value: 'sum' }
          ]
        },
        {
          name: 'factorWeights',
          displayName: '参与因子及权重配置',
          type: 'collection',
          default: [],
          description: '添加参与本次聚合的因子，并指定权重（仅加权平均有效）',
          properties: [
            {
              name: 'factorName',
              displayName: '选择因子',
              type: 'options', // 选一个因子
              options: [] // 动态获取
            },
            {
              name: 'weight',
              displayName: '权重',
              type: 'number',
              default: 1.0
            }
          ]
        }
      ]
    },
    {
      name: 'keepOriginalFactors',
      displayName: '保留原始输入因子',
      type: 'boolean',
      default: true
    }
  ],
  execute: async (input, config) => {
    if (!input || !input.data) return { message: "无有效输入数据" };
    
    const data = input.data;
    const groups = config.aggregationGroups || [];
    const keepOriginal = config.keepOriginalFactors;
    
    const usedFactors = new Set<string>();
    groups.forEach((g: any) => {
      (g.factorWeights || []).forEach((fw: any) => usedFactors.add(fw.factorName));
    });

    const processedData = data.map((row: any) => {
      const newRow = { ...row };
      
      groups.forEach((group: any) => {
        const factorConfigs = group.factorWeights || [];
        if (factorConfigs.length === 0) return;

        const entries = factorConfigs.map((fw: any) => ({
          val: Number(row[fw.factorName]),
          weight: Number(fw.weight || 1)
        })).filter((e: any) => !isNaN(e.val));

        if (entries.length === 0) {
          newRow[group.targetFactorName] = null;
          return;
        }

        let result = 0;
        const vals = entries.map((e: any) => e.val);
        const weights = entries.map((e: any) => e.weight);

        switch (group.method) {
          case 'sum':
            result = vals.reduce((a, b) => a + b, 0);
            break;
          case 'max':
            result = Math.max(...vals);
            break;
          case 'min':
            result = Math.min(...vals);
            break;
          case 'arithmetic_mean':
            result = vals.reduce((a, b) => a + b, 0) / vals.length;
            break;
          case 'weighted_mean':
            const weightedSum = entries.reduce((acc: number, e: any) => acc + (e.val * e.weight), 0);
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            result = totalWeight !== 0 ? weightedSum / totalWeight : 0;
            break;
          case 'geometric_mean':
            const prod = vals.reduce((a, b) => a * b, 1);
            result = Math.pow(Math.abs(prod), 1 / vals.length) * (prod < 0 ? -1 : 1);
            break;
          default:
            result = vals.reduce((a, b) => a + b, 0) / vals.length;
        }
        
        newRow[group.targetFactorName] = result;
      });

      if (!keepOriginal) {
        usedFactors.forEach(f => delete newRow[f]);
      }
      return newRow;
    });

    return { 
      data: processedData, 
      count: processedData.length,
      groups: groups.map((g: any) => g.targetFactorName)
    };
  }
};
