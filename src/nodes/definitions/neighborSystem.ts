import type { NodeDefinition } from '../types'

export const neighborSystemNode: NodeDefinition = {
  name: 'neighbor-system',
  displayName: '相邻系统对接',
  icon: 'database',
  category: 'trigger',
  description: '对接外部系统 API 获取因子数据。支持按时间、方案或 SN 集合进行多维度筛选。',
  properties: [
    {
      name: 'productId',
      displayName: '产品型号',
      type: 'options',
      default: 'p_01',
      options: [
        { name: '旗舰系列 A1', value: 'p_01' },
        { name: '标准系列 B2', value: 'p_02' },
        { name: '经济系列 C3', value: 'p_03' },
      ],
      required: true,
    },
    {
      name: 'fetchMode',
      displayName: '数据获取模式',
      type: 'options',
      default: 'time',
      isRuntimeInput: true,
      options: [
        { name: '时间范围', value: 'time' },
        { name: '按方案', value: 'scheme' },
        { name: '按 SN 集合', value: 'sn' },
      ],
    },
    {
      name: 'timeRange',
      displayName: '查询时间段',
      type: 'datetime-range',
      isRuntimeInput: true,
      description: '获取该时间段内产生数据的 SN 列表',
      displayIf: (config) => config.fetchMode === 'time',
    },
    {
      name: 'schemeId',
      displayName: '选择方案',
      type: 'options',
      default: '',
      isRuntimeInput: true,
      options: [
        { name: '全量生产方案', value: 'sch_full' },
        { name: '核心部件抽检方案', value: 'sch_core' },
        { name: '老化测试方案', value: 'sch_aging' },
      ],
      displayIf: (config) => config.fetchMode === 'scheme',
    },
    {
      name: 'snList',
      displayName: 'SN 集合',
      type: 'string',
      default: '',
      isRuntimeInput: true,
      placeholder: '多个 SN 以逗号或换行分隔',
      description: '直接指定要查询的设备序列号',
      displayIf: (config) => config.fetchMode === 'sn',
    },
    {
      name: 'selectedFactors',
      displayName: '选择要获取的因子',
      type: 'tree',
      required: true,
      description: '从因子全集树中选择（系统 -> 模块 -> 因子）',
      default: {},
      options: [
        {
          key: 'sys_power',
          label: '动力系统',
          data: 'Power System',
          children: [
            {
              key: 'mod_battery',
              label: '电池管理模块',
              data: 'Battery Module',
              children: [
                { key: 'f_bat_volt', label: '总电压', data: 'Total Voltage' },
                { key: 'f_bat_curr', label: '充放电电流', data: 'Current' },
                { key: 'f_bat_temp', label: '电芯最高温度', data: 'Max Temp' },
                { key: 'f_bat_soc', label: '剩余电量 (SOC)', data: 'SOC' },
              ],
            },
            {
              key: 'mod_motor',
              label: '驱动电机模块',
              data: 'Motor Module',
              children: [
                { key: 'f_mot_speed', label: '电机转速', data: 'Motor Speed' },
                { key: 'f_mot_torque', label: '输出扭矩', data: 'Torque' },
                { key: 'f_mot_temp', label: '电机绕组温度', data: 'Winding Temp' },
              ],
            },
          ],
        },
        {
          key: 'sys_control',
          label: '智能控制系统',
          data: 'Control System',
          children: [
            {
              key: 'mod_ecu',
              label: '中央控制单元',
              data: 'ECU',
              children: [
                { key: 'f_cpu_load', label: 'CPU 负载', data: 'CPU Load' },
                { key: 'f_mem_usage', label: '内存占用', data: 'Memory' },
              ],
            },
          ],
        },
        {
          key: 'sys_env',
          label: '环境感知系统',
          data: 'Environment System',
          children: [
            {
              key: 'mod_sensor',
              label: '外部传感器组',
              data: 'Sensors',
              children: [
                { key: 'f_env_temp', label: '环境温度', data: 'Env Temp' },
                { key: 'f_env_hum', label: '环境湿度', data: 'Env Humidity' },
              ],
            },
          ],
        },
      ],
    },
  ],
  execute: async (input, config) => {
    // 1. 模拟获取因子全集并解析选中的因子 ID
    // 选中的 key 可能是系统、模块或因子，我们只需要叶子节点（因子）
    const selectedKeys = Object.keys(config.selectedFactors || {}).filter(
      (key) => config.selectedFactors[key].checked && key.startsWith('f_'),
    )

    if (selectedKeys.length === 0) {
      throw new Error('请至少选择一个因子进行获取')
    }

    // 2. 根据 fetchMode 模拟获取 SN 列表
    let snList: string[] = []
    console.log(`[相邻系统] 正在按模式 [${config.fetchMode}] 检索 SN 列表...`)

    if (config.fetchMode === 'time') {
      const [start, end] = config.timeRange || []
      console.log(`[API] GET /api/v1/sn/query-by-time?start=${start}&end=${end}`)
      snList = ['SN_TIME_001', 'SN_TIME_002', 'SN_TIME_003']
    } else if (config.fetchMode === 'scheme') {
      console.log(`[API] GET /api/v1/sn/query-by-scheme?id=${config.schemeId}`)
      snList = ['SN_SCH_001', 'SN_SCH_002', 'SN_SCH_003', 'SN_SCH_004']
    } else {
      snList = (config.snList || '')
        .split(/[,\n]/)
        .map((s: string) => s.trim())
        .filter(Boolean)
      console.log(`[API] 使用用户输入的 SN 集合: ${snList.length} 个`)
    }

    if (snList.length === 0) {
      throw new Error('未检索到有效的 SN 列表，请检查查询参数')
    }

    // 3. 模拟使用 SN List 和 Factor List 获取详细数据
    console.log(`[API] POST /api/v1/data/fetch-multi-factors`)
    console.log(`[Payload] SNs: ${snList.length}, Factors: ${selectedKeys.length}`)

    // 生成模拟结果数据
    const data = snList.map((sn) => {
      const entry: any = {
        sn,
        timestamp: new Date().toISOString(),
        product_id: config.productId,
      }
      // 为每个选中的因子生成随机数据
      selectedKeys.forEach((f) => {
        entry[f] = (Math.random() * 100).toFixed(2)
      })
      return entry
    })

    return {
      data,
      metadata: {
        total_sn: snList.length,
        factors_count: selectedKeys.length,
        product: config.productId,
        fetch_mode: config.fetchMode,
      },
    }
  },
}
