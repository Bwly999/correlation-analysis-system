from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import os
import sys
import json
from typing import List, Dict, Any, Optional

# 添加当前目录到路径，以便导入算法工具
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from algorithm.robust_insight_tool import RobustAnalyzerTool

app = FastAPI(title="Correlation Analysis Backend")

# 配置 CORS，允许前端访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Correlation Analysis API is running"}

@app.post("/analyze/xgboost-shap")
async def analyze_xgboost_shap(
    data: List[Dict[str, Any]] = Body(...),
    target: str = Body(...),
    config: Dict[str, Any] = Body({})
):
    try:
        if not data:
            raise HTTPException(status_code=400, detail="No data provided")
        
        # 将 JSON 数据转换为 DataFrame
        df = pd.DataFrame(data)
        
        if target not in df.columns:
            raise HTTPException(status_code=400, detail=f"Target column '{target}' not found in data")
            
        # 实例化工具并运行分析
        # 注意：为了让工具能处理 DataFrame 而不是文件，我们可能需要对 tool.run_analysis 做些微调
        # 或者直接在 FastAPI 中调用工具的内部逻辑
        
        # 暂时模拟返回结果，后续根据需要调用真实的 RobustAnalyzerTool 内部类
        # 为了演示对接，我们先返回一个结构化的结果
        
        # 这里可以使用 RobustAnalyzerTool 的逻辑
        analyzer = RobustAnalyzerTool()
        
        # 模拟执行 (因为 run_analysis 默认写文件，我们可能需要捕获其输出或修改它)
        # 建议在实际对接时，将工具类的方法重构为返回数据对象而非仅生成图表
        
        return {
            "status": "success",
            "results": {
                "r2": 0.85,
                "mae": 1.12,
                "importance": [
                    {"name": "因子A", "value": 0.85},
                    {"name": "因子B", "value": 0.62},
                    {"name": "因子C", "value": 0.45}
                ],
                "message": "分析完成"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
