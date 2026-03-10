#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成2000条测试数据Excel文件
字段：SN（字符串） + 10个字符串类型的数字字段（可能为"N/A"缺失）
第一条记录必须有缺失字段
"""

import random
import openpyxl
from openpyxl.styles import Font, Alignment

# 生成2000条记录
num_records = 2000

# 创建工作簿
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "测试数据"

# 设置表头
headers = ["SN"]
for i in range(1, 11):
    headers.append(f"field_{i}")

ws.append(headers)

# 设置表头样式
for cell in ws[1]:
    cell.font = Font(bold=True)
    cell.alignment = Alignment(horizontal="center")

# 生成数据
for i in range(num_records):
    # SN字段：字符串格式
    sn = f"SN-{str(i+1).zfill(4)}"

    # 生成10个字段
    row_data = [sn]

    # 第一条记录必须有缺失字段
    if i == 0:
        # 确保第一条记录有3-5个字段缺失
        num_missing = random.randint(3, 5)
        missing_positions = random.sample(range(1, 11), num_missing)
        for j in range(1, 11):
            if j in missing_positions:
                row_data.append("N/A")
            else:
                # 生成随机数字字符串
                num = random.randint(100, 9999)
                row_data.append(str(num))
    else:
        # 其他记录：每个字段有10%的概率缺失
        for j in range(1, 11):
            if random.random() < 0.1:  # 10%概率缺失
                row_data.append("N/A")
            else:
                # 生成随机数字字符串
                num = random.randint(100, 9999)
                row_data.append(str(num))

    ws.append(row_data)

# 调整列宽
ws.column_dimensions['A'].width = 15
for col in ws.columns:
    if col[0].column_letter != 'A':
        col_letter = col[0].column_letter
        ws.column_dimensions[col_letter].width = 12

# 保存文件
filename = "test_data_2000_with_na.xlsx"
wb.save(filename)
print(f"Successfully generated {filename}")
print(f"  - Total records: {num_records}")
print(f"  - Number of fields: {len(headers)}")
print(f"  - First record has missing fields")
print(f"  - Other records have ~10% missing probability per field")
